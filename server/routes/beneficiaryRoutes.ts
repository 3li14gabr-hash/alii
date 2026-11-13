import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createNotification, db, generateNextCode, UPLOADS_DIR, writeAuditLog } from '../db';
import { requireAuth, requirePermission, upload, type AuthedRequest } from '../middleware';
import { hasPermission } from '../../src/shared/permissions';
import { normalizeDigits } from '../../src/shared/excelSchema';
import type { AidItemAllocation } from '../../src/shared/types';

export const beneficiaryRouter = Router();

// ==================== BENEFICIARIES ====================
beneficiaryRouter.get('/beneficiaries', requireAuth, requirePermission('beneficiaries', 'view'), (req, res) => {
  const includeArchived = req.query.archived === '1';
  const rows = db
    .prepare(`
      SELECT b.*,
        (SELECT COUNT(*) FROM beneficiary_file_members m WHERE m.beneficiary_id = b.id) as files_count,
        (SELECT COUNT(*) FROM aids a WHERE a.beneficiary_id = b.id AND a.status != 'ملغاة') as aids_count
      FROM beneficiaries b
      WHERE (? = 1 OR b.is_archived = 0)
      ORDER BY b.id DESC
    `)
    .all(includeArchived ? 1 : 0);
  res.json({ beneficiaries: rows });
});

beneficiaryRouter.post('/beneficiaries', requireAuth, requirePermission('beneficiaries', 'create'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const wife_name = String(b.wife_name ?? '').trim();
  const husband_name = String(b.husband_name ?? '').trim();
  const wife_national_id = normalizeDigits(b.wife_national_id);
  const husband_national_id = normalizeDigits(b.husband_national_id);
  const phone1 = normalizeDigits(b.phone1);
  const phone2 = normalizeDigits(b.phone2);
  const eligibility = String(b.eligibility ?? 'B').toUpperCase();

  if (!wife_name && !husband_name) {
    res.status(400).json({ error: 'يجب إدخال اسم الزوجة أو اسم الزوج على الأقل.' });
    return;
  }
  if (!['A', 'B', 'C'].includes(eligibility)) {
    res.status(400).json({ error: 'استحقاق الحالة يجب أن يكون A أو B أو C فقط.' });
    return;
  }

  // Duplicate check
  if (wife_national_id) {
    const dup = db
      .prepare('SELECT id, code FROM beneficiaries WHERE wife_national_id = ? OR husband_national_id = ?')
      .get(wife_national_id, wife_national_id) as { id: number; code: string } | undefined;
    if (dup) {
      res.status(409).json({ error: `الرقم القومي للزوجة مسجل مسبقًا للمستفيد (${dup.code}).` });
      return;
    }
  }
  if (husband_national_id) {
    const dup = db
      .prepare('SELECT id, code FROM beneficiaries WHERE wife_national_id = ? OR husband_national_id = ?')
      .get(husband_national_id, husband_national_id) as { id: number; code: string } | undefined;
    if (dup) {
      res.status(409).json({ error: `الرقم القومي للزوج مسجل مسبقًا للمستفيد (${dup.code}).` });
      return;
    }
  }
  if (phone1) {
    const dupPhone = db.prepare('SELECT id, code FROM beneficiaries WHERE phone1 = ?').get(phone1) as { id: number; code: string } | undefined;
    if (dupPhone) {
      res.status(409).json({ error: `رقم الهاتف الأول مسجل مسبقًا للمستفيد (${dupPhone.code}).` });
      return;
    }
  }

  const now = new Date().toISOString();
  const code = generateNextCode('beneficiaries', 'BEN');
  const familyCount = Math.max(1, parseInt(String(b.family_count ?? '1'), 10) || 1);

  const info = db
    .prepare(`
      INSERT INTO beneficiaries (
        code, wife_name, wife_national_id, wife_job, husband_name, husband_national_id, husband_job,
        phone1, phone2, address, family_count, house_description, notes, eligibility, is_archived,
        created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `)
    .run(
      code,
      wife_name,
      wife_national_id,
      String(b.wife_job ?? '').trim(),
      husband_name,
      husband_national_id,
      String(b.husband_job ?? '').trim(),
      phone1,
      phone2,
      String(b.address ?? '').trim(),
      familyCount,
      String(b.house_description ?? '').trim(),
      String(b.notes ?? '').trim(),
      eligibility,
      user.full_name,
      now,
      now
    );

  const created = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(Number(info.lastInsertRowid));
  writeAuditLog({
    userId: user.id,
    userName: user.full_name,
    actionType: 'إضافة مستفيد',
    section: 'beneficiaries',
    recordId: code,
    afterData: created,
  });
  res.status(201).json({ beneficiary: created, message: `تم تسجيل المستفيد بنجاح بكود (${code}).` });
});

