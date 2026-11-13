import React, { useEffect, useState } from 'react';
import { History, ImagePlus, Loader2, Save, Trash2, Upload } from 'lucide-react';
import type { AssociationSettings, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest, formatDateArabic } from '../utils/api';
import { PageHeader } from '../components/UiPrimitives';

interface HistoryEntry {
  id: number;
  updated_by_name: string;
  changes_summary: string;
  updated_at: string;
}

export function AssociationView({
  association,
  user,
  onSaved,
  onToast,
}: {
  association: AssociationSettings | null;
  user: UserRecord;
  onSaved: (updated: AssociationSettings) => void;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canEdit = hasPermission(user.permissions, 'association', 'edit', user.is_owner === 1);

  const [form, setForm] = useState({
    name: '',
    short_name: '',
    app_name: '',
    address: '',
    governorate: '',
    center: '',
    village: '',
    phone1: '',
    phone2: '',
    whatsapp: '',
    email: '',
    website: '',
    registration_no: '',
    tax_no: '',
    chairman_name: '',
    secretary_name: '',
    treasurer_name: '',
    description: '',
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string>('');
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (association) {
      setForm({
        name: association.name || '',
        short_name: association.short_name || '',
        app_name: association.app_name || 'خيرنا',
        address: association.address || '',
        governorate: association.governorate || '',
        center: association.center || '',
        village: association.village || '',
        phone1: association.phone1 || '',
        phone2: association.phone2 || '',
        whatsapp: association.whatsapp || '',
        email: association.email || '',
        website: association.website || '',
        registration_no: association.registration_no || '',
        tax_no: association.tax_no || '',
        chairman_name: association.chairman_name || '',
        secretary_name: association.secretary_name || '',
        treasurer_name: association.treasurer_name || '',
        description: association.description || '',
      });
      setLogoPreviewUrl(association.logo_url || '');
      setLogoFile(null);
      setRemoveLogo(false);
    }
  }, [association]);

  const loadHistory = () => {
    apiRequest<{ history: HistoryEntry[] }>('/api/association/history')
      .then((res) => setHistory(res.history || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      onToast('error', 'صيغة الشعار غير مدعومة؛ يرجى اختيار PNG أو JPG.');
      return;
    }
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) {
      onToast('error', 'ليس لديك صلاحية تعديل بيانات الجمعية.');
      return;
    }
    if (!form.name.trim()) {
      onToast('error', 'اسم الجمعية مطلوب.');
      return;
    }

    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (removeLogo) fd.append('remove_logo', 'true');
      if (logoFile) fd.append('logo', logoFile);

      const res = await apiRequest<{ association: AssociationSettings; message: string }>('/api/association', {
        method: 'PUT',
        body: fd,
        isFormData: true,
      });

      // Only announce success after server confirms persistent write
      onSaved(res.association);
      setLogoFile(null);
      setRemoveLogo(false);
      onToast('success', res.message || 'تم حفظ بيانات الجمعية والشعار في قاعدة البيانات بنجاح.');
      loadHistory();
    } catch (err) {
      // Keep user's form inputs intact on failure!
      onToast('error', err instanceof Error ? err.message : 'فشل حفظ البيانات على الخادم، تم الاحتفاظ بالمدخلات.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="بيانات الجمعية وإعداداتها"
        subtitle="الهوية الرسمية للجمعية وشعارها المعتمد في لوحة التحكم والتقارير والكشوف والكارنيهات والإعلانات"
        actions={
          canEdit ? (
            <button
              type="submit"
              form="association-form"
              disabled={saving}
              className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{saving ? 'جاري الحفظ...' : 'حفظ البيانات والشعار'}</span>
            </button>
          ) : undefined
        }
      />

      <form id="association-form" onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Logo Card */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">شعار الجمعية الرسمي</h2>
            <p className="text-xs text-slate-500 mb-4">
              يدعم صيغ PNG وJPG مع الحفاظ على الأبعاد الأصلية دون تشويه أو تمديد.
            </p>

            <div className="w-full aspect-square max-w-[240px] mx-auto rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center p-4 overflow-hidden">
              {logoPreviewUrl && !removeLogo ? (
                <img
                  src={logoPreviewUrl}
                  alt="معاينة شعار الجمعية"
                  className="max-w-full max-h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="text-center text-slate-400">
                  <ImagePlus className="w-10 h-10 mx-auto mb-2" />
                  <span className="text-xs">لا يوجد شعار معين حاليًا</span>
                </div>
              )}
            </div>

            {canEdit && (
              <div className="mt-4 flex flex-col gap-2">
                <label className="w-full cursor-pointer flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#fbf6eb] hover:bg-[#f5ebd2] border border-[#c6973f] text-[#7a5816] text-xs font-bold transition-colors">
                  <Upload className="w-4 h-4" />
                  <span>{logoPreviewUrl ? 'استبدال الشعار / رفع شعار جديد' : 'رفع شعار الجمعية'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>

                {(logoPreviewUrl || association?.logo_url) && !removeLogo && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoFile(null);
                      setLogoPreviewUrl('');
                      setRemoveLogo(true);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف الشعار الحالي</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {association?.updated_at && (
            <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
              آخر تحديث: {formatDateArabic(association.updated_at)}
              {association.updated_by_name ? ` بواسطة ${association.updated_by_name}` : ''}
            </div>
          )}
        </div>

        {/* Form Fields */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            البيانات التعريفية ووسائل التواصل
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الجمعية الرسمي *</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم المختصر</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.short_name}
                onChange={(e) => setForm({ ...form, short_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم التطبيق</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.app_name}
                onChange={(e) => setForm({ ...form, app_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المحافظة</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.governorate}
                onChange={(e) => setForm({ ...form, governorate: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">المركز / المدينة</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.center}
                onChange={(e) => setForm({ ...form, center: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">القرية</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.village}
                onChange={(e) => setForm({ ...form, village: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">العنوان التفصيلي</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم هاتف أول</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.phone1}
                onChange={(e) => setForm({ ...form, phone1: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم هاتف ثاني</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.phone2}
                onChange={(e) => setForm({ ...form, phone2: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم واتساب التواصل</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">البريد الإلكتروني</label>
              <input
                type="email"
                disabled={!canEdit}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الموقع الإلكتروني</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الإشهار الرسمي</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.registration_no}
                onChange={(e) => setForm({ ...form, registration_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم الضريبي</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.tax_no}
                onChange={(e) => setForm({ ...form, tax_no: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">رئيس مجلس الإدارة</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.chairman_name}
                onChange={(e) => setForm({ ...form, chairman_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الأمين العام</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.secretary_name}
                onChange={(e) => setForm({ ...form, secretary_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">أمين الصندوق</label>
              <input
                type="text"
                disabled={!canEdit}
                value={form.treasurer_name}
                onChange={(e) => setForm({ ...form, treasurer_name: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">نبذة تعريفية عن الجمعية</label>
              <textarea
                rows={3}
                disabled={!canEdit}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm disabled:bg-slate-50"
              />
            </div>
          </div>

          {canEdit && (
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-[#0d5c3e] hover:bg-[#09442e] text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{saving ? 'جاري الحفظ والتحقق من التخزين...' : 'حفظ بيانات الجمعية والشعار'}</span>
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Association Edit History */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-[#0d5c3e]" />
          <span>سجل تعديلات بيانات الجمعية والشعار</span>
        </h2>
        {history.length === 0 ? (
          <p className="text-xs text-slate-500">لم تُجرَ تعديلات مسجلة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="py-2 px-3">المنفذ</th>
                  <th className="py-2 px-3">ملخص التعديل</th>
                  <th className="py-2 px-3">التاريخ والوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{h.updated_by_name}</td>
                    <td className="py-2.5 px-3 text-slate-700">{h.changes_summary}</td>
                    <td className="py-2.5 px-3 text-slate-500 tabular-nums">{formatDateArabic(h.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
