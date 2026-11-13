import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, FileSpreadsheet, LogOut as CheckoutIcon, Printer, Search, Upload } from 'lucide-react';
import type { AssociationSettings, AttendanceRecord, StaffPersonRecord, UserRecord } from '../shared/types';
import { hasPermission } from '../shared/permissions';
import { apiRequest } from '../utils/api';
import { exportGenericExcel, printArabicReport } from '../utils/excelExport';
import { EmptyState, LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function AttendanceView({
  user,
  association,
  onToast,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canCreate = hasPermission(user.permissions, 'attendance', 'create', user.is_owner === 1);
  const canEdit = hasPermission(user.permissions, 'attendance', 'edit', user.is_owner === 1);
  const canPrint = hasPermission(user.permissions, 'attendance', 'print', user.is_owner === 1);
  const canExport = hasPermission(user.permissions, 'attendance', 'export_excel', user.is_owner === 1);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [staff, setStaff] = useState<StaffPersonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Check-in / Check-out Modal
  const [modalMode, setModalMode] = useState<'checkin' | 'checkout' | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<AttendanceRecord | null>(null);
  const [personId, setPersonId] = useState('');
  const [method, setMethod] = useState<'تحقق بالوجه' | 'وسيلة بديلة'>('وسيلة بديلة');
  const [workStatus, setWorkStatus] = useState('حاضر');
  const [consentGiven, setConsentGiven] = useState(false);
  const [notes, setNotes] = useState('');
  const [capturedBase64, setCapturedBase64] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Camera refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [attRes, staffRes] = await Promise.all([
        apiRequest<{ attendance: AttendanceRecord[] }>('/api/attendance'),
        apiRequest<{ staff: StaffPersonRecord[] }>('/api/staff').catch(() => ({ staff: [] })),
      ]);
      setRecords(attRes.attendance);
      setStaff(staffRes.staff);
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل سجل الحضور.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    return () => stopCamera();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch {
      onToast('info', 'تعذر تشغيل الكاميرا في هذا المتصفح؛ يمكنك رفع صورة توثيقية من الجهاز أو استخدام الوسيلة البديلة.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedBase64(canvas.toDataURL('image/jpeg', 0.9));
    setUploadFile(null);
    stopCamera();
  };

  const closeModal = () => {
    stopCamera();
    setModalMode(null);
    setCheckoutTarget(null);
    setCapturedBase64('');
    setUploadFile(null);
    setConsentGiven(false);
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('method', method);
      fd.append('notes', notes);
      if (uploadFile) fd.append('photo', uploadFile);
      else if (capturedBase64) fd.append('photo_base64', capturedBase64);

      if (modalMode === 'checkin') {
        fd.append('person_id', personId);
        fd.append('work_status', workStatus);
        fd.append('consent_given', consentGiven ? 'true' : 'false');
        const res = await apiRequest<{ message: string; verificationStatus: string }>('/api/attendance/check-in', {
          method: 'POST',
          body: fd,
          isFormData: true,
        });
        onToast('success', `${res.message} (${res.verificationStatus})`);
      } else if (modalMode === 'checkout' && checkoutTarget) {
        const res = await apiRequest<{ message: string; verificationStatus: string }>(
          `/api/attendance/${checkoutTarget.id}/check-out`,
          { method: 'POST', body: fd, isFormData: true }
        );
        onToast('success', `${res.message} (${res.verificationStatus})`);
      }
      closeModal();
      await loadData();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تسجيل الدوام.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.person_name || '').toLowerCase().includes(q) ||
      (r.person_code || '').toLowerCase().includes(q) ||
      r.attendance_date.includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="الحضور والانصراف والتحقق بالوجه"
        subtitle="توثيق الحضور والانصراف بصور منفصلة عن الصورة الشخصية مع الالتزام بالخصوصية وموافقة الشخص والوسيلة البديلة"
        actions={
          <>
            {canPrint && (
              <button
                type="button"
                onClick={() =>
                  printArabicReport({
                    title: 'تقرير الحضور والانصراف',
                    association,
                    headers: ['الكود', 'الاسم', 'التاريخ', 'وقت الحضور', 'حالة التحقق', 'وقت الانصراف', 'حالة الدوام'],
                    rows: filtered.map((r) => [
                      r.person_code || '',
                      r.person_name || '',
                      r.attendance_date,
                      r.check_in_time,
                      r.check_in_verification_status,
                      r.check_out_time || '—',
                      r.work_status,
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
                    ['الكود', 'الاسم', 'التاريخ', 'الحضور', 'طريقة الحضور', 'التحقق', 'الانصراف', 'الحالة'],
                    filtered.map((r) => [
                      r.person_code || '',
                      r.person_name || '',
                      r.attendance_date,
                      r.check_in_time,
                      r.check_in_method,
                      r.check_in_verification_status,
                      r.check_out_time,
                      r.work_status,
                    ]),
                    'الحضور والانصراف',
                    'تقرير_الحضور_والانصراف.xlsx'
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
                  setPersonId(staff[0]?.id ? String(staff[0].id) : '');
                  setModalMode('checkin');
                }}
                className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" />
                <span>تسجيل حضور جديد</span>
              </button>
            )}
          </>
        }
      />

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الموظف أو المتطوع أو التاريخ..."
            className="w-full pr-9 pl-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <EmptyState title="لا توجد سجلات حضور" description="سجل أول عملية حضور لموظف أو متطوع." />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="p-3">الموظف / المتطوع</th>
                  <th className="p-3">الصورة الأساسية</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الحضور وصورة التحقق</th>
                  <th className="p-3">الانصراف وصورة التحقق</th>
                  <th className="p-3">حالة التحقق والدوام</th>
                  <th className="p-3">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{r.person_name}</div>
                      <div className="font-mono text-slate-500">{r.person_code}</div>
                    </td>
                    <td className="p-3">
                      {r.profile_photo_url ? (
                        <img src={r.profile_photo_url} alt="الأساسية" className="w-10 h-10 rounded-lg object-cover border border-slate-200" />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 tabular-nums">{r.attendance_date}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {r.check_in_photo_url && (
                          <a href={r.check_in_photo_url} target="_blank" rel="noreferrer">
                            <img src={r.check_in_photo_url} alt="صورة الحضور" className="w-10 h-10 rounded-lg object-cover border border-emerald-300" />
                          </a>
                        )}
                        <div>
                          <div className="font-bold tabular-nums">{r.check_in_time}</div>
                          <div className="text-slate-500">{r.check_in_method}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      {r.check_out_time ? (
                        <div className="flex items-center gap-2">
                          {r.check_out_photo_url && (
                            <a href={r.check_out_photo_url} target="_blank" rel="noreferrer">
                              <img src={r.check_out_photo_url} alt="صورة الانصراف" className="w-10 h-10 rounded-lg object-cover border border-amber-300" />
                            </a>
                          )}
                          <div>
                            <div className="font-bold tabular-nums">{r.check_out_time}</div>
                            <div className="text-slate-500">{r.check_out_method}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">لم ينصرف بعد</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusText status={r.work_status} />
                      <div className="text-[11px] text-slate-500 mt-1 max-w-[200px]">{r.check_in_verification_status}</div>
                    </td>
                    <td className="p-3">
                      {canEdit && !r.check_out_time && (
                        <button
                          type="button"
                          onClick={() => {
                            setCheckoutTarget(r);
                            setModalMode('checkout');
                          }}
                          className="px-2.5 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                        >
                          <CheckoutIcon className="w-3.5 h-3.5" />
                          <span>تسجيل انصراف</span>
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

      {/* Check-in / Check-out Modal */}
      <Modal
        open={Boolean(modalMode)}
        onClose={closeModal}
        title={modalMode === 'checkin' ? 'تسجيل حضور وصورة تحقق' : `تسجيل انصراف: ${checkoutTarget?.person_name}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          {modalMode === 'checkin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف / المتطوع *</label>
                <select required value={personId} onChange={(e) => setPersonId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} — {s.full_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">حالة الدوام</label>
                <select value={workStatus} onChange={(e) => setWorkStatus(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
                  <option value="حاضر">حاضر</option>
                  <option value="متأخر">متأخر</option>
                  <option value="مأمورية">مأمورية</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">طريقة التسجيل</label>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              <option value="وسيلة بديلة">الوسيلة البديلة الموثقة (تسجيل مع صورة توثيقية)</option>
              <option value="تحقق بالوجه">التحقق بالوجه (يتطلب تفعيل خدمة المطابقة الآلية ومقارنتها بالصورة الشخصية)</option>
            </select>
          </div>

          {/* Photo Capture / Upload */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
            <div className="text-xs font-bold text-slate-800">صورة التوثيق (مستقلة عن الصورة الشخصية الأساسية)</div>
            <div className="flex flex-wrap gap-2">
              {!cameraActive ? (
                <button type="button" onClick={startCamera} className="px-3 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <Camera className="w-4 h-4" />
                  <span>فتح الكاميرا والالتقاط</span>
                </button>
              ) : (
                <button type="button" onClick={captureFrame} className="px-3 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>التقاط الصورة الآن</span>
                </button>
              )}
              <label className="cursor-pointer px-3 py-2 border border-slate-300 bg-white text-xs font-semibold rounded-lg flex items-center gap-1.5">
                <Upload className="w-4 h-4" />
                <span>أو رفع صورة من الجهاز</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    setUploadFile(e.target.files?.[0] || null);
                    setCapturedBase64('');
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {cameraActive && (
              <video ref={videoRef} autoPlay playsInline className="w-full max-w-xs rounded-lg border border-slate-300" />
            )}
            {capturedBase64 && (
              <img src={capturedBase64} alt="معاينة الالتقاط" className="w-40 h-32 object-cover rounded-lg border border-emerald-400" />
            )}
            {uploadFile && <div className="text-xs text-emerald-700 font-semibold">تم اختيار الملف: {uploadFile.name}</div>}
          </div>

          {modalMode === 'checkin' && (
            <label className="flex items-start gap-2 text-xs text-slate-700 bg-amber-50 p-3 rounded-lg border border-amber-200 cursor-pointer">
              <input type="checkbox" required checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} className="mt-0.5" />
              <span>أقر بموافقة الموظف/المتطوع الصريحة على التقاط وحفظ صورة التحقق ضمن سجل الدوام المحمي بصلاحيات الخصوصية.</span>
            </label>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={closeModal} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" disabled={submitting} className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold disabled:opacity-50">
              {submitting ? 'جاري الحفظ...' : 'حفظ وتأكيد الدوام'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
