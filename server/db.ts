import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_TEMPLATES } from '../src/shared/permissions';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DB_PATH = path.join(DATA_DIR, 'khayrna.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function copyGeneratedAssetToUploads(assetFileName: string, targetName: string): string {
  const srcPath = path.resolve(process.cwd(), 'src/assets/images', assetFileName);
  const destPath = path.join(UPLOADS_DIR, targetName);
  if (fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
    fs.copyFileSync(srcPath, destPath);
  }
  return fs.existsSync(destPath) ? `/api/uploads/${targetName}` : '';
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS association_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      app_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      governorate TEXT DEFAULT '',
      center TEXT DEFAULT '',
      village TEXT DEFAULT '',
      phone1 TEXT DEFAULT '',
      phone2 TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      email TEXT DEFAULT '',
      website TEXT DEFAULT '',
      registration_no TEXT DEFAULT '',
      tax_no TEXT DEFAULT '',
      chairman_name TEXT DEFAULT '',
      secretary_name TEXT DEFAULT '',
      treasurer_name TEXT DEFAULT '',
      description TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      updated_by_name TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS association_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      updated_by_id INTEGER,
      updated_by_name TEXT NOT NULL,
      changes_summary TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_system INTEGER DEFAULT 0,
      permissions_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      role_id INTEGER NOT NULL,
      is_owner INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS beneficiaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      wife_name TEXT DEFAULT '',
      wife_national_id TEXT DEFAULT '',
      wife_job TEXT DEFAULT '',
      husband_name TEXT DEFAULT '',
      husband_national_id TEXT DEFAULT '',
      husband_job TEXT DEFAULT '',
      phone1 TEXT DEFAULT '',
      phone2 TEXT DEFAULT '',
      address TEXT DEFAULT '',
      family_count INTEGER DEFAULT 1,
      house_description TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      eligibility TEXT NOT NULL DEFAULT 'B' CHECK (eligibility IN ('A', 'B', 'C')),
      is_archived INTEGER DEFAULT 0,
      created_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beneficiary_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      beneficiary_id INTEGER NOT NULL,
      doc_type TEXT NOT NULL,
      title TEXT NOT NULL,
      file_url TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT DEFAULT '',
      uploaded_by_name TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS beneficiary_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      area TEXT DEFAULT '',
      purpose TEXT DEFAULT '',
      supervisor_name TEXT DEFAULT '',
      supervisor_phone TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beneficiary_file_members (
      file_id INTEGER NOT NULL,
      beneficiary_id INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (file_id, beneficiary_id),
      FOREIGN KEY (file_id) REFERENCES beneficiary_files(id) ON DELETE CASCADE,
      FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS initiatives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      budget REAL DEFAULT 0,
      eligibility_rules TEXT DEFAULT '',
      allocated_aids_summary TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'نشطة',
      cover_image_url TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS initiative_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      uploaded_at TEXT NOT NULL,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS initiative_supervisors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role_title TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      assigned_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS initiative_beneficiaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initiative_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      national_id TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      family_count INTEGER DEFAULT 1,
      notes TEXT DEFAULT '',
      linked_beneficiary_id INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE CASCADE,
      FOREIGN KEY (linked_beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT DEFAULT '',
      manager_name TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      min_quantity REAL NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'عام',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference_type TEXT DEFAULT 'manual',
      reference_id INTEGER DEFAULT NULL,
      reason TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stocktakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      recorded_qty REAL NOT NULL,
      actual_qty REAL NOT NULL,
      variance REAL NOT NULL,
      reason TEXT DEFAULT '',
      responsible_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS aids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      beneficiary_id INTEGER NOT NULL,
      initiative_id INTEGER DEFAULT NULL,
      aid_type TEXT NOT NULL,
      quantity_label TEXT DEFAULT '',
      cash_amount REAL DEFAULT 0,
      items_json TEXT DEFAULT '[]',
      aid_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'مسجلة',
      stock_deducted INTEGER DEFAULT 0,
      financial_ref TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      action_reason TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      approved_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE RESTRICT,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      donor_name TEXT NOT NULL,
      donor_phone TEXT DEFAULT '',
      donation_type TEXT NOT NULL DEFAULT 'نقدي',
      amount REAL DEFAULT 0,
      in_kind_description TEXT DEFAULT '',
      donation_date TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'عام',
      initiative_id INTEGER DEFAULT NULL,
      purpose TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'مسجل',
      receipt_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      updated_by_name TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT DEFAULT 'تشغيلي',
      amount REAL NOT NULL DEFAULT 0,
      expense_date TEXT NOT NULL,
      initiative_id INTEGER DEFAULT NULL,
      reason TEXT NOT NULL,
      receipt_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'معتمد',
      created_by_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS staff_persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_type TEXT NOT NULL CHECK (person_type IN ('employee', 'volunteer')),
      code TEXT UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      national_id TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      job_title TEXT NOT NULL,
      department_or_tasks TEXT DEFAULT '',
      hire_or_join_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'نشط',
      photo_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      person_type TEXT NOT NULL CHECK (person_type IN ('employee', 'volunteer')),
      person_id INTEGER NOT NULL,
      attendance_date TEXT NOT NULL,
      check_in_time TEXT DEFAULT '',
      check_in_photo_url TEXT DEFAULT '',
      check_in_method TEXT DEFAULT 'وسيلة بديلة',
      check_in_verification_status TEXT DEFAULT '',
      check_out_time TEXT DEFAULT '',
      check_out_photo_url TEXT DEFAULT '',
      check_out_method TEXT DEFAULT '',
      check_out_verification_status TEXT DEFAULT '',
      work_status TEXT NOT NULL DEFAULT 'حاضر',
      consent_given INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      recorded_by_name TEXT NOT NULL,
      FOREIGN KEY (person_id) REFERENCES staff_persons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      partner_type TEXT DEFAULT 'جمعية أهلية',
      contact_person TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      agreement_title TEXT DEFAULT '',
      agreement_start TEXT DEFAULT '',
      agreement_end TEXT DEFAULT '',
      initiative_id INTEGER DEFAULT NULL,
      document_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS partner_beneficiaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      national_id TEXT DEFAULT '',
      service_received TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT DEFAULT 'مبادرة',
      initiative_id INTEGER DEFAULT NULL,
      image_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'منشور',
      publish_date TEXT NOT NULL,
      expire_date TEXT DEFAULT '',
      contact_note TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      FOREIGN KEY (initiative_id) REFERENCES initiatives(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT DEFAULT 'مواد غذائية',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      tax_no TEXT DEFAULT '',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS supplies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      warehouse_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      supply_date TEXT NOT NULL,
      invoice_no TEXT DEFAULT '',
      invoice_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_by_name TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      action_type TEXT NOT NULL,
      section TEXT NOT NULL,
      record_id TEXT DEFAULT '',
      before_data TEXT DEFAULT '',
      after_data TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      result TEXT NOT NULL DEFAULT 'نجاح',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      section TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS general_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      aid_types_json TEXT NOT NULL,
      units_json TEXT NOT NULL,
      min_password_length INTEGER DEFAULT 6,
      photo_retention_days INTEGER DEFAULT 365,
      print_header_note TEXT DEFAULT '',
      notify_on_low_stock INTEGER DEFAULT 1,
      notify_on_new_aid INTEGER DEFAULT 1,
      notify_on_donation INTEGER DEFAULT 1
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  const roleCount = (db.prepare('SELECT COUNT(*) as c FROM roles').get() as { c: number }).c;
  if (roleCount === 0) {
    const insertRole = db.prepare(
      'INSERT INTO roles (key, name, description, is_system, permissions_json) VALUES (?, ?, ?, 1, ?)'
    );
    for (const r of DEFAULT_ROLE_TEMPLATES) {
      insertRole.run(r.key, r.name, r.description, JSON.stringify(r.permissions));
    }
  } else {
    const viewerTemplate = DEFAULT_ROLE_TEMPLATES.find((r) => r.key === 'viewer');
    const existingViewer = db.prepare("SELECT id, permissions_json FROM roles WHERE key = 'viewer' AND is_system = 1").get() as
      | { id: number; permissions_json: string }
      | undefined;
    if (viewerTemplate && existingViewer) {
      try {
        const parsed = JSON.parse(existingViewer.permissions_json) as Record<string, string[]>;
        if (parsed.audit && parsed.audit.length === 1 && parsed.audit[0] === 'view' && !parsed.beneficiaries?.includes('edit')) {
          db.prepare('UPDATE roles SET permissions_json = ? WHERE id = ?').run(
            JSON.stringify(viewerTemplate.permissions),
            existingViewer.id
          );
        }
      } catch {
        // ignore invalid json
      }
    }
  }

  const assocCount = (db.prepare('SELECT COUNT(*) as c FROM association_settings').get() as { c: number }).c;
  const now = new Date().toISOString();
  const logoUrl = copyGeneratedAssetToUploads('charity_emblem_logo_1794560126444.jpg', 'default_charity_logo.jpg');
  const foodCover = copyGeneratedAssetToUploads('initiative_food_aid_1794560127054.jpg', 'seed_food_initiative.jpg');
  const medCover = copyGeneratedAssetToUploads('initiative_medical_care_1794560126947.jpg', 'seed_medical_initiative.jpg');
  const bannerCover = copyGeneratedAssetToUploads('announcement_campaign_banner_1794560128072.jpg', 'seed_campaign_banner.jpg');

  if (assocCount === 0) {
    db.prepare(`
      INSERT INTO association_settings (
        id, name, short_name, app_name, address, governorate, center, village,
        phone1, phone2, whatsapp, email, website, registration_no, tax_no,
        chairman_name, secretary_name, treasurer_name, description, logo_url,
        updated_at, updated_by_name
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      'جمعية الخير للتنمية الشاملة',
      'جمعية الخير للتنمية الشاملة',
      'خيرنا',
      'المنشية امام المثلث',
      'قنا',
      'الوقف',
      'المراشدة',
      '01023456789',
      '0965432100',
      '01023456789',
      'info@khair-marashda.org',
      'https://khair-marashda.org',
      'مشهرة برقم 1428 لسنة 2016 - مديرية التضامن الاجتماعي بقنا',
      '450-819-221',
      'أ. عبد الرحمن محمد علي',
      'أ. محمود حسن إبراهيم',
      'أ. خالد أحمد يوسف',
      'جمعية تنموية خيرية مشهرة تهدف إلى دعم الأسر الأولى بالرعاية وتقديم المساعدات الغذائية والطبية والتعليمية وتنفيذ المبادرات التنموية الشاملة بقرية المراشدة وتوابعها.',
      logoUrl,
      now,
      'النظام'
    );
  } else {
    const existingAssoc = db.prepare('SELECT id, name, address FROM association_settings WHERE id = 1').get() as
      | { id: number; name: string; address: string }
      | undefined;
    if (
      existingAssoc &&
      existingAssoc.name === 'جمعية الخير للتنمية الشاملة بالمراشدة' &&
      existingAssoc.address === 'شارع الوحدة المحلية - قرية المراشدة - مركز الوقف'
    ) {
      db.prepare('UPDATE association_settings SET name = ?, short_name = ?, address = ?, updated_at = ? WHERE id = 1').run(
        'جمعية الخير للتنمية الشاملة',
        'جمعية الخير للتنمية الشاملة',
        'المنشية امام المثلث',
        now
      );
    }
  }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    const ownerRole = db.prepare("SELECT id FROM roles WHERE key = 'owner'").get() as { id: number };
    const adminRole = db.prepare("SELECT id FROM roles WHERE key = 'admin'").get() as { id: number };
    const viewerRole = db.prepare("SELECT id FROM roles WHERE key = 'viewer'").get() as { id: number };

    const ownerHash = bcrypt.hashSync('Owner@2026', 10);
    const adminHash = bcrypt.hashSync('Admin@2026', 10);
    const viewerHash = bcrypt.hashSync('Viewer@2026', 10);

    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, phone, email, role_id, is_owner, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('owner', ownerHash, 'مالك النظام — رئيس مجلس الإدارة', '01023456789', 'owner@khair-marashda.org', ownerRole.id, 1, now);

    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, phone, email, role_id, is_owner, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('manager', adminHash, 'أ. محمود حسن (مدير الجمعية)', '01011223344', 'manager@khair-marashda.org', adminRole.id, 0, now);

    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, phone, email, role_id, is_owner, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run('viewer', viewerHash, 'مراقب للعرض فقط', '01099887766', 'viewer@khair-marashda.org', viewerRole.id, 0, now);
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) as c FROM general_settings').get() as { c: number }).c;
  if (settingsCount === 0) {
    db.prepare(`
      INSERT INTO general_settings (id, aid_types_json, units_json, min_password_length, photo_retention_days, print_header_note)
      VALUES (1, ?, ?, 6, 365, ?)
    `).run(
      JSON.stringify(['مساعدة غذائية', 'مساعدة مالية', 'مساعدة طبية وعلاجية', 'كسوة وبطاطين', 'تجهيز عرائس', 'سداد ديون وغارمات', 'دعم تعليمي']),
      JSON.stringify(['كرتونة', 'كيلو', 'عبوة', 'جنيه', 'بطانية', 'وحدة', 'حقيبة']),
      'وثيقة رسمية صادرة من نظام خيرنا — جمعية الخير للتنمية الشاملة بالمراشدة'
    );
  }

  const benCount = (db.prepare('SELECT COUNT(*) as c FROM beneficiaries').get() as { c: number }).c;
  if (benCount === 0) {
    const insertBen = db.prepare(`
      INSERT INTO beneficiaries (
        code, wife_name, wife_national_id, wife_job, husband_name, husband_national_id, husband_job,
        phone1, phone2, address, family_count, house_description, notes, eligibility, is_archived, created_by_name, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'النظام', ?, ?)
    `);
    insertBen.run('BEN-0001', 'فاطمة عبد الحميد حسن', '28904122700114', 'ربة منزل', 'علي محمود سليمان', '28408152700321', 'عامل يومية', '01005544332', '01114433221', 'نجع الشيخ حسين - المراشدة', 6, 'منزل دور أرضي طوب أبيض بدون سقف خرساني', 'أسرة أولى بالرعاية - 4 أطفال في مراحل التعليم', 'A', now, now);
    insertBen.run('BEN-0002', 'سعاد إبراهيم محمد', '29201202700552', 'خياطة منزلية', 'أحمد جابر عبد الله', '28706102700817', 'سائق تروسيكل', '01067788991', '', 'شارع الترعة - المراشدة', 4, 'شقة إيجار قديم دور أول', 'يحتاج علاج شهري للزوج', 'A', now, now);
    insertBen.run('BEN-0003', 'نادية مصطفى كامل', '28109032700719', 'أرملة - لا تعمل', '', '', '', '01223344556', '01098877665', 'عزبة الصعايدة - المراشدة', 3, 'منزل قديم مشترك مع الأسرة', 'معاش تكافل فقط', 'B', now, now);
    insertBen.run('BEN-0004', 'زينب حسانين علي', '29511142700443', 'ربة منزل', 'مصطفى عبد الراضي', '29002022700912', 'مزارع بالأجرة', '01156677884', '', 'منطقة المحطة - المراشدة', 5, 'منزل طوب أحمر غرفتين وصالة', 'حالة موسمية مستقرة نسبيًا', 'C', now, now);

    db.prepare(`
      INSERT INTO beneficiary_files (code, name, area, purpose, supervisor_name, supervisor_phone, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FILE-001', 'أسر نجع الشيخ حسين الأولى بالرعاية', 'نجع الشيخ حسين', 'الكفالة الشهرية وكراتين الغذاء', 'أ. عبد الرحمن محمد', '01023456789', 'ملف مخصص للأسر فئة A', now);

    db.prepare(`
      INSERT INTO beneficiary_files (code, name, area, purpose, supervisor_name, supervisor_phone, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('FILE-002', 'ملف الأرامل والأيتام بالمراشدة', 'قرية المراشدة وتوابعها', 'رعاية الأيتام والدعم التعليمي', 'أ. هدى عبد السلام', '01055667788', 'مراجعة دورية كل 3 أشهر', now);

    db.prepare(`INSERT INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (1, 1, ?)`).run(now);
    db.prepare(`INSERT INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (1, 2, ?)`).run(now);
    db.prepare(`INSERT INTO beneficiary_file_members (file_id, beneficiary_id, added_at) VALUES (2, 3, ?)`).run(now);
  }

  const whCount = (db.prepare('SELECT COUNT(*) as c FROM warehouses').get() as { c: number }).c;
  if (whCount === 0) {
    db.prepare(`INSERT INTO warehouses (name, location, manager_name, notes) VALUES (?, ?, ?, ?)`).run(
      'المخزن الرئيسي - مقر الجمعية',
      'شارع الوحدة المحلية - المراشدة',
      'أ. طارق سعد',
      'مخزن المواد الغذائية والبطاطين'
    );
    db.prepare(`INSERT INTO warehouses (name, location, manager_name, notes) VALUES (?, ?, ?, ?)`).run(
      'مخزن القوافل الطبية والأدوية',
      'الدور الثاني - مقر الجمعية',
      'د. سلمى نصر',
      'مستلزمات طبية وأجهزة تعويضية'
    );

    const insertItem = db.prepare(`
      INSERT INTO inventory_items (warehouse_id, code, name, unit, quantity, min_quantity, category, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertItem.run(1, 'ITM-001', 'كرتونة مواد غذائية متكاملة', 'كرتونة', 85, 25, 'مواد غذائية', now);
    insertItem.run(1, 'ITM-002', 'بطانية شتوية مزدوجة', 'بطانية', 18, 20, 'أغطية وملابس', now); // intentionally below min for low-stock alert
    insertItem.run(1, 'ITM-003', 'حقيبة مدرسية بمستلزماتها', 'حقيبة', 45, 15, 'دعم تعليمي', now);
    insertItem.run(2, 'ITM-004', 'جهاز قياس سكر وضغط', 'وحدة', 12, 5, 'مستلزمات طبية', now);

    db.prepare(`
      INSERT INTO inventory_movements (item_id, movement_type, quantity, balance_after, reference_type, reason, created_by_name, created_at)
      VALUES (1, 'وارد', 100, 100, 'seed', 'رصيد افتتاحي', 'النظام', ?)
    `).run(now);
  }

  const initCount = (db.prepare('SELECT COUNT(*) as c FROM initiatives').get() as { c: number }).c;
  if (initCount === 0) {
    db.prepare(`
      INSERT INTO initiatives (code, name, description, start_date, end_date, budget, eligibility_rules, allocated_aids_summary, status, cover_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'INIT-001',
      'مبادرة إطعام وكرامة للأسر الأولى بالرعاية',
      'توزيع كراتين غذائية شهرية متكاملة على الأسر المسجلة بقرية المراشدة والنجوع المجاورة.',
      '2026-01-01',
      '2026-12-31',
      150000,
      'الأسر فئة A و B بعد البحث الميداني',
      '200 كرتونة غذائية شهريًا',
      'نشطة',
      foodCover,
      now
    );

    db.prepare(`
      INSERT INTO initiatives (code, name, description, start_date, end_date, budget, eligibility_rules, allocated_aids_summary, status, cover_image_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'INIT-002',
      'القافلة الطبية الشاملة وصرف العلاج المجاني',
      'قافلة طبية شهرية بالتعاون مع أطباء متطوعين لتوقيع الكشف وصرف الأدوية بالمجان.',
      '2026-03-01',
      '2026-11-30',
      85000,
      'جميع أهالي قرية المراشدة وفق الأولوية الصحية',
      'كشوفات + أدوية + نظارات طبية',
      'نشطة',
      medCover,
      now
    );

    if (foodCover) {
      db.prepare(`INSERT INTO initiative_images (initiative_id, image_url, is_primary, uploaded_at) VALUES (1, ?, 1, ?)`).run(foodCover, now);
    }
    if (medCover) {
      db.prepare(`INSERT INTO initiative_images (initiative_id, image_url, is_primary, uploaded_at) VALUES (2, ?, 1, ?)`).run(medCover, now);
    }

    db.prepare(`
      INSERT INTO initiative_supervisors (initiative_id, name, role_title, phone, assigned_date, is_active, notes)
      VALUES (1, 'أ. طارق سعد', 'منسق المساعدات الميدانية', '01033445566', '2026-01-01', 1, 'تكليف أساسي')
    `).run();
    db.prepare(`
      INSERT INTO initiative_supervisors (initiative_id, name, role_title, phone, assigned_date, is_active, notes)
      VALUES (2, 'د. سلمى نصر', 'منسقة القوافل الصحية', '01077889900', '2026-03-01', 1, 'إشراف طبي كامل')
    `).run();

    // Independent initiative beneficiaries (separate from aids beneficiaries!)
    db.prepare(`
      INSERT INTO initiative_beneficiaries (initiative_id, full_name, national_id, phone, address, family_count, notes, linked_beneficiary_id, created_at)
      VALUES (2, 'الحاج صابر عبد الموجود', '26503112700198', '01044556677', 'المراشدة البحري', 2, 'تسجيل قافلة رمد فقط', NULL, ?)
    `).run(now);
  }

  const aidsCount = (db.prepare('SELECT COUNT(*) as c FROM aids').get() as { c: number }).c;
  if (aidsCount === 0) {
    db.prepare(`
      INSERT INTO aids (code, beneficiary_id, initiative_id, aid_type, quantity_label, cash_amount, items_json, aid_date, status, stock_deducted, notes, created_by_name, approved_by_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'AID-0001',
      1,
      1,
      'مساعدة غذائية',
      '2 كرتونة غذائية',
      0,
      JSON.stringify([{ item_id: 1, item_name: 'كرتونة مواد غذائية متكاملة', unit: 'كرتونة', quantity: 2 }]),
      '2026-11-05',
      'مسلمة',
      1,
      'تم التسليم في مقر الجمعية',
      'أ. محمود حسن',
      'مالك النظام',
      now,
      now
    );

    db.prepare(`
      INSERT INTO aids (code, beneficiary_id, initiative_id, aid_type, quantity_label, cash_amount, items_json, aid_date, status, stock_deducted, notes, created_by_name, approved_by_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'AID-0002',
      2,
      1,
      'مساعدة مالية',
      '1000 جنيه دعم علاجي',
      1000,
      '[]',
      '2026-11-10',
      'قيد المراجعة',
      0,
      'بانتظار اعتماد الصرف المالي',
      'أ. محمود حسن',
      '',
      now,
      now
    );
  }

  const donCount = (db.prepare('SELECT COUNT(*) as c FROM donations').get() as { c: number }).c;
  if (donCount === 0) {
    db.prepare(`
      INSERT INTO donations (code, donor_name, donor_phone, donation_type, amount, in_kind_description, donation_date, scope, initiative_id, purpose, status, notes, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('DON-0001', 'الحاج مصطفى عبد الفتاح', '01012345678', 'نقدي', 25000, '', '2026-11-01', 'عام', null, 'دعم أنشطة الجمعية العامة', 'معتمد', 'إيصال نقدي معتمد', 'مالك النظام', now);

    db.prepare(`
      INSERT INTO donations (code, donor_name, donor_phone, donation_type, amount, in_kind_description, donation_date, scope, initiative_id, purpose, status, notes, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('DON-0002', 'مؤسسة أهل الخير للتنمية', '0223456789', 'نقدي', 40000, '', '2026-11-04', 'مخصص', 1, 'تمويل مبادرة إطعام وكرامة', 'معتمد', 'تحويل بنكي مخصص للمبادرة', 'مالك النظام', now);

    db.prepare(`
      INSERT INTO expenses (code, title, category, amount, expense_date, initiative_id, reason, status, created_by_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('EXP-0001', 'شراء مستلزمات تعبئة كراتين الغذاء', 'مبادرات', 12500, '2026-11-06', 1, 'تجهيز دفعة شهر نوفمبر من الكراتين الغذائية', 'معتمد', 'أ. محمود حسن', now);
  }

  const staffCount = (db.prepare('SELECT COUNT(*) as c FROM staff_persons').get() as { c: number }).c;
  if (staffCount === 0) {
    db.prepare(`
      INSERT INTO staff_persons (person_type, code, full_name, national_id, phone, email, address, job_title, department_or_tasks, hire_or_join_date, status, notes, created_at)
      VALUES ('employee', 'EMP-0001', 'طارق سعد عبد الرحيم', '28807122700412', '01033445566', 'tarek@khair-marashda.org', 'المراشدة - مركز الوقف', 'منسق المساعدات والمخازن', 'إدارة المخازن وتسليم المساعدات', '2023-04-01', 'نشط', 'موظف دائم', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO staff_persons (person_type, code, full_name, national_id, phone, email, address, job_title, department_or_tasks, hire_or_join_date, status, notes, created_at)
      VALUES ('employee', 'EMP-0002', 'هدى عبد السلام أحمد', '29305192700621', '01055667788', 'hoda@khair-marashda.org', 'المراشدة - نجع الشيخ', 'باحثة اجتماعية', 'دراسة الحالات والأبحاث الميدانية', '2024-01-15', 'نشط', 'مسؤولة ملف الأرامل', ?)
    `).run(now);

    db.prepare(`
      INSERT INTO staff_persons (person_type, code, full_name, national_id, phone, email, address, job_title, department_or_tasks, hire_or_join_date, status, notes, created_at)
      VALUES ('volunteer', 'VOL-0001', 'يوسف محمد العارف', '30108202700315', '01122334455', 'youssef@khair-marashda.org', 'المراشدة - شارع المدرسة', 'متطوع ميداني', 'توزيع المساعدات وتنظيم القوافل', '2025-02-10', 'نشط', 'مشارك في مبادرة إطعام وكرامة', ?)
    `).run(now);
  }

  const annCount = (db.prepare('SELECT COUNT(*) as c FROM announcements').get() as { c: number }).c;
  if (annCount === 0) {
    db.prepare(`
      INSERT INTO announcements (title, body, category, initiative_id, image_url, status, publish_date, expire_date, contact_note, created_by_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'انطلاق القافلة الطبية المجانية بقرية المراشدة',
      'تعلن جمعية الخير للتنمية الشاملة بالمراشدة عن تنظيم قافلة طبية مجانية في تخصصات الباطنة والأطفال والرمد مع صرف العلاج بالمجان بمقر الجمعية.',
      'قافلة طبية',
      2,
      bannerCover,
      'منشور',
      '2026-11-08',
      '2026-12-15',
      'للحجز والاستفسار يرجى التوجه لمقر الجمعية أو الاتصال على 01023456789',
      'مالك النظام'
    );
  }

  const partnerCount = (db.prepare('SELECT COUNT(*) as c FROM partners').get() as { c: number }).c;
  if (partnerCount === 0) {
    db.prepare(`
      INSERT INTO partners (name, partner_type, contact_person, phone, email, address, agreement_title, agreement_start, agreement_end, initiative_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'مؤسسة صناع الخير للتنمية',
      'مؤسسة مجتمع مدني',
      'د. هاني عبد الله',
      '01088776655',
      'partners@sonaa.org',
      'القاهرة - فرع الصعيد',
      'بروتوكول تعاون القوافل الطبية بمركز الوقف',
      '2026-01-01',
      '2026-12-31',
      2,
      'شراكة سنوية لتنظيم قوافل الرمد والباطنة'
    );
  }

  const supCount = (db.prepare('SELECT COUNT(*) as c FROM suppliers').get() as { c: number }).c;
  if (supCount === 0) {
    db.prepare(`
      INSERT INTO suppliers (name, category, phone, email, address, tax_no, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('شركة النيل لتجارة الجملة الغذائية', 'مواد غذائية', '01011998877', 'sales@nilefood.eg', 'قنا - المنطقة الصناعية', '309-441-118', 'توريد شهري لكراتين الغذاء');
  }

  const notifCount = (db.prepare('SELECT COUNT(*) as c FROM notifications').get() as { c: number }).c;
  if (notifCount === 0) {
    db.prepare(`INSERT INTO notifications (title, message, section, severity, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)`).run(
      'تنبيه انخفاض مخزون',
      'الصنف "بطانية شتوية مزدوجة" وصل إلى 18 بطانية (الحد الأدنى 20).',
      'inventory',
      'warning',
      now
    );
    db.prepare(`INSERT INTO notifications (title, message, section, severity, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)`).run(
      'مساعدة بانتظار الاعتماد',
      'تم تسجيل طلب المساعدة AID-0002 للمستفيدة سعاد إبراهيم محمد وبانتظار المراجعة والاعتماد.',
      'aids',
      'info',
      now
    );
  }
}

export function writeAuditLog(params: {
  userId: number | null;
  userName: string;
  actionType: string;
  section: string;
  recordId?: string | number;
  beforeData?: unknown;
  afterData?: unknown;
  reason?: string;
  result?: string;
}) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, user_name, action_type, section, record_id, before_data, after_data, reason, result, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.userId,
    params.userName,
    params.actionType,
    params.section,
    params.recordId !== undefined ? String(params.recordId) : '',
    params.beforeData !== undefined ? JSON.stringify(params.beforeData) : '',
    params.afterData !== undefined ? JSON.stringify(params.afterData) : '',
    params.reason ?? '',
    params.result ?? 'نجاح',
    new Date().toISOString()
  );
}

export function createNotification(title: string, message: string, section: string, severity: 'info' | 'warning' | 'success' | 'alert' = 'info') {
  db.prepare(`
    INSERT INTO notifications (title, message, section, severity, is_read, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(title, message, section, severity, new Date().toISOString());
}

export function generateNextCode(table: string, prefix: string): string {
  const row = db.prepare(`SELECT MAX(id) as maxId FROM ${table}`).get() as { maxId: number | null };
  const nextNum = (row?.maxId ?? 0) + 1;
  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}
