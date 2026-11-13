import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Plus,
  Printer,
  Star,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import type {
  AssociationSettings,
  BeneficiaryRecord,
  InitiativeBeneficiaryRecord,
  InitiativeRecord,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatCurrency } from '../utils/api';
import { exportGenericExcel, parseGenericExcelFile, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function InitiativesView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'initiatives', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'initiatives', 'edit', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'initiatives', 'delete_single', user.is_owner === 1);
  const canFiles = hasPermission(user.permissions, 'initiatives', 'manage_files', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'initiatives', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'initiatives', 'export_excel', user.is_owner === 1);

  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [baseBeneficiaries, setBaseBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedInit, setSelectedInit] = useState<InitiativeRecord | null>(null);
  const [initBeneficiaries, setInitBeneficiaries] = useState<InitiativeBeneficiaryRecord[]>([]);
  const [detailTab, setDetailTab] = useState<'info' | 'beneficiaries' | 'supervisors' | 'images'>('info');

  // Create/Edit Initiative Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingInit, setEditingInit] = useState<InitiativeRecord | null>(null);
  const [initForm, setInitForm] = useState({
    name: '',
    description: '',
    start_date: new Date().toISOString().slice(0, 10),
    end_date: '',
    budget: 0,
    eligibility_rules: '',
    allocated_aids_summary: '',
    status: 'نشطة',
    supervisor_name: '',
    supervisor_role: '',
    supervisor_phone: '',
  });
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Separate Initiative Beneficiary Form
  const [newInitBen, setNewInitBen] = useState({
    full_name: '',
    national_id: '',
    phone: '',
    address: '',
    family_count: 1,
    notes: '',
  });
  const [linkTargetBenId, setLinkTargetBenId] = useState<Record<number, string>>({});

  // Supervisor assignment form
  const [supForm, setSupForm] = useState({ name: '', role_title: '', phone: '', notes: '' });

  const loadInitiatives = async () => {
    setLoading(true);
    try {
      const [res, benRes] = await Promise.all([
        apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives'),
        apiRequest<{ beneficiaries: BeneficiaryRecord[] }>('/api/beneficiaries').catch(() => ({ beneficiaries: [] })),
      ]);
      setInitiatives(res.initiatives);
      setBaseBeneficiaries(benRes.beneficiaries);
      if (selectedInit) {
        const refreshed = res.initiatives.find((i) => i.id === selectedInit.id) || null;
        setSelectedInit(refreshed);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل المبادرات.');
    } finally {
      setLoading(false);
    }
  };

  const loadInitBeneficiaries = async (initId: number) => {
    try {
      const res = await apiRequest<{ beneficiaries: InitiativeBeneficiaryRecord[] }>(
        `/api/initiatives/${initId}/beneficiaries`
      );
      setInitBeneficiaries(res.beneficiaries);
    } catch {
      setInitBeneficiaries([]);
    }
  };

  useEffect(() => {
    loadInitiatives();
  }, []);

  const openInitiativeDetails = (init: InitiativeRecord) => {
    setSelectedInit(init);
    setDetailTab('info');
    loadInitBeneficiaries(init.id);
  };

  const handleSaveInitiative = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(initForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (coverFile) fd.append('cover', coverFile);

      if (editingInit) {
        const res = await apiRequest<{ message: string }>(`/api/initiatives/${editingInit.id}`, {
          method: 'PUT',
          body: fd,
          isFormData: true,
        });
        onToast('success', res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/initiatives', {
          method: 'POST',
          body: fd,
          isFormData: true,
        });
        onToast('success', res.message);
      }
      setFormOpen(false);
      setCoverFile(null);
      await loadInitiatives();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل حفظ المبادرة.');
    }
  };

  const handleUploadGalleryImages = async (filesList: FileList | null) => {
    if (!selectedInit || !filesList || filesList.length === 0) return;
    const fd = new FormData();
    Array.from(filesList).forEach((f) => fd.append('images', f));
    try {
      const res = await apiRequest<{ message: string }>(`/api/initiatives/${selectedInit.id}/images`, {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      onToast('success', res.message);
      await loadInitiatives();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل رفع الصور.');
    }
  };

  const handleAddInitBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInit) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/initiatives/${selectedInit.id}/beneficiaries`, {
        method: 'POST',
        body: JSON.stringify(newInitBen),
      });
      onToast('success', res.message);
      setNewInitBen({ full_name: '', national_id: '', phone: '', address: '', family_count: 1, notes: '' });
      await loadInitBeneficiaries(selectedInit.id);
      await loadInitiatives();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر إضافة المستفيد للمبادرة.');
    }
  };

  const handleImportInitExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedInit) return;
    try {
      const matrix = await parseGenericExcelFile(file);
      const rows = matrix.slice(1).map((r) => ({
        full_name: String(r[0] || '').trim(),
        national_id: String(r[1] || '').trim(),
        phone: String(r[2] || '').trim(),
        address: String(r[3] || '').trim(),
        family_count: Number(r[4]) || 1,
        notes: String(r[5] || '').trim(),
      }));
      const res = await apiRequest<{ message: string }>(`/api/initiatives/${selectedInit.id}/beneficiaries/import`, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      onToast('success', res.message);
      await loadInitBeneficiaries(selectedInit.id);
      await loadInitiatives();
    } catch {
      onToast('error', 'فشل استيراد ملف مستفيدي المبادرة.');
    }
  };

  const handleAssignSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInit) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/initiatives/${selectedInit.id}/supervisors`, {
        method: 'POST',
        body: JSON.stringify(supForm),
      });
      onToast('success', res.message);
      setSupForm({ name: '', role_title: '', phone: '', notes: '' });
      await loadInitiatives();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تعيين المسؤول.');
    }
  };

  return (
    <div>
      <PageHeader
        title="إدارة المبادرات"
        subtitle="مبادرات الجمعية وصورها ومسؤولوها وسجل مستفيدي المبادرات المستقل عن سجل المساعدات"
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => {
                setEditingInit(null);
                setInitForm({
                  name: '',
                  description: '',
                  start_date: new Date().toISOString().slice(0, 10),
                  end_date: '',
                  budget: 0,
                  eligibility_rules: '',
                  allocated_aids_summary: '',
                  status: 'نشطة',
                  supervisor_name: '',
                  supervisor_role: '',
                  supervisor_phone: '',
                });
                setFormOpen(true);
              }}
              className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء مبادرة جديدة</span>
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : initiatives.length === 0 ? (
        <EmptyState title="لا توجد مبادرات مسجلة" description="ابدأ بإنشاء أول مبادرة تنموية أو خيرية للجمعية." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {initiatives.map((init) => {
            const activeSup = init.supervisors?.find((s) => s.is_active === 1);
            return (
              <div key={init.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-video bg-slate-100 relative overflow-hidden">
                  {init.cover_image_url ? (
                    <img
                      src={init.cover_image_url}
                      alt={init.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                      لا توجد صورة رئيسية
                    </div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                      <span className="font-mono font-bold text-[#0d5c3e]">{init.code}</span>
                      <StatusText status={init.status} />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-snug">{init.name}</h3>
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">{init.description}</p>

                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                      <div>المسؤول: <strong className="text-slate-900">{activeSup?.name || 'غير محدد'}</strong></div>
                      <div>الميزانية: <strong className="tabular-nums">{formatCurrency(init.budget)}</strong></div>
                      <div>مستفيدو المبادرة (سجل مستقل): <strong className="tabular-nums">{init.beneficiaries_count ?? 0}</strong></div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openInitiativeDetails(init)}
                      className="flex-1 py-2 px-3 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      إدارة المبادرة والمستفيدين
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingInit(init);
                          setInitForm({
                            name: init.name,
                            description: init.description,
                            start_date: init.start_date,
                            end_date: init.end_date,
                            budget: init.budget,
                            eligibility_rules: init.eligibility_rules,
                            allocated_aids_summary: init.allocated_aids_summary,
                            status: init.status,
                            supervisor_name: '',
                            supervisor_role: '',
                            supervisor_phone: '',
                          });
                          setFormOpen(true);
                        }}
                        className="px-3 py-2 border border-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-50"
                      >
                        تعديل
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/initiatives/${init.id}`, { method: 'DELETE' });
                          onToast('success', 'تم حذف المبادرة.');
                          if (selectedInit?.id === init.id) setSelectedInit(null);
                          loadInitiatives();
                        }}
                        aria-label={`حذف ${init.name}`}
                        className="p-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Initiative Details Modal */}
      <Modal
        open={Boolean(selectedInit)}
        onClose={() => setSelectedInit(null)}
        title={selectedInit ? `${selectedInit.code} — ${selectedInit.name}` : ''}
        maxWidth="max-w-5xl"
      >
        {selectedInit && (
          <div className="space-y-4">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { key: 'info', label: 'البيانات العامة' },
                { key: 'beneficiaries', label: `مستفيدو المبادرة (سجل مستقل - ${initBeneficiaries.length})` },
                { key: 'supervisors', label: `مسؤولو المبادرة (${selectedInit.supervisors?.length || 0})` },
                { key: 'images', label: `معرض الصور (${selectedInit.images?.length || 0})` },
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDetailTab(t.key as typeof detailTab)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md ${
                    detailTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {detailTab === 'info' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div><span className="text-slate-500">تاريخ البداية:</span> <strong>{selectedInit.start_date || '—'}</strong></div>
                <div><span className="text-slate-500">تاريخ النهاية:</span> <strong>{selectedInit.end_date || '—'}</strong></div>
                <div><span className="text-slate-500">الميزانية:</span> <strong className="tabular-nums">{formatCurrency(selectedInit.budget)}</strong></div>
                <div><span className="text-slate-500">الحالة:</span> <StatusText status={selectedInit.status} /></div>
                <div className="sm:col-span-2"><span className="text-slate-500">شروط الاستحقاق:</span> {selectedInit.eligibility_rules || '—'}</div>
                <div className="sm:col-span-2"><span className="text-slate-500">المساعدات المخصصة:</span> {selectedInit.allocated_aids_summary || '—'}</div>
                <div className="sm:col-span-2"><span className="text-slate-500">الوصف:</span> {selectedInit.description || '—'}</div>
              </div>
            )}

            {detailTab === 'beneficiaries' && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
                  تنبيه تنظيمي: مستفيدو هذه المبادرة محفوظون في سجل مستقل تمامًا ولا يتم دمجهم تلقائيًا مع مستفيدي المساعدات، كما لا يعني التسجيل هنا صرف مساعدة تلقائيًا. يمكنك ربط أي شخص بسجله الأساسي عند الحاجة دون تكرار.
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-2">
                    {canPrint && (
                      <button
                        type="button"
                        onClick={() =>
                          printArabicReport({
                            title: `كشف مستفيدي مبادرة: ${selectedInit.name}`,
                            association,
                            headers: ['الاسم الكامل', 'الرقم القومي', 'الهاتف', 'العنوان', 'الأفراد', 'ملاحظات'],
                            rows: initBeneficiaries.map((b) => [b.full_name, b.national_id, b.phone, b.address, b.family_count, b.notes]),
                          })
                        }
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة كشف المبادرة</span>
                      </button>
                    )}
                    {canExport && (
                      <button
                        type="button"
                        onClick={() =>
                          exportGenericExcel(
                            ['الاسم الكامل', 'الرقم القومي', 'الهاتف', 'العنوان', 'عدد الأفراد', 'ملاحظات'],
                            initBeneficiaries.map((b) => [b.full_name, b.national_id, b.phone, b.address, b.family_count, b.notes]),
                            'مستفيدي المبادرة',
                            `مستفيدي_${selectedInit.code}.xlsx`
                          )
                        }
                        className="px-3 py-1.5 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>تصدير Excel</span>
                      </button>
                    )}
                  </div>
                  {canEdit && (
                    <label className="cursor-pointer px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold">
                      استيراد Excel للمبادرة
                      <input type="file" accept=".xlsx,.xls" onChange={handleImportInitExcel} className="hidden" />
                    </label>
                  )}
                </div>

                {canEdit && (
                  <form onSubmit={handleAddInitBeneficiary} className="grid grid-cols-1 sm:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="الاسم الكامل *"
                      value={newInitBen.full_name}
                      onChange={(e) => setNewInitBen({ ...newInitBen, full_name: e.target.value })}
                      className="sm:col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="الرقم القومي"
                      value={newInitBen.national_id}
                      onChange={(e) => setNewInitBen({ ...newInitBen, national_id: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <input
                      type="text"
                      placeholder="الهاتف"
                      value={newInitBen.phone}
                      onChange={(e) => setNewInitBen({ ...newInitBen, phone: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <input
                      type="text"
                      placeholder="العنوان"
                      value={newInitBen.address}
                      onChange={(e) => setNewInitBen({ ...newInitBen, address: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg"
                    />
                    <button type="submit" className="px-3 py-2 bg-[#0d5c3e] text-white font-semibold rounded-lg flex items-center justify-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>إضافة</span>
                    </button>
                  </form>
                )}

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">الاسم</th>
                        <th className="p-2.5">الرقم القومي</th>
                        <th className="p-2.5">الهاتف</th>
                        <th className="p-2.5">العنوان</th>
                        <th className="p-2.5">الربط بالسجل الأساسي</th>
                        <th className="p-2.5">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {initBeneficiaries.map((ib) => (
                        <tr key={ib.id}>
                          <td className="p-2.5 font-semibold">{ib.full_name}</td>
                          <td className="p-2.5 font-mono">{ib.national_id || '—'}</td>
                          <td className="p-2.5 font-mono">{ib.phone || '—'}</td>
                          <td className="p-2.5">{ib.address || '—'}</td>
                          <td className="p-2.5">
                            {ib.linked_beneficiary_code ? (
                              <span className="font-mono text-emerald-700 font-bold">
                                مربوط ({ib.linked_beneficiary_code})
                              </span>
                            ) : canEdit ? (
                              <div className="flex items-center gap-1">
                                <select
                                  value={linkTargetBenId[ib.id] || ''}
                                  onChange={(e) => setLinkTargetBenId({ ...linkTargetBenId, [ib.id]: e.target.value })}
                                  className="px-2 py-1 border border-slate-300 rounded bg-white max-w-[160px]"
                                >
                                  <option value="">ربط بمستفيد أساسي...</option>
                                  {baseBeneficiaries.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.code} - {b.wife_name || b.husband_name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const bid = linkTargetBenId[ib.id];
                                    if (!bid) return;
                                    const res = await apiRequest<{ message: string }>(`/api/initiative-beneficiaries/${ib.id}/link`, {
                                      method: 'POST',
                                      body: JSON.stringify({ beneficiary_id: Number(bid) }),
                                    });
                                    onToast('success', res.message);
                                    loadInitBeneficiaries(selectedInit.id);
                                  }}
                                  className="p-1 bg-[#0d5c3e] text-white rounded"
                                  title="ربط"
                                >
                                  <Link2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              'غير مربوط'
                            )}
                          </td>
                          <td className="p-2.5">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/initiative-beneficiaries/${ib.id}`, { method: 'DELETE' });
                                  loadInitBeneficiaries(selectedInit.id);
                                  loadInitiatives();
                                }}
                                className="text-red-600 hover:underline"
                              >
                                حذف
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailTab === 'supervisors' && (
              <div className="space-y-4">
                {canEdit && (
                  <form onSubmit={handleAssignSupervisor} className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
                    <input
                      type="text"
                      required
                      placeholder="اسم المسؤول الجديد *"
                      value={supForm.name}
                      onChange={(e) => setSupForm({ ...supForm, name: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="الصفة / الوظيفة"
                      value={supForm.role_title}
                      onChange={(e) => setSupForm({ ...supForm, role_title: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="رقم الهاتف"
                      value={supForm.phone}
                      onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })}
                      className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono"
                    />
                    <button type="submit" className="px-3 py-2 bg-[#0d5c3e] text-white font-semibold rounded-lg flex items-center justify-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>تكليف مسؤول جديد</span>
                    </button>
                  </form>
                )}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">المسؤول</th>
                        <th className="p-2.5">الوظيفة</th>
                        <th className="p-2.5">الهاتف</th>
                        <th className="p-2.5">تاريخ التكليف</th>
                        <th className="p-2.5">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedInit.supervisors?.map((s) => (
                        <tr key={s.id}>
                          <td className="p-2.5 font-semibold">{s.name}</td>
                          <td className="p-2.5">{s.role_title}</td>
                          <td className="p-2.5 font-mono">{s.phone}</td>
                          <td className="p-2.5 tabular-nums">{s.assigned_date}</td>
                          <td className="p-2.5">
                            <StatusText status={s.is_active ? 'نشط' : 'تكليف سابق'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detailTab === 'images' && (
              <div className="space-y-4">
                {canFiles && (
                  <label className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg">
                    <ImagePlus className="w-4 h-4" />
                    <span>رفع صور إضافية للمبادرة (صورة أو عدة صور)</span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleUploadGalleryImages(e.target.files)}
                      className="hidden"
                    />
                  </label>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selectedInit.images?.map((img) => (
                    <div key={img.id} className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <div className="aspect-video bg-slate-100">
                        <img src={img.image_url} alt="صورة مبادرة" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      {canFiles && (
                        <div className="p-2 flex items-center justify-between text-xs">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/initiatives/${selectedInit.id}/images/${img.id}/primary`, { method: 'POST' });
                              loadInitiatives();
                            }}
                            className={`flex items-center gap-1 font-semibold ${img.is_primary ? 'text-amber-600' : 'text-slate-600 hover:text-[#0d5c3e]'}`}
                          >
                            <Star className="w-3.5 h-3.5" />
                            <span>{img.is_primary ? 'صورة رئيسية' : 'تعيين كرئيسية'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/initiatives/${selectedInit.id}/images/${img.id}`, { method: 'DELETE' });
                              loadInitiatives();
                            }}
                            className="text-red-600 hover:underline"
                          >
                            حذف
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create/Edit Initiative Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingInit ? `تعديل المبادرة (${editingInit.code})` : 'إنشاء مبادرة جديدة'}
      >
        <form onSubmit={handleSaveInitiative} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المبادرة *</label>
            <input
              type="text"
              required
              value={initForm.name}
              onChange={(e) => setInitForm({ ...initForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ البداية</label>
            <input
              type="date"
              value={initForm.start_date}
              onChange={(e) => setInitForm({ ...initForm, start_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ النهاية</label>
            <input
              type="date"
              value={initForm.end_date}
              onChange={(e) => setInitForm({ ...initForm, end_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الميزانية التقديرية (ج.م)</label>
            <input
              type="number"
              min={0}
              value={initForm.budget}
              onChange={(e) => setInitForm({ ...initForm, budget: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة</label>
            <select
              value={initForm.status}
              onChange={(e) => setInitForm({ ...initForm, status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="نشطة">نشطة</option>
              <option value="مخططة">مخططة</option>
              <option value="مكتملة">مكتملة</option>
              <option value="متوقفة">متوقفة</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">شروط الاستحقاق</label>
            <input
              type="text"
              value={initForm.eligibility_rules}
              onChange={(e) => setInitForm({ ...initForm, eligibility_rules: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">أنواع المساعدات والكميات المخصصة</label>
            <input
              type="text"
              value={initForm.allocated_aids_summary}
              onChange={(e) => setInitForm({ ...initForm, allocated_aids_summary: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          {!editingInit && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">اسم مسؤول المبادرة</label>
                <input
                  type="text"
                  value={initForm.supervisor_name}
                  onChange={(e) => setInitForm({ ...initForm, supervisor_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">هاتف المسؤول</label>
                <input
                  type="text"
                  value={initForm.supervisor_phone}
                  onChange={(e) => setInitForm({ ...initForm, supervisor_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">الصورة الرئيسية للمبادرة</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              className="text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">الوصف</label>
            <textarea
              rows={2}
              value={initForm.description}
              onChange={(e) => setInitForm({ ...initForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">
              حفظ المبادرة
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
