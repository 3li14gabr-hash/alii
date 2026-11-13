import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { GoogleGenAI } from '@google/genai';
import { db, UPLOADS_DIR, writeAuditLog, generateNextCode } from '../db';
import { requireAuth, requirePermission, saveBase64ImageToUploads, upload, type AuthedRequest } from '../middleware';
import { hasPermission } from '../../src/shared/permissions';

export const orgAndAdminRouter = Router();

// ==================== STAFF (EMPLOYEES & VOLUNTEERS) ====================
orgAndAdminRouter.get('/staff', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const personType = req.query.type as string | undefined;
  const canEmp = hasPermission(user.permissions, 'employees', 'view', user.is_owner === 1) || hasPermission(user.permissions, 'id_cards', 'view', user.is_owner === 1);
  const canVol = hasPermission(user.permissions, 'volunteers', 'view', user.is_owner === 1) || hasPermission(user.permissions, 'id_cards', 'view', user.is_owner === 1);

  if (!canEmp && !canVol) {
    res.status(403).json({ error: 'ليس لديك صلاحية عرض بيانات الموظفين أو المتطوعين.' });
    return;
  }

  let rows: unknown[] = [];
  if (personType === 'employee' && canEmp) {
    rows = db.prepare("SELECT * FROM staff_persons WHERE person_type = 'employee' ORDER BY id DESC").all();
  } else if (personType === 'volunteer' && canVol) {
    rows = db.prepare("SELECT * FROM staff_persons WHERE person_type = 'volunteer' ORDER BY id DESC").all();
  } else {
    rows = db.prepare('SELECT * FROM staff_persons ORDER BY id DESC').all();
  }
  res.json({ staff: rows });
});