beneficiaryRouter.put('/beneficiaries/:id', requireAuth, requirePermission('beneficiaries', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المستفيد غير موجود.' });
    return;
  }

  const b = req.body || {};
  const wife_name = String(b.wife_name ?? existing.wife_name ?? '').trim();
  const husband_name = String(b.husband_name ?? existing.husband_name ?? '').trim();
  const wife_national_id = normalizeDigits(b.wife_national_id ?? existing.wife_national_id);
  const husband_national_id = normalizeDigits(b.husband_national_id ?? existing.husband_national_id);
  const phone1 = normalizeDigits(b.phone1 ?? existing.phone1);
  const phone2 = normalizeDigits(b.phone2 ?? existing.phone2);
  const eligibility = String(b.eligibility ?? existing.eligibility ?? 'B').toUpperCase();

  if (!wife_name && !husband_name) {
    res.status(400).json({ error: 'يجب إدخال اسم الزوجة أو اسم الزوج.' });
    return;
  }
  if (!['A', 'B', 'C'].includes(eligibility)) {
    res.status(400).json({ error: 'استحقاق الحالة يجب أن يكون A أو B أو C فقط.' });
    return;
  }

  if (wife_national_id) {
    const dup = db
      .prepare('SELECT id, code FROM beneficiaries WHERE id != ? AND (wife_national_id = ? OR husband_national_id = ?)')
      .get(id, wife_national_id, wife_national_id) as { id: number; code: string } | undefined;
    if (dup) {
      res.status(409).json({ error: `الرقم القومي للزوجة مسجل لمستفيد آخر (${dup.code}).` });
      return;
    }
  }
  if (husband_national_id) {
    const dup = db
      .prepare('SELECT id, code FROM beneficiaries WHERE id != ? AND (wife_national_id = ? OR husband_national_id = ?)')
      .get(id, husband_national_id, husband_national_id) as { id: number; code: string } | undefined;
    if (dup) {
      res.status(409).json({ error: `الرقم القومي للزوج مسجل لمستفيد آخر (${dup.code}).` });
      return;
    }
  }

  const now = new Date().toISOString();
  const familyCount = Math.max(1, parseInt(String(b.family_count ?? existing.family_count ?? '1'), 10) || 1);

  db.prepare(`
    UPDATE beneficiaries SET
      wife_name = ?, wife_national_id = ?, wife_job = ?,
      husband_name = ?, husband_national_id = ?, husband_job = ?,
      phone1 = ?, phone2 = ?, address = ?, family_count = ?,
      house_description = ?, notes = ?, eligibility = ?, updated_at = ?
    WHERE id = ?
  `).run(
    wife_name,
    wife_national_id,
    String(b.wife_job ?? existing.wife_job ?? '').trim(),
    husband_name,
    husband_national_id,
    String(b.husband_job ?? existing.husband_job ?? '').trim(),
    phone1,
    phone2,
    String(b.address ?? existing.address ?? '').trim(),
    familyCount,
    String(b.house_description ?? existing.house_description ?? '').trim(),
    String(b.notes ?? existing.notes ?? '').trim(),
    eligibility,
    now,
    id
  );

  const updated = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(id);
  writeAuditLog({
    userId: user.id,
    userName: user.full_name,
    actionType: 'تعديل مستفيد',
    section: 'beneficiaries',
    recordId: String(existing.code),
    beforeData: existing,
    afterData: updated,
  });
  res.json({ beneficiary: updated, message: 'تم تحديث بيانات المستفيد بنجاح.' });
});

beneficiaryRouter.post('/beneficiaries/:id/archive', requireAuth, requirePermission('beneficiaries', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const archived = req.body?.archived ? 1 : 0;
  const existing = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المستفيد غير موجود.' });
    return;
  }
  db.prepare('UPDATE beneficiaries SET is_archived = ?, updated_at = ? WHERE id = ?').run(archived, new Date().toISOString(), id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: archived ? 'أرشفة مستفيد' : 'إلغاء أرشفة مستفيد',
    section: 'beneficiaries',
    recordId: String(existing.code),
  });
  res.json({ ok: true, message: archived ? 'تمت أرشفة المستفيد.' : 'تمت استعادة المستفيد من الأرشيف.' });
});

beneficiaryRouter.delete('/beneficiaries/:id', requireAuth, requirePermission('beneficiaries', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المستفيد غير موجود.' });
    return;
  }
  const aidCount = (db.prepare('SELECT COUNT(*) as c FROM aids WHERE beneficiary_id = ?').get(id) as { c: number }).c;
  if (aidCount > 0) {
    res.status(409).json({
      error: 'لا يمكن حذف مستفيد مرتبط بمساعدات مسجلة؛ يمكنك أرشفته للحفاظ على سلامة السجلات.',
    });
    return;
  }
  db.prepare('DELETE FROM beneficiaries WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف مستفيد',
    section: 'beneficiaries',
    recordId: String(existing.code),
    beforeData: existing,
  });
  res.json({ ok: true, message: 'تم حذف المستفيد نهائيًا.' });
});

