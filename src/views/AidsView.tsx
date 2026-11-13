import React, { useEffect, useMemo, useState } from 'react';
import { Check, FileSpreadsheet, Plus, Printer, Search, Trash2, XCircle } from 'lucide-react';
import type {
  AidItemAllocation,
  AidRecord,
  AssociationSettings,
  BeneficiaryRecord,
  InitiativeRecord,
  InventoryItemRecord,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatCurrency } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function AidsView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'aids', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'aids', 'edit', user.is_owner === 1);
  const canDeleteSingle = hasPermission(user.permissions, 'aids', 'delete_single', user.is_owner === 1);
  const canDeleteBulk = hasPermission(user.permissions, 'aids', 'delete_bulk', user.is_owner === 1);
  const canApprove = hasPermission(user.permissions, 'aids', 'approve', user.is_owner === 1);
  const canReject = hasPermission(user.permissions, 'aids', 'reject', user.is_owner === 1);
  const canCancel = hasPermission(user.permissions, 'aids', 'cancel', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'aids', 'print', user.is_owner === 1);
  const canExportExcel = hasPermission(user.permissions, 'aids', 'export_excel', user.is_owner === 1);

  const [aids, setAids] = useState<AidRecord[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemRecord[]>([]);
  const [aidTypes, setAidTypes] = useState<string[]>(['مساعدة غذائية', 'مساعدة مالية', 'مساعدة طبية وعلاجية']);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Create/Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingAid, setEditingAid] = useState<AidRecord | null>(null);
  const [aidForm, setAidForm] = useState({
    beneficiary_id: '',
    initiative_id: '',
    aid_type: 'مساعدة غذائية',
    quantity_label: '',
    cash_amount: 0,
    aid_date: new Date().toISOString().slice(0, 10),
    status: 'قيد المراجعة',
    financial_ref: '',
    notes: '',
    action_reason: '',
    items: [] as AidItemAllocation[],
  });
  const [pickItemId, setPickItemId] = useState('');
  const [pickItemQty, setPickItemQty] = useState(1);

  // Reason Modal for Delete / Reject / Cancel / Bulk Delete
  const [reasonModal, setReasonModal] = useState<{
    mode: 'delete' | 'bulk_delete' | 'reject' | 'cancel';
    aid?: AidRecord;
  } | null>(null);
  const [reasonText, setReasonText] = useState('');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [aidsRes, benRes, initRes, invRes, setRes] = await Promise.all([
        apiRequest<{ aids: AidRecord[] }>('/api/aids'),
        apiRequest<{ beneficiaries: BeneficiaryRecord[] }>('/api/beneficiaries').catch(() => ({ beneficiaries: [] })),
        apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives').catch(() => ({ initiatives: [] })),
        apiRequest<{ items: InventoryItemRecord[] }>('/api/inventory').catch(() => ({ items: [] })),
        apiRequest<{ settings: { aid_types: string[] } }>('/api/settings/general').catch(() => ({ settings: { aid_types: [] } })),
      ]);
      setAids(aidsRes.aids);
      setBeneficiaries(benRes.beneficiaries);
      setInitiatives(initRes.initiatives);
      setInventoryItems(invRes.items);
      if (setRes.settings?.aid_types?.length) {
        setAidTypes(setRes.settings.aid_types);
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر تحميل سجل المساعدات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return aids.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.aid_type !== typeFilter) return false;
      if (!q) return true;
      return (
        a.code.toLowerCase().includes(q) ||
        (a.beneficiary_name || '').toLowerCase().includes(q) ||
        (a.beneficiary_code || '').toLowerCase().includes(q) ||
        a.aid_type.toLowerCase().includes(q) ||
        a.aid_date.includes(q)
      );
    });
  }, [aids, search, statusFilter, typeFilter]);

  const openCreate = () => {
    setEditingAid(null);
    setAidForm({
      beneficiary_id: beneficiaries[0]?.id ? String(beneficiaries[0].id) : '',
      initiative_id: '',
      aid_type: aidTypes[0] || 'مساعدة غذائية',
      quantity_label: '',
      cash_amount: 0,
      aid_date: new Date().toISOString().slice(0, 10),
      status: canApprove ? 'معتمدة' : 'قيد المراجعة',
      financial_ref: '',
      notes: '',
      action_reason: '',
      items: [],
    });
    setFormOpen(true);
  };

  const openEdit = (a: AidRecord) => {
    setEditingAid(a);
    setAidForm({
      beneficiary_id: String(a.beneficiary_id),
      initiative_id: a.initiative_id ? String(a.initiative_id) : '',
      aid_type: a.aid_type,
      quantity_label: a.quantity_label,
      cash_amount: a.cash_amount,
      aid_date: a.aid_date,
      status: a.status,
      financial_ref: a.financial_ref,
      notes: a.notes,
      action_reason: '',
      items: a.items || [],
    });
    setFormOpen(true);
  };

  const addItemAllocation = () => {
    const inv = inventoryItems.find((i) => i.id === Number(pickItemId));
    if (!inv || pickItemQty <= 0) return;
    setAidForm((prev) => {
      const exists = prev.items.find((x) => x.item_id === inv.id);
      const nextItems = exists
        ? prev.items.map((x) => (x.item_id === inv.id ? { ...x, quantity: x.quantity + pickItemQty } : x))
        : [...prev.items, { item_id: inv.id, item_name: inv.name, unit: inv.unit, quantity: pickItemQty }];
      return { ...prev, items: nextItems };
    });
    setPickItemId('');
    setPickItemQty(1);
  };

  const handleSaveAid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAid) {
        const res = await apiRequest<{ message: string }>(`/api/aids/${editingAid.id}`, {
          method: 'PUT',
          body: JSON.stringify(aidForm),
        });
        onToast('success', res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/aids', {
          method: 'POST',
          body: JSON.stringify({
            ...aidForm,
            beneficiary_id: Number(aidForm.beneficiary_id),
            initiative_id: aidForm.initiative_id ? Number(aidForm.initiative_id) : null,
          }),
        });
        onToast('success', res.message);
      }
      setFormOpen(false);
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل حفظ المساعدة.');
    }
  };

  const handleStatusChange = async (aidId: number, status: string, reason = '') => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/aids/${aidId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
      onToast('success', res.message);
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر تحديث حالة المساعدة.');
    }
  };

  const handleConfirmReasonAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal || !reasonText.trim()) return;
    try {
      if (reasonModal.mode === 'delete' && reasonModal.aid) {
        const res = await apiRequest<{ message: string }>(`/api/aids/${reasonModal.aid.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason: reasonText.trim() }),
        });
        onToast('success', res.message);
      } else if (reasonModal.mode === 'bulk_delete') {
        const res = await apiRequest<{ message: string }>('/api/aids/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({ ids: selectedIds, reason: reasonText.trim() }),
        });
        onToast('success', res.message);
        setSelectedIds([]);
      } else if (reasonModal.mode === 'reject' && reasonModal.aid) {
        await handleStatusChange(reasonModal.aid.id, 'مرفوضة', reasonText.trim());
      } else if (reasonModal.mode === 'cancel' && reasonModal.aid) {
        await handleStatusChange(reasonModal.aid.id, 'ملغاة', reasonText.trim());
      }
      setReasonModal(null);
      setReasonText('');
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تنفيذ العملية.');
    }
  };

  return (
    <div>
      <PageHeader
        title="إدارة المساعدات"
        subtitle="تسجيل المساعدات واعتمادها وصرفها مع الخصم التلقائي من المخازن وحركات التصحيح الموثقة"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'تقرير المساعدات المصروفة والمسجلة',
                    association,
                    headers: ['الكود', 'المستفيد', 'النوع', 'المبادرة', 'الأصناف/البيان', 'المبلغ النقدي', 'التاريخ', 'الحالة'],
                    rows: filtered.map((a) => [
                      a.code,
                      `${a.beneficiary_name || ''} (${a.beneficiary_code || ''})`,
                      a.aid_type,
                      a.initiative_name || '—',
                      a.items?.length ? a.items.map((i) => `${i.item_name} (${i.quantity})`).join(' + ') : a.quantity_label,
                      a.cash_amount,
                      a.aid_date,
                      a.status,
                    ]),
                  })
                }
                className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            )}
            {canExportExcel && (
              <button
                type="button"
                onClick={() =>
                  exportGenericExcel(
                    ['الكود', 'كود المستفيد', 'اسم المستفيد', 'النوع', 'المبادرة', 'الكمية/الأصناف', 'القيمة النقدية', 'التاريخ', 'الحالة'],
                    filtered.map((a) => [
                      a.code,
                      a.beneficiary_code || '',
                      a.beneficiary_name || '',
                      a.aid_type,
                      a.initiative_name || '',
                      a.items?.length ? a.items.map((i) => `${i.item_name} (${i.quantity})`).join(' + ') : a.quantity_label,
                      a.cash_amount,
                      a.aid_date,
                      a.status,
                    ]),
                    'المساعدات',
                    'سجل_المساعدات.xlsx'
                  )
                }
                className="px-3 py-2 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={openCreate}
                className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>تسجيل مساعدة جديدة</span>
              </button>
            )}
          </>
        }
      />

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم المستفيد أو الكود أو التاريخ..."
            className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">جميع أنواع المساعدات</option>
          {aidTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="all">كل الحالات</option>
          {['مسجلة', 'قيد المراجعة', 'معتمدة', 'مسلمة', 'مرفوضة', 'ملغاة'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {canDeleteBulk && selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setReasonText('');
              setReasonModal({ mode: 'bulk_delete' });
            }}
            className="px-3 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>حذف جماعي ({selectedIds.length})</span>
          </button>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا توجد مساعدات مطابقة"
          description="يمكنك تسجيل مساعدة جديدة وربطها بمستفيد ومخزن ومبادرة."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  {canDeleteBulk && (
                    <th className="py-3 px-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === filtered.length && filtered.length > 0}
                        onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((a) => a.id) : [])}
                      />
                    </th>
                  )}
                  <th className="py-3 px-3">الكود</th>
                  <th className="py-3 px-3">المستفيد</th>
                  <th className="py-3 px-3">النوع والمبادرة</th>
                  <th className="py-3 px-3">الأصناف / القيمة</th>
                  <th className="py-3 px-3">التاريخ</th>
                  <th className="py-3 px-3">الحالة</th>
                  <th className="py-3 px-3">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    {canDeleteBulk && (
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(a.id)}
                          onChange={(e) =>
                            setSelectedIds((prev) =>
                              e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="py-3 px-3 font-mono text-xs font-bold text-[#0d5c3e] whitespace-nowrap">{a.code}</td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-900">{a.beneficiary_name}</div>
                      <div className="text-xs text-slate-500 font-mono">{a.beneficiary_code}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-slate-800">{a.aid_type}</div>
                      {a.initiative_name && <div className="text-xs text-slate-500">{a.initiative_name}</div>}
                    </td>
                    <td className="py-3 px-3 text-xs">
                      {a.items?.length > 0 && (
                        <div className="text-slate-800 font-medium">
                          {a.items.map((i) => `${i.item_name} (${i.quantity} ${i.unit})`).join('، ')}
                        </div>
                      )}
                      {a.cash_amount > 0 && (
                        <div className="font-bold text-emerald-700 tabular-nums">{formatCurrency(a.cash_amount)}</div>
                      )}
                      {a.quantity_label && <div className="text-slate-500">{a.quantity_label}</div>}
                    </td>
                    <td className="py-3 px-3 tabular-nums text-xs whitespace-nowrap">{a.aid_date}</td>
                    <td className="py-3 px-3">
                      <StatusText status={a.status} />
                      {a.action_reason && (
                        <div className="text-[11px] text-slate-500 mt-0.5 max-w-[160px] truncate" title={a.action_reason}>
                          {a.action_reason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        {canApprove && (a.status === 'مسجلة' || a.status === 'قيد المراجعة') && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(a.id, 'معتمدة')}
                            className="px-2 py-1 bg-emerald-700 text-white text-xs font-semibold rounded hover:bg-emerald-800 flex items-center gap-1 whitespace-nowrap"
                          >
                            <Check className="w-3 h-3" />
                            <span>اعتماد</span>
                          </button>
                        )}
                        {canApprove && a.status === 'معتمدة' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(a.id, 'مسلمة')}
                            className="px-2 py-1 bg-[#0d5c3e] text-white text-xs font-semibold rounded hover:bg-[#09442e] whitespace-nowrap"
                          >
                            تسجيل تسليم
                          </button>
                        )}
                        {canReject && (a.status === 'مسجلة' || a.status === 'قيد المراجعة') && (
                          <button
                            type="button"
                            onClick={() => {
                              setReasonText('');
                              setReasonModal({ mode: 'reject', aid: a });
                            }}
                            className="px-2 py-1 border border-red-200 text-red-700 text-xs font-semibold rounded hover:bg-red-50"
                          >
                            رفض
                          </button>
                        )}
                        {canCancel && (a.status === 'معتمدة' || a.status === 'مسلمة') && (
                          <button
                            type="button"
                            onClick={() => {
                              setReasonText('');
                              setReasonModal({ mode: 'cancel', aid: a });
                            }}
                            className="px-2 py-1 border border-amber-300 text-amber-800 text-xs font-semibold rounded hover:bg-amber-50 flex items-center gap-1"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>إلغاء</span>
                          </button>
                        )}
                        {canEdit && a.status !== 'ملغاة' && (
                          <button
                            type="button"
                            onClick={() => openEdit(a)}
                            className="px-2 py-1 border border-slate-300 text-slate-700 text-xs font-semibold rounded hover:bg-slate-100"
                          >
                            تعديل
                          </button>
                        )}
                        {canDeleteSingle && (
                          <button
                            type="button"
                            onClick={() => {
                              setReasonText('');
                              setReasonModal({ mode: 'delete', aid: a });
                            }}
                            aria-label={`حذف ${a.code}`}
                            className="p-1.5 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Aid Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingAid ? `تعديل المساعدة (${editingAid.code})` : 'تسجيل مساعدة جديدة'}
      >
        <form onSubmit={handleSaveAid} className="space-y-4 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المستفيد *</label>
              <select
                required
                disabled={Boolean(editingAid)}
                value={aidForm.beneficiary_id}
                onChange={(e) => setAidForm({ ...aidForm, beneficiary_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
              >
                <option value="">اختر المستفيد...</option>
                {beneficiaries.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.wife_name || b.husband_name} ({b.eligibility})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">نوع المساعدة *</label>
              <select
                value={aidForm.aid_type}
                onChange={(e) => setAidForm({ ...aidForm, aid_type: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {aidTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المبادرة المرتبطة (اختياري)</label>
              <select
                value={aidForm.initiative_id}
                onChange={(e) => setAidForm({ ...aidForm, initiative_id: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">مساعدة عامة غير مرتبطة بمبادرة</option>
                {initiatives.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} — {i.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ المساعدة *</label>
              <input
                type="date"
                required
                value={aidForm.aid_date}
                onChange={(e) => setAidForm({ ...aidForm, aid_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">وصف الكمية</label>
              <input
                type="text"
                value={aidForm.quantity_label}
                onChange={(e) => setAidForm({ ...aidForm, quantity_label: e.target.value })}
                placeholder="مثال: 2 كرتونة + بطانية"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المبلغ النقدي (ج.م)</label>
              <input
                type="number"
                min={0}
                value={aidForm.cash_amount}
                onChange={(e) => setAidForm({ ...aidForm, cash_amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          </div>

          {/* Inventory Items Allocation */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
            <div className="text-xs font-bold text-slate-800">الأصناف المخزنية المصروفة (تخصم تلقائيًا عند الاعتماد)</div>
            <div className="flex flex-wrap gap-2">
              <select
                value={pickItemId}
                onChange={(e) => setPickItemId(e.target.value)}
                className="flex-1 min-w-[180px] px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
              >
                <option value="">اختر صنفًا من المخزن...</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} (متاح: {item.quantity} {item.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={pickItemQty}
                onChange={(e) => setPickItemQty(Number(e.target.value))}
                className="w-24 px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs tabular-nums"
              />
              <button
                type="button"
                onClick={addItemAllocation}
                className="px-3 py-1.5 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg"
              >
                إضافة الصنف
              </button>
            </div>
            {aidForm.items.length > 0 && (
              <div className="space-y-1">
                {aidForm.items.map((it) => (
                  <div key={it.item_id} className="flex items-center justify-between bg-white px-3 py-1.5 rounded border border-slate-200 text-xs">
                    <span>
                      {it.item_name} — <strong className="tabular-nums">{it.quantity}</strong> {it.unit}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAidForm((prev) => ({
                          ...prev,
                          items: prev.items.filter((x) => x.item_id !== it.item_id),
                        }))
                      }
                      className="text-red-600 hover:underline"
                    >
                      إزالة
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!editingAid && canApprove && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">حالة التسجيل</label>
              <select
                value={aidForm.status}
                onChange={(e) => setAidForm({ ...aidForm, status: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="قيد المراجعة">قيد المراجعة</option>
                <option value="معتمدة">معتمدة (صرف وخصم من المخزن)</option>
                <option value="مسلمة">مسلمة فورًا (صرف وخصم من المخزن)</option>
              </select>
            </div>
          )}

          {editingAid && (
            <div>
              <label className="block text-xs font-semibold text-red-700 mb-1">سبب التعديل (إلزامي للتوثيق) *</label>
              <input
                type="text"
                required
                value={aidForm.action_reason}
                onChange={(e) => setAidForm({ ...aidForm, action_reason: e.target.value })}
                placeholder="اكتب سبب التعديل لتسجيله في سجل التدقيق..."
                className="w-full px-3 py-2 border border-red-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={aidForm.notes}
              onChange={(e) => setAidForm({ ...aidForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">
              حفظ المساعدة
            </button>
          </div>
        </form>
      </Modal>

      {/* Mandatory Reason Modal */}
      <Modal
        open={Boolean(reasonModal)}
        onClose={() => setReasonModal(null)}
        title={
          reasonModal?.mode === 'delete'
            ? `تأكيد حذف المساعدة (${reasonModal.aid?.code})`
            : reasonModal?.mode === 'bulk_delete'
              ? `تأكيد الحذف الجماعي (${selectedIds.length} مساعدة)`
              : reasonModal?.mode === 'reject'
                ? 'سبب رفض المساعدة'
                : 'سبب إلغاء المساعدة'
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmReasonAction} className="space-y-4 text-sm">
          <p className="text-xs text-slate-600 leading-relaxed">
            سيتم تسجيل السبب واسم المنفذ والتاريخ في سجل التدقيق، وإنشاء حركة تصحيح مخزنية موثقة لأي أصناف تم خصمها مسبقًا دون حذف الحركة الأصلية.
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">السبب الموثق *</label>
            <textarea
              rows={3}
              required
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="اكتب السبب بوضوح..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReasonModal(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              تراجع
            </button>
            <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold">
              تأكيد التنفيذ
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