orgAndAdminRouter.post('/staff', requireAuth, upload.single('photo'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const person_type = b.person_type === 'volunteer' ? 'volunteer' : 'employee';
  const section = person_type === 'volunteer' ? 'volunteers' : 'employees';

  if (!hasPermission(user.permissions, section, 'create', user.is_owner === 1)) {
    res.status(403).json({ error: 'ليس لديك صلاحية الإضافة في هذا القسم.' });
    return;
  }

  const full_name = String(b.full_name ?? '').trim();
  const job_title = String(b.job_title ?? '').trim();
  if (!full_name || !job_title) {
    res.status(400).json({ error: 'الاسم الكامل والصفة/الوظيفة مطلوبان.' });
    return;
  }

  const prefix = person_type === 'volunteer' ? 'VOL' : 'EMP';
  const existingCount = (db.prepare('SELECT COUNT(*) as c FROM staff_persons WHERE person_type = ?').get(person_type) as { c: number }).c;
  const code = `${prefix}-${String(existingCount + 1 + Math.floor(Math.random() * 5) * 0).padStart(4, '0')}`;
  const uniqueCode = db.prepare('SELECT id FROM staff_persons WHERE code = ?').get(code)
    ? generateNextCode('staff_persons', prefix)
    : code;

  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
  const now = new Date().toISOString();

  const info = db
    .prepare(`
      INSERT INTO staff_persons (person_type, code, full_name, national_id, phone, email, address, job_title, department_or_tasks, hire_or_join_date, status, photo_url, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      person_type,
      uniqueCode,
      full_name,
      String(b.national_id ?? '').trim(),
      String(b.phone ?? '').trim(),
      String(b.email ?? '').trim(),
      String(b.address ?? '').trim(),
      job_title,
      String(b.department_or_tasks ?? '').trim(),
      String(b.hire_or_join_date ?? now.slice(0, 10)).trim(),
      String(b.status ?? 'نشط').trim(),
      photoUrl,
      String(b.notes ?? '').trim(),
      now
    );

  const created = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(Number(info.lastInsertRowid));
  writeAuditLog({
    userId: user.id,
    userName: user.full_name,
    actionType: person_type === 'volunteer' ? 'إضافة متطوع' : 'إضافة موظف',
    section,
    recordId: uniqueCode,
    afterData: created,
  });
  res.status(201).json({ person: created, message: `تم التسجيل بنجاح بكود (${uniqueCode}).` });
});

orgAndAdminRouter.put('/staff/:id', requireAuth, upload.single('photo'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'السجل غير موجود.' });
    return;
  }
  const section = existing.person_type === 'volunteer' ? 'volunteers' : 'employees';
  if (!hasPermission(req.user!.permissions, section, 'edit', req.user!.is_owner === 1)) {
    res.status(403).json({ error: 'ليس لديك صلاحية التعديل في هذا القسم.' });
    return;
  }

  const b = req.body || {};
  const photoUrl = req.file ? `/api/uploads/${req.file.filename}` : String(existing.photo_url ?? '');

  db.prepare(`
    UPDATE staff_persons SET full_name = ?, national_id = ?, phone = ?, email = ?, address = ?,
      job_title = ?, department_or_tasks = ?, hire_or_join_date = ?, status = ?, photo_url = ?, notes = ?
    WHERE id = ?
  `).run(
    String(b.full_name ?? existing.full_name).trim(),
    String(b.national_id ?? existing.national_id ?? '').trim(),
    String(b.phone ?? existing.phone ?? '').trim(),
    String(b.email ?? existing.email ?? '').trim(),
    String(b.address ?? existing.address ?? '').trim(),
    String(b.job_title ?? existing.job_title).trim(),
    String(b.department_or_tasks ?? existing.department_or_tasks ?? '').trim(),
    String(b.hire_or_join_date ?? existing.hire_or_join_date).trim(),
    String(b.status ?? existing.status).trim(),
    photoUrl,
    String(b.notes ?? existing.notes ?? '').trim(),
    id
  );

  const updated = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تعديل بيانات موظف/متطوع',
    section,
    recordId: String(existing.code),
    beforeData: existing,
    afterData: updated,
  });
  res.json({ person: updated, message: 'تم تحديث البيانات وحفظ السجل بنجاح.' });
});

orgAndAdminRouter.delete('/staff/:id', requireAuth, (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'السجل غير موجود.' });
    return;
  }
  const section = existing.person_type === 'volunteer' ? 'volunteers' : 'employees';
  if (!hasPermission(req.user!.permissions, section, 'delete_single', req.user!.is_owner === 1)) {
    res.status(403).json({ error: 'ليس لديك صلاحية الحذف في هذا القسم.' });
    return;
  }
  db.prepare('DELETE FROM staff_persons WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف موظف/متطوع',
    section,
    recordId: String(existing.code),
    beforeData: existing,
  });
  res.json({ ok: true, message: 'تم حذف السجل بنجاح.' });
});

// ==================== ATTENDANCE & FACE VERIFICATION ====================
async function verifyFacesWithGemini(profilePhotoUrl: string, livePhotoUrl: string): Promise<{
  available: boolean;
  matched: boolean | null;
  confidence: string;
  message: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      available: false,
      matched: null,
      confidence: 'غير مفعلة',
      message: 'خدمة التحقق بالوجه الآلي غير مفعلة حاليًا (مفتاح خدمة التحقق غير مضبوط). يرجى استخدام الوسيلة البديلة الموثقة مع حفظ الصورة التوثيقية.',
    };
  }
  if (!profilePhotoUrl || !livePhotoUrl) {
    return {
      available: true,
      matched: false,
      confidence: 'ناقص',
      message: 'تتطلب المطابقة وجود صورة شخصية أساسية مسجلة وصورة التقاط حالية.',
    };
  }

  const resolveDiskPath = (url: string) => path.join(UPLOADS_DIR, path.basename(url));
  const p1 = resolveDiskPath(profilePhotoUrl);
  const p2 = resolveDiskPath(livePhotoUrl);
  if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
    return {
      available: false,
      matched: null,
      confidence: 'غير متاح',
      message: 'تعذر قراءة ملفات الصور للمقارنة على الخادم.',
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const img1Base64 = fs.readFileSync(p1).toString('base64');
    const img2Base64 = fs.readFileSync(p2).toString('base64');
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: img1Base64 } },
            { inlineData: { mimeType: 'image/jpeg', data: img2Base64 } },
            {
              text: 'Compare the two face images strictly for attendance identity verification. Respond ONLY with valid JSON: {"matched": true|false, "confidence": "high"|"medium"|"low", "reason_ar": "سبب مختصر بالعربية"}.',
            },
          ],
        },
      ],
    });
    const raw = response.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : '{}') as {
      matched?: boolean;
      confidence?: string;
      reason_ar?: string;
    };
    return {
      available: true,
      matched: Boolean(parsed.matched),
      confidence: parsed.confidence || 'medium',
      message: parsed.reason_ar || (parsed.matched ? 'تمت مطابقة الوجه بنجاح.' : 'لم تتطابق ملامح الوجه.'),
    };
  } catch {
    return {
      available: false,
      matched: null,
      confidence: 'تعذر الاتصال',
      message: 'تعذر الاتصال بخدمة التحقق بالوجه الآن؛ تم حفظ الصورة التوثيقية ويمكن الاعتماد على الوسيلة البديلة.',
    };
  }
}

orgAndAdminRouter.get('/attendance', requireAuth, requirePermission('attendance', 'view'), (_req, res) => {
  const records = db
    .prepare(`
      SELECT a.*, s.full_name as person_name, s.code as person_code, s.photo_url as profile_photo_url
      FROM attendance a
      JOIN staff_persons s ON s.id = a.person_id
      ORDER BY a.id DESC LIMIT 200
    `)
    .all();
  res.json({ attendance: records });
});

orgAndAdminRouter.post('/attendance/check-in', requireAuth, requirePermission('attendance', 'create'), upload.single('photo'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const b = req.body || {};
  const person_id = Number(b.person_id);
  const consent_given = b.consent_given === true || b.consent_given === 'true' || b.consent_given === '1';

  if (!person_id) {
    res.status(400).json({ error: 'يرجى اختيار الموظف أو المتطوع.' });
    return;
  }
  if (!consent_given) {
    res.status(400).json({ error: 'يجب تأكيد موافقة الشخص على التقاط وحفظ صورة التحقق قبل تسجيل الحضور.' });
    return;
  }

  const person = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(person_id) as
    | { id: number; person_type: 'employee' | 'volunteer'; full_name: string; photo_url: string }
    | undefined;
  if (!person) {
    res.status(404).json({ error: 'الموظف أو المتطوع غير موجود.' });
    return;
  }

  let checkInPhotoUrl = '';
  if (req.file) {
    checkInPhotoUrl = `/api/uploads/${req.file.filename}`;
  } else if (typeof b.photo_base64 === 'string' && b.photo_base64.startsWith('data:image/')) {
    checkInPhotoUrl = saveBase64ImageToUploads(b.photo_base64, 'checkin');
  }

  const requestedMethod = b.method === 'تحقق بالوجه' ? 'تحقق بالوجه' : 'وسيلة بديلة';
  let finalMethod: 'تحقق بالوجه' | 'وسيلة بديلة' = requestedMethod;
  let verificationStatus = 'تسجيل يدوي موثق بالوسيلة البديلة';

  if (requestedMethod === 'تحقق بالوجه') {
    const verify = await verifyFacesWithGemini(person.photo_url, checkInPhotoUrl);
    if (!verify.available) {
      finalMethod = 'وسيلة بديلة';
      verificationStatus = `تعذر التحقق الآلي (${verify.message}) — تم التحويل للوسيلة البديلة`;
    } else if (verify.matched) {
      verificationStatus = `مطابق (${verify.confidence}) — ${verify.message}`;
    } else {
      verificationStatus = `غير مطابق (${verify.confidence}) — ${verify.message}`;
    }
  }

  const now = new Date();
  const dateStr = String(b.attendance_date ?? now.toISOString().slice(0, 10));
  const timeStr = String(b.check_in_time ?? now.toTimeString().slice(0, 5));

  const info = db
    .prepare(`
      INSERT INTO attendance (
        person_type, person_id, attendance_date, check_in_time, check_in_photo_url,
        check_in_method, check_in_verification_status, work_status, consent_given, notes, recorded_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `)
    .run(
      person.person_type,
      person.id,
      dateStr,
      timeStr,
      checkInPhotoUrl,
      finalMethod,
      verificationStatus,
      String(b.work_status ?? 'حاضر'),
      String(b.notes ?? '').trim(),
      user.full_name
    );

  writeAuditLog({
    userId: user.id,
    userName: user.full_name,
    actionType: 'تسجيل حضور',
    section: 'attendance',
    recordId: Number(info.lastInsertRowid),
    afterData: { person: person.full_name, method: finalMethod, verificationStatus },
  });
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    verificationStatus,
    method: finalMethod,
    message: `تم تسجيل حضور ${person.full_name} وحفظ صورة التوثيق بنجاح.`,
  });
});

orgAndAdminRouter.post('/attendance/:id/check-out', requireAuth, requirePermission('attendance', 'edit'), upload.single('photo'), async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'سجل الحضور غير موجود.' });
    return;
  }
  const person = db.prepare('SELECT * FROM staff_persons WHERE id = ?').get(existing.person_id as number) as
    | { full_name: string; photo_url: string }
    | undefined;

  const b = req.body || {};
  let checkOutPhotoUrl = '';
  if (req.file) {
    checkOutPhotoUrl = `/api/uploads/${req.file.filename}`;
  } else if (typeof b.photo_base64 === 'string' && b.photo_base64.startsWith('data:image/')) {
    checkOutPhotoUrl = saveBase64ImageToUploads(b.photo_base64, 'checkout');
  }

  const requestedMethod = b.method === 'تحقق بالوجه' ? 'تحقق بالوجه' : 'وسيلة بديلة';
  let finalMethod = requestedMethod;
  let verificationStatus = 'انصراف موثق بالوسيلة البديلة';

  if (requestedMethod === 'تحقق بالوجه' && person) {
    const verify = await verifyFacesWithGemini(person.photo_url, checkOutPhotoUrl);
    if (!verify.available) {
      finalMethod = 'وسيلة بديلة';
      verificationStatus = `تعذر التحقق الآلي — تم التحويل للوسيلة البديلة`;
    } else {
      verificationStatus = `${verify.matched ? 'مطابق' : 'غير مطابق'} (${verify.confidence}) — ${verify.message}`;
    }
  }

  const now = new Date();
  const timeStr = String(b.check_out_time ?? now.toTimeString().slice(0, 5));

  db.prepare(`
    UPDATE attendance SET
      check_out_time = ?, check_out_photo_url = ?, check_out_method = ?,
      check_out_verification_status = ?, work_status = 'منصرف'
    WHERE id = ?
  `).run(timeStr, checkOutPhotoUrl, finalMethod, verificationStatus, id);

  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تسجيل انصراف',
    section: 'attendance',
    recordId: id,
    afterData: { timeStr, verificationStatus },
  });
  res.json({ ok: true, verificationStatus, message: 'تم تسجيل الانصراف وحفظ صورة التحقق بنجاح.' });
});

// ==================== PARTNERS ====================
orgAndAdminRouter.get('/partners', requireAuth, requirePermission('partners', 'view'), (_req, res) => {
  const partners = db
    .prepare(`
      SELECT p.*, i.name as initiative_name,
        (SELECT COUNT(*) FROM partner_beneficiaries pb WHERE pb.partner_id = p.id) as beneficiaries_count
      FROM partners p
      LEFT JOIN initiatives i ON i.id = p.initiative_id
      ORDER BY p.id DESC
    `)
    .all();
  res.json({ partners });
});

orgAndAdminRouter.post('/partners', requireAuth, requirePermission('partners', 'create'), upload.single('document'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'اسم الجهة الشريكة مطلوب.' });
    return;
  }
  const docUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
  const info = db
    .prepare(`
      INSERT INTO partners (name, partner_type, contact_person, phone, email, address, agreement_title, agreement_start, agreement_end, initiative_id, document_url, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      name,
      String(b.partner_type ?? 'جمعية أهلية').trim(),
      String(b.contact_person ?? '').trim(),
      String(b.phone ?? '').trim(),
      String(b.email ?? '').trim(),
      String(b.address ?? '').trim(),
      String(b.agreement_title ?? '').trim(),
      String(b.agreement_start ?? '').trim(),
      String(b.agreement_end ?? '').trim(),
      b.initiative_id ? Number(b.initiative_id) : null,
      docUrl,
      String(b.notes ?? '').trim()
    );
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إضافة شريك',
    section: 'partners',
    recordId: Number(info.lastInsertRowid),
    afterData: { name },
  });
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تمت إضافة الشريك بنجاح.' });
});