beneficiaryRouter.post('/beneficiaries/bulk-delete', requireAuth, requirePermission('beneficiaries', 'delete_bulk'), (req: AuthedRequest, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) {
    res.status(400).json({ error: 'لم يتم تحديد سجلات للحذف.' });
    return;
  }
  let deleted = 0;
  let skipped = 0;
  for (const id of ids) {
    const aidCount = (db.prepare('SELECT COUNT(*) as c FROM aids WHERE beneficiary_id = ?').get(id) as { c: number }).c;
    if (aidCount > 0) {
      skipped++;
      continue;
    }
    const r = db.prepare('DELETE FROM beneficiaries WHERE id = ?').run(id);
    if (r.changes > 0) deleted++;
  }
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف جماعي للمستفيدين',
    section: 'beneficiaries',
    reason: `تم حذف ${deleted} سجل وتخطي ${skipped} مرتبط بمساعدات`,
  });
  res.json({ deleted, skipped, message: `تم حذف ${deleted} مستفيد${skipped ? ` (وتم تخطي ${skipped} لوجود مساعدات مرتبطة بهم)` : ''}.` });
});

beneficiaryRouter.post('/beneficiaries/import', requireAuth, requirePermission('beneficiaries', 'create'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const fileId = req.body?.file_id ? Number(req.body.file_id) : null;

  if (rows.length === 0) {
    res.status(400).json({ error: 'لا توجد صفوف صالحة للاستيراد.' });
    return;
  }

  const existingNids = new Set<string>();
  const existingPhones = new Set<string>();
  const allExisting = db.prepare('SELECT wife_national_id, husband_national_id, phone1 FROM beneficiaries').all() as {
    wife_national_id: string;
    husband_national_id: string;
    phone1: string;
  }[];
  for (const e of allExisting) {
    if (e.wife_national_id) existingNids.add(e.wife_national_id);
    if (e.husband_national_id) existingNids.add(e.husband_national_id);
    if (e.phone1) existingPhones.add(e.phone1);
  }

  let acceptedCount = 0;
  const rejected: { rowIndex: number; reason: string; name: string }[] = [];
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const wife_name = String(r.wife_name ?? '').trim();
      const husband_name = String(r.husband_name ?? '').trim();
      const wife_nid = normalizeDigits(r.wife_national_id);
      const husband_nid = normalizeDigits(r.husband_national_id);
      const phone1 = normalizeDigits(r.phone1);
      const phone2 = normalizeDigits(r.phone2);
      const eligibility = String(r.eligibility ?? '').toUpperCase();
      const label = wife_name || husband_name || `صف ${idx + 1}`;

      if (!wife_name && !husband_name) {
        rejected.push({ rowIndex: r.rowIndex ?? idx + 1, reason: 'لا يوجد اسم للزوجة أو الزوج', name: label });
        continue;
      }
      if (!['A', 'B', 'C'].includes(eligibility)) {
        rejected.push({ rowIndex: r.rowIndex ?? idx + 1, reason: 'استحقاق الحالة ليس A أو B أو C', name: label });
        continue;
      }
      if (wife_nid && existingNids.has(wife_nid)) {
        rejected.push({ rowIndex: r.rowIndex ?? idx + 1, reason: `تكرار الرقم القومي للزوجة (${wife_nid})`, name: label });
        continue;
      }
      if (husband_nid && existingNids.has(husband_nid)) {
        rejected.push({ rowIndex: r.rowIndex ?? idx + 1, reason: `تكرار الرقم القومي للزوج (${husband_nid})`, name: label });
        continue;
      }
      if (phone1 && existingPhones.has(phone1)) {
        rejected.push({ rowIndex: r.rowIndex ?? idx + 1, reason: `تكرار رقم الهاتف (${phone1})`, name: label });
        continue;
      }

      if (wife_nid) existingNids.add(wife_nid);
      if (husband_nid) existingNids.add(husband_nid);
      if (phone1) existingPhones.add(phone1);

      const code = generateNextCode('beneficiaries', 'BEN');
      const familyCount = Math.max(1, parseInt(String(r.family_count ?? '1'), 10) || 1);
      const info = db
        .prepare(`
          INSERT INTO beneficiaries (
            code, wife_name, wife_national_id, wife_job, husband_name, husband_national_id, husband_job,
            phone1, phone2, address, family_count, house_description, notes, eligibility, is_archived,
            created_by_name, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        `)
        .run(
          code,
          wife_name,
          wife_nid,
          String(r.wife_job ?? '').trim(),
          husband_name,
          husband_nid,
          String(r.husband_job ?? '').trim(),
          phone1,
          phone2,
          String(r.address ?? '').trim(),
          familyCount,
          String(r.house_description ?? '').trim(),
          String(r.notes ?? '').trim(),
          eligibility,
          user.full_name,
          now,
          now
        );

      if (fileId) {
        db.prepare('INSERT OR IGNORE INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (?, ?, ?)').run(
          fileId,
          Number(info.lastInsertRowid),
          now
        );
      }
      acceptedCount++;
    }

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'استيراد مستفيدين من Excel',
      section: 'beneficiaries',
      reason: `مقبول: ${acceptedCount} / مرفوض: ${rejected.length}`,
    });
    db.exec('COMMIT');
    res.json({
      acceptedCount,
      rejected,
      message: `اكتمل الاستيراد: تم قبول ${acceptedCount} مستفيد، ورفض ${rejected.length} سجل.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'حدث خطأ أثناء تنفيذ الاستيراد.' });
  }
});

// ==================== BENEFICIARY DOCUMENTS & HISTORY ====================
beneficiaryRouter.get('/beneficiaries/:id/details', requireAuth, requirePermission('beneficiaries', 'view'), (req, res) => {
  const id = Number(req.params.id);
  const beneficiary = db.prepare('SELECT * FROM beneficiaries WHERE id = ?').get(id);
  if (!beneficiary) {
    res.status(404).json({ error: 'المستفيد غير موجود.' });
    return;
  }
  const documents = db
    .prepare('SELECT * FROM beneficiary_documents WHERE beneficiary_id = ? ORDER BY id DESC')
    .all(id);
  const aids = db
    .prepare(`
      SELECT a.*, i.name as initiative_name
      FROM aids a
      LEFT JOIN initiatives i ON i.id = a.initiative_id
      WHERE a.beneficiary_id = ?
      ORDER BY a.id DESC
    `)
    .all(id);
  const files = db
    .prepare(`
      SELECT f.*
      FROM beneficiary_files f
      JOIN beneficiary_file_members m ON m.file_id = f.id
      WHERE m.beneficiary_id = ?
    `)
    .all(id);
  res.json({ beneficiary, documents, aids, files });
});

beneficiaryRouter.post(
  '/beneficiaries/:id/documents',
  requireAuth,
  requirePermission('beneficiaries', 'manage_files'),
  upload.single('file'),
  (req: AuthedRequest, res) => {
    const beneficiaryId = Number(req.params.id);
    if (!req.file) {
      res.status(400).json({ error: 'يرجى اختيار ملف أو صورة للرفع.' });
      return;
    }
    const diskPath = path.join(UPLOADS_DIR, req.file.filename);
    if (!fs.existsSync(diskPath)) {
      res.status(500).json({ error: 'تعذر حفظ المستند على الخادم.' });
      return;
    }
    const now = new Date().toISOString();
    const docType = String(req.body?.doc_type ?? 'مستندات أخرى').trim();
    const title = String(req.body?.title ?? req.file.originalname).trim();
    const fileUrl = `/api/uploads/${req.file.filename}`;

    const info = db
      .prepare(`
        INSERT INTO beneficiary_documents (beneficiary_id, doc_type, title, file_url, original_name, mime_type, uploaded_by_name, uploaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(beneficiaryId, docType, title, fileUrl, req.file.originalname, req.file.mimetype, req.user!.full_name, now);

    const doc = db.prepare('SELECT * FROM beneficiary_documents WHERE id = ?').get(Number(info.lastInsertRowid));
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'رفع مستند مستفيد',
      section: 'beneficiaries',
      recordId: beneficiaryId,
      afterData: { docType, title, fileUrl },
    });
    res.status(201).json({ document: doc, message: 'تم رفع المستند وحفظه في ملف المستفيد بنجاح.' });
  }
);

