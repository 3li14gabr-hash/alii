import React, { useEffect, useMemo, useState } from 'react';
import { Check, Eye, FileSpreadsheet, Plus, Printer, Trash2 } from 'lucide-react';
import type {
  AssociationSettings,
  DonationRecord,
  ExpenseRecord,
  InitiativeRecord,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatCurrency } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function FinanceView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'donations', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'donations', 'edit', user.is_owner === 1);
  const canApprove = hasPermission(user.permissions, 'donations', 'approve', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'donations', 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'donations', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'donations', 'export_excel', user.is_owner === 1);

  const [tab, setTab] = useState<'donations' | 'expenses'>('donations');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'عام' | 'مخصص'>('all');
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [donModalOpen, setDonModalOpen] = useState(false);
  const [expModalOpen, setExpModalOpen] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const [donForm, setDonForm] = useState({
    donor_name: '',
    donor_phone: '',
    donation_type: 'نقدي',
    amount: 0,
    in_kind_description: '',
    donation_date: new Date().toISOString().slice(0, 10),
    scope: 'عام',
    initiative_id: '',
    purpose: '',
    status: 'مسجل',
    notes: '',
  });

  const [expForm, setExpForm] = useState({
    title: '',
    category: 'مبادرات',
    amount: 0,
    expense_date: new Date().toISOString().slice(0, 10),
    initiative_id: '',
    reason: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [finRes, initRes] = await Promise.all([
        apiRequest<{ donations: DonationRecord[]; expenses: ExpenseRecord[] }>('/api/donations'),
        apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives').catch(() => ({ initiatives: [] })),
      ]);
      setDonations(finRes.donations);
      setExpenses(finRes.expenses);
      setInitiatives(initRes.initiatives);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل التبرعات والحسابات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const summary = useMemo(() => {
    const approvedCash = donations
      .filter((d) => d.donation_type === 'نقدي' && d.status === 'معتمد')
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    const generalCash = donations
      .filter((d) => d.donation_type === 'نقدي' && d.status === 'معتمد' && d.scope === 'عام')
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    const earmarkedCash = donations
      .filter((d) => d.donation_type === 'نقدي' && d.status === 'معتمد' && d.scope === 'مخصص')
      .reduce((s, d) => s + Number(d.amount || 0), 0);
    const expTotal = expenses.filter((e) => e.status !== 'ملغى').reduce((s, e) => s + Number(e.amount || 0), 0);
    return { approvedCash, generalCash, earmarkedCash, expTotal, balance: approvedCash - expTotal };
  }, [donations, expenses]);

  const filteredDonations = donations.filter((d) => scopeFilter === 'all' || d.scope === scopeFilter);

  const handleSaveDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(donForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (receiptFile) fd.append('receipt', receiptFile);
      const res = await apiRequest<{ message: string }>('/api/donations', {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      onToast('success', res.message);
      setDonModalOpen(false);
      setReceiptFile(null);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تسجيل التبرع.');
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(expForm).forEach(([k, v]) => fd.append(k, String(v)));
      if (receiptFile) fd.append('receipt', receiptFile);
      const res = await apiRequest<{ message: string }>('/api/expenses', {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      onToast('success', res.message);
      setExpModalOpen(false);
      setReceiptFile(null);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تسجيل المصروف.');
    }
  };

  const handleApproveDonation = async (d: DonationRecord) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/donations/${d.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'معتمد' }),
      });
      onToast('success', res.message);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر اعتماد التبرع.');
    }
  };

  return (
    <div>
      <PageHeader
        title="التبرعات والحسابات"
        subtitle="فصل التبرعات العامة عن المخصصة للمبادرات، إدارة المصروفات وإرفاق الإيصالات"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: tab === 'donations' ? 'تقرير التبرعات' : 'تقرير المصروفات',
                    association,
                    headers:
                      tab === 'donations'
                        ? ['الكود', 'المتبرع', 'النوع', 'المبلغ/الوصف', 'التصنيف', 'المبادرة', 'التاريخ', 'الحالة']
                        : ['الكود', 'البيان', 'الفئة', 'المبلغ', 'السبب', 'التاريخ'],
                    rows:
                      tab === 'donations'
                        ? filteredDonations.map((d) => [
                            d.code,
                            d.donor_name,
                            d.donation_type,
                            d.donation_type === 'نقدي' ? d.amount : d.in_kind_description,
                            d.scope,
                            d.initiative_name || 'عام',
                            d.donation_date,
                            d.status,
                          ])
                        : expenses.map((e) => [e.code, e.title, e.category, e.amount, e.reason, e.expense_date]),
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
                    ['الكود', 'المتبرع', 'النوع', 'المبلغ', 'الوصف العيني', 'النطاق', 'المبادرة', 'التاريخ', 'الحالة'],
                    filteredDonations.map((d) => [
                      d.code,
                      d.donor_name,
                      d.donation_type,
                      d.amount,
                      d.in_kind_description,
                      d.scope,
                      d.initiative_name || '',
                      d.donation_date,
                      d.status,
                    ]),
                    'التبرعات',
                    'تقرير_التبرعات.xlsx'
                  )
                }
                className="px-3 py-2 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] rounded-lg text-xs font-bold flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
            {canCreate && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptFile(null);
                    setDonModalOpen(true);
                  }}
                  className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل تبرع</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptFile(null);
                    setExpModalOpen(true);
                  }}
                  className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>تسجيل مصروف</span>
                </button>
              </>
            )}
          </>
        }
      />

      {/* Financial Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">التبرعات العامة المعتمدة</div>
          <div className="text-xl font-bold text-slate-900 mt-1 tabular-nums">{formatCurrency(summary.generalCash)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">التبرعات المخصصة للمبادرات</div>
          <div className="text-xl font-bold text-[#0d5c3e] mt-1 tabular-nums">{formatCurrency(summary.earmarkedCash)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">إجمالي المصروفات</div>
          <div className="text-xl font-bold text-amber-700 mt-1 tabular-nums">{formatCurrency(summary.expTotal)}</div>
        </div>
        <div className="bg-white border border-[#c6973f] rounded-xl p-4">
          <div className="text-xs text-slate-500">صافي الرصيد المالي المتاح</div>
          <div className="text-xl font-bold text-[#0d5c3e] mt-1 tabular-nums">{formatCurrency(summary.balance)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('donations')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'donations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            سجل التبرعات ({donations.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('expenses')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md ${tab === 'expenses' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            سجل المصروفات ({expenses.length})
          </button>
        </div>

        {tab === 'donations' && (
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs">
            {(['all', 'عام', 'مخصص'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScopeFilter(s)}
                className={`px-3 py-1 rounded font-semibold ${scopeFilter === s ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'}`}
              >
                {s === 'all' ? 'الكل' : s === 'عام' ? 'تبرعات عامة' : 'تبرعات مخصصة'}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : tab === 'donations' ? (
        filteredDonations.length === 0 ? (
          <EmptyState title="لا توجد تبرعات" description="سجل أول تبرع نقدي أو عيني." />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="p-3">الكود</th>
                    <th className="p-3">المتبرع</th>
                    <th className="p-3">النوع والقيمة</th>
                    <th className="p-3">النطاق والمبادرة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">الإيصال وإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDonations.map((d) => (
                    <tr key={d.id}>
                      <td className="p-3 font-mono text-xs font-bold text-[#0d5c3e]">{d.code}</td>
                      <td className="p-3">
                        <div className="font-semibold">{d.donor_name}</div>
                        <div className="text-xs text-slate-500 font-mono">{d.donor_phone}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold tabular-nums">
                          {d.donation_type === 'نقدي' ? formatCurrency(d.amount) : d.in_kind_description}
                        </div>
                        <div className="text-xs text-slate-500">{d.donation_type}</div>
                      </td>
                      <td className="p-3 text-xs">
                        <div className="font-semibold">{d.scope}</div>
                        <div className="text-slate-500">{d.initiative_name || d.purpose || '—'}</div>
                      </td>
                      <td className="p-3 text-xs tabular-nums">{d.donation_date}</td>
                      <td className="p-3">
                        <StatusText status={d.status} />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {d.receipt_url && (
                            <a href={d.receipt_url} target="_blank" rel="noreferrer" className="p-1.5 border border-slate-300 rounded text-slate-700" title="عرض الإيصال">
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}
                          {canApprove && d.status !== 'معتمد' && (
                            <button
                              type="button"
                              onClick={() => handleApproveDonation(d)}
                              className="px-2 py-1 bg-emerald-700 text-white text-xs font-semibold rounded flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>اعتماد</span>
                            </button>
                          )}
                          {canEdit && d.status === 'مسجل' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/donations/${d.id}`, {
                                  method: 'PUT',
                                  body: JSON.stringify({ status: 'قيد المراجعة' }),
                                });
                                loadData();
                              }}
                              className="px-2 py-1 border border-slate-300 text-xs rounded"
                            >
                              للمراجعة
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiRequest(`/api/donations/${d.id}`, { method: 'DELETE' });
                                  onToast('success', 'تم حذف التبرع.');
                                  loadData();
                                } catch (err) {
                                  onToast('error', err instanceof Error ? err.message : 'تعذر الحذف.');
                                }
                              }}
                              className="p-1.5 border border-red-200 text-red-600 rounded"
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
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                <tr>
                  <th className="p-3">الكود</th>
                  <th className="p-3">البيان</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">سبب الصرف</th>
                  <th className="p-3">المبادرة</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">مستند</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3 font-mono text-xs font-bold">{e.code}</td>
                    <td className="p-3 font-semibold">{e.title}</td>
                    <td className="p-3 font-bold text-amber-700 tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="p-3 text-xs text-slate-600">{e.reason}</td>
                    <td className="p-3 text-xs">{e.initiative_name || 'مصروف عام'}</td>
                    <td className="p-3 text-xs tabular-nums">{e.expense_date}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {e.receipt_url && (
                          <a href={e.receipt_url} target="_blank" rel="noreferrer" className="p-1.5 border border-slate-300 rounded">
                            <Eye className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/expenses/${e.id}`, { method: 'DELETE' });
                              onToast('success', 'تم حذف المصروف.');
                              loadData();
                            }}
                            className="p-1.5 border border-red-200 text-red-600 rounded"
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

      {/* Donation Modal */}
      <Modal open={donModalOpen} onClose={() => setDonModalOpen(false)} title="تسجيل تبرع جديد">
        <form onSubmit={handleSaveDonation} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المتبرع *</label>
            <input
              type="text"
              required
              value={donForm.donor_name}
              onChange={(e) => setDonForm({ ...donForm, donor_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">هاتف المتبرع</label>
            <input
              type="text"
              value={donForm.donor_phone}
              onChange={(e) => setDonForm({ ...donForm, donor_phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">نوع التبرع</label>
            <select
              value={donForm.donation_type}
              onChange={(e) => setDonForm({ ...donForm, donation_type: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="نقدي">نقدي</option>
              <option value="عيني">عيني</option>
            </select>
          </div>
          {donForm.donation_type === 'نقدي' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المبلغ (ج.م) *</label>
              <input
                type="number"
                min={1}
                required
                value={donForm.amount}
                onChange={(e) => setDonForm({ ...donForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">وصف التبرع العيني *</label>
              <input
                type="text"
                required
                value={donForm.in_kind_description}
                onChange={(e) => setDonForm({ ...donForm, in_kind_description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تخصيص التبرع</label>
            <select
              value={donForm.scope}
              onChange={(e) => setDonForm({ ...donForm, scope: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="عام">تبرع عام للجمعية</option>
              <option value="مخصص">تبرع مخصص لمبادرة / غرض محدد</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المبادرة (إذا كان مخصصًا)</label>
            <select
              value={donForm.initiative_id}
              onChange={(e) => setDonForm({ ...donForm, initiative_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="">بدون مبادرة محددة</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">التاريخ</label>
            <input
              type="date"
              value={donForm.donation_date}
              onChange={(e) => setDonForm({ ...donForm, donation_date: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة</label>
            <select
              value={donForm.status}
              onChange={(e) => setDonForm({ ...donForm, status: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="مسجل">مسجل</option>
              <option value="قيد المراجعة">قيد المراجعة</option>
              {canApprove && <option value="معتمد">معتمد</option>}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">صورة الإيصال / المستند</label>
            <input type="file" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setDonModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">
              حفظ التبرع
            </button>
          </div>
        </form>
      </Modal>

      {/* Expense Modal */}
      <Modal open={expModalOpen} onClose={() => setExpModalOpen(false)} title="تسجيل مصروف جديد">
        <form onSubmit={handleSaveExpense} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">بيان المصروف *</label>
            <input
              type="text"
              required
              value={expForm.title}
              onChange={(e) => setExpForm({ ...expForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المبلغ (ج.م) *</label>
              <input
                type="number"
                min={1}
                required
                value={expForm.amount}
                onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">التاريخ</label>
              <input
                type="date"
                value={expForm.expense_date}
                onChange={(e) => setExpForm({ ...expForm, expense_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">سبب الصرف *</label>
            <input
              type="text"
              required
              value={expForm.reason}
              onChange={(e) => setExpForm({ ...expForm, reason: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">صورة الفاتورة / المستند</label>
            <input type="file" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setExpModalOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">
              حفظ المصروف
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