orgAndAdminRouter.put('/partners/:id', requireAuth, requirePermission('partners', 'edit'), upload.single('document'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الشريك غير موجود.' });
    return;
  }
  const b = req.body || {};
  const docUrl = req.file ? `/api/uploads/${req.file.filename}` : String(existing.document_url ?? '');
  db.prepare(`
    UPDATE partners SET name = ?, partner_type = ?, contact_person = ?, phone = ?, email = ?, address = ?,
      agreement_title = ?, agreement_start = ?, agreement_end = ?, initiative_id = ?, document_url = ?, notes = ?
    WHERE id = ?
  `).run(
    String(b.name ?? existing.name).trim(),
    String(b.partner_type ?? existing.partner_type).trim(),
    String(b.contact_person ?? existing.contact_person ?? '').trim(),
    String(b.phone ?? existing.phone ?? '').trim(),
    String(b.email ?? existing.email ?? '').trim(),
    String(b.address ?? existing.address ?? '').trim(),
    String(b.agreement_title ?? existing.agreement_title ?? '').trim(),
    String(b.agreement_start ?? existing.agreement_start ?? '').trim(),
    String(b.agreement_end ?? existing.agreement_end ?? '').trim(),
    b.initiative_id !== undefined ? (b.initiative_id ? Number(b.initiative_id) : null) : (existing.initiative_id ? Number(existing.initiative_id) : null),
    docUrl,
    String(b.notes ?? existing.notes ?? '').trim(),
    id
  );
  res.json({ ok: true, message: 'تم تحديث بيانات الشريك.' });
});

