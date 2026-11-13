import React, { useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle,
  DatabaseBackup,
  Download,
  KeyRound,
  Plus,
  Save,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AuditLogRecord,
  PermissionAction,
  PermissionSection,
  PermissionsMatrix,
  RoleRecord,
  UserRecord,
} from '../shared/types';
import { ALL_ACTIONS, ALL_SECTIONS, hasPermission } from '../shared/permissions';
import { apiRequest, formatDateArabic } from '../utils/api';
import { LoadingState, Modal, PageHeader, StatusText } from '../components/UiPrimitives';

export function AdminView({
  user,
  onToast,
}: {
  user: UserRecord;
  onToast: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const canUsers = hasPermission(user.permissions, 'users', 'view', user.is_owner === 1);
  const canCreateUser = hasPermission(user.permissions, 'users', 'create', user.is_owner === 1);
  const canEditUser = hasPermission(user.permissions, 'users', 'edit', user.is_owner === 1);
  const canDeleteUser = hasPermission(user.permissions, 'users', 'delete_single', user.is_owner === 1);

  const canRoles = hasPermission(user.permissions, 'roles', 'view', user.is_owner === 1);
  const canEditRoles = hasPermission(user.permissions, 'roles', 'edit', user.is_owner === 1);
  const canCreateRoles = hasPermission(user.permissions, 'roles', 'create', user.is_owner === 1);

  const canAudit = hasPermission(user.permissions, 'audit', 'view', user.is_owner === 1);
  const canBackup = hasPermission(user.permissions, 'backup', 'view', user.is_owner === 1);
  const canRestore = hasPermission(user.permissions, 'backup', 'create', user.is_owner === 1);
  const canSettings = hasPermission(user.permissions, 'settings', 'edit', user.is_owner === 1);

  const initialTab = canUsers ? 'users' : canRoles ? 'roles' : canAudit ? 'audit' : canBackup ? 'backup' : 'settings';
  const [tab, setTab] = useState<'users' | 'roles' | 'audit' | 'backup' | 'settings'>(initialTab);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [generalSettings, setGeneralSettings] = useState({
    aid_types: [] as string[],
    units: [] as string[],
    min_password_length: 6,
    photo_retention_days: 365,
    print_header_note: '',
    notify_on_low_stock: 1,
    notify_on_new_aid: 1,
    notify_on_donation: 1,
  });
  const [aidTypesText, setAidTypesText] = useState('');
  const [unitsText, setUnitsText] = useState('');
  const [loading, setLoading] = useState(true);

  // User Modal
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ username: '', full_name: '', phone: '', email: '', password: '', role_id: '' });
  const [resetPwdUser, setResetPwdUser] = useState<UserRecord | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Role Editor
  const [editingRole, setEditingRole] = useState<RoleRecord | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [roleMatrix, setRoleMatrix] = useState<PermissionsMatrix>({});
  const [createRoleModal, setCreateRoleModal] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [uRes, rRes, lRes, sRes] = await Promise.all([
        canUsers ? apiRequest<{ users: UserRecord[] }>('/api/users') : Promise.resolve({ users: [] }),
        canRoles || canUsers ? apiRequest<{ roles: RoleRecord[] }>('/api/roles') : Promise.resolve({ roles: [] }),
        canAudit ? apiRequest<{ logs: AuditLogRecord[] }>('/api/audit-logs') : Promise.resolve({ logs: [] }),
        apiRequest<{ settings: typeof generalSettings }>('/api/settings/general').catch(() => ({ settings: generalSettings })),
      ]);
      setUsers(uRes.users);
      setRoles(rRes.roles);
      setLogs(lRes.logs);
      if (sRes.settings) {
        setGeneralSettings(sRes.settings);
        setAidTypesText((sRes.settings.aid_types || []).join('، '));
        setUnitsText((sRes.settings.units || []).join('، '));
      }
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تحميل إعدادات الإدارة.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleMatrixCell = (section: PermissionSection, action: PermissionAction) => {
    setRoleMatrix((prev) => {
      const current = prev[section] || [];
      const exists = current.includes(action);
      return {
        ...prev,
        [section]: exists ? current.filter((a) => a !== action) : [...current, action],
      };
    });
  };

  const handleDownloadBackup = async () => {
    try {
      const data = await apiRequest<Record<string, unknown>>('/api/backup/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `khayrna_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      onToast('success', 'تم تصدير النسخة الاحتياطية الكاملة لقاعدة البيانات والملفات بنجاح.');
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل تصدير النسخة الاحتياطية.');
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await apiRequest<{ message: string }>('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      onToast('success', res.message);
      await loadAll();
    } catch (err) {
      onToast('error', err instanceof Error ? err.message : 'فشل استعادة النسخة الاحتياطية.');
    }
  };

  return (
    <div>
      <PageHeader
        title="المستخدمون والصلاحيات والتدقيق والنسخ الاحتياطي"
        subtitle="إدارة حسابات المستخدمين والأدوار والصلاحيات التفصيلية، سجل التدقيق غير القابل للتعديل، والنسخ الاحتياطي"
      />

      <div className="inline-flex flex-wrap p-1 bg-slate-200/70 rounded-lg mb-5">
        {canUsers && (
          <button type="button" onClick={() => setTab('users')} className={`px-4 py-2 text-xs font-bold rounded-md ${tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            المستخدمون ({users.length})
          </button>
        )}
        {canRoles && (
          <button type="button" onClick={() => setTab('roles')} className={`px-4 py-2 text-xs font-bold rounded-md ${tab === 'roles' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            الأدوار والصلاحيات ({roles.length})
          </button>
        )}
        {canAudit && (
          <button type="button" onClick={() => setTab('audit')} className={`px-4 py-2 text-xs font-bold rounded-md ${tab === 'audit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            سجل التدقيق والعمليات
          </button>
        )}
        {canBackup && (
          <button type="button" onClick={() => setTab('backup')} className={`px-4 py-2 text-xs font-bold rounded-md ${tab === 'backup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
            النسخ الاحتياطي والاستعادة
          </button>
        )}
        <button type="button" onClick={() => setTab('settings')} className={`px-4 py-2 text-xs font-bold rounded-md ${tab === 'settings' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
          الإعدادات العامة
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : tab === 'users' ? (
        <div className="space-y-4">
          {canCreateUser && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setUserForm({ username: '', full_name: '', phone: '', email: '', password: '', role_id: roles[1]?.id ? String(roles[1].id) : String(roles[0]?.id || '') });
                  setUserModal(true);
                }}
                className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء مستخدم جديد</span>
              </button>
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="p-3">اسم المستخدم</th>
                    <th className="p-3">الاسم الكامل</th>
                    <th className="p-3">الدور</th>
                    <th className="p-3">الحالة</th>
                    <th className="p-3">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="p-3 font-mono font-bold text-[#0d5c3e]">{u.username}</td>
                      <td className="p-3 font-semibold">{u.full_name}</td>
                      <td className="p-3">{u.role_name}</td>
                      <td className="p-3">
                        <StatusText status={u.is_active ? 'نشط' : 'موقوف'} />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {canEditUser && (
                            <button
                              type="button"
                              onClick={() => {
                                setResetPwdUser(u);
                                setNewPassword('');
                              }}
                              className="px-2.5 py-1 border border-slate-300 rounded text-xs font-semibold flex items-center gap-1"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>كلمة المرور</span>
                            </button>
                          )}
                          {canEditUser && !u.is_owner && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await apiRequest<{ message: string }>(`/api/users/${u.id}/toggle-active`, { method: 'POST' });
                                onToast('success', res.message);
                                loadAll();
                              }}
                              className={`px-2.5 py-1 border rounded text-xs font-semibold flex items-center gap-1 ${
                                u.is_active ? 'border-amber-300 text-amber-800' : 'border-emerald-300 text-emerald-800'
                              }`}
                            >
                              {u.is_active ? <Ban className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                              <span>{u.is_active ? 'حظر' : 'تفعيل'}</span>
                            </button>
                          )}
                          {canDeleteUser && !u.is_owner && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/users/${u.id}`, { method: 'DELETE' });
                                onToast('success', 'تم حذف المستخدم.');
                                loadAll();
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
        </div>
      ) : tab === 'roles' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-2.5">
            {canCreateRoles && (
              <button
                type="button"
                onClick={() => {
                  setNewRoleName('');
                  setNewRoleDesc('');
                  setCreateRoleModal(true);
                }}
                className="w-full py-2.5 px-4 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة دور جديد</span>
              </button>
            )}
            {roles.map((r) => (
              <div
                key={r.id}
                className={`bg-white border rounded-xl p-3.5 flex items-center justify-between gap-2 ${
                  editingRole?.id === r.id ? 'border-[#0d5c3e] bg-emerald-50/40' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditingRole(r);
                    setRoleMatrix(r.permissions || {});
                  }}
                  className="text-right flex-1"
                >
                  <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#0d5c3e]" />
                    <span>{r.name}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>
                </button>
                {!r.is_system && canEditRoles && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiRequest(`/api/roles/${r.id}`, { method: 'DELETE' });
                        onToast('success', 'تم حذف الدور.');
                        if (editingRole?.id === r.id) setEditingRole(null);
                        loadAll();
                      } catch (err) {
                        onToast('error', err instanceof Error ? err.message : 'تعذر حذف الدور.');
                      }
                    }}
                    className="p-1.5 text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5">
            {!editingRole ? (
              <p className="text-sm text-slate-500 py-10 text-center">اختر دورًا من القائمة لتعديل مصفوفة الصلاحيات التفصيلية لكل قسم.</p>
            ) : (
              <div>
                <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900">صلاحيات دور: {editingRole.name}</h3>
                    <p className="text-xs text-slate-500">تُفرض هذه الصلاحيات فعليًا على الخادم وقاعدة البيانات عند كل طلب.</p>
                  </div>
                  {canEditRoles && editingRole.key !== 'owner' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await apiRequest<{ message: string }>(`/api/roles/${editingRole.id}`, {
                          method: 'PUT',
                          body: JSON.stringify({
                            name: editingRole.name,
                            description: editingRole.description,
                            permissions: roleMatrix,
                          }),
                        });
                        onToast('success', res.message);
                        loadAll();
                      }}
                      className="px-4 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                    >
                      <Save className="w-4 h-4" />
                      <span>حفظ الصلاحيات</span>
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto max-h-[540px]">
                  <table className="w-full text-[11px] text-right border-collapse">
                    <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        <th className="p-2 min-w-[140px]">القسم</th>
                        {ALL_ACTIONS.map((a) => (
                          <th key={a.key} className="p-2 text-center whitespace-nowrap">
                            {a.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ALL_SECTIONS.map((s) => (
                        <tr key={s.key} className="hover:bg-slate-50">
                          <td className="p-2 font-semibold text-slate-800 whitespace-nowrap">{s.label}</td>
                          {ALL_ACTIONS.map((a) => {
                            const checked = (roleMatrix[s.key] || []).includes(a.key);
                            return (
                              <td key={a.key} className="p-2 text-center">
                                <input
                                  type="checkbox"
                                  disabled={!canEditRoles || editingRole.key === 'owner'}
                                  checked={editingRole.key === 'owner' || checked}
                                  onChange={() => toggleMatrixCell(s.key, a.key)}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : tab === 'audit' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50 text-xs text-slate-600 font-semibold">
            سجل التدقيق الشامل (محمي وغير قابل للتعديل أو الحذف لضمان الشفافية والمساءلة)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-3">المستخدم</th>
                  <th className="p-3">العملية</th>
                  <th className="p-3">القسم</th>
                  <th className="p-3">السجل</th>
                  <th className="p-3">السبب / الملاحظة</th>
                  <th className="p-3">النتيجة</th>
                  <th className="p-3">التوقيت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 font-semibold">{l.user_name}</td>
                    <td className="p-3">{l.action_type}</td>
                    <td className="p-3 font-mono">{l.section}</td>
                    <td className="p-3 font-mono">{l.record_id || '—'}</td>
                    <td className="p-3 max-w-[240px] truncate" title={l.reason}>{l.reason || '—'}</td>
                    <td className="p-3"><StatusText status={l.result} /></td>
                    <td className="p-3 tabular-nums text-slate-500">{formatDateArabic(l.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === 'backup' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <DatabaseBackup className="w-8 h-8 text-[#0d5c3e]" />
            <h3 className="text-base font-bold text-slate-900">تصدير نسخة احتياطية كاملة</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              تتضمن النسخة الاحتياطية جميع الجداول والسجلات والمستندات والشعارات والصور المرفوعة في قاعدة البيانات المركزية.
            </p>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="px-4 py-2.5 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>تحميل النسخة الاحتياطية الآن</span>
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <Upload className="w-8 h-8 text-[#c6973f]" />
            <h3 className="text-base font-bold text-slate-900">استعادة نسخة احتياطية</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              ارفع ملف النسخة الاحتياطية (.json) لاستعادة جميع بيانات النظام وملفاته داخل معاملة قاعدة بيانات آمنة.
            </p>
            {canRestore && (
              <label className="inline-flex cursor-pointer items-center gap-2 px-4 py-2.5 bg-[#fbf6eb] border border-[#c6973f] text-[#7a5816] text-xs font-bold rounded-lg">
                <Upload className="w-4 h-4" />
                <span>اختيار ملف واستعادة البيانات</span>
                <input type="file" accept=".json" onChange={handleRestoreBackup} className="hidden" />
              </label>
            )}
          </div>
        </div>
      ) : (
        /* General Settings */
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/settings/general', {
                method: 'PUT',
                body: JSON.stringify({
                  ...generalSettings,
                  aid_types: aidTypesText.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
                  units: unitsText.split(/[،,]/).map((s) => s.trim()).filter(Boolean),
                }),
              });
              onToast('success', res.message);
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل حفظ الإعدادات.');
            }
          }}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-sm max-w-3xl"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">أنواع المساعدات المعتمدة (مفصولة بفاصلة)</label>
            <input type="text" disabled={!canSettings} value={aidTypesText} onChange={(e) => setAidTypesText(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">وحدات المخازن المعتمدة (مفصولة بفاصلة)</label>
            <input type="text" disabled={!canSettings} value={unitsText} onChange={(e) => setUnitsText(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">الحد الأدنى لطول كلمة المرور</label>
              <input type="number" min={6} disabled={!canSettings} value={generalSettings.min_password_length} onChange={(e) => setGeneralSettings({ ...generalSettings, min_password_length: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">مدة الاحتفاظ بصور التحقق (بالأيام)</label>
              <input type="number" min={30} disabled={!canSettings} value={generalSettings.photo_retention_days} onChange={(e) => setGeneralSettings({ ...generalSettings, photo_retention_days: Number(e.target.value) })} className="w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">تذييل الطباعة والتقارير</label>
            <input type="text" disabled={!canSettings} value={generalSettings.print_header_note} onChange={(e) => setGeneralSettings({ ...generalSettings, print_header_note: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          {canSettings && (
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white text-xs font-semibold rounded-lg">
                حفظ الإعدادات العامة
              </button>
            </div>
          )}
        </form>
      )}

      {/* Create User Modal */}
      <Modal open={userModal} onClose={() => setUserModal(false)} title="إنشاء مستخدم جديد">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/users', {
                method: 'POST',
                body: JSON.stringify({ ...userForm, role_id: Number(userForm.role_id) }),
              });
              onToast('success', res.message);
              setUserModal(false);
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل إنشاء المستخدم.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المستخدم (لتسجيل الدخول) *</label>
            <input type="text" required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الاسم الكامل *</label>
            <input type="text" required value={userForm.full_name} onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الدور الوظيفي *</label>
            <select required value={userForm.role_id} onChange={(e) => setUserForm({ ...userForm, role_id: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white">
              {roles.filter((r) => r.key !== 'owner').map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور (6 أحرف فأكثر) *</label>
            <input type="password" required minLength={6} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button type="button" onClick={() => setUserModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-5 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">إنشاء المستخدم</button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={Boolean(resetPwdUser)} onClose={() => setResetPwdUser(null)} title={`إعادة تعيين كلمة مرور: ${resetPwdUser?.full_name}`} maxWidth="max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resetPwdUser) return;
            try {
              const res = await apiRequest<{ message: string }>(`/api/users/${resetPwdUser.id}/reset-password`, {
                method: 'POST',
                body: JSON.stringify({ password: newPassword }),
              });
              onToast('success', res.message);
              setResetPwdUser(null);
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل التحديث.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور الجديدة *</label>
            <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetPwdUser(null)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-4 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">تأكيد التغيير</button>
          </div>
        </form>
      </Modal>

      {/* Create Role Modal */}
      <Modal open={createRoleModal} onClose={() => setCreateRoleModal(false)} title="إنشاء دور وظيفي جديد" maxWidth="max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res = await apiRequest<{ message: string }>('/api/roles', {
                method: 'POST',
                body: JSON.stringify({ name: newRoleName, description: newRoleDesc, permissions: { dashboard: ['view'] } }),
              });
              onToast('success', res.message);
              setCreateRoleModal(false);
              loadAll();
            } catch (err) {
              onToast('error', err instanceof Error ? err.message : 'فشل إنشاء الدور.');
            }
          }}
          className="space-y-3 text-sm"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الدور *</label>
            <input type="text" required value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">الوصف</label>
            <input type="text" value={newRoleDesc} onChange={(e) => setNewRoleDesc(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreateRoleModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold">إلغاء</button>
            <button type="submit" className="px-4 py-2 bg-[#0d5c3e] text-white rounded-lg text-xs font-semibold">إنشاء</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
