import React, { useEffect, useState } from 'react';
import { Download, FileText, Printer, Share2 } from 'lucide-react';
import type { AssociationSettings, StaffPersonRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import {
  exportIdCardImage,
  exportIdCardsPdf,
  ID_CARD_HEIGHT,
  ID_CARD_WIDTH,
  printIdCardsBatch,
  renderIdCardCanvas,
} from '../utils/idCardRenderer';
import { EmptyState, LoadingState, PageHeader } from '../components/UiPrimitives';

export function IdCardsView({
  user,
  association,
  initialPersonId,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  initialPersonId: number | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canPrint = hasPermission(user.permissions, 'id_cards', 'print', user.is_owner === 1);
  const canExportPdf = hasPermission(user.permissions, 'id_cards', 'export_pdf', user.is_owner === 1);

  const [staff, setStaff] = useState<StaffPersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(initialPersonId);
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest<{ staff: StaffPersonRecord[] }>('/api/staff')
      .then((res) => {
        setStaff(res.staff);
        if (initialPersonId && res.staff.some((s) => s.id === initialPersonId)) {
          setSelectedId(initialPersonId);
        } else if (res.staff.length > 0 && !selectedId) {
          setSelectedId(res.staff[0].id);
        }
      })
      .catch((err) => onToast('error', err instanceof Error ? err.message : 'فشل تحميل بيانات الأعضاء.'))
      .finally(() => setLoading(false));
  }, [initialPersonId]);

  const activePerson = staff.find((s) => s.id === selectedId) || null;

  useEffect(() => {
    if (!activePerson) {
      setPreviewDataUrl('');
      return;
    }
    let cancelled = false;
    renderIdCardCanvas(activePerson, association)
      .then((canvas) => {
        if (!cancelled) {
          setPreviewDataUrl(canvas.toDataURL('image/png'));
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [activePerson, association]);

  const handleDownloadImage = async (format: 'png' | 'jpeg') => {
    if (!activePerson) return;
    setBusy(true);
    try {
      const res = await exportIdCardImage(activePerson, association, format);
      onToast('success', `تم تجهيز وتنزيل الكارنيه الكامل (${res.filename}) بجودة عالية دون أي قص.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تصدير صورة الكارنيه.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdf = async (personsList: StaffPersonRecord[]) => {
    setBusy(true);
    try {
      const filename = await exportIdCardsPdf(personsList, association);
      onToast('success', `تم إنشاء وتنزيل ملف PDF (${filename}) بهوامش طباعة آمنة كاملة.`);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تصدير ملف PDF.');
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!activePerson) return;
    setBusy(true);
    try {
      const canvas = await renderIdCardCanvas(activePerson, association);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('تعذر توليد ملف المشاركة'))), 'image/png', 0.96);
      });
      const file = new File([blob], `كارنيه_${activePerson.code}.png`, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `كارنيه ${activePerson.full_name}`,
          text: `${association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة'} — ${activePerson.full_name} (${activePerson.code})`,
          files: [file],
        });
        onToast('success', 'تمت مشاركة ملف الكارنيه بنجاح.');
      } else {
        // Fallback: trigger download and open WhatsApp text share link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        const msg = encodeURIComponent(
          `كارنيه رسمي صادر من ${association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة'}\nالاسم: ${activePerson.full_name}\nالصفة: ${activePerson.job_title}\nالكود: ${activePerson.code}`
        );
        const waAnchor = document.createElement('a');
        waAnchor.href = `https://wa.me/?text=${msg}`;
        waAnchor.target = '_blank';
        waAnchor.rel = 'noreferrer';
        waAnchor.click();
        onToast('info', 'تم تنزيل صورة الكارنيه الكاملة وفتح مشاركة واتساب لإرفاقها مباشرة.');
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر إتمام المشاركة.');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async (personsList: StaffPersonRecord[]) => {
    setBusy(true);
    try {
      await printIdCardsBatch(personsList, association);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'تعذر تجهيز الطباعة.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="الكارنيهات الإلكترونية والطباعة"
        subtitle="إخراج موحد عالي الدقة بأبعاد ثابتة (1050×660) — المعاينة مطابقة تمامًا لملف PNG وJPG وPDF بدون قص للحواف"
        actions={
          batchIds.length > 0 && canPrint ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePrint(staff.filter((s) => batchIds.includes(s.id)))}
                className="px-3.5 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة المحدد ({batchIds.length})</span>
              </button>
              {canExportPdf && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleDownloadPdf(staff.filter((s) => batchIds.includes(s.id)))}
                  className="px-3.5 py-2 bg-[#fbf6eb] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  <span>تصدير المحدد PDF</span>
                </button>
              )}
            </div>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : staff.length === 0 ? (
        <EmptyState title="لا يوجد موظفون أو متطوعون" description="أضف موظفين أو متطوعين أولاً لتوليد كارنيهاتهم." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Selector List */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-2 max-h-[650px] overflow-y-auto">
            <div className="text-xs font-bold text-slate-700 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>اختر صاحب الكارنيه أو حدد للطباعة الجماعية</span>
              <button
                type="button"
                onClick={() => setBatchIds(batchIds.length === staff.length ? [] : staff.map((s) => s.id))}
                className="text-[#0d5c3e] hover:underline"
              >
                {batchIds.length === staff.length ? 'إلغاء التحديد' : 'تحديد الكل'}
              </button>
            </div>
            {staff.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${
                  selectedId === p.id ? 'border-[#0d5c3e] bg-emerald-50/50' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  aria-label={`تحديد كارنيه ${p.full_name}`}
                  checked={batchIds.includes(p.id)}
                  onChange={(e) =>
                    setBatchIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="flex-1 text-right min-w-0"
                >
                  <div className="text-xs font-bold text-slate-900 truncate">{p.full_name}</div>
                  <div className="text-[11px] text-slate-500">
                    {p.code} · {p.person_type === 'volunteer' ? 'متطوع' : 'موظف'} · {p.job_title}
                  </div>
                </button>
              </div>
            ))}
          </div>

          {/* Exact-Match Preview & Export Studio */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            {activePerson && previewDataUrl ? (
              <>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">معاينة الكارنيه النهائية</h2>
                      <p className="text-xs text-slate-500">
                        أبعاد التصميم الثابتة: <span className="font-mono">{ID_CARD_WIDTH} × {ID_CARD_HEIGHT}</span> بكسل — يظهر الشعار والصور والنصوص كاملة دون قص.
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-4 flex items-center justify-center">
                    <img
                      src={previewDataUrl}
                      alt={`معاينة كارنيه ${activePerson.full_name}`}
                      data-testid="id-card-preview-image"
                      className="w-full max-w-[680px] h-auto rounded-lg shadow-sm"
                    />
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDownloadImage('png')}
                    className="px-4 py-2 bg-[#0d5c3e] hover:bg-[#09442e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل PNG</span>
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDownloadImage('jpeg')}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>تنزيل JPG</span>
                  </button>
                  {canExportPdf && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDownloadPdf([activePerson])}
                      className="px-4 py-2 bg-[#fbf6eb] hover:bg-[#f5ebd2] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <FileText className="w-4 h-4" />
                      <span>تنزيل PDF</span>
                    </button>
                  )}
                  {canPrint && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handlePrint([activePerson])}
                      className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Printer className="w-4 h-4" />
                      <span>طباعة</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleShare}
                    className="px-4 py-2 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>مشاركة / واتساب</span>
                  </button>
                </div>
              </>
            ) : (
              <LoadingState label="جاري توليد معاينة الكارنيه..." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
