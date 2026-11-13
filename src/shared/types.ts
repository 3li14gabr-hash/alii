export type PermissionSection =
  | 'dashboard'
  | 'association'
  | 'beneficiaries'
  | 'beneficiary_files'
  | 'aids'
  | 'initiatives'
  | 'donations'
  | 'inventory'
  | 'employees'
  | 'volunteers'
  | 'id_cards'
  | 'attendance'
  | 'partners'
  | 'announcements'
  | 'suppliers'
  | 'reports'
  | 'audit'
  | 'users'
  | 'roles'
  | 'settings'
  | 'backup';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete_single'
  | 'delete_bulk'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'print'
  | 'export_excel'
  | 'export_pdf'
  | 'manage_files'
  | 'override_stock';

export type PermissionsMatrix = Partial<Record<PermissionSection, PermissionAction[]>>;

export interface RoleRecord {
  id: number;
  name: string;
  key: string;
  description: string;
  is_system: number;
  permissions: PermissionsMatrix;
}

export interface UserRecord {
  id: number;
  username: string;
  full_name: string;
  phone: string;
  email: string;
  role_id: number;
  role_name?: string;
  role_key?: string;
  is_owner: number;
  is_active: number;
  permissions: PermissionsMatrix;
  created_at: string;
}

export interface AssociationSettings {
  id: number;
  name: string;
  short_name: string;
  app_name: string;
  address: string;
  governorate: string;
  center: string;
  village: string;
  phone1: string;
  phone2: string;
  whatsapp: string;
  email: string;
  website: string;
  registration_no: string;
  tax_no: string;
  chairman_name: string;
  secretary_name: string;
  treasurer_name: string;
  description: string;
  logo_url: string;
  updated_at: string;
  updated_by_name?: string;
}

export interface BeneficiaryRecord {
  id: number;
  code: string;
  wife_name: string;
  wife_national_id: string;
  wife_job: string;
  husband_name: string;
  husband_national_id: string;
  husband_job: string;
  phone1: string;
  phone2: string;
  address: string;
  family_count: number;
  house_description: string;
  notes: string;
  eligibility: 'A' | 'B' | 'C';
  is_archived: number;
  created_at: string;
  updated_at: string;
  files_count?: number;
  aids_count?: number;
}

export interface BeneficiaryDocument {
  id: number;
  beneficiary_id: number;
  doc_type: string;
  title: string;
  file_url: string;
  original_name: string;
  mime_type: string;
  uploaded_by_name: string;
  uploaded_at: string;
}

export interface BeneficiaryFileGroup {
  id: number;
  code: string;
  name: string;
  area: string;
  purpose: string;
  supervisor_name: string;
  supervisor_phone: string;
  notes: string;
  members_count?: number;
  created_at: string;
}

export interface AidItemAllocation {
  item_id: number;
  item_name: string;
  unit: string;
  quantity: number;
}

export type AidStatus = 'مسجلة' | 'قيد المراجعة' | 'معتمدة' | 'مسلمة' | 'مرفوضة' | 'ملغاة';

export interface AidRecord {
  id: number;
  code: string;
  beneficiary_id: number;
  beneficiary_code?: string;
  beneficiary_name?: string;
  initiative_id: number | null;
  initiative_name?: string;
  aid_type: string;
  quantity_label: string;
  cash_amount: number;
  items: AidItemAllocation[];
  aid_date: string;
  status: AidStatus;
  notes: string;
  financial_ref: string;
  action_reason: string;
  created_by_name: string;
  approved_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface InitiativeRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  budget: number;
  eligibility_rules: string;
  allocated_aids_summary: string;
  status: 'نشطة' | 'مخططة' | 'مكتملة' | 'متوقفة';
  cover_image_url: string;
  images: { id: number; image_url: string; is_primary: number }[];
  supervisors: {
    id: number;
    name: string;
    role_title: string;
    phone: string;
    assigned_date: string;
    is_active: number;
    notes: string;
  }[];
  beneficiaries_count?: number;
  aids_count?: number;
  created_at: string;
}

