import { Router } from 'express';
import { createNotification, db, generateNextCode, writeAuditLog } from '../db';
import { requireAuth, requirePermission, upload, type AuthedRequest } from '../middleware';
import { hasPermission } from '../../src/shared/permissions';

export const programsAndFinanceRouter = Router();

// ==================== INITIATIVES ====================
programsAndFinanceRouter.get('/initiatives', requireAuth, requirePermission('initiatives', 'view'), (_req, res) => {
  const initiatives = db.prepare('SELECT * FROM initiatives ORDER BY id DESC').all() as Record<string, unknown>[];
  const images = db.prepare('SELECT * FROM initiative_images ORDER BY is_primary DESC, id ASC').all() as Record<string, unknown>[];
  const supervisors = db.prepare('SELECT * FROM initiative_supervisors ORDER BY is_active DESC, id DESC').all() as Record<string, unknown>[];
  const benCounts = db
    .prepare('SELECT initiative_id, COUNT(*) as c FROM initiative_beneficiaries GROUP BY initiative_id')
    .all() as { initiative_id: number; c: number }[];
  const aidCounts = db
    .prepare("SELECT initiative_id, COUNT(*) as c FROM aids WHERE initiative_id IS NOT NULL AND status != 'ملغاة' GROUP BY initiative_id")
    .all() as { initiative_id: number; c: number }[];

  const benMap = new Map(benCounts.map((r) => [r.initiative_id, r.c]));
  const aidMap = new Map(aidCounts.map((r) => [r.initiative_id, r.c]));

  const enriched = initiatives.map((init) => ({
    ...init,
    images: images.filter((img) => img.initiative_id === init.id),
    supervisors: supervisors.filter((s) => s.initiative_id === init.id),
    beneficiaries_count: benMap.get(Number(init.id)) ?? 0,
    aids_count: aidMap.get(Number(init.id)) ?? 0,
  }));

  res.json({ initiatives: enriched });
});

programsAndFinanceRouter.post(
  '/initiatives',
  requireAuth,
  requirePermission('initiatives', 'create'),
  upload.single('cover'),
  (req: AuthedRequest, res) => {
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'اسم المبادرة مطلوب.' });
      return;
    }
    const code = generateNextCode('initiatives', 'INIT');
    const coverUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
    const now = new Date().toISOString();

    const info = db
      .prepare(`
        INSERT INTO initiatives (code, name, description, start_date, end_date, budget, eligibility_rules, allocated_aids_summary, status, cover_image_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        name,
        String(b.description ?? '').trim(),
        String(b.start_date ?? '').trim(),
        String(b.end_date ?? '').trim(),
        Number(b.budget ?? 0) || 0,
        String(b.eligibility_rules ?? '').trim(),
        String(b.allocated_aids_summary ?? '').trim(),
        String(b.status ?? 'نشطة').trim(),
        coverUrl,
        now
      );

    const id = Number(info.lastInsertRowid);
    if (coverUrl) {
      db.prepare('INSERT INTO initiative_images (initiative_id, image_url, is_primary, uploaded_at) VALUES (?, ?, 1, ?)').run(
        id,
        coverUrl,
        now
      );
    }

    if (String(b.supervisor_name ?? '').trim()) {
      db.prepare(`
        INSERT INTO initiative_supervisors (initiative_id, name, role_title, phone, assigned_date, is_active, notes)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        id,
        String(b.supervisor_name).trim(),
        String(b.supervisor_role ?? 'مسؤول مبادرة').trim(),
        String(b.supervisor_phone ?? '').trim(),
        now.slice(0, 10),
        'تكليف عند إنشاء المبادرة'
      );
      createNotification('تكليف بمبادرة', `تم تكليف ${b.supervisor_name} بالإشراف على مبادرة "${name}".`, 'initiatives', 'info');
    }

    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'إضافة مبادرة',
      section: 'initiatives',
      recordId: code,
      afterData: { name, code },
    });
    createNotification('مبادرة جديدة', `تمت إضافة المبادرة "${name}" (${code}).`, 'initiatives', 'success');
    res.status(201).json({ id, code, message: `تم إنشاء المبادرة (${code}) بنجاح.` });
  }
);

