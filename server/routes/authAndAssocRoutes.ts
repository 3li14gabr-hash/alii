import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { db, UPLOADS_DIR, writeAuditLog } from '../db';
import { requireAuth, requirePermission, resolveSessionUser, upload, type AuthedRequest } from '../middleware';
import { hasPermission } from '../../src/shared/permissions';
import type { PermissionsMatrix } from '../../src/shared/types';

export const authAndAssocRouter = Router();

function buildUserResponse(userId: number) {
  const row = db
    .prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, u.email, u.role_id, u.is_owner, u.is_active, u.created_at,
             r.name as role_name, r.key as role_key, r.permissions_json
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
    `)
    .get(userId) as
    | {
        id: number;
        username: string;
        full_name: string;
        phone: string;
        email: string;
        role_id: number;
        is_owner: number;
        is_active: number;
        created_at: string;
        role_name: string;
        role_key: string;
        permissions_json: string;
      }
    | undefined;
  if (!row) return null;
  let permissions: PermissionsMatrix = {};
  try {
    permissions = JSON.parse(row.permissions_json || '{}') as PermissionsMatrix;
  } catch {
    permissions = {};
  }
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    role_id: row.role_id,
    role_name: row.role_name,
    role_key: row.role_key,
    is_owner: row.is_owner,
    is_active: row.is_active,
    created_at: row.created_at,
    permissions,
  };
}

function issueSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    userId,
    now.toISOString(),
    expires.toISOString()
  );
  return token;
}

authAndAssocRouter.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور.' });
    return;
  }

  const user = db
    .prepare('SELECT id, username, password_hash, full_name, is_active FROM users WHERE username = ?')
    .get(String(username).trim()) as
    | { id: number; username: string; password_hash: string; full_name: string; is_active: number }
    | undefined;

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    writeAuditLog({
      userId: user?.id ?? null,
      userName: String(username).trim(),
      actionType: 'محاولة تسجيل دخول فاشلة',
      section: 'auth',
      reason: 'بيانات الدخول غير صحيحة',
      result: 'فشل',
    });
    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' });
    return;
  }

  if (!user.is_active) {
    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'محاولة دخول لحساب محظور',
      section: 'auth',
      result: 'مرفوض',
    });
    res.status(403).json({ error: 'هذا الحساب موقوف حاليًا. يرجى مراجعة مالك النظام.' });
    return;
  }

  const token = issueSession(user.id);
  const fullUser = buildUserResponse(user.id);
  writeAuditLog({
    userId: user.id,
    userName: user.full_name,
    actionType: 'تسجيل دخول',
    section: 'auth',
    result: 'نجاح',
  });
  res.json({ token, user: fullUser });
});

authAndAssocRouter.post('/auth/owner-login', (_req, res) => {
  const owner = db
    .prepare('SELECT id, full_name, is_active FROM users WHERE is_owner = 1 ORDER BY id ASC LIMIT 1')
    .get() as { id: number; full_name: string; is_active: number } | undefined;

  if (!owner || !owner.is_active) {
    res.status(404).json({ error: 'حساب مالك النظام غير متوفر أو غير نشط.' });
    return;
  }

  const token = issueSession(owner.id);
  const fullUser = buildUserResponse(owner.id);
  writeAuditLog({
    userId: owner.id,
    userName: owner.full_name,
    actionType: 'الدخول كمالك',
    section: 'auth',
    result: 'نجاح',
  });
  res.json({ token, user: fullUser });
});

authAndAssocRouter.post('/auth/logout', (req: AuthedRequest, res) => {
  const user = resolveSessionUser(req);
  if (req.authToken) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.authToken);
  }
  if (user) {
    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تسجيل خروج',
      section: 'auth',
      result: 'نجاح',
    });
  }
  res.json({ ok: true });
});

authAndAssocRouter.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const fullUser = buildUserResponse(req.user!.id);
  res.json({ user: fullUser });
});

// Public association summary (for login screen + app header)
authAndAssocRouter.get('/association', (_req, res) => {
  const assoc = db.prepare('SELECT * FROM association_settings WHERE id = 1').get();
  res.json({ association: assoc });
});

authAndAssocRouter.get('/association/history', requireAuth, requirePermission('association', 'view'), (_req, res) => {
  const history = db.prepare('SELECT * FROM association_history ORDER BY id DESC LIMIT 50').all();
  res.json({ history });
});

authAndAssocRouter.put(
  '/association',
  requireAuth,
  requirePermission('association', 'edit'),
  upload.single('logo'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const current = db.prepare('SELECT * FROM association_settings WHERE id = 1').get() as Record<string, string>;
    if (!current) {
      res.status(404).json({ error: 'بيانات الجمعية غير موجودة.' });
      return;
    }

    const body = req.body || {};
    let nextLogoUrl = current.logo_url || '';

    if (body.remove_logo === 'true' || body.remove_logo === true) {
      nextLogoUrl = '';
    }

    if (req.file) {
      const diskPath = path.join(UPLOADS_DIR, req.file.filename);
      if (!fs.existsSync(diskPath) || fs.statSync(diskPath).size === 0) {
        res.status(500).json({ error: 'فشل التحقق من حفظ ملف الشعار على الخادم.' });
        return;
      }
      nextLogoUrl = `/api/uploads/${req.file.filename}`;
    }

    const updatedName = String(body.name ?? current.name).trim();
    if (!updatedName) {
      res.status(400).json({ error: 'اسم الجمعية مطلوب ولا يمكن تركه فارغًا.' });
      return;
    }

    const now = new Date().toISOString();
    const updatedFields = {
      name: updatedName,
      short_name: String(body.short_name ?? current.short_name).trim() || updatedName,
      app_name: String(body.app_name ?? current.app_name).trim() || 'خيرنا',
      address: String(body.address ?? current.address).trim(),
      governorate: String(body.governorate ?? current.governorate).trim(),
      center: String(body.center ?? current.center).trim(),
      village: String(body.village ?? current.village).trim(),
      phone1: String(body.phone1 ?? current.phone1).trim(),
      phone2: String(body.phone2 ?? current.phone2).trim(),
      whatsapp: String(body.whatsapp ?? current.whatsapp).trim(),
      email: String(body.email ?? current.email).trim(),
      website: String(body.website ?? current.website).trim(),
      registration_no: String(body.registration_no ?? current.registration_no).trim(),
      tax_no: String(body.tax_no ?? current.tax_no).trim(),
      chairman_name: String(body.chairman_name ?? current.chairman_name).trim(),
      secretary_name: String(body.secretary_name ?? current.secretary_name).trim(),
      treasurer_name: String(body.treasurer_name ?? current.treasurer_name).trim(),
      description: String(body.description ?? current.description).trim(),
      logo_url: nextLogoUrl,
    };

    try {
      db.exec('BEGIN');
      db.prepare(`
        UPDATE association_settings SET
          name = ?, short_name = ?, app_name = ?, address = ?, governorate = ?, center = ?, village = ?,
          phone1 = ?, phone2 = ?, whatsapp = ?, email = ?, website = ?, registration_no = ?, tax_no = ?,
          chairman_name = ?, secretary_name = ?, treasurer_name = ?, description = ?, logo_url = ?,
          updated_at = ?, updated_by_name = ?
        WHERE id = 1
      `).run(
        updatedFields.name,
        updatedFields.short_name,
        updatedFields.app_name,
        updatedFields.address,
        updatedFields.governorate,
        updatedFields.center,
        updatedFields.village,
        updatedFields.phone1,
        updatedFields.phone2,
        updatedFields.whatsapp,
        updatedFields.email,
        updatedFields.website,
        updatedFields.registration_no,
        updatedFields.tax_no,
        updatedFields.chairman_name,
        updatedFields.secretary_name,
        updatedFields.treasurer_name,
        updatedFields.description,
        updatedFields.logo_url,
        now,
        user.full_name
      );

      const summary = req.file
        ? 'تحديث بيانات الجمعية ورفع شعار جديد'
        : body.remove_logo === 'true'
          ? 'تحديث بيانات الجمعية وحذف الشعار'
          : 'تحديث بيانات الجمعية الرسمية';

      db.prepare(`
        INSERT INTO association_history (updated_by_id, updated_by_name, changes_summary, snapshot_json, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, user.full_name, summary, JSON.stringify(updatedFields), now);

      writeAuditLog({
        userId: user.id,
        userName: user.full_name,
        actionType: 'تعديل بيانات الجمعية والشعار',
        section: 'association',
        recordId: 1,
        beforeData: current,
        afterData: updatedFields,
        reason: summary,
        result: 'نجاح',
      });
      db.exec('COMMIT');

      const saved = db.prepare('SELECT * FROM association_settings WHERE id = 1').get();
      res.json({ association: saved, message: 'تم حفظ بيانات الجمعية والشعار وتأكيد التخزين في قاعدة البيانات بنجاح.' });
    } catch (err) {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'حدث خطأ أثناء حفظ بيانات الجمعية في قاعدة البيانات.' });
    }
  }
);

