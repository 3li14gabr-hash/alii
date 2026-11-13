import type { PermissionAction, PermissionSection, PermissionsMatrix } from './types';

export const ALL_SECTIONS: { key: PermissionSection; label: string }[] = [
  { key: 'dashboard', label: 'لوحة التحكم' },
  { key: 'association', label: 'بيانات الجمعية والشعار' },
  { key: 'beneficiaries', label: 'المستفيدين' },
  { key: 'beneficiary_files', label: 'ملفات المستفيدين الجماعية' },
  { key: 'aids', label: 'المساعدات' },
  { key: 'initiatives', label: 'المبادرات' },
  { key: 'donations', label: 'التبرعات والحسابات' },
  { key: 'inventory', label: 'المخازن والجرد' },
  { key: 'employees', label: 'الموظفون' },
  { key: 'volunteers', label: 'المتطوعون' },
  { key: 'id_cards', label: 'الكارنيهات' },
  { key: 'attendance', label: 'الحضور والانصراف' },
  { key: 'partners', label: 'الشراكات' },
  { key: 'announcements', label: 'الإعلانات والتوعية' },
  { key: 'suppliers', label: 'الموردون' },
  { key: 'reports', label: 'التقارير' },
  { key: 'audit', label: 'سجل التدقيق والعمليات' },
  { key: 'users', label: 'إدارة المستخدمين' },
  { key: 'roles', label: 'الأدوار والصلاحيات' },
  { key: 'settings', label: 'الإعدادات العامة' },
  { key: 'backup', label: 'النسخ الاحتياطي والاستعادة' },
];

export const ALL_ACTIONS: { key: PermissionAction; label: string }[] = [
  { key: 'view', label: 'عرض البيانات' },
  { key: 'create', label: 'إضافة' },
  { key: 'edit', label: 'تعديل' },
  { key: 'delete_single', label: 'حذف سجل' },
  { key: 'delete_bulk', label: 'حذف جماعي' },
  { key: 'approve', label: 'اعتماد' },
  { key: 'reject', label: 'رفض' },
  { key: 'cancel', label: 'إلغاء' },
  { key: 'print', label: 'طباعة' },
  { key: 'export_excel', label: 'تصدير Excel' },
  { key: 'export_pdf', label: 'تصدير PDF' },
  { key: 'manage_files', label: 'إدارة الصور والملفات' },
  { key: 'override_stock', label: 'تجاوز حد المخزون' },
];

const FULL_ACCESS_ACTIONS: PermissionAction[] = ALL_ACTIONS.map((a) => a.key);

export function createFullPermissions(): PermissionsMatrix {
  const matrix: PermissionsMatrix = {};
  for (const s of ALL_SECTIONS) {
    matrix[s.key] = [...FULL_ACCESS_ACTIONS];
  }
  return matrix;
}

export function createViewOnlyPermissions(): PermissionsMatrix {
  const matrix: PermissionsMatrix = {};
  for (const s of ALL_SECTIONS) {
    if (
      s.key === 'users' ||
      s.key === 'roles' ||
      s.key === 'backup' ||
      s.key === 'settings' ||
      s.key === 'audit'
    ) {
      continue;
    }
    matrix[s.key] = ['view'];
  }
  return matrix;
}