programsAndFinanceRouter.put(
  '/initiatives/:id',
  requireAuth,
  requirePermission('initiatives', 'edit'),
  upload.single('cover'),
  (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM initiatives WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'المبادرة غير موجودة.' });
      return;
    }
    const b = req.body || {};
    const coverUrl = req.file ? `/api/uploads/${req.file.filename}` : String(existing.cover_image_url ?? '');
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE initiatives SET name = ?, description = ?, start_date = ?, end_date = ?, budget = ?,
        eligibility_rules = ?, allocated_aids_summary = ?, status = ?, cover_image_url = ?
      WHERE id = ?
    `).run(
      String(b.name ?? existing.name).trim(),
      String(b.description ?? existing.description ?? '').trim(),
      String(b.start_date ?? existing.start_date ?? '').trim(),
      String(b.end_date ?? existing.end_date ?? '').trim(),
      Number(b.budget ?? existing.budget ?? 0) || 0,
      String(b.eligibility_rules ?? existing.eligibility_rules ?? '').trim(),
      String(b.allocated_aids_summary ?? existing.allocated_aids_summary ?? '').trim(),
      String(b.status ?? existing.status ?? 'نشطة').trim(),
      coverUrl,
      id
    );

    if (req.file) {
      db.prepare('UPDATE initiative_images SET is_primary = 0 WHERE initiative_id = ?').run(id);
      db.prepare('INSERT INTO initiative_images (initiative_id, image_url, is_primary, uploaded_at) VALUES (?, ?, 1, ?)').run(
        id,
        coverUrl,
        now
      );
    }

    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'تعديل مبادرة',
      section: 'initiatives',
      recordId: String(existing.code),
    });
    res.json({ ok: true, message: 'تم تحديث بيانات المبادرة بنجاح.' });
  }
);

programsAndFinanceRouter.delete('/initiatives/:id', requireAuth, requirePermission('initiatives', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM initiatives WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المبادرة غير موجودة.' });
    return;
  }
  db.prepare('DELETE FROM initiatives WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف مبادرة',
    section: 'initiatives',
    recordId: String(existing.code),
    beforeData: existing,
  });
  res.json({ ok: true, message: 'تم حذف المبادرة بنجاح.' });
});

programsAndFinanceRouter.post(
  '/initiatives/:id/images',
  requireAuth,
  requirePermission('initiatives', 'manage_files'),
  upload.array('images', 8),
  (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      res.status(400).json({ error: 'يرجى اختيار صورة واحدة على الأقل.' });
      return;
    }
    const now = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO initiative_images (initiative_id, image_url, is_primary, uploaded_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < files.length; i++) {
      const url = `/api/uploads/${files[i].filename}`;
      stmt.run(id, url, 0, now);
    }
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'رفع صور مبادرة',
      section: 'initiatives',
      recordId: id,
    });
    res.status(201).json({ ok: true, message: `تم رفع ${files.length} صورة للمبادرة بنجاح.` });
  }
);

programsAndFinanceRouter.post(
  '/initiatives/:id/images/:imgId/primary',
  requireAuth,
  requirePermission('initiatives', 'manage_files'),
  (req, res) => {
    const id = Number(req.params.id);
    const imgId = Number(req.params.imgId);
    const img = db.prepare('SELECT * FROM initiative_images WHERE id = ? AND initiative_id = ?').get(imgId, id) as
      | { image_url: string }
      | undefined;
    if (!img) {
      res.status(404).json({ error: 'الصورة غير موجودة.' });
      return;
    }
    db.prepare('UPDATE initiative_images SET is_primary = 0 WHERE initiative_id = ?').run(id);
    db.prepare('UPDATE initiative_images SET is_primary = 1 WHERE id = ?').run(imgId);
    db.prepare('UPDATE initiatives SET cover_image_url = ? WHERE id = ?').run(img.image_url, id);
    res.json({ ok: true, message: 'تم تعيين الصورة كصورة رئيسية للمبادرة.' });
  }
);

programsAndFinanceRouter.delete(
  '/initiatives/:id/images/:imgId',
  requireAuth,
  requirePermission('initiatives', 'manage_files'),
  (req, res) => {
    const id = Number(req.params.id);
    const imgId = Number(req.params.imgId);
    const img = db.prepare('SELECT * FROM initiative_images WHERE id = ? AND initiative_id = ?').get(imgId, id) as
      | { image_url: string; is_primary: number }
      | undefined;
    if (!img) {
      res.status(404).json({ error: 'الصورة غير موجودة.' });
      return;
    }
    db.prepare('DELETE FROM initiative_images WHERE id = ?').run(imgId);
    if (img.is_primary) {
      const next = db.prepare('SELECT id, image_url FROM initiative_images WHERE initiative_id = ? LIMIT 1').get(id) as
        | { id: number; image_url: string }
        | undefined;
      db.prepare('UPDATE initiatives SET cover_image_url = ? WHERE id = ?').run(next?.image_url ?? '', id);
      if (next) db.prepare('UPDATE initiative_images SET is_primary = 1 WHERE id = ?').run(next.id);
    }
    res.json({ ok: true, message: 'تم حذف الصورة.' });
  }
);

programsAndFinanceRouter.post(
  '/initiatives/:id/supervisors',
  requireAuth,
  requirePermission('initiatives', 'edit'),
  (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    if (!name) {
      res.status(400).json({ error: 'اسم مسؤول المبادرة مطلوب.' });
      return;
    }
    const init = db.prepare('SELECT name FROM initiatives WHERE id = ?').get(id) as { name: string } | undefined;
    if (!init) {
      res.status(404).json({ error: 'المبادرة غير موجودة.' });
      return;
    }
    db.exec('BEGIN');
    try {
      // Keep previous supervisor assignment history by marking previous as inactive rather than deleting
      if (b.replace_active !== false) {
        db.prepare('UPDATE initiative_supervisors SET is_active = 0 WHERE initiative_id = ?').run(id);
      }
      db.prepare(`
        INSERT INTO initiative_supervisors (initiative_id, name, role_title, phone, assigned_date, is_active, notes)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        id,
        name,
        String(b.role_title ?? 'مسؤول المبادرة').trim(),
        String(b.phone ?? '').trim(),
        String(b.assigned_date ?? new Date().toISOString().slice(0, 10)).trim(),
        String(b.notes ?? '').trim()
      );
      writeAuditLog({
        userId: req.user!.id,
        userName: req.user!.full_name,
        actionType: 'تعيين/تغيير مسؤول مبادرة',
        section: 'initiatives',
        recordId: id,
        afterData: b,
      });
      createNotification('تكليف مسؤول مبادرة', `تم تكليف ${name} بإدارة مبادرة "${init.name}".`, 'initiatives', 'info');
      db.exec('COMMIT');
      res.status(201).json({ ok: true, message: 'تم تعيين المسؤول وحفظ سجل التكليفات السابقة بنجاح.' });
    } catch {
      db.exec('ROLLBACK');
      res.status(500).json({ error: 'تعذر تعيين المسؤول.' });
    }
  }
);