beneficiaryRouter.delete(
  '/beneficiaries/:id/documents/:docId',
  requireAuth,
  requirePermission('beneficiaries', 'manage_files'),
  (req: AuthedRequest, res) => {
    const docId = Number(req.params.docId);
    const doc = db.prepare('SELECT * FROM beneficiary_documents WHERE id = ?').get(docId) as { file_url: string; title: string } | undefined;
    if (!doc) {
      res.status(404).json({ error: 'المستند غير موجود.' });
      return;
    }
    db.prepare('DELETE FROM beneficiary_documents WHERE id = ?').run(docId);
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'حذف مستند مستفيد',
      section: 'beneficiaries',
      recordId: req.params.id,
      beforeData: doc,
    });
    res.json({ ok: true, message: 'تم حذف المستند بنجاح.' });
  }
);

// ==================== BENEFICIARY COLLECTIVE FILES ====================
beneficiaryRouter.get('/beneficiary-files', requireAuth, requirePermission('beneficiary_files', 'view'), (_req, res) => {
  const files = db
    .prepare(`
      SELECT f.*, (SELECT COUNT(*) FROM beneficiary_file_members m WHERE m.file_id = f.id) as members_count
      FROM beneficiary_files f
      ORDER BY f.id DESC
    `)
    .all();
  res.json({ files });
});