orgAndAdminRouter.delete('/partners/:id', requireAuth, requirePermission('partners', 'delete_single'), (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM partners WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, message: 'تم حذف الشريك.' });
});

orgAndAdminRouter.get('/partners/:id/beneficiaries', requireAuth, requirePermission('partners', 'view'), (req, res) => {
  const rows = db.prepare('SELECT * FROM partner_beneficiaries WHERE partner_id = ? ORDER BY id DESC').all(Number(req.params.id));
  res.json({ beneficiaries: rows });
});

orgAndAdminRouter.post('/partners/:id/beneficiaries', requireAuth, requirePermission('partners', 'edit'), (req, res) => {
  const partnerId = Number(req.params.id);
  const b = req.body || {};
  const full_name = String(b.full_name ?? '').trim();
  if (!full_name) {
    res.status(400).json({ error: 'اسم المستفيد مطلوب.' });
    return;
  }
  db.prepare(`
    INSERT INTO partner_beneficiaries (partner_id, full_name, phone, national_id, service_received, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    partnerId,
    full_name,
    String(b.phone ?? '').trim(),
    String(b.national_id ?? '').trim(),
    String(b.service_received ?? '').trim(),
    String(b.notes ?? '').trim(),
    new Date().toISOString()
  );
  res.status(201).json({ ok: true, message: 'تم تسجيل المستفيد ضمن قائمة الشريك.' });
});

// ==================== ANNOUNCEMENTS ====================
orgAndAdminRouter.get('/announcements', requireAuth, requirePermission('announcements', 'view'), (_req, res) => {
  const rows = db
    .prepare(`
      SELECT a.*, i.name as initiative_name
      FROM announcements a
      LEFT JOIN initiatives i ON i.id = a.initiative_id
      ORDER BY a.id DESC
    `)
    .all();
  res.json({ announcements: rows });
});

orgAndAdminRouter.post('/announcements', requireAuth, requirePermission('announcements', 'create'), upload.single('image'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const title = String(b.title ?? '').trim();
  const body = String(b.body ?? '').trim();
  if (!title || !body) {
    res.status(400).json({ error: 'عنوان ونص الإعلان مطلوبان.' });
    return;
  }
  const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
  const now = new Date().toISOString();
  const info = db
    .prepare(`
      INSERT INTO announcements (title, body, category, initiative_id, image_url, status, publish_date, expire_date, contact_note, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      title,
      body,
      String(b.category ?? 'مبادرة').trim(),
      b.initiative_id ? Number(b.initiative_id) : null,
      imageUrl,
      String(b.status ?? 'منشور').trim(),
      String(b.publish_date ?? now.slice(0, 10)).trim(),
      String(b.expire_date ?? '').trim(),
      String(b.contact_note ?? '').trim(),
      req.user!.full_name
    );
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تم حفظ الإعلان بنجاح.' });
});

orgAndAdminRouter.put('/announcements/:id', requireAuth, requirePermission('announcements', 'edit'), upload.single('image'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الإعلان غير موجود.' });
    return;
  }
  const b = req.body || {};
  const imageUrl = req.file ? `/api/uploads/${req.file.filename}` : String(existing.image_url ?? '');
  db.prepare(`
    UPDATE announcements SET title = ?, body = ?, category = ?, initiative_id = ?, image_url = ?, status = ?, publish_date = ?, expire_date = ?, contact_note = ?
    WHERE id = ?
  `).run(
    String(b.title ?? existing.title).trim(),
    String(b.body ?? existing.body).trim(),
    String(b.category ?? existing.category).trim(),
    b.initiative_id !== undefined ? (b.initiative_id ? Number(b.initiative_id) : null) : (existing.initiative_id ? Number(existing.initiative_id) : null),
    imageUrl,
    String(b.status ?? existing.status).trim(),
    String(b.publish_date ?? existing.publish_date).trim(),
    String(b.expire_date ?? existing.expire_date ?? '').trim(),
    String(b.contact_note ?? existing.contact_note ?? '').trim(),
    id
  );
  res.json({ ok: true, message: 'تم تحديث الإعلان.' });
});