// ==================== SEPARATE INITIATIVE BENEFICIARIES ====================
programsAndFinanceRouter.get('/initiatives/:id/beneficiaries', requireAuth, requirePermission('initiatives', 'view'), (req, res) => {
  const id = Number(req.params.id);
  const rows = db
    .prepare(`
      SELECT ib.*, b.code as linked_beneficiary_code
      FROM initiative_beneficiaries ib
      LEFT JOIN beneficiaries b ON b.id = ib.linked_beneficiary_id
      WHERE ib.initiative_id = ?
      ORDER BY ib.id DESC
    `)
    .all(id);
  res.json({ beneficiaries: rows });
});

programsAndFinanceRouter.post('/initiatives/:id/beneficiaries', requireAuth, requirePermission('initiatives', 'edit'), (req: AuthedRequest, res) => {
  const initiativeId = Number(req.params.id);
  const b = req.body || {};
  const full_name = String(b.full_name ?? '').trim();
  if (!full_name) {
    res.status(400).json({ error: 'اسم المستفيد مطلوب.' });
    return;
  }
  const now = new Date().toISOString();
  // Strictly inserted ONLY into initiative_beneficiaries — never auto-merged into aids beneficiaries!
  const info = db
    .prepare(`
      INSERT INTO initiative_beneficiaries (initiative_id, full_name, national_id, phone, address, family_count, notes, linked_beneficiary_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      initiativeId,
      full_name,
      String(b.national_id ?? '').trim(),
      String(b.phone ?? '').trim(),
      String(b.address ?? '').trim(),
      Math.max(1, parseInt(String(b.family_count ?? '1'), 10) || 1),
      String(b.notes ?? '').trim(),
      b.linked_beneficiary_id ? Number(b.linked_beneficiary_id) : null,
      now
    );

  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إضافة مستفيد لمبادرة (سجل مستقل)',
    section: 'initiatives',
    recordId: initiativeId,
    afterData: { full_name, national_id: b.national_id },
  });
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تم تسجيل المستفيد في سجل المبادرة المستقل دون دمجه مع مستفيدي المساعدات.' });
});

programsAndFinanceRouter.post('/initiatives/:id/beneficiaries/import', requireAuth, requirePermission('initiatives', 'edit'), (req: AuthedRequest, res) => {
  const initiativeId = Number(req.params.id);
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const now = new Date().toISOString();
  let count = 0;
  const stmt = db.prepare(`
    INSERT INTO initiative_beneficiaries (initiative_id, full_name, national_id, phone, address, family_count, notes, linked_beneficiary_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
  `);
  for (const r of rows) {
    const fullName = String(r.full_name ?? '').trim();
    if (!fullName) continue;
    stmt.run(
      initiativeId,
      fullName,
      String(r.national_id ?? '').trim(),
      String(r.phone ?? '').trim(),
      String(r.address ?? '').trim(),
      Math.max(1, parseInt(String(r.family_count ?? '1'), 10) || 1),
      String(r.notes ?? '').trim(),
      now
    );
    count++;
  }
  res.json({ count, message: `تم استيراد ${count} مستفيد إلى سجل المبادرة.` });
});

programsAndFinanceRouter.post('/initiative-beneficiaries/:id/link', requireAuth, requirePermission('initiatives', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { beneficiary_id } = req.body || {};
  const initBen = db.prepare('SELECT * FROM initiative_beneficiaries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!initBen) {
    res.status(404).json({ error: 'سجل مستفيد المبادرة غير موجود.' });
    return;
  }
  if (!beneficiary_id) {
    res.status(400).json({ error: 'يرجى تحديد المستفيد الأساسي للربط.' });
    return;
  }
  db.prepare('UPDATE initiative_beneficiaries SET linked_beneficiary_id = ? WHERE id = ?').run(Number(beneficiary_id), id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'ربط مستفيد مبادرة بسجل المستفيدين الأساسي',
    section: 'initiatives',
    recordId: id,
    afterData: { linked_beneficiary_id: beneficiary_id },
  });
  res.json({ ok: true, message: 'تم ربط المستفيد بسجله الأساسي بنجاح دون إنشاء سجل مكرر.' });
});

programsAndFinanceRouter.delete('/initiative-beneficiaries/:id', requireAuth, requirePermission('initiatives', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM initiative_beneficiaries WHERE id = ?').run(id);
  res.json({ ok: true, message: 'تم حذف المستفيد من سجل المبادرة.' });
});

// ==================== DONATIONS & EXPENSES ====================
programsAndFinanceRouter.get('/donations', requireAuth, requirePermission('donations', 'view'), (_req, res) => {
  const donations = db
    .prepare(`
      SELECT d.*, i.name as initiative_name
      FROM donations d
      LEFT JOIN initiatives i ON i.id = d.initiative_id
      ORDER BY d.id DESC
    `)
    .all();
  const expenses = db
    .prepare(`
      SELECT e.*, i.name as initiative_name
      FROM expenses e
      LEFT JOIN initiatives i ON i.id = e.initiative_id
      ORDER BY e.id DESC
    `)
    .all();
  res.json({ donations, expenses });
});

programsAndFinanceRouter.post(
  '/donations',
  requireAuth,
  requirePermission('donations', 'create'),
  upload.single('receipt'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const b = req.body || {};
    const donor_name = String(b.donor_name ?? '').trim();
    if (!donor_name) {
      res.status(400).json({ error: 'اسم المتبرع مطلوب.' });
      return;
    }
    const code = generateNextCode('donations', 'DON');
    const now = new Date().toISOString();
    const receiptUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
    const status =
      b.status === 'معتمد' && hasPermission(user.permissions, 'donations', 'approve', user.is_owner === 1)
        ? 'معتمد'
        : String(b.status ?? 'مسجل');

    const info = db
      .prepare(`
        INSERT INTO donations (code, donor_name, donor_phone, donation_type, amount, in_kind_description, donation_date, scope, initiative_id, purpose, status, receipt_url, notes, created_by_name, updated_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        donor_name,
        String(b.donor_phone ?? '').trim(),
        String(b.donation_type ?? 'نقدي'),
        Number(b.amount ?? 0) || 0,
        String(b.in_kind_description ?? '').trim(),
        String(b.donation_date ?? now.slice(0, 10)).trim(),
        String(b.scope ?? 'عام'),
        b.initiative_id ? Number(b.initiative_id) : null,
        String(b.purpose ?? '').trim(),
        status,
        receiptUrl,
        String(b.notes ?? '').trim(),
        user.full_name,
        user.full_name,
        now
      );

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تسجيل تبرع',
      section: 'donations',
      recordId: code,
      afterData: { donor_name, amount: b.amount, donation_type: b.donation_type, status },
    });
    createNotification('تبرع جديد', `تم تسجيل تبرع (${code}) من ${donor_name} بقيمة ${b.amount || 0}.`, 'donations', 'success');
    res.status(201).json({ id: Number(info.lastInsertRowid), code, message: `تم تسجيل التبرع (${code}) بنجاح.` });
  }
);

