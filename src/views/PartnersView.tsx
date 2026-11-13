import React, { useEffect, useState } from 'react';
import { Eye, FileSpreadsheet, Plus, Printer, Trash2, Users } from 'lucide-react';
import type { AssociationSettings, InitiativeRecord, PartnerRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader } from '../components/UiPrimitives';

interface PartnerBeneficiary {
  id: number;
  full_name: string;
  phone: string;
  national_id: string;
  service_received: string;
  notes: string;
}

export function PartnersView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'partners', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'partners', 'edit', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'partners', 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'partners', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'partners', 'export_excel', user.is_owner === 1);

  const [partners, setPartners] = useState<(PartnerRecord & { beneficiaries_count?: number })[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: '',
    partner_type: 'جمعية أهلية',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    agreement_title: '',
    agreement_start: '',
    agreement_end: '',
    initiative_id: '',
    notes: '',
  });

  const [benModalPartner, setBenModalPartner] = useState<PartnerRecord | null>(null);
  const [partnerBens, setPartnerBens] = useState<PartnerBeneficiary[]>([]);
  const [newBen, setNewBen] = useState({ full_name: '', phone: '', national_id: '', service_received: '', notes: '' });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, iRes] = await Promise.all([
        apiRequest<{ partners: (PartnerRecord & { beneficiaries_count?: number })[] }>('/api/partners'),
        apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives').catch(() => ({ initiatives: [] })),
      ]);
      setPartners(pRes.partners);
      setInitiatives(iRes.initiatives);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل الشراكات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPartnerBens = async (p: PartnerRecord) => {
    setBenModalPartner(p);
    try {
      const res = await apiRequest<{ beneficiaries: PartnerBeneficiary[] }>(`/api/partners/${p.id}/beneficiaries`);
      setPartnerBens(res.beneficiaries);
    } catch {
      setPartnerBens([]);
    }
  };

  return (
    <div>
      <PageHeader
        title="إدارة الشراكات والاتفاقيات"
        subtitle="الجهات الشريكة والاتفاقيات والمبادرات المشتركة وقوائم المستفيدين المرتبطة بها"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'تقرير الشراكات والاتفاقيات',
                    association,
                    headers: ['الجهة الشريكة', 'النوع', 'المسؤول', 'الهاتف', 'الاتفاقية', 'المبادرة', 'المستفيدون'],
                    rows: partners.map((p) => [
                      p.name,
                      p.partner_type,
                      p.contact_person,
                      p.phone,
                      p.agreement_title,
                      p.initiative_name || '—',
                      p.beneficiaries_count ?? 0,
                    ]),
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
                    ['الجهة', 'النوع', 'مسؤول الاتصال', 'الهاتف', 'الاتفاقية', 'من', 'إلى', 'المبادرة'],
                    partners.map((p) => [
                      p.name,
                      p.partner_type,
                      p.contact_person,
                      p.phone,
                      p.agreement_title,
                      p.agreement_start,
                      p.agreement_end,
                      p.initiative_name || '',
                    ]),
                    'الشراكات',
                    'تقرير_الشراكات.xlsx'
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
                  setDocFile(null);
                  setFormOpen(true);
                }}
                className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة جهة شريكة</span>
              </button>
            )}
          </>
        }
      />

      {loading ? (
        <LoadingState />
      ) : partners.length === 0 ? (
        <EmptyState title="لا توجد شراكات مسجلة" description="أضف الجهات الشريكة واتفاقيات التعاون." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {partners.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[#0d5c3e]">{p.partner_type}</div>
                    <h3 className="text-base font-bold text-slate-900 mt-0.5">{p.name}</h3>
                  </div>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/partners/${p.id}`, { method: 'DELETE' });
                        onToast('success', 'تم حذف الشريك.');
                        loadData();
                      }}
                      className="p-1.5 border border-red-200 text-red-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div>الاتفاقية: <strong className="text-slate-900">{p.agreement_title || '—'}</strong></div>
                  <div>المدة: {p.agreement_start || '—'} إلى {p.agreement_end || '—'}</div>
                  <div>المبادرة المرتبطة: {p.initiative_name || 'شراكة عامة'}</div>
                  <div>التواصل: {p.contact_person || '—'} · <span className="font-mono">{p.phone}</span></div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openPartnerBens(p)}
                  className="px-3 py-1.5 bg-[#fbf6eb] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg flex items-center gap-1.5"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>مستفيدو الشراكة ({p.beneficiaries_count ?? 0})</span>
                </button>
                {p.document_url && (
                  <a
                    href={p.document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>مستند الاتفاقية</span>
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Partner Modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="إضافة جهة شريكة">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const fd = new FormData();
              Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
              if (docFile) fd.append('document', docFile);
              const res = await apiRequest<{ message: string }>('/api/partners', {
                method: 'POST',
                body: fd,
                isFormData: true,
              });
              onToast('success', res.message);
              setFormOpen(false);
              loadData();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل إضافة الشريك.');
            }
          }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
        >
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الجهة الشريكة *</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الجهة</label>
            <input type="text" value={form.partner_type} onChange={(e) => setForm({ ...form, partner_type: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">مسؤول التواصل</label>
            <input type="text" value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الهاتف</label>
            <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المبادرة المرتبطة</label>
            <select value={form.initiative_id} onChange={(e) => setForm({ ...form, initiative_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              <option value="">شراكة عامة</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الاتفاقية</label>
            <input type="text" value={form.agreement_title} onChange={(e) => setForm({ ...form, agreement_title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ البدء</label>
            <input type="date" value={form.agreement_start} onChange={(e) => setForm({ ...form, agreement_start: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ الانتهاء</label>
            <input type="date" value={form.agreement_end} onChange={(e) => setForm({ ...form, agreement_end: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">مستند الاتفاقية (PDF/صورة)</label>
            <input type="file" onChange={(e) => setDocFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ الشريك</button>
          </div>
        </form>
      </Modal>

      {/* Partner Beneficiaries Modal */}
      <Modal
        open={Boolean(benModalPartner)}
        onClose={() => setBenModalPartner(null)}
        title={benModalPartner ? `مستفيدو الشراكة: ${benModalPartner.name}` : ''}
        maxWidth="max-w-3xl"
      >
        {benModalPartner && (
          <div className="space-y-4">
            {canEdit && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiRequest(`/api/partners/${benModalPartner.id}/beneficiaries`, {
                    method: 'POST',
                    body: JSON.stringify(newBen),
                  });
                  setNewBen({ full_name: '', phone: '', national_id: '', service_received: '', notes: '' });
                  openPartnerBens(benModalPartner);
                  loadData();
                }}
                className="grid grid-cols-1 sm:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs"
              >
                <input type="text" required placeholder="الاسم الكامل *" value={newBen.full_name} onChange={(e) => setNewBen({ ...newBen, full_name: e.target.value })} className="px-2.5 py-2 border border-slate-300 rounded-lg" />
                <input type="text" placeholder="الرقم القومي" value={newBen.national_id} onChange={(e) => setNewBen({ ...newBen, national_id: e.target.value })} className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono" />
                <input type="text" placeholder="الهاتف" value={newBen.phone} onChange={(e) => setNewBen({ ...newBen, phone: e.target.value })} className="px-2.5 py-2 border border-slate-300 rounded-lg font-mono" />
                <input type="text" placeholder="الخدمة المقدمة" value={newBen.service_received} onChange={(e) => setNewBen({ ...newBen, service_received: e.target.value })} className="px-2.5 py-2 border border-slate-300 rounded-lg" />
                <button type="submit" className="px-3 py-2 bg-[#0d5c3e] text-white font-semibold rounded-lg">إضافة</button>
              </form>
            )}
            <table className="w-full text-xs text-right border border-slate-200">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">الاسم</th>
                  <th className="p-2.5">الرقم القومي</th>
                  <th className="p-2.5">الهاتف</th>
                  <th className="p-2.5">الخدمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partnerBens.map((pb) => (
                  <tr key={pb.id}>
                    <td className="p-2.5 font-semibold">{pb.full_name}</td>
                    <td className="p-2.5 font-mono">{pb.national_id || '—'}</td>
                    <td className="p-2.5 font-mono">{pb.phone || '—'}</td>
                    <td className="p-2.5">{pb.service_received || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