orgAndAdminRouter.delete('/announcements/:id', requireAuth, requirePermission('announcements', 'delete_single'), (req, res) => {
  db.prepare('DELETE FROM announcements WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, message: 'تم حذف الإعلان.' });
});

// ==================== SUPPLIERS & SUPPLIES ====================
orgAndAdminRouter.get('/suppliers', requireAuth, requirePermission('suppliers', 'view'), (_req, res) => {
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY id DESC').all();
  const supplies = db
    .prepare(`
      SELECT s.*, sup.name as supplier_name, w.name as warehouse_name, i.name as item_name
      FROM supplies s
      JOIN suppliers sup ON sup.id = s.supplier_id
      JOIN warehouses w ON w.id = s.warehouse_id
      JOIN inventory_items i ON i.id = s.item_id
      ORDER BY s.id DESC
    `)
    .all();
  res.json({ suppliers, supplies });
});

orgAndAdminRouter.post('/suppliers', requireAuth, requirePermission('suppliers', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'اسم المورد مطلوب.' });
    return;
  }
  const info = db
    .prepare('INSERT INTO suppliers (name, category, phone, email, address, tax_no, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(
      name,
      String(b.category ?? 'مواد غذائية').trim(),
      String(b.phone ?? '').trim(),
      String(b.email ?? '').trim(),
      String(b.address ?? '').trim(),
      String(b.tax_no ?? '').trim(),
      String(b.notes ?? '').trim()
    );
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تمت إضافة المورد بنجاح.' });
});

orgAndAdminRouter.put('/suppliers/:id', requireAuth, requirePermission('suppliers', 'edit'), (req, res) => {
  const id = Number(req.params.id);
  const b = req.body || {};
  db.prepare('UPDATE suppliers SET name = ?, category = ?, phone = ?, email = ?, address = ?, tax_no = ?, notes = ? WHERE id = ?').run(
    String(b.name ?? '').trim(),
    String(b.category ?? '').trim(),
    String(b.phone ?? '').trim(),
    String(b.email ?? '').trim(),
    String(b.address ?? '').trim(),
    String(b.tax_no ?? '').trim(),
    String(b.notes ?? '').trim(),
    id
  );
  res.json({ ok: true, message: 'تم تحديث بيانات المورد.' });
});