programsAndFinanceRouter.put(
  '/donations/:id',
  requireAuth,
  requirePermission('donations', 'edit'),
  upload.single('receipt'),
  (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    const user = req.user!;
    const existing = db.prepare('SELECT * FROM donations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'التبرع غير موجود.' });
      return;
    }
    const b = req.body || {};
    const receiptUrl = req.file ? `/api/uploads/${req.file.filename}` : String(existing.receipt_url ?? '');
    const nextStatus = String(b.status ?? existing.status);
    if (nextStatus === 'معتمد' && existing.status !== 'معتمد' && !hasPermission(user.permissions, 'donations', 'approve', user.is_owner === 1)) {
      res.status(403).json({ error: 'ليس لديك صلاحية اعتماد التبرعات.' });
      return;
    }

    db.prepare(`
      UPDATE donations SET donor_name = ?, donor_phone = ?, donation_type = ?, amount = ?, in_kind_description = ?,
        donation_date = ?, scope = ?, initiative_id = ?, purpose = ?, status = ?, receipt_url = ?, notes = ?, updated_by_name = ?
      WHERE id = ?
    `).run(
      String(b.donor_name ?? existing.donor_name).trim(),
      String(b.donor_phone ?? existing.donor_phone ?? '').trim(),
      String(b.donation_type ?? existing.donation_type),
      Number(b.amount ?? existing.amount ?? 0) || 0,
      String(b.in_kind_description ?? existing.in_kind_description ?? '').trim(),
      String(b.donation_date ?? existing.donation_date).trim(),
      String(b.scope ?? existing.scope),
      b.initiative_id !== undefined ? (b.initiative_id ? Number(b.initiative_id) : null) : (existing.initiative_id ? Number(existing.initiative_id) : null),
      String(b.purpose ?? existing.purpose ?? '').trim(),
      nextStatus,
      receiptUrl,
      String(b.notes ?? existing.notes ?? '').trim(),
      user.full_name,
      id
    );

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تعديل تبرع',
      section: 'donations',
      recordId: String(existing.code),
      beforeData: existing,
    });
    res.json({ ok: true, message: 'تم تحديث بيانات التبرع بنجاح.' });
  }
);

