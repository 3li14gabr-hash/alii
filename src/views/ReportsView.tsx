import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, Search } from 'lucide-react';
import type { AssociationSettings, BeneficiaryRecord, InitiativeRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import { exportAidBeneficiariesExcel, exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, PageHeader } from '../components/UiPrimitives';

interface ReportDefinition {
  key: string;
  label: string;
  columns: { key: string; label: string }[];
}

const REPORT_DEFS: ReportDefinition[] = [
  {
    key: 'beneficiaries',
    label: 'تقرير المستفيدين الأساسي',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'wife_name', label: 'اسم الزوجة' },
      { key: 'wife_national_id', label: 'قومي الزوجة' },
      { key: 'husband_name', label: 'اسم الزوج' },
      { key: 'husband_national_id', label: 'قومي الزوج' },
      { key: 'phone1', label: 'الهاتف' },
      { key: 'address', label: 'العنوان' },
      { key: 'family_count', label: 'الأفراد' },
      { key: 'eligibility', label: 'الاستحقاق' },
    ],
  },
  {
    key: 'beneficiaries_no_aid',
    label: 'المستفيدون الذين لم يحصلوا على مساعدة',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'wife_name', label: 'اسم الزوجة' },
      { key: 'husband_name', label: 'اسم الزوج' },
      { key: 'phone1', label: 'الهاتف' },
      { key: 'address', label: 'العنوان' },
      { key: 'eligibility', label: 'الاستحقاق' },
    ],
  },
  {
    key: 'initiative_beneficiaries',
    label: 'مستفيدو المبادرات (كل مبادرة)',
    columns: [
      { key: 'initiative_name', label: 'المبادرة' },
      { key: 'full_name', label: 'الاسم' },
      { key: 'national_id', label: 'الرقم القومي' },
      { key: 'phone', label: 'الهاتف' },
      { key: 'address', label: 'العنوان' },
      { key: 'family_count', label: 'الأفراد' },
    ],
  },
  {
    key: 'beneficiary_files',
    label: 'الأسر والملفات الجماعية',
    columns: [
      { key: 'code', label: 'كود الملف' },
      { key: 'name', label: 'اسم الملف' },
      { key: 'area', label: 'المنطقة' },
      { key: 'supervisor_name', label: 'المسؤول' },
      { key: 'members_count', label: 'عدد الأسر' },
    ],
  },
  {
    key: 'aids',
    label: 'المساعدات المصروفة وحسب النوع والتاريخ',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'beneficiary_name', label: 'المستفيد' },
      { key: 'aid_type', label: 'النوع' },
      { key: 'initiative_name', label: 'المبادرة' },
      { key: 'cash_amount', label: 'القيمة النقدية' },
      { key: 'aid_date', label: 'التاريخ' },
      { key: 'status', label: 'الحالة' },
    ],
  },
  {
    key: 'cancelled_rejected_aids',
    label: 'العمليات الملغاة والمرفوضة',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'beneficiary_name', label: 'المستفيد' },
      { key: 'aid_type', label: 'النوع' },
      { key: 'status', label: 'الحالة' },
      { key: 'action_reason', label: 'السبب' },
      { key: 'aid_date', label: 'التاريخ' },
    ],
  },
  {
    key: 'donations_expenses',
    label: 'التبرعات والمصروفات',
    columns: [
      { key: 'entry_kind', label: 'البند' },
      { key: 'code', label: 'الكود' },
      { key: 'title_or_party', label: 'المتبرع / البيان' },
      { key: 'amount', label: 'المبلغ' },
      { key: 'entry_date', label: 'التاريخ' },
      { key: 'initiative_name', label: 'المبادرة' },
      { key: 'status', label: 'الحالة' },
    ],
  },
  {
    key: 'inventory_movements',
    label: 'حركة المخزون',
    columns: [
      { key: 'movement_type', label: 'نوع الحركة' },
      { key: 'item_name', label: 'الصنف' },
      { key: 'warehouse_name', label: 'المخزن' },
      { key: 'quantity', label: 'الكمية' },
      { key: 'balance_after', label: 'الرصيد بعد' },
      { key: 'reason', label: 'السبب' },
      { key: 'created_by_name', label: 'المنفذ' },
    ],
  },
  {
    key: 'staff',
    label: 'الموظفون والمتطوعون والكارنيهات',
    columns: [
      { key: 'code', label: 'الكود' },
      { key: 'person_type', label: 'الصفة' },
      { key: 'full_name', label: 'الاسم' },
      { key: 'job_title', label: 'الوظيفة' },
      { key: 'phone', label: 'الهاتف' },
      { key: 'status', label: 'الحالة' },
    ],
  },
  {
    key: 'attendance',
    label: 'سجل الحضور والانصراف',
    columns: [
      { key: 'person_code', label: 'الكود' },
      { key: 'person_name', label: 'الاسم' },
      { key: 'attendance_date', label: 'التاريخ' },
      { key: 'check_in_time', label: 'الحضور' },
      { key: 'check_out_time', label: 'الانصراف' },
      { key: 'work_status', label: 'الحالة' },
    ],
  },
  {
    key: 'partners',
    label: 'الشراكات والمستفيدون',
    columns: [
      { key: 'name', label: 'الجهة الشريكة' },
      { key: 'agreement_title', label: 'الاتفاقية' },
      { key: 'initiative_name', label: 'المبادرة' },
      { key: 'beneficiaries_count', label: 'عدد المستفيدين' },
    ],
  },
  {
    key: 'supplies',
    label: 'الموردون والمشتريات',
    columns: [
      { key: 'supplier_name', label: 'المورد' },
      { key: 'item_name', label: 'الصنف' },
      { key: 'quantity', label: 'الكمية' },
      { key: 'total_price', label: 'الإجمالي' },
      { key: 'supply_date', label: 'التاريخ' },
    ],
  },
  {
    key: 'user_operations',
    label: 'العمليات التي نفذها كل مستخدم',
    columns: [
      { key: 'user_name', label: 'المستخدم' },
      { key: 'action_type', label: 'العملية' },
      { key: 'section', label: 'القسم' },
      { key: 'reason', label: 'التفاصيل/السبب' },
      { key: 'result', label: 'النتيجة' },
      { key: 'created_at', label: 'الوقت' },
    ],
  },
];