orgAndAdminRouter.delete('/suppliers/:id', requireAuth, requirePermission('suppliers', 'delete_single'), (req, res) => {
  db.prepare('DELETE FROM suppliers WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true, message: 'تم حذف المورد.' });
});

orgAndAdminRouter.post('/supplies', requireAuth, requirePermission('suppliers', 'create'), upload.single('invoice'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const supplier_id = Number(b.supplier_id);
  const item_id = Number(b.item_id);
  const quantity = Number(b.quantity ?? 0);
  const unit_price = Number(b.unit_price ?? 0);
  if (!supplier_id || !item_id || quantity <= 0) {
    res.status(400).json({ error: 'يرجى تحديد المورد والصنف والكمية.' });
    return;
  }
  const item = db.prepare('SELECT id, warehouse_id, quantity, name FROM inventory_items WHERE id = ?').get(item_id) as
    | { id: number; warehouse_id: number; quantity: number; name: string }
    | undefined;
  if (!item) {
    res.status(404).json({ error: 'الصنف غير موجود.' });
    return;
  }
  const total_price = quantity * unit_price;
  const invoiceUrl = req.file ? `/api/uploads/${req.file.filename}` : '';
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    const info = db
      .prepare(`
        INSERT INTO supplies (supplier_id, warehouse_id, item_id, quantity, unit_price, total_price, supply_date, invoice_no, invoice_url, notes, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        supplier_id,
        item.warehouse_id,
        item.id,
        quantity,
        unit_price,
        total_price,
        String(b.supply_date ?? now.slice(0, 10)),
        String(b.invoice_no ?? '').trim(),
        invoiceUrl,
        String(b.notes ?? '').trim(),
        req.user!.full_name
      );

    const newQty = item.quantity + quantity;
    db.prepare('UPDATE inventory_items SET quantity = ?, updated_at = ? WHERE id = ?').run(newQty, now, item.id);
    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reference_id, reason, created_by_name, created_at)
      VALUES (?, 'وارد', ?, ?, 'supply', ?, ?, ?, ?)
    `).run(item.id, quantity, newQty, Number(info.lastInsertRowid), `توريد من مورد فاتورة (${b.invoice_no || '-'})`, req.user!.full_name, now);

    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'تسجيل توريد وإضافته للمخزن',
      section: 'suppliers',
      recordId: Number(info.lastInsertRowid),
      afterData: { item: item.name, quantity, total_price },
    });
    db.exec('COMMIT');
    res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تم تسجيل التوريد وإضافة الكمية للمخزن بنجاح.' });
  } catch {
    db.exec('ROLLBACK');
    res.status(500).json({ error: 'تعذر تسجيل التوريد.' });
  }
});

// ==================== USERS, ROLES, AUDIT, SETTINGS, BACKUP ====================
orgAndAdminRouter.get('/users', requireAuth, requirePermission('users', 'view'), (_req, res) => {
  const users = db
    .prepare(`
      SELECT u.id, u.username, u.full_name, u.phone, u.email, u.role_id, u.is_owner, u.is_active, u.created_at,
             r.name as role_name, r.key as role_key
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.is_owner DESC, u.id ASC
    `)
    .all();
  res.json({ users });
});

orgAndAdminRouter.post('/users', requireAuth, requirePermission('users', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const username = String(b.username ?? '').trim();
  const full_name = String(b.full_name ?? '').trim();
  const password = String(b.password ?? '');
  const role_id = Number(b.role_id);

  if (!username || !full_name || password.length < 6 || !role_id) {
    res.status(400).json({ error: 'يرجى إدخال اسم المستخدم والاسم الكامل والدور وكلمة مرور لا تقل عن 6 أحرف.' });
    return;
  }

  const dup = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (dup) {
    res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقًا.' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  const info = db
    .prepare(`
      INSERT INTO users (username, password_hash, full_name, phone, email, role_id, is_owner, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
    `)
    .run(username, hash, full_name, String(b.phone ?? '').trim(), String(b.email ?? '').trim(), role_id, now);

  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إنشاء مستخدم جديد',
    section: 'users',
    recordId: username,
    afterData: { username, full_name, role_id },
  });
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تم إنشاء حساب المستخدم بنجاح.' });
});

orgAndAdminRouter.put('/users/:id', requireAuth, requirePermission('users', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as { is_owner: number; username: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }
  const b = req.body || {};
  db.prepare('UPDATE users SET full_name = ?, phone = ?, email = ?, role_id = ? WHERE id = ?').run(
    String(b.full_name ?? '').trim(),
    String(b.phone ?? '').trim(),
    String(b.email ?? '').trim(),
    target.is_owner ? (db.prepare("SELECT id FROM roles WHERE key = 'owner'").get() as { id: number }).id : Number(b.role_id),
    id
  );
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تعديل مستخدم',
    section: 'users',
    recordId: target.username,
  });
  res.json({ ok: true, message: 'تم تحديث بيانات المستخدم.' });
});

