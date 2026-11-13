import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from 'lucide-react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error' | 'info';
  text: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 max-w-md w-[calc(100vw-2rem)] no-print"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium transition-all ${
            t.type === 'success'
              ? 'bg-emerald-950 text-white border-emerald-700'
              : t.type === 'error'
                ? 'bg-red-950 text-white border-red-700'
                : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {t.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
          {t.type === 'error' && <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
          {t.type === 'info' && <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
          <span className="flex-1 leading-relaxed">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="إغلاق الإشعار"
            className="text-slate-300 hover:text-white p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-4 overflow-y-auto no-print"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={`bg-white border border-slate-200 rounded-xl shadow-xl w-full ${maxWidth} max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`إغلاق ${title}`}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-slate-200 mb-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadingState({ label = 'جاري تحميل البيانات...' }: { label?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 flex items-center justify-center gap-3 text-slate-600">
      <Loader2 className="w-5 h-5 animate-spin text-[#0d5c3e]" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function StatusText({ status }: { status: string }) {
  const tone =
    ['معتمد', 'معتمدة', 'مسلمة', 'نشط', 'نشطة', 'منشور', 'حاضر', 'نجاح', 'A'].includes(status)
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : ['قيد المراجعة', 'مسجل', 'مسجلة', 'مخططة', 'مسودة', 'إجازة', 'متأخر', 'منصرف', 'B'].includes(status)
        ? 'text-amber-800 bg-amber-50 border-amber-200'
        : ['مرفوضة', 'ملغاة', 'ملغى', 'موقوف', 'متوقفة', 'منتهي', 'غياب', 'فشل', 'C'].includes(status)
          ? 'text-red-700 bg-red-50 border-red-200'
          : 'text-slate-700 bg-slate-50 border-slate-200';

  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded border whitespace-nowrap ${tone}`}>
      {status}
    </span>
  );
}