export function ReportsView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canPrint = hasPermission(user.permissions, 'reports', 'print', user.is_owner === 1);
  const canExportExcel = hasPermission(user.permissions, 'reports', 'export_excel', user.is_owner === 1);

  const [reportKey, setReportKey] = useState(REPORT_DEFS[0].key);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [initiativeId, setInitiativeId] = useState('');
  const [selectedCols, setSelectedCols] = useState<string[]>(REPORT_DEFS[0].columns.map((c) => c.key));

  const currentDef = REPORT_DEFS.find((r) => r.key === reportKey) || REPORT_DEFS[0];

  useEffect(() => {
    setSelectedCols(currentDef.columns.map((c) => c.key));
  }, [reportKey]);

  useEffect(() => {
    apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives')
      .then((r) => setInitiatives(r.initiatives))
      .catch(() => {});
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from', fromDate);
      if (toDate) qs.set('to', toDate);
      if (initiativeId) qs.set('initiative_id', initiativeId);
      const res = await apiRequest<{ rows: Record<string, unknown>[] }>(`/api/reports/${reportKey}?${qs.toString()}`);
      setRows(res.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'ليس لديك صلاحية الاطلاع على هذا التقرير.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [reportKey, fromDate, toDate, initiativeId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }, [rows, search]);

  const activeColumns = currentDef.columns.filter((c) => selectedCols.includes(c.key));

  const handleExportExcel = () => {
    if (reportKey === 'beneficiaries' || reportKey === 'beneficiaries_no_aid') {
      // Enforce strict 13-column rule on Aid Beneficiaries Excel export
      exportAidBeneficiariesExcel(filteredRows as unknown as BeneficiaryRecord[], `${reportKey}_13cols.xlsx`);
      onToast('success', 'تم تصدير ملف مستفيدي المساعدات بالصيغة الإلزامية ذات الـ 13 عمودًا.');
      return;
    }
    exportGenericExcel(
      activeColumns.map((c) => c.label),
      filteredRows.map((r) => activeColumns.map((c) => String(r[c.key] ?? ''))),
      currentDef.label,
      `${reportKey}.xlsx`
    );
    onToast('success', 'تم تصدير التقرير إلى Excel بنجاح.');
  };

  return (
    <div>
      <PageHeader
        title="مركز التقارير والطباعة والتصدير"
        subtitle="تقارير قابلة للبحث والتصفية واختيار الأعمدة والطباعة والتصدير مع تطبيق الصلاحيات"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                disabled={Boolean(error) || loading}
                onClick={() =>
                  printArabicReport({
                    title: currentDef.label,
                    subtitle: `عدد النتائج المطابقة: ${filteredRows.length}`,
                    association,
                    headers: activeColumns.map((c) => c.label),
                    rows: filteredRows.map((r) => activeColumns.map((c) => String(r[c.key] ?? '—'))),
                  })
                }
                className="px-3.5 py-2 border border-slate-300 bg-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة / PDF</span>
              </button>
            )}
            {canExportExcel && (
              <button
                type="button"
                disabled={Boolean(error) || loading}
                onClick={handleExportExcel}
                className="px-4 py-2 border border-[#c6973f] bg-[#fbf6eb] text-[#7a5816] rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel</span>
              </button>
            )}
          </>
        }
      />

      {/* Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">اختر التقرير</label>
            <select
              value={reportKey}
              onChange={(e) => setReportKey(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-semibold"
            >
              {REPORT_DEFS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">بحث داخل النتائج</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث..."
                className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">من تاريخ</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">إلى تاريخ</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </div>
        </div>

        {(reportKey === 'aids' || reportKey === 'initiative_beneficiaries') && (
          <div className="max-w-xs">
            <select
              value={initiativeId}
              onChange={(e) => setInitiativeId(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
            >
              <option value="">كل المبادرات</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Column selector */}
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold text-slate-600">الأعمدة الظاهرة:</span>
          {currentDef.columns.map((c) => (
            <label key={c.key} className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedCols.includes(c.key)}
                onChange={(e) =>
                  setSelectedCols((prev) =>
                    e.target.checked ? [...prev, c.key] : prev.length > 1 ? prev.filter((k) => k !== c.key) : prev
                  )
                }
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-800 font-semibold">
          {error}
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState title="لا توجد نتائج في هذا التقرير" description="جرّب تغيير معايير البحث أو الفترة الزمنية." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  {activeColumns.map((c) => (
                    <th key={c.key} className="p-3 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {activeColumns.map((c) => (
                      <td key={c.key} className="p-3 tabular-nums">
                        {String(row[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