orgAndAdminRouter.post('/users/:id/toggle-active', requireAuth, requirePermission('users', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT id, username, is_owner, is_active FROM users WHERE id = ?').get(id) as
    | { id: number; username: string; is_owner: number; is_active: number }
    | undefined;
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }
  if (target.is_owner) {
    res.status(400).json({ error: 'لا يمكن حظر حساب مالك النظام.' });
    return;
  }
  const nextActive = target.is_active ? 0 : 1;
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextActive, id);
  if (!nextActive) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: nextActive ? 'تفعيل مستخدم' : 'حظر مستخدم',
    section: 'users',
    recordId: target.username,
  });
  res.json({ ok: true, is_active: nextActive, message: nextActive ? 'تم تفعيل المستخدم.' : 'تم حظر المستخدم وإنهاء جلساته.' });
});

orgAndAdminRouter.post('/users/:id/reset-password', requireAuth, requirePermission('users', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password ?? '');
  if (password.length < 6) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' });
    return;
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إعادة تعيين كلمة مرور',
    section: 'users',
    recordId: id,
  });
  res.json({ ok: true, message: 'تمت إعادة تعيين كلمة المرور بنجاح.' });
});

orgAndAdminRouter.delete('/users/:id', requireAuth, requirePermission('users', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const target = db.prepare('SELECT is_owner, username FROM users WHERE id = ?').get(id) as { is_owner: number; username: string } | undefined;
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }
  if (target.is_owner) {
    res.status(400).json({ error: 'لا يمكن حذف مالك النظام.' });
    return;
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'حذف مستخدم',
    section: 'users',
    recordId: target.username,
  });
  res.json({ ok: true, message: 'تم حذف المستخدم.' });
});

orgAndAdminRouter.get('/roles', requireAuth, (req: AuthedRequest, res) => {
  const canView =
    hasPermission(req.user!.permissions, 'roles', 'view', req.user!.is_owner === 1) ||
    hasPermission(req.user!.permissions, 'users', 'view', req.user!.is_owner === 1);
  if (!canView) {
    res.status(403).json({ error: 'ليس لديك صلاحية عرض الأدوار.' });
    return;
  }
  const rows = db.prepare('SELECT * FROM roles ORDER BY id ASC').all() as {
    id: number;
    key: string;
    name: string;
    description: string;
    is_system: number;
    permissions_json: string;
  }[];
  res.json({
    roles: rows.map((r) => ({
      ...r,
      permissions: JSON.parse(r.permissions_json || '{}'),
    })),
  });
});

orgAndAdminRouter.post('/roles', requireAuth, requirePermission('roles', 'create'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  const name = String(b.name ?? '').trim();
  if (!name) {
    res.status(400).json({ error: 'اسم الدور مطلوب.' });
    return;
  }
  const key = `custom_${Date.now()}`;
  const perms = JSON.stringify(b.permissions || {});
  const info = db
    .prepare('INSERT INTO roles (key, name, description, is_system, permissions_json) VALUES (?, ?, ?, 0, ?)')
    .run(key, name, String(b.description ?? '').trim(), perms);
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'إضافة دور جديد',
    section: 'roles',
    recordId: name,
  });
  res.status(201).json({ id: Number(info.lastInsertRowid), message: 'تم إنشاء الدور وتحديد صلاحياته بنجاح.' });
});

orgAndAdminRouter.put('/roles/:id', requireAuth, requirePermission('roles', 'edit'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as { key: string; name: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الدور غير موجود.' });
    return;
  }
  if (existing.key === 'owner') {
    res.status(400).json({ error: 'لا يمكن تقليص صلاحيات مالك النظام.' });
    return;
  }
  const b = req.body || {};
  db.prepare('UPDATE roles SET name = ?, description = ?, permissions_json = ? WHERE id = ?').run(
    String(b.name ?? existing.name).trim(),
    String(b.description ?? '').trim(),
    JSON.stringify(b.permissions || {}),
    id
  );
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تعديل صلاحيات دور',
    section: 'roles',
    recordId: existing.name,
  });
  res.json({ ok: true, message: 'تم حفظ صلاحيات الدور وتطبيقها فورًا.' });
});

orgAndAdminRouter.delete('/roles/:id', requireAuth, requirePermission('roles', 'delete_single'), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id) as { is_system: number; name: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'الدور غير موجود.' });
    return;
  }
  if (existing.is_system) {
    res.status(400).json({ error: 'لا يمكن حذف الأدوار الافتراضية الأساسية للنظام.' });
    return;
  }
  const assigned = (db.prepare('SELECT COUNT(*) as c FROM users WHERE role_id = ?').get(id) as { c: number }).c;
  if (assigned > 0) {
    res.status(409).json({ error: 'لا يمكن حذف دور مرتبط بمستخدمين حاليين.' });
    return;
  }
  db.prepare('DELETE FROM roles WHERE id = ?').run(id);
  res.json({ ok: true, message: 'تم حذف الدور.' });
});

orgAndAdminRouter.get('/audit-logs', requireAuth, requirePermission('audit', 'view'), (req, res) => {
  const limit = Math.min(500, Number(req.query.limit ?? 200));
  const logs = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);
  res.json({ logs });
});

orgAndAdminRouter.get('/settings/general', requireAuth, (_req, res) => {
  const row = db.prepare('SELECT * FROM general_settings WHERE id = 1').get() as Record<string, unknown>;
  res.json({
    settings: {
      ...row,
      aid_types: JSON.parse(String(row.aid_types_json || '[]')),
      units: JSON.parse(String(row.units_json || '[]')),
    },
  });
});

