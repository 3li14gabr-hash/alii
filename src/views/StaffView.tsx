import React, { useEffect, useState } from 'react';
import { BadgeCheck, FileSpreadsheet, Plus, Printer, Search, Trash2, User } from 'lucide-react';
import type { AssociationSettings, StaffPersonRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function StaffView({
  user,
  association,
  onOpenIdCard,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onOpenIdCard: (personId: number) => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canViewEmp = hasPermission(user.permissions, 'employees', 'view', user.is_owner === 1);
  const canViewVol = hasPermission(user.permissions, 'volunteers', 'view', user.is_owner === 1);

  const [tab, setTab] = useState<'employee' | 'volunteer'>(canViewEmp ? 'employee' : 'volunteer');
  const [staff, setStaff] = useState<StaffPersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StaffPersonRecord | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    person_type: 'employee' as 'employee' | 'volunteer',
    full_name: '',
    national_id: '',
    phone: '',
    email: '',
    address: '',
    job_title: '',
    department_or_tasks: '',
    hire_or_join_date: new Date().toISOString().slice(0, 10),
    status: 'نشط',
    notes: '',
  });

  const sectionKey = tab === 'employee' ? 'employees' : 'volunteers';
  const canCreate = hasPermission(user.permissions, sectionKey, 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, sectionKey, 'edit', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, sectionKey, 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, sectionKey, 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, sectionKey, 'export_excel', user.is_owner === 1);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ staff: StaffPersonRecord[] }>('/api/staff');
      setStaff(res.staff);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل الموظفين والمتطوعين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = staff
    .filter((s) => s.person_type === tab)
    .filter((s) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        s.full_name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.job_title.toLowerCase().includes(q) ||
        s.phone.includes(q)
      );
    });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      if (photoFile) fd.append('photo', photoFile);

      if (editing) {
        const res = await apiRequest<{ message: string }>(`/api/staff/${editing.id}`, {
          method: 'PUT',
          body: fd,
          isFormData: true,
        });
        onToast('success', res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/staff', {
          method: 'POST',
          body: fd,
          isFormData: true,
        });
        onToast('success', res.message);
      }
      setFormOpen(false);
      setPhotoFile(null);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل حفظ البيانات.');
    }
  };

  return (
    <div>
      <PageHeader
        title="إدارة الموظفين والمتطوعين"
        subtitle="الملفات الشخصية والصور الوظيفية والمهام والربط المباشر مع الكارنيهات وسجل الحضور"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: tab === 'employee' ? 'كشف موظفي الجمعية' : 'كشف متطوعي الجمعية',
                    association,
                    headers: ['الكود', 'الاسم الكامل', 'الوظيفة / الصفة', 'المهام / القسم', 'الهاتف', 'تاريخ الانضمام', 'الحالة'],
                    rows: filtered.map((s) => [s.code, s.full_name, s.job_title, s.department_or_tasks, s.phone, s.hire_or_join_date, s.status]),
                  })
                }
                className="px-3 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            )}
            {canExport && (
              <button
                type="button"
                onClick={() =>
                  exportGenericExcel(
                    ['الكود', 'النوع', 'الاسم الكامل', 'الرقم القومي', 'الهاتف', 'الوظيفة', 'المهام', 'التاريخ', 'الحالة'],
                    filtered.map((s) => [
                      s.code,
                      s.person_type === 'employee' ? 'موظف' : 'متطوع',
                      s.full_name,
                      s.national_id,
                      s.phone,
                      s.job_title,
                      s.department_or_tasks,
                      s.hire_or_join_date,
                      s.status,
                    ]),
                    tab === 'employee' ? 'الموظفون' : 'المتطوعون',
                    `${tab === 'employee' ? 'الموظفون' : 'المتطوعون'}.xlsx`
                  )
                }
                className="px-3 py-2 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setPhotoFile(null);
                  setForm({
                    person_type: tab,
                    full_name: '',
                    national_id: '',
                    phone: '',
                    email: '',
                    address: '',
                    job_title: tab === 'employee' ? '' : 'متطوع ميداني',
                    department_or_tasks: '',
                    hire_or_join_date: new Date().toISOString().slice(0, 10),
                    status: 'نشط',
                    notes: '',
                  });
                  setFormOpen(true);
                }}
                className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>{tab === 'employee' ? 'إضافة موظف' : 'إضافة متطوع'}</span>
              </button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg">
          {canViewEmp && (
            <button
              type="button"
              onClick={() => setTab('employee')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'employee' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              الموظفون ({staff.filter((s) => s.person_type === 'employee').length})
            </button>
          )}
          {canViewVol && (
            <button
              type="button"
              onClick={() => setTab('volunteer')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'volunteer' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              المتطوعون ({staff.filter((s) => s.person_type === 'volunteer').length})
            </button>
          )}
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الكود أو الوظيفة..."
            className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState title="لا توجد سجلات" description="أضف موظفًا أو متطوعًا جديدًا لبدء إدارة ملفه وكارنيهه." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
              <div className="flex items-start gap-3.5">
                <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#0d5c3e]">{p.code}</span>
                    <StatusText status={p.status} />
                  </div>
                  <h3 className="font-bold text-slate-900 truncate mt-0.5">{p.full_name}</h3>
                  <div className="text-xs font-medium text-slate-700">{p.job_title}</div>
                  <div className="text-xs text-slate-500 mt-1 line-clamp-2">{p.department_or_tasks || '—'}</div>
                  <div className="text-xs text-slate-500 font-mono mt-1">{p.phone || '—'}</div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onOpenIdCard(p.id)}
                  className="flex-1 py-1.5 px-3 bg-[#fbf6eb] hover:bg-[#f5ebd2] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg flex items-center justify-center gap-1.5"
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  <span>الكارنيه الإلكتروني</span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(p);
                      setPhotoFile(null);
                      setForm({
                        person_type: p.person_type,
                        full_name: p.full_name,
                        national_id: p.national_id,
                        phone: p.phone,
                        email: p.email,
                        address: p.address,
                        job_title: p.job_title,
                        department_or_tasks: p.department_or_tasks,
                        hire_or_join_date: p.hire_or_join_date,
                        status: p.status,
                        notes: p.notes,
                      });
                      setFormOpen(true);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-50"
                  >
                    تعديل
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest(`/api/staff/${p.id}`, { method: 'DELETE' });
                      onToast('success', 'تم حذف السجل.');
                      loadData();
                    }}
                    className="p-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Staff Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `تعديل بيانات (${editing.code})` : form.person_type === 'employee' ? 'إضافة موظف جديد' : 'إضافة متطوع جديد'}
      >
        <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الكامل *</label>
            <input type="text" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الوظيفة / الصفة *</label>
            <input type="text" required value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المهام / المبادرات المشارك بها</label>
            <input type="text" value={form.department_or_tasks} onChange={(e) => setForm({ ...form, department_or_tasks: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي</label>
            <input type="text" value={form.national_id} onChange={(e) => setForm({ ...form, national_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ التعيين / الانضمام</label>
            <input type="date" value={form.hire_or_join_date} onChange={(e) => setForm({ ...form, hire_or_join_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              <option value="نشط">نشط</option>
              <option value="إجازة">إجازة</option>
              <option value="موقوف">موقوف</option>
              <option value="منتهي">منتهي</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">الصورة الشخصية (تظهر بالكارنيه وتستخدم للتحقق)</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ البيانات</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
