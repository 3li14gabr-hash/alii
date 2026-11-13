import React, { useEffect, useState } from 'react';
import { Eye, Plus, Printer, Trash2 } from 'lucide-react';
import type { AnnouncementRecord, AssociationSettings, InitiativeRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function AnnouncementsView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'announcements', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'announcements', 'edit', user.is_owner === 1);
  const canDelete = hasPermission(user.permissions, 'announcements', 'delete_single', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'announcements', 'print', user.is_owner === 1);

  const [items, setItems] = useState<AnnouncementRecord[]>([]);
  const [initiatives, setInitiatives] = useState<InitiativeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: '',
    body: '',
    category: 'مبادرة',
    initiative_id: '',
    status: 'منشور',
    publish_date: new Date().toISOString().slice(0, 10),
    expire_date: '',
    contact_note: '',
  });

  const [posterTarget, setPosterTarget] = useState<AnnouncementRecord | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [aRes, iRes] = await Promise.all([
        apiRequest<{ announcements: AnnouncementRecord[] }>('/api/announcements'),
        apiRequest<{ initiatives: InitiativeRecord[] }>('/api/initiatives').catch(() => ({ initiatives: [] })),
      ]);
      setItems(aRes.announcements);
      setInitiatives(iRes.initiatives);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل الإعلانات.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      if (imageFile) fd.append('image', imageFile);
      if (editing) {
        await apiRequest(`/api/announcements/${editing.id}`, { method: 'PUT', body: fd, isFormData: true });
        onToast('success', 'تم تحديث الإعلان بنجاح.');
      } else {
        await apiRequest('/api/announcements', { method: 'POST', body: fd, isFormData: true });
        onToast('success', 'تم حفظ الإعلان بنجاح.');
      }
      setFormOpen(false);
      setImageFile(null);
      loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر حفظ الإعلان.');
    }
  };

  const printPoster = (ann: AnnouncementRecord) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(`<!doctype html><html dir="rtl" lang="ar"><head><title>${ann.title}</title>
      <style>
        body { font-family: 'Cairo', Tahoma, sans-serif; margin: 20px; color: #0f172a; }
        .poster { border: 4px solid #0d5c3e; border-radius: 16px; padding: 28px; max-width: 720px; margin: 0 auto; }
        .head { display:flex; align-items:center; gap:16px; border-bottom: 2px solid #c6973f; padding-bottom:16px; margin-bottom:20px; }
        .head img { width:72px; height:72px; object-fit:contain; }
        .banner { width:100%; max-height:320px; object-fit:cover; border-radius:12px; margin-bottom:20px; }
        h1 { color:#0d5c3e; font-size:26px; margin:0 0 12px; }
        p { font-size:16px; line-height:1.8; }
        .foot { margin-top:24px; padding-top:14px; border-top:1px solid #cbd5e1; font-size:13px; color:#334155; }
      </style></head>
      <body><div class="poster">
        <div class="head">
          ${association?.logo_url ? `<img src="${association.logo_url}" />` : ''}
          <div>
            <div style="font-weight:800;font-size:20px;color:#0d5c3e;">${association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة'}</div>
            <div style="font-size:13px;color:#64748b;">${ann.category} · تاريخ النشر: ${ann.publish_date}</div>
          </div>
        </div>
        ${ann.image_url ? `<img class="banner" src="${ann.image_url}" />` : ''}
        <h1>${ann.title}</h1>
        <p>${ann.body}</p>
        <div class="foot">
          <div>${ann.contact_note || ''}</div>
          <div style="margin-top:6px;">العنوان: ${association?.address || ''} · هاتف: ${association?.phone1 || ''}</div>
        </div>
      </div></body></html>`);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1500);
    }, 350);
  };

  return (
    <div>
      <PageHeader
        title="الإعلانات والتوعية"
        subtitle="إعداد إعلانات المبادرات والمساعدات وتجهيز بوسترات جاهزة للنشر والطباعة بشعار وبيانات الجمعية تلقائيًا"
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setImageFile(null);
                setForm({
                  title: '',
                  body: '',
                  category: 'مبادرة',
                  initiative_id: '',
                  status: 'منشور',
                  publish_date: new Date().toISOString().slice(0, 10),
                  expire_date: '',
                  contact_note: `للاستفسار: ${association?.phone1 || ''}`,
                });
                setFormOpen(true);
              }}
              className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>إنشاء إعلان جديد</span>
            </button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState title="لا توجد إعلانات" description="أنشئ إعلانًا جديدًا لحملات الجمعية التوعوية أو المبادرات." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {items.map((ann) => (
            <div key={ann.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              {ann.image_url && (
                <div className="aspect-video bg-slate-100">
                  <img src={ann.image_url} alt={ann.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              )}
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                    <span>{ann.category} · {ann.publish_date}</span>
                    <StatusText status={ann.status} />
                  </div>
                  <h3 className="font-bold text-slate-900">{ann.title}</h3>
                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-3 leading-relaxed">{ann.body}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPosterTarget(ann)}
                    className="flex-1 py-1.5 px-2.5 bg-[#fbf6eb] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg flex items-center justify-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>معاينة البوستر</span>
                  </button>
                  {canPrint && (
                    <button
                      type="button"
                      onClick={() => printPoster(ann)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة</span>
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(ann);
                        setImageFile(null);
                        setForm({
                          title: ann.title,
                          body: ann.body,
                          category: ann.category,
                          initiative_id: ann.initiative_id ? String(ann.initiative_id) : '',
                          status: ann.status,
                          publish_date: ann.publish_date,
                          expire_date: ann.expire_date,
                          contact_note: ann.contact_note,
                        });
                        setFormOpen(true);
                      }}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
                    >
                      تعديل
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/announcements/${ann.id}`, { method: 'DELETE' });
                        loadData();
                      }}
                      className="p-1.5 border border-red-200 text-red-600 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Branded Poster Preview Modal */}
      <Modal open={Boolean(posterTarget)} onClose={() => setPosterTarget(null)} title="تصميم الإعلان الجاهز للنشر والطباعة" maxWidth="max-w-2xl">
        {posterTarget && (
          <div className="space-y-4">
            <div className="border-4 border-[#0d5c3e] rounded-2xl p-6 bg-white">
              <div className="flex items-center gap-4 border-b-2 border-[#c6973f] pb-4 mb-4">
                {association?.logo_url && (
                  <img src={association.logo_url} alt={association.name} className="w-16 h-16 object-contain" />
                )}
                <div>
                  <div className="font-bold text-lg text-[#0d5c3e]">{association?.name}</div>
                  <div className="text-xs text-slate-500">
                    {posterTarget.category} · {posterTarget.publish_date}
                  </div>
                </div>
              </div>
              {posterTarget.image_url && (
                <img src={posterTarget.image_url} alt={posterTarget.title} className="w-full max-h-64 object-cover rounded-xl mb-4" />
              )}
              <h3 className="text-xl font-bold text-slate-900 mb-2">{posterTarget.title}</h3>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{posterTarget.body}</p>
              <div className="mt-5 pt-3 border-t border-slate-200 text-xs text-slate-600 space-y-1">
                {posterTarget.contact_note && <div className="font-semibold text-[#0d5c3e]">{posterTarget.contact_note}</div>}
                <div>{association?.address} · هاتف: {association?.phone1}</div>
              </div>
            </div>
            {canPrint && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => printPoster(posterTarget)}
                  className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة / حفظ كـ PDF</span>
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'تعديل إعلان' : 'إنشاء إعلان جديد'}>
        <form onSubmit={handleSave} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">عنوان الإعلان *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">التصنيف</label>
              <input type="text" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الحالة</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                <option value="مسودة">مسودة</option>
                <option value="منشور">منشور</option>
                <option value="منتهي">منتهي</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ النشر</label>
              <input type="date" value={form.publish_date} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ الانتهاء</label>
              <input type="date" value={form.expire_date} onChange={(e) => setForm({ ...form, expire_date: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">المبادرة المرتبطة</label>
            <select value={form.initiative_id} onChange={(e) => setForm({ ...form, initiative_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              <option value="">إعلان عام</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">نص الإعلان *</label>
            <textarea rows={3} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظة التواصل في التصميم</label>
            <input type="text" value={form.contact_note} onChange={(e) => setForm({ ...form, contact_note: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">صورة الإعلان</label>
            <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">حفظ الإعلان</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