beneficiaryRouter.post('/beneficiary-files', requireAuth, requirePermission('beneficiary_files', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'اسم الملف مطلوب.' });
    return;
  }
  const code = String(b.code ?? '').trim() || generateNextCode('beneficiary_files', 'FILE');
  const now = new Date().toISOString();
  try {
    const info = db
      .prepare(`
        INSERT INTO beneficiary_files (code, name, area, purpose, supervisor_name, supervisor_phone, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        code,
        name,
        String(b.area ?? '').trim(),
        String(b.purpose ?? '').trim(),
        String(b.supervisor_name ?? '').trim(),
        String(b.supervisor_phone ?? '').trim(),
        String(b.notes ?? '').trim(),
        now
      );
    const file = db.prepare('SELECT * FROM beneficiary_files WHERE id = ?').get(Number(info.lastInsertRowid));
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'إنشاء ملف مستفيدين جماعي',
      section: 'beneficiary_files',
      recordId: code,
      afterData: file,
    });
    res.status(201).json({ file, message: 'تم إنشاء الملف الجماعي بنجاح.' });
  } catch {
    res.status(409).json({ error: 'كود الملف مستخدم مسبقًا، يرجى اختيار كود آخر.' });
  }
});

beneficiaryRouter.put('/beneficiary-files/:id', requireAuth, requirePermission('beneficiary_files', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM beneficiary_files WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الملف غير موجود.' });
    return;
  }
  const b = req.body || {};
  db.prepare(`
    UPDATE beneficiary_files SET name = ?, area = ?, purpose = ?, supervisor_name = ?, supervisor_phone = ?, notes = ?
    WHERE id = ?
  `).run(
    String(b.name ?? existing.name).trim(),
    String(b.area ?? existing.area ?? '').trim(),
    String(b.purpose ?? existing.purpose ?? '').trim(),
    String(b.supervisor_name ?? existing.supervisor_name ?? '').trim(),
    String(b.supervisor_phone ?? existing.supervisor_phone ?? '').trim(),
    String(b.notes ?? existing.notes ?? '').trim(),
    id
  );
  const updated = db.prepare('SELECT * FROM beneficiary_files WHERE id = ?').get(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تعديل ملف جماعي',
    section: 'beneficiary_files',
    recordId: id,
  });
  res.json({ file: updated, message: 'تم تعديل بيانات الملف الجماعي.' });
});

beneficiaryRouter.delete('/beneficiary-files/:id', requireAuth, requirePermission('beneficiary_files', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM beneficiary_files WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف ملف جماعي',
    section: 'beneficiary_files',
    recordId: id,
  });
  res.json({ ok: true, message: 'تم حذف الملف الجماعي دون المساس ببيانات المستفيدين الأساسية.' });
});

beneficiaryRouter.get('/beneficiary-files/:id/members', requireAuth, requirePermission('beneficiary_files', 'view'), (req, res) => {
  const fileId = Number(req.params.id);
  const members = db
    .prepare(`
      SELECT b.*, m.added_at
      FROM beneficiaries b
      JOIN beneficiary_file_members m ON m.beneficiary_id = b.id
      WHERE m.file_id = ?
      ORDER BY b.id DESC
    `)
    .all(fileId);
  res.json({ members });
});

beneficiaryRouter.post('/beneficiary-files/:id/members', requireAuth, requirePermission('beneficiary_files', 'edit'), (req: AuthedRequest, res) => {
  const fileId = Number(req.params.id);
  const beneficiaryIds: number[] = Array.isArray(req.body?.beneficiary_ids)
    ? req.body.beneficiary_ids.map(Number)
    : req.body?.beneficiary_id
      ? [Number(req.body.beneficiary_id)]
      : [];
  const now = new Date().toISOString();
  const stmt = db.prepare('INSERT OR IGNORE INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (?, ?, ?)');
  for (const bid of beneficiaryIds) {
    stmt.run(fileId, bid, now);
  }
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إضافة مستفيدين لملف جماعي',
    section: 'beneficiary_files',
    recordId: fileId,
    afterData: beneficiaryIds,
  });
  res.json({ ok: true, message: 'تمت إضافة المستفيدين إلى الملف بنجاح.' });
});

beneficiaryRouter.delete(
  '/beneficiary-files/:id/members/:beneficiaryId',
  requireAuth,
  requirePermission('beneficiary_files', 'edit'),
  (req: AuthedRequest, res) => {
    const fileId = Number(req.params.id);
    const beneficiaryId = Number(req.params.beneficiaryId);
    // Removes only from file membership, NEVER deletes base beneficiary record
    db.prepare('DELETE FROM beneficiary_file_members WHERE file_id = ? AND beneficiary_id = ?').run(fileId, beneficiaryId);
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'إزالة مستفيد من ملف جماعي',
      section: 'beneficiary_files',
      recordId: `${fileId}:${beneficiaryId}`,
    });
    res.json({ ok: true, message: 'تمت إزالة المستفيد من الملف مع الإبقاء على بياناته الأساسية.' });
  }
);

beneficiaryRouter.post('/beneficiary-files/transfer', requireAuth, requirePermission('beneficiary_files', 'edit'), (req: AuthedRequest, res) => {
  const { from_file_id, to_file_id, beneficiary_id } = req.body || {};
  const fromId = Number(from_file_id);
  const toId = Number(to_file_id);
  const benId = Number(beneficiary_id);
  if (!fromId || !toId || !benId || fromId === toId) {
    res.status(400).json({ error: 'يرجى تحديد الملف المصدر والملف الهدف والمستفيد بشكل صحيح.' });
    return;
  }
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM beneficiary_file_members WHERE file_id = ? AND beneficiary_id = ?').run(fromId, benId);
    db.prepare('INSERT OR IGNORE INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (?, ?, ?)').run(
      toId,
      benId,
      new Date().toISOString()
    );
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'نقل مستفيد بين الملفات',
      section: 'beneficiary_files',
      recordId: benId,
      beforeData: { file_id: fromId },
      afterData: { file_id: toId },
    });
    db.exec('COMMIT');
    res.json({ ok: true, message: 'تم نقل المستفيد إلى الملف الجديد بنجاح دون تكرار بياناته.' });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'تعذر نقل المستفيد بين الملفات.' });
  }
});

// ==================== AIDS MANAGEMENT ====================
function parseAidItems(raw: string): AidItemAllocation[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function deductAidInventory(aidId: number, aidCode: string, items: AidItemAllocation[], user: NonNullable<AuthedRequest['user']>) {
  const canOverride = hasPermission(user.permissions, 'inventory', 'override_stock', user.is_owner === 1);
  const now = new Date().toISOString();

  for (const alloc of items) {
    const qty = Number(alloc.quantity);
    if (!alloc.item_id || qty <= 0) continue;
    const invItem = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(alloc.item_id) as
      | { id: number; name: string; quantity: number; min_quantity: number }
      | undefined;
    if (!invItem) {
      throw new Error(`الصنف المحدد (${alloc.item_name}) غير موجود في المخازن.`);
    }
    if (invItem.quantity < qty && !canOverride) {
      throw new Error(`الرصيد المتاح من "${invItem.name}" (${invItem.quantity}) غير كافٍ لصرف (${qty}).`);
    }
    const newQty = invItem.quantity - qty;
    db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(newQty, now, invItem.id);
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reference_id, reason, created_by_name, created_at)
      VALUES (?, 'منصرف', ?, ?, 'aid', ?, ?, ?, ?)
    `).run(
      invItem.id,
      qty,
      newQty,
      aidId,
      `صرف مساعدة معتمدة (${aidCode})${invItem.quantity < qty ? ' [تجاوز حد المخزون بصلاحية خاصة]' : ''}`,
      user.full_name,
      now
    );

    if (newQty <= invItem.min_quantity) {
      createNotification(
        'تنبيه انخفاض مخزون',
        `انخفض رصيد الصنف "${invItem.name}" إلى ${newQty} بعد صرف المساعدة ${aidCode}.`,
        'inventory',
        'warning'
      );
    }
  }
}