orgAndAdminRouter.put('/settings/general', requireAuth, requirePermission('settings', 'edit'), (req: AuthedRequest, res) => {
  const b = req.body || {};
  db.prepare(`
    UPDATE general_settings SET
      aid_types_json = ?, units_json = ?, min_password_length = ?, photo_retention_days = ?,
      print_header_note = ?, notify_on_low_stock = ?, notify_on_new_aid = ?, notify_on_donation = ?
    WHERE id = 1
  `).run(
    JSON.stringify(Array.isArray(b.aid_types) ? b.aid_types : []),
    JSON.stringify(Array.isArray(b.units) ? b.units : []),
    Math.max(6, Number(b.min_password_length ?? 6)),
    Math.max(30, Number(b.photo_retention_days ?? 365)),
    String(b.print_header_note ?? '').trim(),
    b.notify_on_low_stock ? 1 : 0,
    b.notify_on_new_aid ? 1 : 0,
    b.notify_on_donation ? 1 : 0
  );
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تحديث الإعدادات العامة',
    section: 'settings',
  });
  res.json({ ok: true, message: 'تم حفظ الإعدادات العامة بنجاح.' });
});

// ==================== BACKUP & RESTORE ====================
const BACKUP_TABLES = [
  'association_settings',
  'association_history',
  'roles',
  'users',
  'beneficiaries',
  'beneficiary_documents',
  'beneficiary_files',
  'beneficiary_file_members',
  'initiatives',
  'initiative_images',
  'initiative_supervisors',
  'initiative_beneficiaries',
  'warehouses',
  'inventory_items',
  'inventory_movements',
  'stocktakes',
  'aids',
  'donations',
  'expenses',
  'staff_persons',
  'attendance',
  'partners',
  'partner_beneficiaries',
  'announcements',
  'suppliers',
  'supplies',
  'general_settings',
  'notifications',
  'audit_logs',
];

orgAndAdminRouter.get('/backup/export', requireAuth, requirePermission('backup', 'view'), (req: AuthedRequest, res) => {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  }
  const uploadedFiles: Record<string, string> = {};
  if (fs.existsSync(UPLOADS_DIR)) {
    for (const f of fs.readdirSync(UPLOADS_DIR)) {
      const full = path.join(UPLOADS_DIR, f);
      if (fs.statSync(full).isFile() && fs.statSync(full).size < 5 * 1024 * 1024) {
        uploadedFiles[f] = fs.readFileSync(full).toString('base64');
      }
    }
  }
  writeAuditLog({
    userId: req.user!.id,
    userName: req.user!.full_name,
    actionType: 'تصدير نسخة احتياطية كاملة',
    section: 'backup',
  });
  res.json({
    meta: {
      app: 'خيرنا — جمعية الخير للتنمية الشاملة بالمراشدة',
      exported_at: new Date().toISOString(),
      exported_by: req.user!.full_name,
      version: 1,
    },
    tables,
    uploadedFiles,
  });
});

orgAndAdminRouter.post('/backup/restore', requireAuth, requirePermission('backup', 'create'), (req: AuthedRequest, res) => {
  const payload = req.body || {};
  const tables = payload.tables as Record<string, Record<string, unknown>[]> | undefined;
  if (!tables || typeof tables !== 'object' || !Array.isArray(tables.association_settings)) {
    res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح أو تالف.' });
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN;');
  try {
    for (const t of [...BACKUP_TABLES].reverse()) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    for (const t of BACKUP_TABLES) {
      const rows = tables[t];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      for (const row of rows) {
        const cols = Object.keys(row);
        const placeholders = cols.map(() => '?').join(', ');
        const vals = cols.map((c) => {
          const v = row[c];
          return v === undefined ? null : (v as string | number | null);
        });
        db.prepare(`INSERT INTO ${t} (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
      }
    }
    if (payload.uploadedFiles && typeof payload.uploadedFiles === 'object') {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      for (const [fname, b64] of Object.entries(payload.uploadedFiles as Record<string, string>)) {
        const safeName = path.basename(fname);
        fs.writeFileSync(path.join(UPLOADS_DIR, safeName), Buffer.from(b64, 'base64'));
      }
    }
    db.exec('COMMIT;');
    db.exec('PRAGMA foreign_keys = ON;');
    writeAuditLog({
      userId: req.user!.id,
      userName: req.user!.full_name,
      actionType: 'استعادة نسخة احتياطية',
      section: 'backup',
      result: 'نجاح',
    });
    res.json({ ok: true, message: 'تمت استعادة قاعدة البيانات والملفات بنجاح.' });
  } catch (err) {
    db.exec('ROLLBACK;');
    db.exec('PRAGMA foreign_keys = ON;');
    res.status(500).json({ error: 'فشلت استعادة النسخة الاحتياطية؛ تم الحفاظ على البيانات الحالية.' });
  }
});