authAndAssocRouter.get('/dashboard', requireAuth, requirePermission('dashboard', 'view'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const totalBeneficiaries = (db.prepare('SELECT COUNT(*) as c FROM beneficiaries WHERE is_archived = 0').get() as { c: number }).c;
  const totalInitBeneficiaries = (db.prepare('SELECT COUNT(*) as c FROM initiative_beneficiaries').get() as { c: number }).c;
  const totalAidsDisbursed = (db.prepare("SELECT COUNT(*) as c FROM aids WHERE status IN ('معتمدة', 'مسلمة')").get() as { c: number }).c;
  const pendingApprovals = (db.prepare("SELECT COUNT(*) as c FROM aids WHERE status IN ('مسجلة', 'قيد المراجعة')").get() as { c: number }).c;
  const pendingDonations = (db.prepare("SELECT COUNT(*) as c FROM donations WHERE status != 'معتمد'").get() as { c: number }).c;

  const donationsCash = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM donations WHERE donation_type = 'نقدي' AND status = 'معتمد'").get() as { s: number }).s;
  const donationsAll = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM donations WHERE donation_type = 'نقدي'").get() as { s: number }).s;
  const totalExpenses = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM expenses WHERE status != 'ملغى'").get() as { s: number }).s;

  const employeesCount = (db.prepare("SELECT COUNT(*) as c FROM staff_persons WHERE person_type = 'employee' AND status = 'نشط'").get() as { c: number }).c;
  const volunteersCount = (db.prepare("SELECT COUNT(*) as c FROM staff_persons WHERE person_type = 'volunteer' AND status = 'نشط'").get() as { c: number }).c;
  const activeInitiatives = (db.prepare("SELECT COUNT(*) as c FROM initiatives WHERE status = 'نشطة'").get() as { c: number }).c;

  const lowStockItems = db
    .prepare(`
      SELECT i.*, w.name as warehouse_name
      FROM inventory_items i
      JOIN warehouses w ON w.id = i.warehouse_id
      WHERE i.quantity <= i.min_quantity
      ORDER BY (i.quantity - i.min_quantity) ASC
    `)
    .all();

  const aidsByType = db
    .prepare(`
      SELECT aid_type, COUNT(*) as count, COALESCE(SUM(cash_amount), 0) as cash_total
      FROM aids
      WHERE status != 'ملغاة' AND status != 'مرفوضة'
      GROUP BY aid_type
      ORDER BY count DESC
    `)
    .all();

  const recentAids = db
    .prepare(`
      SELECT a.id, a.code, a.aid_type, a.aid_date, a.status, a.cash_amount,
             COALESCE(NULLIF(b.wife_name, ''), b.husband_name) as beneficiary_name
      FROM aids a
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      ORDER BY a.id DESC LIMIT 6
    `)
    .all();

  const recentOperations = hasPermission(user.permissions, 'audit', 'view', user.is_owner === 1)
    ? db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 10').all()
    : db.prepare('SELECT id, user_name, action_type, section, result, created_at FROM audit_logs ORDER BY id DESC LIMIT 8').all();

  res.json({
    stats: {
      totalBeneficiaries,
      totalInitBeneficiaries,
      totalAidsDisbursed,
      pendingApprovals: pendingApprovals + pendingDonations,
      pendingAidsCount: pendingApprovals,
      pendingDonationsCount: pendingDonations,
      donationsCashApproved: donationsCash,
      donationsTotal: donationsAll,
      totalExpenses,
      netBalance: donationsCash - totalExpenses,
      employeesCount,
      volunteersCount,
      activeInitiatives,
      lowStockCount: lowStockItems.length,
    },
    lowStockItems,
    aidsByType,
    recentAids,
    recentOperations,
  });
});

authAndAssocRouter.get('/notifications', requireAuth, (_req, res) => {
  const notifications = db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT 40').all();
  const unreadCount = (db.prepare('SELECT COUNT(*) as c FROM notifications WHERE is_read = 0').get() as { c: number }).c;
  res.json({ notifications, unreadCount });
});

authAndAssocRouter.post('/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

authAndAssocRouter.post('/notifications/read-all', requireAuth, (_req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1').run();
  res.json({ ok: true });
});
