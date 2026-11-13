import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowRightLeft,
  Download,
  Eye,
  FileSpreadsheet,
  FolderPlus,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from 'lucide-react';
import type {
  AidRecord,
  AssociationSettings,
  BeneficiaryDocument,
  BeneficiaryFileGroup,
  BeneficiaryRecord,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { AID_BENEFICIARIES_EXCEL_HEADERS, type ExcelImportPreviewResult } from '../shared/excelSchema';
import { apiRequest, formatDateArabic } from '../utils/api';
import {
  downloadAidBeneficiariesTemplate,
  exportAidBeneficiariesExcel,
  parseAidBeneficiariesExcelFile,
  printArabicReport,
} from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

const DOC_TYPES = [
  'بطاقة الزوج',
  'بطاقة الزوجة',
  'شهادات الميلاد',
  'إثبات الحالة الاجتماعية',
  'إثبات الدخل',
  'صور المنزل',
  'الأبحاث الاجتماعية',
  'مستندات أخرى',
];

export function BeneficiariesView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'beneficiaries', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'beneficiaries', 'edit', user.is_owner === 1);
  const canDeleteSingle = hasPermission(user.permissions, 'beneficiaries', 'delete_single', user.is_owner === 1);
  const canDeleteBulk = hasPermission(user.permissions, 'beneficiaries', 'delete_bulk', user.is_owner === 1);
  const canFiles = hasPermission(user.permissions, 'beneficiaries', 'manage_files', user.is_owner === 1);
  const canExportExcel = hasPermission(user.permissions, 'beneficiaries', 'export_excel', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'beneficiaries', 'print', user.is_owner === 1);

  const canManageGroups = hasPermission(user.permissions, 'beneficiary_files', 'view', user.is_owner === 1);
  const canCreateGroup = hasPermission(user.permissions, 'beneficiary_files', 'create', user.is_owner === 1);
  const canEditGroup = hasPermission(user.permissions, 'beneficiary_files', 'edit', user.is_owner === 1);
  const canDeleteGroup = hasPermission(user.permissions, 'beneficiary_files', 'delete_single', user.is_owner === 1);

  const [subTab, setSubTab] = useState<'list' | 'files' | 'excel'>('list');
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRecord[]>([]);
  const [files, setFiles] = useState<BeneficiaryFileGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'id_desc' | 'name' | 'family'>('id_desc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Add/Edit Beneficiary Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingBen, setEditingBen] = useState<BeneficiaryRecord | null>(null);
  const [benForm, setBenForm] = useState({
    wife_name: '',
    wife_national_id: '',
    wife_job: '',
    husband_name: '',
    husband_national_id: '',
    husband_job: '',
    phone1: '',
    phone2: '',
    address: '',
    family_count: 1,
    house_description: '',
    notes: '',
    eligibility: 'B' as 'A' | 'B' | 'C',
  });
  const [savingBen, setSavingBen] = useState(false);

  // Full Profile & Documents Modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileData, setProfileData] = useState<{
    beneficiary: BeneficiaryRecord;
    documents: BeneficiaryDocument[];
    aids: AidRecord[];
    files: BeneficiaryFileGroup[];
  } | null>(null);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docTitle, setDocTitle] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Collective Files state
  const [fileFormOpen, setFileFormOpen] = useState(false);
  const [fileForm, setFileForm] = useState({
    code: '',
    name: '',
    area: '',
    purpose: '',
    supervisor_name: '',
    supervisor_phone: '',
    notes: '',
  });
  const [activeFile, setActiveFile] = useState<BeneficiaryFileGroup | null>(null);
  const [activeFileMembers, setActiveFileMembers] = useState<BeneficiaryRecord[]>([]);
  const [addMemberId, setAddMemberId] = useState<string>('');
  const [transferTargetFileId, setTransferTargetFileId] = useState<string>('');

  // Excel 13-col Import state
  const [importPreview, setImportPreview] = useState<ExcelImportPreviewResult | null>(null);
  const [importTargetFileId, setImportTargetFileId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<{ acceptedCount: number; rejected: { rowIndex: number; reason: string; name: string }[] } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [benRes, filesRes] = await Promise.all([
        apiRequest<{ beneficiaries: BeneficiaryRecord[] }>(`/api/beneficiaries?archived=${showArchived ? '1' : '0'}`),
        canManageGroups ? apiRequest<{ files: BeneficiaryFileGroup[] }>('/api/beneficiary-files') : Promise.resolve({ files: [] }),
      ]);
      setBeneficiaries(benRes.beneficiaries);
      setFiles(filesRes.files);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل بيانات المستفيدين.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [showArchived]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = beneficiaries.filter((b) => {
      if (eligibilityFilter !== 'all' && b.eligibility !== eligibilityFilter) return false;
      if (!q) return true;
      return (
        b.code.toLowerCase().includes(q) ||
        b.wife_name.toLowerCase().includes(q) ||
        b.husband_name.toLowerCase().includes(q) ||
        b.wife_national_id.includes(q) ||
        b.husband_national_id.includes(q) ||
        b.phone1.includes(q) ||
        b.phone2.includes(q) ||
        b.address.toLowerCase().includes(q)
      );
    });
    if (sortBy === 'name') {
      list = [...list].sort((a, b) => (a.wife_name || a.husband_name).localeCompare(b.wife_name || b.husband_name, 'ar'));
    } else if (sortBy === 'family') {
      list = [...list].sort((a, b) => b.family_count - a.family_count);
    }
    return list;
  }, [beneficiaries, search, eligibilityFilter, sortBy]);

  const openCreateModal = () => {
    setEditingBen(null);
    setBenForm({
      wife_name: '',
      wife_national_id: '',
      wife_job: '',
      husband_name: '',
      husband_national_id: '',
      husband_job: '',
      phone1: '',
      phone2: '',
      address: '',
      family_count: 1,
      house_description: '',
      notes: '',
      eligibility: 'B',
    });
    setFormOpen(true);
  };

  const openEditModal = (b: BeneficiaryRecord) => {
    setEditingBen(b);
    setBenForm({
      wife_name: b.wife_name,
      wife_national_id: b.wife_national_id,
      wife_job: b.wife_job,
      husband_name: b.husband_name,
      husband_national_id: b.husband_national_id,
      husband_job: b.husband_job,
      phone1: b.phone1,
      phone2: b.phone2,
      address: b.address,
      family_count: b.family_count,
      house_description: b.house_description,
      notes: b.notes,
      eligibility: b.eligibility,
    });
    setFormOpen(true);
  };

  const handleSaveBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBen(true);
    try {
      if (editingBen) {
        const res = await apiRequest<{ message: string }>(`/api/beneficiaries/${editingBen.id}`, {
          method: 'PUT',
          body: JSON.stringify(benForm),
        });
        onToast('success', res.message);
      } else {
        const res = await apiRequest<{ message: string }>('/api/beneficiaries', {
          method: 'POST',
          body: JSON.stringify(benForm),
        });
        onToast('success', res.message);
      }
      setFormOpen(false);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل حفظ المستفيد.');
    } finally {
      setSavingBen(false);
    }
  };

  const handleDeleteBeneficiary = async (b: BeneficiaryRecord) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/beneficiaries/${b.id}`, { method: 'DELETE' });
      onToast('success', res.message);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر حذف المستفيد.');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await apiRequest<{ message: string }>('/api/beneficiaries/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: selectedIds }),
      });
      onToast('success', res.message);
      setSelectedIds([]);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل الحذف الجماعي.');
    }
  };

  const handleToggleArchive = async (b: BeneficiaryRecord) => {
    try {
      const res = await apiRequest<{ message: string }>(`/api/beneficiaries/${b.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ archived: b.is_archived === 0 }),
      });
      onToast('success', res.message);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحديث حالة الأرشفة.');
    }
  };

  const openProfile = async (b: BeneficiaryRecord) => {
    setProfileOpen(true);
    setProfileLoading(true);
    try {
      const res = await apiRequest<{
        beneficiary: BeneficiaryRecord;
        documents: BeneficiaryDocument[];
        aids: AidRecord[];
        files: BeneficiaryFileGroup[];
      }>(`/api/beneficiaries/${b.id}/details`);
      setProfileData(res);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر فتح ملف المستفيد.');
      setProfileOpen(false);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileData || !docFile) return;
    setUploadingDoc(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('doc_type', docType);
      fd.append('title', docTitle.trim() || docType);
      const res = await apiRequest<{ message: string }>(`/api/beneficiaries/${profileData.beneficiary.id}/documents`, {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      onToast('success', res.message);
      setDocFile(null);
      setDocTitle('');
      await openProfile(profileData.beneficiary);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل رفع المستند.');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (docId: number) => {
    if (!profileData) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/beneficiaries/${profileData.beneficiary.id}/documents/${docId}`, {
        method: 'DELETE',
      });
      onToast('success', res.message);
      await openProfile(profileData.beneficiary);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر حذف المستند.');
    }
  };

  // Collective Files handlers
  const openFileMembers = async (file: BeneficiaryFileGroup) => {
    setActiveFile(file);
    try {
      const res = await apiRequest<{ members: BeneficiaryRecord[] }>(`/api/beneficiary-files/${file.id}/members`);
      setActiveFileMembers(res.members);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر تحميل أعضاء الملف.');
    }
  };

  const handleCreateFileGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ message: string }>('/api/beneficiary-files', {
        method: 'POST',
        body: JSON.stringify(fileForm),
      });
      onToast('success', res.message);
      setFileFormOpen(false);
      setFileForm({ code: '', name: '', area: '', purpose: '', supervisor_name: '', supervisor_phone: '', notes: '' });
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر إنشاء الملف.');
    }
  };

  const handleAddMemberToFile = async () => {
    if (!activeFile || !addMemberId) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/beneficiary-files/${activeFile.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ beneficiary_id: Number(addMemberId) }),
      });
      onToast('success', res.message);
      setAddMemberId('');
      await openFileMembers(activeFile);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر إضافة المستفيد.');
    }
  };

  const handleRemoveMemberFromFile = async (benId: number) => {
    if (!activeFile) return;
    try {
      const res = await apiRequest<{ message: string }>(`/api/beneficiary-files/${activeFile.id}/members/${benId}`, {
        method: 'DELETE',
      });
      onToast('success', res.message);
      await openFileMembers(activeFile);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر إزالة المستفيد.');
    }
  };

  const handleTransferMember = async (benId: number) => {
    if (!activeFile || !transferTargetFileId) {
      onToast('error', 'اختر الملف الهدف للنقل أولاً.');
      return;
    }
    try {
      const res = await apiRequest<{ message: string }>('/api/beneficiary-files/transfer', {
        method: 'POST',
        body: JSON.stringify({
          from_file_id: activeFile.id,
          to_file_id: Number(transferTargetFileId),
          beneficiary_id: benId,
        }),
      });
      onToast('success', res.message);
      await openFileMembers(activeFile);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر نقل المستفيد.');
    }
  };

  // Excel 13-Col Import Handlers
  const handleExcelSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportReport(null);
    try {
      const preview = await parseAidBeneficiariesExcelFile(file, beneficiaries);
      setImportPreview(preview);
    } catch {
      onToast('error', 'تعذر قراءة ملف Excel؛ تأكد من سلامة الملف وصيغته.');
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.accepted.length === 0) return;
    setImporting(true);
    try {
      const res = await apiRequest<{
        acceptedCount: number;
        rejected: { rowIndex: number; reason: string; name: string }[];
        message: string;
      }>('/api/beneficiaries/import', {
        method: 'POST',
        body: JSON.stringify({
          rows: importPreview.accepted,
          file_id: importTargetFileId ? Number(importTargetFileId) : null,
        }),
      });
      setImportReport({
        acceptedCount: res.acceptedCount,
        rejected: [...importPreview.rejected.map((r) => ({ rowIndex: r.rowIndex, reason: r.reason, name: r.rawSummary })), ...res.rejected],
      });
      setImportPreview(null);
      onToast('success', res.message);
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل استيراد الملف.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="إدارة المستفيدين والملفات"
        subtitle="السجل المركزي لمستفيدي المساعدات وملفاتهم الجماعية ومستنداتهم واستيراد Excel المعتمد (13 عمودًا)"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'كشف مستفيدي المساعدات',
                    association,
                    headers: ['الكود', 'اسم الزوجة', 'قومي الزوجة', 'اسم الزوج', 'قومي الزوج', 'هاتف 1', 'العنوان', 'الأفراد', 'الاستحقاق'],
                    rows: filtered.map((b) => [
                      b.code,
                      b.wife_name,
                      b.wife_national_id,
                      b.husband_name,
                      b.husband_national_id,
                      b.phone1,
                      b.address,
                      b.family_count,
                      b.eligibility,
                    ]),
                  })
                }
                className="px-3 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكشف</span>
              </button>
            )}
            {canExportExcel && (
              <button
                type="button"
                onClick={() => exportAidBeneficiariesExcel(filtered)}
                className="px-3 py-2 border border-[#c6973f] bg-[#fbf6eb] hover:bg-[#f5ebd2] text-[#7a5816] text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير Excel (13 عمودًا)</span>
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مستفيد جديد</span>
              </button>
            )}
          </>
        }
      />

      {/* Segmented Sub-navigation */}
      <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg mb-5">
        <button
          type="button"
          onClick={() => setSubTab('list')}
          className={`px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
            subTab === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          سجل المستفيدين ({beneficiaries.length})
        </button>
        {canManageGroups && (
          <button
            type="button"
            onClick={() => setSubTab('files')}
            className={`px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
              subTab === 'files' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الملفات الجماعية ({files.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => setSubTab('excel')}
          className={`px-4 py-2 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
            subTab === 'excel' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          استيراد وتصدير Excel (13 عمودًا)
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : subTab === 'list' ? (
        <div>
          {/* Filters Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرقم القومي أو الهاتف أو الكود..."
                className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <select
              value={eligibilityFilter}
              onChange={(e) => setEligibilityFilter(e.target.value)}
              aria-label="تصفية حسب الاستحقاق"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="all">كل درجات الاستحقاق</option>
              <option value="A">فئة A (أولوية قصوى)</option>
              <option value="B">فئة B (مستحق)</option>
              <option value="C">فئة C (موسمي)</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="ترتيب النتائج"
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="id_desc">الأحدث تسجيلًا</option>
              <option value="name">ترتيب أبجدي</option>
              <option value="family">عدد الأفراد (الأكثر)</option>
            </select>

            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>إظهار المؤرشفين</span>
            </label>

            {canDeleteBulk && selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف المحدد ({selectedIds.length})</span>
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="لا توجد سجلات مطابقة"
              description="يمكنك إضافة مستفيد جديد يدويًا أو استيراد شيت Excel ذي الأعمدة الثلاثة عشر."
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
                            aria-label="تحديد الكل"
                            checked={selectedIds.length === filtered.length && filtered.length > 0}
                            onChange={(e) =>
                              setSelectedIds(e.target.checked ? filtered.map((b) => b.id) : [])
                            }
                          />
                        </th>
                      )}
                      <th className="py-3 px-3">الكود</th>
                      <th className="py-3 px-3">الزوجة</th>
                      <th className="py-3 px-3">الزوج</th>
                      <th className="py-3 px-3">الهاتف</th>
                      <th className="py-3 px-3">العنوان</th>
                      <th className="py-3 px-3">الأفراد</th>
                      <th className="py-3 px-3">الاستحقاق</th>
                      <th className="py-3 px-3">المساعدات</th>
                      <th className="py-3 px-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/70">
                        {canDeleteBulk && (
                          <td className="py-3 px-3">
                            <input
                              type="checkbox"
                              aria-label={`تحديد ${b.code}`}
                              checked={selectedIds.includes(b.id)}
                              onChange={(e) =>
                                setSelectedIds((prev) =>
                                  e.target.checked ? [...prev, b.id] : prev.filter((id) => id !== b.id)
                                )
                              }
                            />
                          </td>
                        )}
                        <td className="py-3 px-3 font-mono text-xs font-semibold text-[#0d5c3e] whitespace-nowrap">
                          {b.code}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-900">{b.wife_name || '—'}</div>
                          {b.wife_national_id && (
                            <div className="text-xs text-slate-500 font-mono">{b.wife_national_id}</div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-slate-800">{b.husband_name || '—'}</div>
                          {b.husband_national_id && (
                            <div className="text-xs text-slate-500 font-mono">{b.husband_national_id}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs whitespace-nowrap">{b.phone1 || b.phone2 || '—'}</td>
                        <td className="py-3 px-3 text-xs text-slate-600 max-w-[180px] truncate">{b.address || '—'}</td>
                        <td className="py-3 px-3 tabular-nums font-semibold">{b.family_count}</td>
                        <td className="py-3 px-3">
                          <StatusText status={b.eligibility} />
                        </td>
                        <td className="py-3 px-3 tabular-nums text-xs text-slate-600">{b.aids_count ?? 0}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openProfile(b)}
                              className="px-2.5 py-1 text-xs font-semibold rounded border border-slate-300 hover:bg-slate-100 text-slate-700 whitespace-nowrap"
                            >
                              الملف والمستندات
                            </button>
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => openEditModal(b)}
                                className="px-2 py-1 text-xs font-semibold rounded border border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                              >
                                تعديل
                              </button>
                            )}
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => handleToggleArchive(b)}
                                title={b.is_archived ? 'إلغاء الأرشفة' : 'أرشفة'}
                                aria-label={b.is_archived ? `استعادة ${b.code}` : `أرشفة ${b.code}`}
                                className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDeleteSingle && (
                              <button
                                type="button"
                                onClick={() => handleDeleteBeneficiary(b)}
                                aria-label={`حذف ${b.code}`}
                                className="p-1.5 rounded border border-red-200 text-red-600 hover:bg-red-50"
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
        </div>
      ) : subTab === 'files' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">الملفات الجماعية</h2>
              {canCreateGroup && (
                <button
                  type="button"
                  onClick={() => setFileFormOpen(true)}
                  className="px-3 py-1.5 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>ملف جديد</span>
                </button>
              )}
            </div>
            {files.map((f) => (
              <div
                key={f.id}
                className={`bg-white border rounded-xl p-4 transition-colors ${
                  activeFile?.id === f.id ? 'border-[#0d5c3e] bg-emerald-50/30' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => openFileMembers(f)}
                    className="text-right flex-1"
                  >
                    <div className="text-xs font-mono text-[#0d5c3e] font-bold">{f.code}</div>
                    <div className="font-bold text-slate-900 mt-0.5">{f.name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      المنطقة: {f.area || '—'} · المسؤول: {f.supervisor_name || '—'} · الأعضاء: {f.members_count ?? 0}
                    </div>
                  </button>
                  {canDeleteGroup && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/beneficiary-files/${f.id}`, { method: 'DELETE' });
                        onToast('success', 'تم حذف الملف الجماعي.');
                        if (activeFile?.id === f.id) setActiveFile(null);
                        loadData();
                      }}
                      aria-label={`حذف ملف ${f.name}`}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            {!activeFile ? (
              <div className="text-center py-12 text-sm text-slate-500">
                اختر ملفًا جماعيًا من القائمة لعرض أعضائه أو نقل المستفيدين بين الملفات.
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{activeFile.name}</h3>
                    <p className="text-xs text-slate-500">
                      {activeFile.purpose} · المسؤول: {activeFile.supervisor_name || '—'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canPrint && (
                      <button
                        type="button"
                        onClick={() =>
                          printArabicReport({
                            title: `كشف ملف: ${activeFile.name}`,
                            subtitle: `المنطقة: ${activeFile.area} · المسؤول: ${activeFile.supervisor_name}`,
                            association,
                            headers: ['الكود', 'الزوجة', 'الزوج', 'الهاتف', 'العنوان', 'الاستحقاق'],
                            rows: activeFileMembers.map((m) => [
                              m.code,
                              m.wife_name,
                              m.husband_name,
                              m.phone1,
                              m.address,
                              m.eligibility,
                            ]),
                          })
                        }
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>طباعة</span>
                      </button>
                    )}
                    {canExportExcel && (
                      <button
                        type="button"
                        onClick={() => exportAidBeneficiariesExcel(activeFileMembers, `ملف_${activeFile.code}.xlsx`)}
                        className="px-3 py-1.5 border border-[#c6973f] bg-[#fbf6eb] rounded-lg text-xs font-bold text-[#7a5816]"
                      >
                        تصدير Excel
                      </button>
                    )}
                  </div>
                </div>

                {canEditGroup && (
                  <div className="flex flex-wrap gap-2 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <select
                      value={addMemberId}
                      onChange={(e) => setAddMemberId(e.target.value)}
                      className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                    >
                      <option value="">اختر مستفيدًا لإضافته إلى الملف...</option>
                      {beneficiaries
                        .filter((b) => !activeFileMembers.some((m) => m.id === b.id))
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.code} — {b.wife_name || b.husband_name} ({b.phone1})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddMemberToFile}
                      className="px-3 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>إضافة للملف</span>
                    </button>
                  </div>
                )}

                {files.length > 1 && canEditGroup && (
                  <div className="mb-4 flex items-center gap-2 text-xs">
                    <span className="text-slate-600 font-semibold">ملف الوجهة للنقل:</span>
                    <select
                      value={transferTargetFileId}
                      onChange={(e) => setTransferTargetFileId(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">اختر الملف الهدف...</option>
                      {files
                        .filter((f) => f.id !== activeFile.id)
                        .map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div className="divide-y divide-slate-100">
                  {activeFileMembers.length === 0 ? (
                    <p className="text-xs text-slate-500 py-6 text-center">لا يوجد أعضاء في هذا الملف بعد.</p>
                  ) : (
                    activeFileMembers.map((m) => (
                      <div key={m.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="font-mono text-[#0d5c3e] font-bold ml-2">{m.code}</span>
                          <span className="font-semibold text-slate-900">{m.wife_name || m.husband_name}</span>
                          <span className="text-slate-500 mr-2">· {m.phone1}</span>
                        </div>
                        {canEditGroup && (
                          <div className="flex items-center gap-1.5">
                            {files.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleTransferMember(m.id)}
                                className="px-2 py-1 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 flex items-center gap-1"
                              >
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>نقل</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveMemberFromFile(m.id)}
                              className="px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                            >
                              إزالة من الملف
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Strict 13-Column Excel Import/Export Tab */
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">مواصفات شيت مستفيدي المساعدات (13 عمودًا فقط)</h2>
            <p className="text-xs text-slate-600 mt-1">
              يُقرأ الملف ويُصدّر بالترتيب الثابت التالي دون أي أعمدة إضافية، مع التعامل مع الرقم القومي والمهنة الأول للزوجة والثاني للزوج بشكل مستقل:
            </p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {AID_BENEFICIARIES_EXCEL_HEADERS.map((h, idx) => (
                <div key={idx} className="px-2.5 py-1.5 rounded bg-slate-50 border border-slate-200 text-xs">
                  <span className="font-mono text-[#0d5c3e] font-bold ml-1">{idx + 1}.</span>
                  <span className="font-medium text-slate-800">{h}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={downloadAidBeneficiariesTemplate}
              className="px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 rounded-lg text-xs font-bold text-slate-800 flex items-center gap-2"
            >
              <Download className="w-4 h-4 text-[#0d5c3e]" />
              <span>تحميل قالب Excel الفارغ (13 عمودًا + قائمة A/B/C)</span>
            </button>

            {canExportExcel && (
              <button
                type="button"
                onClick={() => exportAidBeneficiariesExcel(beneficiaries)}
                className="px-4 py-2.5 border border-[#c6973f] bg-[#fbf6eb] hover:bg-[#f5ebd2] rounded-lg text-xs font-bold text-[#7a5816] flex items-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>تصدير جميع المستفيدين (13 عمودًا)</span>
              </button>
            )}

            {canCreate && (
              <label className="cursor-pointer px-4 py-2.5 bg-[#0d5c3e] hover:bg-[#09442e] text-white rounded-lg text-xs font-bold flex items-center gap-2">
                <Upload className="w-4 h-4" />
                <span>رفع ملف Excel للمعاينة والاستيراد</span>
                <input type="file" accept=".xlsx,.xls" onChange={handleExcelSelect} className="hidden" />
              </label>
            )}
          </div>

          {importPreview && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
              {!importPreview.headerValid ? (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 font-semibold">
                  {importPreview.headerError}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">
                      معاينة الاستيراد: مقبول ({importPreview.accepted.length}) · مرفوض ({importPreview.rejected.length})
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={importTargetFileId}
                        onChange={(e) => setImportTargetFileId(e.target.value)}
                        className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      >
                        <option value="">بدون ربط بملف جماعي</option>
                        {files.map((f) => (
                          <option key={f.id} value={f.id}>
                            إضافة إلى ملف: {f.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={importing || importPreview.accepted.length === 0}
                        onClick={handleConfirmImport}
                        className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-bold rounded-lg disabled:opacity-50"
                      >
                        {importing ? 'جاري الاستيراد...' : `تأكيد استيراد (${importPreview.accepted.length}) سجل`}
                      </button>
                    </div>
                  </div>

                  {importPreview.accepted.length > 0 && (
                    <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg max-h-60">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-slate-100">
                          <tr>
                            <th className="p-2">صف</th>
                            <th className="p-2">الزوجة</th>
                            <th className="p-2">قومي الزوجة</th>
                            <th className="p-2">الزوج</th>
                            <th className="p-2">قومي الزوج</th>
                            <th className="p-2">هاتف 1</th>
                            <th className="p-2">الأفراد</th>
                            <th className="p-2">الاستحقاق</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importPreview.accepted.slice(0, 20).map((r) => (
                            <tr key={r.rowIndex}>
                              <td className="p-2 font-mono">{r.rowIndex}</td>
                              <td className="p-2">{r.wife_name}</td>
                              <td className="p-2 font-mono">{r.wife_national_id}</td>
                              <td className="p-2">{r.husband_name}</td>
                              <td className="p-2 font-mono">{r.husband_national_id}</td>
                              <td className="p-2 font-mono">{r.phone1}</td>
                              <td className="p-2 tabular-nums">{r.family_count}</td>
                              <td className="p-2 font-bold">{r.eligibility}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {importPreview.rejected.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <div className="text-xs font-bold text-red-900 mb-2">السجلات المرفوضة وأسباب الرفض:</div>
                      <ul className="space-y-1 text-xs text-red-800">
                        {importPreview.rejected.map((rej) => (
                          <li key={rej.rowIndex}>
                            صف {rej.rowIndex} ({rej.rawSummary}): {rej.reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {importReport && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
              <div className="font-bold text-emerald-900">
                تقرير نتيجة الاستيراد: تم قبول وحفظ ({importReport.acceptedCount}) مستفيد، ورفض ({importReport.rejected.length}) سجل.
              </div>
              {importReport.rejected.map((r, i) => (
                <div key={i} className="text-red-700">
                  صف {r.rowIndex} ({r.name}): {r.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Beneficiary Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingBen ? `تعديل بيانات المستفيد (${editingBen.code})` : 'إضافة مستفيد جديد'}
      >
        <form onSubmit={handleSaveBeneficiary} className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الزوجة</label>
            <input
              type="text"
              value={benForm.wife_name}
              onChange={(e) => setBenForm({ ...benForm, wife_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي للزوجة</label>
            <input
              type="text"
              value={benForm.wife_national_id}
              onChange={(e) => setBenForm({ ...benForm, wife_national_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">مهنة الزوجة</label>
            <input
              type="text"
              value={benForm.wife_job}
              onChange={(e) => setBenForm({ ...benForm, wife_job: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الزوج</label>
            <input
              type="text"
              value={benForm.husband_name}
              onChange={(e) => setBenForm({ ...benForm, husband_name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي للزوج</label>
            <input
              type="text"
              value={benForm.husband_national_id}
              onChange={(e) => setBenForm({ ...benForm, husband_national_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">مهنة الزوج</label>
            <input
              type="text"
              value={benForm.husband_job}
              onChange={(e) => setBenForm({ ...benForm, husband_job: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">رقم هاتف أول</label>
            <input
              type="text"
              value={benForm.phone1}
              onChange={(e) => setBenForm({ ...benForm, phone1: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">رقم هاتف ثاني</label>
            <input
              type="text"
              value={benForm.phone2}
              onChange={(e) => setBenForm({ ...benForm, phone2: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">العنوان</label>
            <input
              type="text"
              value={benForm.address}
              onChange={(e) => setBenForm({ ...benForm, address: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">عدد الأفراد</label>
            <input
              type="number"
              min={1}
              value={benForm.family_count}
              onChange={(e) => setBenForm({ ...benForm, family_count: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">وصف المنزل</label>
            <input
              type="text"
              value={benForm.house_description}
              onChange={(e) => setBenForm({ ...benForm, house_description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">استحقاق الحالة *</label>
            <select
              value={benForm.eligibility}
              onChange={(e) => setBenForm({ ...benForm, eligibility: e.target.value as 'A' | 'B' | 'C' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="A">A — أولوية قصوى</option>
              <option value="B">B — مستحق</option>
              <option value="C">C — مساعدة موسمية</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات</label>
            <textarea
              rows={2}
              value={benForm.notes}
              onChange={(e) => setBenForm({ ...benForm, notes: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={savingBen}
              className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold disabled:opacity-60"
            >
              {savingBen ? 'جاري الحفظ...' : 'حفظ المستفيد'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Full Beneficiary Profile, Documents & Aid History Modal */}
      <Modal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title={profileData ? `ملف المستفيد: ${profileData.beneficiary.code}` : 'ملف المستفيد'}
        maxWidth="max-w-4xl"
      >
        {profileLoading || !profileData ? (
          <LoadingState />
        ) : (
          <div className="space-y-6 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div>
                <div className="text-xs text-slate-500">الزوجة</div>
                <div className="font-bold text-slate-900">{profileData.beneficiary.wife_name || '—'}</div>
                <div className="text-xs text-slate-500 font-mono">{profileData.beneficiary.wife_national_id}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">الزوج</div>
                <div className="font-bold text-slate-900">{profileData.beneficiary.husband_name || '—'}</div>
                <div className="text-xs text-slate-500 font-mono">{profileData.beneficiary.husband_national_id}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">التواصل والاستحقاق</div>
                <div className="font-mono text-slate-900">{profileData.beneficiary.phone1 || '—'}</div>
                <div className="mt-1">
                  <StatusText status={profileData.beneficiary.eligibility} /> · {profileData.beneficiary.family_count} أفراد
                </div>
              </div>
            </div>

            {/* Documents Section */}
            <div>
              <h3 className="font-bold text-slate-900 mb-3">مستندات المستفيد</h3>
              {canFiles && (
                <form onSubmit={handleUploadDoc} className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="وصف المستند (اختياري)"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <input
                    type="file"
                    onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                    className="text-xs"
                  />
                  <button
                    type="submit"
                    disabled={uploadingDoc || !docFile}
                    className="px-3 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                  >
                    {uploadingDoc ? 'جاري الرفع...' : 'رفع المستند'}
                  </button>
                </form>
              )}

              {profileData.documents.length === 0 ? (
                <p className="text-xs text-slate-500">لا توجد مستندات مرفوعة لهذا المستفيد.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profileData.documents.map((doc) => (
                    <div key={doc.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{doc.title}</div>
                        <div className="text-[11px] text-slate-500">
                          {doc.doc_type} · بواسطة {doc.uploaded_by_name} · {formatDateArabic(doc.uploaded_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={doc.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-100"
                          title="معاينة / تحميل"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </a>
                        {canFiles && (
                          <button
                            type="button"
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="p-1.5 border border-red-200 rounded text-red-600 hover:bg-red-50"
                            title="حذف المستند"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Aid History */}
            <div>
              <h3 className="font-bold text-slate-900 mb-2">سجل المساعدات السابق</h3>
              {profileData.aids.length === 0 ? (
                <p className="text-xs text-slate-500">لم يحصل المستفيد على مساعدات مسجلة بعد.</p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-right">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-2">الكود</th>
                        <th className="p-2">النوع</th>
                        <th className="p-2">التاريخ</th>
                        <th className="p-2">الكمية / القيمة</th>
                        <th className="p-2">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {profileData.aids.map((a) => (
                        <tr key={a.id}>
                          <td className="p-2 font-mono">{a.code}</td>
                          <td className="p-2">{a.aid_type}</td>
                          <td className="p-2 tabular-nums">{a.aid_date}</td>
                          <td className="p-2">{a.quantity_label || (a.cash_amount ? `${a.cash_amount} ج.م` : '—')}</td>
                          <td className="p-2">
                            <StatusText status={a.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create Collective File Modal */}
      <Modal open={fileFormOpen} onClose={() => setFileFormOpen(false)} title="إنشاء ملف مستفيدين جماعي" maxWidth="max-w-lg">
        <form onSubmit={handleCreateFileGroup} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الملف *</label>
            <input
              type="text"
              required
              value={fileForm.name}
              onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم/كود مميز (اختياري)</label>
              <input
                type="text"
                value={fileForm.code}
                onChange={(e) => setFileForm({ ...fileForm, code: e.target.value })}
                placeholder="توليد تلقائي"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المنطقة</label>
              <input
                type="text"
                value={fileForm.area}
                onChange={(e) => setFileForm({ ...fileForm, area: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الغرض من الملف</label>
            <input
              type="text"
              value={fileForm.purpose}
              onChange={(e) => setFileForm({ ...fileForm, purpose: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المسؤول</label>
              <input
                type="text"
                value={fileForm.supervisor_name}
                onChange={(e) => setFileForm({ ...fileForm, supervisor_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">هاتف المسؤول</label>
              <input
                type="text"
                value={fileForm.supervisor_phone}
                onChange={(e) => setFileForm({ ...fileForm, supervisor_phone: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFileFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">
              إلغاء
            </button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">
              إنشاء الملف
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