export interface InitiativeBeneficiaryRecord {
  id: number;
  initiative_id: number;
  initiative_name?: string;
  full_name: string;
  national_id: string;
  phone: string;
  address: string;
  family_count: number;
  notes: string;
  linked_beneficiary_id: number | null;
  linked_beneficiary_code?: string;
  created_at: string;
}

export interface DonationRecord {
  id: number;
  code: string;
  donor_name: string;
  donor_phone: string;
  donation_type: 'نقدي' | 'عيني';
  amount: number;
  in_kind_description: string;
  donation_date: string;
  scope: 'عام' | 'مخصص';
  initiative_id: number | null;
  initiative_name?: string;
  purpose: string;
  status: 'مسجل' | 'قيد المراجعة' | 'معتمد';
  receipt_url: string;
  notes: string;
  created_by_name: string;
  updated_by_name?: string;
  created_at: string;
}

export interface ExpenseRecord {
  id: number;
  code: string;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  initiative_id: number | null;
  initiative_name?: string;
  reason: string;
  receipt_url: string;
  status: 'مسجل' | 'معتمد' | 'ملغى';
  created_by_name: string;
  created_at: string;
}

export interface WarehouseRecord {
  id: number;
  name: string;
  location: string;
  manager_name: string;
  notes: string;
}

export interface InventoryItemRecord {
  id: number;
  warehouse_id: number;
  warehouse_name?: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  category: string;
  updated_at: string;
}

export interface InventoryMovementRecord {
  id: number;
  item_id: number;
  item_name?: string;
  warehouse_name?: string;
  movement_type: 'وارد' | 'منصرف' | 'مرتجع' | 'تحويل' | 'تصحيح';
  quantity: number;
  balance_after: number;
  reference_type: string;
  reference_id: number | null;
  reason: string;
  created_by_name: string;
  created_at: string;
}

export interface StaffPersonRecord {
  id: number;
  person_type: 'employee' | 'volunteer';
  code: string;
  full_name: string;
  national_id: string;
  phone: string;
  email: string;
  address: string;
  job_title: string;
  department_or_tasks: string;
  hire_or_join_date: string;
  status: 'نشط' | 'إجازة' | 'موقوف' | 'منتهي';
  photo_url: string;
  notes: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  person_type: 'employee' | 'volunteer';
  person_id: number;
  person_name?: string;
  person_code?: string;
  profile_photo_url?: string;
  attendance_date: string;
  check_in_time: string;
  check_in_photo_url: string;
  check_in_method: 'تحقق بالوجه' | 'وسيلة بديلة';
  check_in_verification_status: string;
  check_out_time: string;
  check_out_photo_url: string;
  check_out_method: string;
  check_out_verification_status: string;
  work_status: 'حاضر' | 'منصرف' | 'متأخر' | 'مأمورية' | 'غياب';
  consent_given: number;
  notes: string;
  recorded_by_name: string;
}

export interface PartnerRecord {
  id: number;
  name: string;
  partner_type: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  agreement_title: string;
  agreement_start: string;
  agreement_end: string;
  initiative_id: number | null;
  initiative_name?: string;
  document_url: string;
  notes: string;
}

export interface AnnouncementRecord {
  id: number;
  title: string;
  body: string;
  category: string;
  initiative_id: number | null;
  initiative_name?: string;
  image_url: string;
  status: 'مسودة' | 'منشور' | 'منتهي';
  publish_date: string;
  expire_date: string;
  contact_note: string;
  created_by_name: string;
}

export interface SupplierRecord {
  id: number;
  name: string;
  category: string;
  phone: string;
  email: string;
  address: string;
  tax_no: string;
  notes: string;
}

export interface SupplyRecord {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  warehouse_id: number;
  warehouse_name?: string;
  item_id: number;
  item_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  supply_date: string;
  invoice_no: string;
  invoice_url: string;
  notes: string;
}

export interface AuditLogRecord {
  id: number;
  user_id: number | null;
  user_name: string;
  action_type: string;
  section: string;
  record_id: string;
  before_data: string;
  after_data: string;
  reason: string;
  result: string;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  title: string;
  message: string;
  section: string;
  severity: 'info' | 'warning' | 'success' | 'alert';
  is_read: number;
  created_at: string;
}