programsAndFinanceRouter.delete('/donations/:id', requireAuth, requirePermission('donations', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM donations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'التبرع غير موجود.' });
    return;
  }
  if (existing.status === 'معتمد' && req.user!.is_owner !== 1) {
    res.status(403).json({ error: 'لا يمكن حذف تبرع معتمد إلا بواسطة مالك النظام.' });
    return;
  }
  db.prepare('DELETE FROM donations WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف تبرع',
    section: 'donations',
    recordId: String(existing.code),
    beforeData: existing,
  });
  res.json({ ok: true, message: 'تم حذف سجل التبرع.' });
});

programsAndFinanceRouter.post(
  '/expenses',
  requireAuth,
  requirePermission('donations', 'create'),
  upload.single('receipt'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const b = req.body || {};
    const title = String(b.title ?? '').trim();
    const reason = String(b.reason ?? '').trim();
    const amount = Number(b.amount ?? 0) || 0;
    if (!title || !reason || amount <= 0) {
      res.status(400).json({ error: 'يرجى إدخال بيان المصروف وسبب الصرف والمبلغ الصحيح.' });
      return;
    }
    const code = generateNextCode('expenses', 'EXP');
    const now = new Date().toISOString();
    const receiptUrl = req.file ? `/api/uploads/${req.file.filename}` : '';

    const info = db
      .prepare(`
        INSERT INTO expenses (code, title, category, amount, expense_date, initiative_id, reason, receipt_url, status, created_by_name, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        title,
        String(b.category ?? 'تشغيلي'),
        amount,
        String(b.expense_date ?? now.slice(0, 10)),
        b.initiative_id ? Number(b.initiative_id) : null,
        reason,
        receiptUrl,
        String(b.status ?? 'معتمد'),
        user.full_name,
        now
      );

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تسجيل مصروف',
      section: 'donations',
      recordId: code,
      afterData: { title, amount, reason },
    });
    createNotification('تسجيل مصروف', `تم تسجيل مصروف "${title}" بمبلغ ${amount} ج.م.`, 'donations', 'info');
    res.status(201).json({ id: Number(info.lastInsertRowid), code, message: `تم تسجيل المصروف (${code}) بنجاح.` });
  }
);

programsAndFinanceRouter.delete('/expenses/:id', requireAuth, requirePermission('donations', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المصروف غير موجود.' });
    return;
  }
  db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف مصروف',
    section: 'donations',
    recordId: String(existing.code),
    beforeData: existing,
  });
  res.json({ ok: true, message: 'تم حذف المصروف.' });
});

// ==================== WAREHOUSES & INVENTORY ====================
programsAndFinanceRouter.get('/inventory', requireAuth, requirePermission('inventory', 'view'), (_req, res) => {
  const warehouses = db.prepare('SELECT * FROM warehouses ORDER BY id ASC').all();
  const items = db
    .prepare(`
      SELECT i.*, w.name as warehouse_name
      FROM inventory_items i
      JOIN warehouses w ON w.id = i.warehouse_id
      ORDER BY i.id DESC
    `)
    .all();
  const movements = db
    .prepare(`
      SELECT m.*, i.name as item_name, w.name as warehouse_name
      FROM inventory_movements m
      JOIN inventory_items i ON i.id = m.item_id
      JOIN warehouses w ON w.id = i.warehouse_id
      ORDER BY m.id DESC LIMIT 120
    `)
    .all();
  const stocktakes = db
    .prepare(`
      SELECT s.*, i.name as item_name, i.unit, w.name as warehouse_name
      FROM stocktakes s
      JOIN inventory_items i ON i.id = s.item_id
      JOIN warehouses w ON w.id = i.warehouse_id
      ORDER BY s.id DESC LIMIT 50
    `)
    .all();
  res.json({ warehouses, items, movements, stocktakes });
});

programsAndFinanceRouter.post('/warehouses', requireAuth, requirePermission('inventory', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'اسم المخزن مطلوب.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO warehouses (name, location, manager_name, notes) VALUES (?, ?, ?, ?)')
    .run(name, String(b.location ?? '').trim(), String(b.manager_name ?? '').trim(), String(b.notes ?? '').trim());
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إضافة مخزن',
    section: 'inventory',
    recordId: Number(info.lastInsertRowid),
    afterData: { name },
  });
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تمت إضافة المخزن بنجاح.' });
});

programsAndFinanceRouter.delete('/warehouses/:id', requireAuth, requirePermission('inventory', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const count = (db.prepare('SELECT COUNT(*) as c FROM inventory_items WHERE warehouse_id = ?').get(id) as { c: number }).c;
  if (count > 0) {
    res.status(409).json({ error: 'لا يمكن حذف مخزن يحتوي على أصناف مسجلة.' });
    return;
  }
  db.prepare('DELETE FROM warehouses WHERE id = ?').run(id);
  res.json({ ok: true, message: 'تم حذف المخزن.' });
});

programsAndFinanceRouter.post('/inventory/items', requireAuth, requirePermission('inventory', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const warehouse_id = Number(b.warehouse_id);
  const name = String(b.name ?? '').trim();
  const unit = String(b.unit ?? 'وحدة').trim();
  const qty = Number(b.quantity ?? 0) || 0;
  const minQty = Number(b.min_quantity ?? 0) || 0;

  if (!warehouse_id || !name) {
    res.status(400).json({ error: 'المخزن واسم الصنف مطلوبان.' });
    return;
  }
  const code = generateNextCode('inventory_items', 'ITM');
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(`
        INSERT INTO inventory_items (warehouse_id, code, name, unit, quantity, min_quantity, category, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(warehouse_id, code, name, unit, qty, minQty, String(b.category ?? 'عام').trim(), now);
    const itemId = Number(info.lastInsertRowid);
    if (qty > 0) {
      db.prepare(`
        INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reason, created_by_name, created_at)
        VALUES (?, 'وارد', ?, ?, 'opening', 'رصيد افتتاحي عند إضافة الصنف', ?, ?)
      `).run(itemId, qty, qty, req.user!.full_name, now);
    }
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'إضافة صنف مخزني',
      section: 'inventory',
      recordId: code,
      afterData: { name, qty, unit },
    });
    db.exec('COMMIT');
    res.status(201).json({ id: itemId, code, message: `تمت إضافة الصنف (${code}) بنجاح.` });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'تعذر إضافة الصنف.' });
  }
});