function restoreAidInventoryWithCorrection(aidId: number, aidCode: string, items: AidItemAllocation[], userName: string, reason: string) {
  const now = new Date().toISOString();
  for (const alloc of items) {
    const qty = Number(alloc.quantity);
    if (!alloc.item_id || qty <= 0) continue;
    const invItem = db.prepare('SELECT id, name, quantity FROM inventory_items WHERE id = ?').get(alloc.item_id) as
      | { id: number; name: string; quantity: number }
      | undefined;
    if (!invItem) continue;
    const newQty = invItem.quantity + qty;
    db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(newQty, now, invItem.id);
    // Documented corrective movement WITHOUT deleting original movement
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reference_id, reason, created_by_name, created_at)
      VALUES (?, 'تصحيح', ?, ?, 'aid_correction', ?, ?, ?, ?)
    `).run(invItem.id, qty, newQty, aidId, `حركة تصحيح مخزنية (${aidCode}): ${reason}`, userName, now);
  }
}

beneficiaryRouter.get('/aids', requireAuth, requirePermission('aids', 'view'), (_req, res) => {
  const rows = db
    .prepare(`
      SELECT a.*,
        COALESCE(NULLIF(b.wife_name, ''), b.husband_name) as beneficiary_name,
        b.code as beneficiary_code,
        i.name as initiative_name
      FROM aids a
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      LEFT JOIN initiatives i ON i.id = a.initiative_id
      ORDER BY a.id DESC
    `)
    .all() as Record<string, unknown>[];

  const mapped = rows.map((r) => ({
    ...r,
    items: parseAidItems(String(r.items_json ?? '[]')),
  }));
  res.json({ aids: mapped });
});

beneficiaryRouter.post('/aids', requireAuth, requirePermission('aids', 'create'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const beneficiary_id = Number(b.beneficiary_id);
  const initiative_id = b.initiative_id ? Number(b.initiative_id) : null;
  const aid_type = String(b.aid_type ?? '').trim();
  const aid_date = String(b.aid_date ?? new Date().toISOString().slice(0, 10)).trim();
  const items: AidItemAllocation[] = Array.isArray(b.items) ? b.items : [];
  const requestedStatus = String(b.status ?? 'مسجلة');

  if (!beneficiary_id || !aid_type) {
    res.status(400).json({ error: 'يرجى تحديد المستفيد ونوع المساعدة.' });
    return;
  }

  const canApproveOnCreate =
    (requestedStatus === 'معتمدة' || requestedStatus === 'مسلمة') &&
    hasPermission(user.permissions, 'aids', 'approve', user.is_owner === 1);
  const finalStatus = canApproveOnCreate ? requestedStatus : 'قيد المراجعة';

  const code = generateNextCode('aids', 'AID');
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(`
        INSERT INTO aids (
          code, beneficiary_id, initiative_id, aid_type, quantity_label, cash_amount, items_json,
          aid_date, status, stock_deducted, financial_ref, notes, action_reason, created_by_name, approved_by_name, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '', ?, ?, ?, ?)
      `)
      .run(
        code,
        beneficiary_id,
        initiative_id,
        aid_type,
        String(b.quantity_label ?? '').trim(),
        Number(b.cash_amount ?? 0) || 0,
        JSON.stringify(items),
        aid_date,
        finalStatus,
        String(b.financial_ref ?? '').trim(),
        String(b.notes ?? '').trim(),
        user.full_name,
        canApproveOnCreate ? user.full_name : '',
        now,
        now
      );

    const newId = Number(info.lastInsertRowid);
    if ((finalStatus === 'معتمدة' || finalStatus === 'مسلمة') && items.length > 0) {
      deductAidInventory(newId, code, items, user);
      db.prepare('UPDATE aids SET stock_deducted = 1 WHERE id = ?').run(newId);
    }

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تسجيل مساعدة جديدة',
      section: 'aids',
      recordId: code,
      afterData: { beneficiary_id, aid_type, status: finalStatus, items },
    });
    createNotification('تسجيل مساعدة جديدة', `تم تسجيل مساعدة (${aid_type}) بكود ${code} بحالة (${finalStatus}).`, 'aids', 'info');

    db.exec('COMMIT');
    const created = db.prepare('SELECT * FROM aids WHERE id = ?').get(newId) as Record<string, unknown>;
    res.status(201).json({
      aid: { ...created, items },
      message: `تم تسجيل المساعدة (${code}) بنجاح.`,
    });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تسجيل المساعدة.' });
  }
});

beneficiaryRouter.put('/aids/:id', requireAuth, requirePermission('aids', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.user!;
  const existing = db.prepare('SELECT * FROM aids WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المساعدة غير موجودة.' });
    return;
  }

  const b = req.body || {};
  const reason = String(b.action_reason ?? '').trim();
  if (!reason) {
    res.status(400).json({ error: 'يجب كتابة سبب التعديل لتوثيقه في سجل العمليات.' });
    return;
  }

  if (existing.status === 'ملغاة') {
    res.status(400).json({ error: 'لا يمكن تعديل مساعدة ملغاة.' });
    return;
  }

  const newItems: AidItemAllocation[] = Array.isArray(b.items) ? b.items : parseAidItems(String(existing.items_json ?? '[]'));
  const oldItems = parseAidItems(String(existing.items_json ?? '[]'));
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    if (existing.stock_deducted === 1) {
      // Reverse old deducted stock via corrective movement, then deduct new items
      restoreAidInventoryWithCorrection(id, String(existing.code), oldItems, user.full_name, `تعديل أصناف المساعدة: ${reason}`);
      deductAidInventory(id, String(existing.code), newItems, user);
    }

    db.prepare(`
      UPDATE aids SET
        aid_type = ?, quantity_label = ?, cash_amount = ?, items_json = ?, aid_date = ?,
        initiative_id = ?, notes = ?, action_reason = ?, updated_at = ?
      WHERE id = ?
    `).run(
      String(b.aid_type ?? existing.aid_type).trim(),
      String(b.quantity_label ?? existing.quantity_label ?? '').trim(),
      Number(b.cash_amount ?? existing.cash_amount ?? 0) || 0,
      JSON.stringify(newItems),
      String(b.aid_date ?? existing.aid_date).trim(),
      b.initiative_id !== undefined ? (b.initiative_id ? Number(b.initiative_id) : null) : (existing.initiative_id ? Number(existing.initiative_id) : null),
      String(b.notes ?? existing.notes ?? '').trim(),
      reason,
      now,
      id
    );

    const updated = db.prepare('SELECT * FROM aids WHERE id = ?').get(id) as Record<string, unknown>;
    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'تعديل مساعدة',
      section: 'aids',
      recordId: String(existing.code),
      beforeData: existing,
      afterData: updated,
      reason,
    });
    db.exec('COMMIT');
    res.json({ aid: { ...updated, items: newItems }, message: 'تم تعديل المساعدة وتوثيق السبب في سجل العمليات.' });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'تعذر تعديل المساعدة.' });
  }
});

beneficiaryRouter.post('/aids/:id/status', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.user!;
  const { status, reason } = req.body || {};
  const existing = db.prepare('SELECT * FROM aids WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المساعدة غير موجودة.' });
    return;
  }

  let requiredAction: 'approve' | 'reject' | 'cancel' = 'approve';
  if (status === 'مرفوضة') requiredAction = 'reject';
  else if (status === 'ملغاة') requiredAction = 'cancel';

  if (!hasPermission(user.permissions, 'aids', requiredAction, user.is_owner === 1)) {
    res.status(403).json({ error: 'ليس لديك صلاحية تنفيذ هذا الإجراء على المساعدة.' });
    return;
  }

  if ((status === 'مرفوضة' || status === 'ملغاة') && !String(reason ?? '').trim()) {
    res.status(400).json({ error: 'يرجى توضيح سبب الرفض أو الإلغاء.' });
    return;
  }

  const items = parseAidItems(String(existing.items_json ?? '[]'));
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    let stockDeducted = Number(existing.stock_deducted || 0);

    if ((status === 'معتمدة' || status === 'مسلمة') && stockDeducted === 0 && items.length > 0) {
      deductAidInventory(id, String(existing.code), items, user);
      stockDeducted = 1;
    }

    if ((status === 'ملغاة' || status === 'مرفوضة') && stockDeducted === 1 && items.length > 0) {
      restoreAidInventoryWithCorrection(id, String(existing.code), items, user.full_name, String(reason));
      stockDeducted = 0;
    }

    db.prepare(`
      UPDATE aids SET status = ?, stock_deducted = ?, action_reason = ?, approved_by_name = ?, updated_at = ?
      WHERE id = ?
    `).run(
      status,
      stockDeducted,
      String(reason ?? '').trim(),
      status === 'معتمدة' || status === 'مسلمة' ? user.full_name : String(existing.approved_by_name ?? ''),
      now,
      id
    );

    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: `تغيير حالة مساعدة إلى (${status})`,
      section: 'aids',
      recordId: String(existing.code),
      beforeData: { status: existing.status },
      afterData: { status },
      reason: String(reason ?? ''),
    });
    createNotification('تحديث حالة مساعدة', `تم تحديث حالة المساعدة ${existing.code} إلى (${status}).`, 'aids', status === 'مرفوضة' ? 'warning' : 'success');

    db.exec('COMMIT');
    res.json({ ok: true, message: `تم تحديث حالة المساعدة إلى (${status}) بنجاح.` });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'فشل تغيير حالة المساعدة.' });
  }
});

beneficiaryRouter.delete('/aids/:id', requireAuth, requirePermission('aids', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const user = req.user!;
  const reason = String(req.body?.reason ?? req.query.reason ?? '').trim();
  if (!reason) {
    res.status(400).json({ error: 'يجب تسجيل سبب الحذف لتوثيقه في سجل العمليات.' });
    return;
  }
  const existing = db.prepare('SELECT * FROM aids WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'المساعدة غير موجودة.' });
    return;
  }

  const items = parseAidItems(String(existing.items_json ?? '[]'));
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    // If tied to financial ref or approved cash, settle/cancel instead of hard delete
    if (String(existing.financial_ref ?? '').trim() || (Number(existing.cash_amount ?? 0) > 0 && (existing.status === 'معتمدة' || existing.status === 'مسلمة'))) {
      if (existing.stock_deducted === 1 && items.length > 0) {
        restoreAidInventoryWithCorrection(id, String(existing.code), items, user.full_name, reason);
      }
      db.prepare(`UPDATE aids SET status = 'ملغاة', stock_deducted = 0, action_reason = ?, updated_at = ? WHERE id = ?`).run(
        `إلغاء وتسوية مالية: ${reason}`,
        now,
        id
      );
      writeAuditLog({
        userId: user.id,
        userName: user.full_name,
        actionType: 'إلغاء وتسوية مساعدة مرتبطة ماليًا',
        section: 'aids',
        recordId: String(existing.code),
        beforeData: existing,
        reason,
      });
      db.exec('COMMIT');
      res.json({ ok: true, settledOnly: true, message: 'المساعدة مرتبطة بقيد مالي معتمد؛ تم إلغاؤها وتسويتها مع حفظ سجل التدقيق دون حذفها ماليًا.' });
      return;
    }

    if (existing.stock_deducted === 1 && items.length > 0) {
      restoreAidInventoryWithCorrection(id, String(existing.code), items, user.full_name, `حذف مساعدة مصروفة: ${reason}`);
    }

    db.prepare('DELETE FROM aids WHERE id = ?').run(id);
    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'حذف مساعدة',
      section: 'aids',
      recordId: String(existing.code),
      beforeData: existing,
      reason,
    });
    db.exec('COMMIT');
    res.json({ ok: true, message: 'تم حذف المساعدة وتوثيق حركة التصحيح المخزنية في سجل العمليات.' });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'تعذر حذف المساعدة.' });
  }
});

beneficiaryRouter.post('/aids/bulk-delete', requireAuth, requirePermission('aids', 'delete_bulk'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const reason = String(req.body?.reason ?? '').trim();
  if (ids.length === 0 || !reason) {
    res.status(400).json({ error: 'يرجى تحديد المساعدات وذكر سبب الحذف الجماعي.' });
    return;
  }

  let deleted = 0;
  let settled = 0;
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    for (const id of ids) {
      const existing = db.prepare('SELECT * FROM aids WHERE id = ?').get(id) as Record<string, unknown> | undefined;
      if (!existing) continue;
      const items = parseAidItems(String(existing.items_json ?? '[]'));
      if (existing.stock_deducted === 1 && items.length > 0) {
        restoreAidInventoryWithCorrection(id, String(existing.code), items, user.full_name, reason);
      }
      if (String(existing.financial_ref ?? '').trim() || (Number(existing.cash_amount ?? 0) > 0 && (existing.status === 'معتمدة' || existing.status === 'مسلمة'))) {
        db.prepare(`UPDATE aids SET status = 'ملغاة', stock_deducted = 0, action_reason = ?, updated_at = ? WHERE id = ?`).run(reason, now, id);
        settled++;
      } else {
        db.prepare('DELETE FROM aids WHERE id = ?').run(id);
        deleted++;
      }
    }
    writeAuditLog({
      userId: user.id,
      userName: user.full_name,
      actionType: 'حذف جماعي للمساعدات',
      section: 'aids',
      reason: `${reason} (حذف: ${deleted}، تسوية: ${settled})`,
    });
    db.exec('COMMIT');
    res.json({ deleted, settled, message: `تم حذف ${deleted} مساعدة وتسوية/إلغاء ${settled} مساعدة مرتبطة ماليًا.` });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'فشل الحذف الجماعي للمساعدات.' });
  }
});