export const DEFAULT_ROLE_TEMPLATES: {
  key: string;
  name: string;
  description: string;
  permissions: PermissionsMatrix;
}[] = [
  {
    key: 'owner',
    name: 'مالك النظام',
    description: 'صلاحيات كاملة وغير مقيدة على جميع الأقسام والمستخدمين والنسخ الاحتياطي.',
    permissions: createFullPermissions(),
  },
  {
    key: 'admin',
    name: 'مدير النظام',
    description: 'إدارة شاملة لأقسام الجمعية والمستفيدين والمبادرات والتقارير والمستخدمين.',
    permissions: (() => {
      const m = createFullPermissions();
      m.backup = ['view', 'export_excel'];
      return m;
    })(),
  },
  {
    key: 'staff',
    name: 'موظف الجمعية',
    description: 'تسجيل المستفيدين والمستندات ومتابعة المبادرات والحضور.',
    permissions: {
      dashboard: ['view'],
      association: ['view'],
      beneficiaries: ['view', 'create', 'edit', 'manage_files', 'print', 'export_excel'],
      beneficiary_files: ['view', 'create', 'edit', 'print'],
      aids: ['view', 'create'],
      initiatives: ['view', 'create', 'edit', 'manage_files'],
      announcements: ['view', 'create', 'edit', 'print'],
      attendance: ['view', 'create'],
      reports: ['view', 'print'],
    },
  },
  {
    key: 'aids_officer',
    name: 'مسؤول المساعدات',
    description: 'إدارة المستفيدين وملفاتهم وصرف واعتماد المساعدات والمبادرات.',
    permissions: {
      dashboard: ['view'],
      association: ['view'],
      beneficiaries: ['view', 'create', 'edit', 'delete_single', 'manage_files', 'print', 'export_excel', 'export_pdf'],
      beneficiary_files: ['view', 'create', 'edit', 'delete_single', 'print', 'export_excel'],
      aids: ['view', 'create', 'edit', 'delete_single', 'approve', 'reject', 'cancel', 'print', 'export_excel', 'export_pdf'],
      initiatives: ['view', 'create', 'edit', 'manage_files', 'print', 'export_excel'],
      inventory: ['view'],
      reports: ['view', 'print', 'export_excel', 'export_pdf'],
    },
  },
  {
    key: 'inventory_officer',
    name: 'مسؤول المخازن',
    description: 'إدارة المخازن والأصناف والحركات والجرد والموردين.',
    permissions: {
      dashboard: ['view'],
      association: ['view'],
      inventory: ['view', 'create', 'edit', 'delete_single', 'approve', 'print', 'export_excel', 'export_pdf'],
      suppliers: ['view', 'create', 'edit', 'manage_files', 'print', 'export_excel'],
      aids: ['view'],
      reports: ['view', 'print', 'export_excel', 'export_pdf'],
    },
  },
  {
    key: 'accountant',
    name: 'المحاسب',
    description: 'إدارة التبرعات والمصروفات والمستندات المالية والتقارير المالية.',
    permissions: {
      dashboard: ['view'],
      association: ['view'],
      donations: ['view', 'create', 'edit', 'approve', 'reject', 'cancel', 'manage_files', 'print', 'export_excel', 'export_pdf'],
      suppliers: ['view', 'print', 'export_excel'],
      aids: ['view'],
      initiatives: ['view'],
      reports: ['view', 'print', 'export_excel', 'export_pdf'],
    },
  },
  {
    key: 'hr_officer',
    name: 'مسؤول الموظفين والمتطوعين',
    description: 'إدارة ملفات الموظفين والمتطوعين والكارنيهات وسجل الحضور والانصراف.',
    permissions: {
      dashboard: ['view'],
      association: ['view'],
      employees: ['view', 'create', 'edit', 'delete_single', 'manage_files', 'print', 'export_excel', 'export_pdf'],
      volunteers: ['view', 'create', 'edit', 'delete_single', 'manage_files', 'print', 'export_excel', 'export_pdf'],
      id_cards: ['view', 'create', 'print', 'export_pdf'],
      attendance: ['view', 'create', 'edit', 'approve', 'manage_files', 'print', 'export_excel'],
      reports: ['view', 'print', 'export_excel', 'export_pdf'],
    },
  },
  {
    key: 'viewer',
    name: 'مستخدم للعرض فقط',
    description: 'صلاحية قراءة ومشاهدة البيانات المسموحة دون أي تعديل أو حذف أو تصدير.',
    permissions: createViewOnlyPermissions(),
  },
];

export function hasPermission(
  permissions: PermissionsMatrix | undefined | null,
  section: PermissionSection,
  action: PermissionAction,
  isOwner = false
): boolean {
  if (isOwner) return true;
  if (!permissions) return false;
  const sectionPerms = permissions[section];
  if (!Array.isArray(sectionPerms)) return false;
  return sectionPerms.includes(action);
}
