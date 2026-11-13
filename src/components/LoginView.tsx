import React, { useState } from 'react';
import { KeyRound, Lock, ShieldCheck, User as UserIcon } from 'lucide-react';
import type { AssociationSettings, UserRecord } from '../shared/types';
import { apiRequest, setAuthToken } from '../utils/api';

export function LoginView({
  association,
  onLoginSuccess,
}: {
  association: AssociationSettings | null;
  onLoginSuccess: (user: UserRecord) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserRecord }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerLogin = async () => {
    setError('');
    setOwnerLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: UserRecord }>('/api/auth/owner-login', {
        method: 'POST',
      });
      setAuthToken(res.token);
      onLoginSuccess(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الدخول كمالك.');
    } finally {
      setOwnerLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f5] flex flex-col justify-center items-center p-4 sm:p-6">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12">
        {/* Brand Panel */}
        <div className="md:col-span-5 bg-[#0d5c3e] text-white p-8 flex flex-col justify-between">
          <div>
            <div className="w-20 h-20 bg-white rounded-xl p-2 border-2 border-[#c6973f] flex items-center justify-center mb-6">
              {association?.logo_url ? (
                <img
                  src={association.logo_url}
                  alt={association.name}
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-xl font-bold text-[#0d5c3e]">خيرنا</span>
              )}
            </div>
            <p className="text-xs font-semibold text-[#f5dea9] mb-1">
              {association?.app_name || 'خيرنا'} · نظام الإدارة المركزي
            </p>
            <h1 className="text-2xl font-bold leading-snug">
              {association?.name || 'جمعية الخير للتنمية الشاملة'}
            </h1>
            <p className="text-sm text-emerald-100/90 mt-3 leading-relaxed">
              {association?.description ||
                'منظومة مركزية متكاملة لإدارة المستفيدين والمساعدات والمبادرات والتبرعات والمخازن والموظفين والمتطوعين.'}
            </p>
          </div>

          <div className="mt-8 pt-5 border-t border-emerald-700/60 text-xs text-emerald-100 space-y-1.5">
            <div>{association?.address || 'المنشية امام المثلث'}</div>
            <div>{association?.registration_no || 'جمعية تنموية خيرية مشهرة'}</div>
          </div>
        </div>

        {/* Login Form Panel */}
        <div className="md:col-span-7 p-8 sm:p-10 flex flex-col justify-center">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900">تسجيل الدخول إلى النظام</h2>
            <p className="text-sm text-slate-600 mt-1">
              الدخول مقتصر على الحسابات المعتمدة من مالك الجمعية (التسجيل الذاتي مغلق).
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-username" className="block text-sm font-semibold text-slate-700 mb-1.5">
                اسم المستخدم
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="أدخل اسم المستخدم"
                  autoComplete="username"
                  className="w-full pr-10 pl-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0d5c3e]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-semibold text-slate-700 mb-1.5">
                كلمة المرور
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  autoComplete="current-password"
                  className="w-full pr-10 pl-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0d5c3e]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || ownerLoading}
              className="w-full py-2.5 px-4 bg-[#0d5c3e] hover:bg-[#09442e] text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>{loading ? 'جاري التحقق من البيانات...' : 'تسجيل الدخول'}</span>
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-500">أو الوصول المباشر المعتمد</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <button
            type="button"
            onClick={handleOwnerLogin}
            disabled={loading || ownerLoading}
            className="w-full py-2.5 px-4 bg-[#fbf6eb] hover:bg-[#f5ebd2] text-[#7a5816] border border-[#c6973f] font-bold rounded-lg text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{ownerLoading ? 'جاري تسجيل الدخول كمالك...' : 'الدخول كمالك'}</span>
          </button>

          <div className="mt-5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <div className="font-semibold text-slate-700">حسابات الاختبار الافتراضية (يمكن تعديلها من إدارة المستخدمين):</div>
            <div>مالك النظام: <span className="font-mono">owner / Owner@2026</span> · مدير النظام: <span className="font-mono">manager / Admin@2026</span> · عرض فقط: <span className="font-mono">viewer / Viewer@2026</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