programsAndFinanceRouter.put('/inventory/items/:id', requireAuth, requirePermission('inventory', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الصنف غير موجود.' });
    return;
  }
  const b = req.body || {};
  db.prepare(`
    UPDATE inventory_items SET warehouse_id = ?, name = ?, unit = ?, min_quantity = ?, category = ?, updated_at = ?
    WHERE id = ?
  `).run(
    Number(b.warehouse_id ?? existing.warehouse_id),
    String(b.name ?? existing.name).trim(),
    String(b.unit ?? existing.unit).trim(),
    Number(b.min_quantity ?? existing.min_quantity ?? 0),
    String(b.category ?? existing.category ?? 'عام').trim(),
    new Date().toISOString(),
    id
  );
  res.json({ ok: true, message: 'تم تحديث بيانات الصنف.' });
});

programsAndFinanceRouter.delete('/inventory/items/:id', requireAuth, requirePermission('inventory', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف صنف مخزني',
    section: 'inventory',
    recordId: id,
  });
  res.json({ ok: true, message: 'تم حذف الصنف.' });
});

programsAndFinanceRouter.post('/inventory/movements', requireAuth, requirePermission('inventory', 'create'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const item_id = Number(b.item_id);
  const movement_type = String(b.movement_type ?? 'وارد');
  const quantity = Number(b.quantity ?? 0);
  const reason = String(b.reason ?? '').trim();
  const target_warehouse_id = b.target_warehouse_id ? Number(b.target_warehouse_id) : null;

  if (!item_id || quantity <= 0 || !reason) {
    res.status(400).json({ error: 'يرجى تحديد الصنف والكمية وسبب الحركة.' });
    return;
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id) as
    | { id: number; warehouse_id: number; name: string; unit: string; quantity: number; min_quantity: number; category: string }
    | undefined;
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود.' });
    return;
  }

  const canOverride = hasPermission(user.permissions, 'inventory', 'override_stock', user.is_owner === 1);
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    let nextQty = item.quantity;
    if (movement_type === 'وارد' || movement_type === 'مرتجع') {
      nextQty += quantity;
    } else if (movement_type === 'منصرف' || movement_type === 'تحويل') {
      if (item.quantity < quantity && !canOverride) {
        throw new Error(`الرصيد المتاح (${item.quantity}) غير كافٍ لخصم (${quantity}).`);
      }
      nextQty -= quantity;
    } else {
      throw new Error('نوع حركة غير مدعوم.');
    }

    db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(nextQty, now, item.id);
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reason, created_by_name, created_at)
      VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)
    `).run(item.id, movement_type, quantity, nextQty, reason, user.full_name, now);

    if (movement_type === 'تحويل' && target_warehouse_id && target_warehouse_id !== item.warehouse_id) {
      let targetItem = db
        .prepare('SELECT * FROM inventory_items WHERE warehouse_id = ? AND name = ?')
        .get(target_warehouse_id, item.name) as { id: number; quantity: number } | undefined;

      if (!targetItem) {
        const newCode = generateNextCode('inventory_items', 'ITM');
        const info = db
          .prepare(`
            INSERT INTO inventory_items (warehouse_id, code, name, unit, quantity, min_quantity, category, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(target_warehouse_id, newCode, item.name, item.unit, quantity, item.min_quantity, item.category, now);
        targetItem = { id: Number(info.lastInsertRowid), quantity };
      } else {
        const newTargetQty = targetItem.quantity + quantity;
        db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(newTargetQty, now, targetItem.id);
        targetItem.quantity = newTargetQty;
      }

      db.prepare(`
        INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reason, created_by_name, created_at)
        VALUES (?, 'تحويل', ?, ?, 'transfer_in', ?, ?, ?)
      `).run(targetItem.id, quantity, targetItem.quantity, `تحويل وارد: ${reason}`, user.full_name, now);
    }

    if (nextQty <= item.min_quantity) {
      createNotification('تنبيه انخفاض مخزون', `الصنف "${item.name}" وصل رصيده إلى ${nextQty} (الحد الأدنى ${item.min_quantity}).`, 'inventory', 'warning');
    }

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: `حركة مخزون (${movement_type})`,
      section: 'inventory',
      recordId: item.id,
      afterData: { item: item.name, quantity, balance_after: nextQty, reason },
    });
    db.exec('COMMIT');
    res.status(201).json({ ok: true, balance_after: nextQty, message: 'تم تسجيل حركة المخزون بنجاح.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'فشل تسجيل حركة المخزون.' });
  }
});

programsAndFinanceRouter.post('/inventory/stocktakes', requireAuth, requirePermission('inventory', 'edit'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const item_id = Number(b.item_id);
  const actual_qty = Number(b.actual_qty);
  const reason = String(b.reason ?? '').trim();
  const responsible_name = String(b.responsible_name ?? user.full_name).trim();

  if (!item_id || Number.isNaN(actual_qty) || actual_qty < 0) {
    res.status(400).json({ error: 'يرجى تحديد الصنف والكمية الفعلية الصحيحة.' });
    return;
  }

  const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(item_id) as
    | { id: number; name: string; quantity: number }
    | undefined;
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود.' });
    return;
  }

  const variance = actual_qty - item.quantity;
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO stocktakes (item_id, recorded_qty, actual_qty, variance, reason, responsible_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, item.quantity, actual_qty, variance, reason || 'جرد دوري', responsible_name, now);

    if (variance !== 0) {
      db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(actual_qty, now, item.id);
      db.prepare(`
        INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reason, created_by_name, created_at)
        VALUES (?, 'تصحيح', ?, ?, 'stocktake', ?, ?, ?)
      `).run(
        item.id,
        Math.abs(variance),
        actual_qty,
        `تسوية جرد (فرق: ${variance > 0 ? `+${variance}` : variance}) — ${reason || 'جرد فعلي'}`,
        user.full_name,
        now
      );
    }

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'جرد مخزني',
      section: 'inventory',
      recordId: item.id,
      beforeData: { recorded_qty: item.quantity },
      afterData: { actual_qty, variance },
      reason,
    });
    db.exec('COMMIT');
    res.status(201).json({ ok: true, variance, message: `تم تسجيل الجرد بنجاح (الفرق: ${variance}).` });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'تعذر حفظ الجرد.' });
  }
});
