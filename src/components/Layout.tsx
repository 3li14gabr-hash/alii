import React, { useState } from 'react';
import {
  Activity,
  Award,
  BadgeCheck,
  BarChart3,
  Bell,
  Building2,
  Camera,
  DatabaseBackup,
  FileBarChart2,
  FolderKanban,
  HandHeart,
  Handshake,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  Package,
  Settings,
  Shield,
  Truck,
  UserCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import type {
  AssociationSettings,
  NotificationRecord,
  PermissionSection,
  UserRecord,
} from '../shared/types';
import { hasPermission } from '../shared/permissions';

export type NavTabKey =
  | 'dashboard'
  | 'association'
  | 'beneficiaries'
  | 'aids'
  | 'initiatives'
  | 'donations'
  | 'inventory'
  | 'staff'
  | 'id_cards'
  | 'attendance'
  | 'partners'
  | 'announcements'
  | 'suppliers'
  | 'reports'
  | 'admin';

interface NavItem {
  key: NavTabKey;
  label: string;
  section: PermissionSection;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', section: 'dashboard', icon: LayoutDashboard },
  { key: 'association', label: 'بيانات الجمعية', section: 'association', icon: Building2 },
  { key: 'beneficiaries', label: 'المستفيدين والملفات', section: 'beneficiaries', icon: Users },
  { key: 'aids', label: 'المساعدات', section: 'aids', icon: HandHeart },
  { key: 'initiatives', label: 'المبادرات', section: 'initiatives', icon: FolderKanban },
  { key: 'donations', label: 'التبرعات والحسابات', section: 'donations', icon: Wallet },
  { key: 'inventory', label: 'المخازن والجرد', section: 'inventory', icon: Package },
  { key: 'staff', label: 'الموظفون والمتطوعون', section: 'employees', icon: UserCheck },
  { key: 'id_cards', label: 'الكارنيهات', section: 'id_cards', icon: BadgeCheck },
  { key: 'attendance', label: 'الحضور والتحقق بالوجه', section: 'attendance', icon: Camera },
  { key: 'partners', label: 'الشراكات', section: 'partners', icon: Handshake },
  { key: 'announcements', label: 'الإعلانات والتوعية', section: 'announcements', icon: Megaphone },
  { key: 'suppliers', label: 'الموردون والتوريدات', section: 'suppliers', icon: Truck },
  { key: 'reports', label: 'التقارير والتصدير', section: 'reports', icon: FileBarChart2 },
  { key: 'admin', label: 'الصلاحيات والتدقيق والنسخ', section: 'users', icon: Shield },
];

export function AppShell({
  user,
  association,
  activeTab,
  onNavigate,
  onLogout,
  notifications,
  unreadCount,
  onMarkAllRead,
  onMarkRead,
  children,
}: {
  user: UserRecord;
  association: AssociationSettings | null;
  activeTab: NavTabKey;
  onNavigate: (tab: NavTabKey) => void;
  onLogout: () => void;
  notifications: NotificationRecord[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onMarkRead: (id: number) => void;
  children: React.ReactNode;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.key === 'staff') {
      return (
        hasPermission(user.permissions, 'employees', 'view', user.is_owner === 1) ||
        hasPermission(user.permissions, 'volunteers', 'view', user.is_owner === 1)
      );
    }
    if (item.key === 'admin') {
      return (
        user.is_owner === 1 ||
        hasPermission(user.permissions, 'users', 'view') ||
        hasPermission(user.permissions, 'roles', 'view') ||
        hasPermission(user.permissions, 'audit', 'view') ||
        hasPermission(user.permissions, 'settings', 'view') ||
        hasPermission(user.permissions, 'backup', 'view')
      );
    }
    return hasPermission(user.permissions, item.section, 'view', user.is_owner === 1);
  });

  const activeLabel = NAV_ITEMS.find((i) => i.key === activeTab)?.label || 'الرئيسية';

  const handleSelectNav = (tab: NavTabKey) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-l border-slate-200">
      <div className="p-4 border-b border-slate-200 flex items-center gap-3">
        <div className="w-11 h-11 rounded-lg border border-[#c6973f] bg-white p-1 shrink-0 flex items-center justify-center overflow-hidden">
          {association?.logo_url ? (
            <img
              src={association.logo_url}
              alt={association.name}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Award className="w-6 h-6 text-[#0d5c3e]" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-sm text-[#0d5c3e] truncate">
            {association?.app_name || 'خيرنا'}
          </div>
          <div className="text-xs text-slate-600 truncate">
            {association?.short_name || 'جمعية الخير بالمراشدة'}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="القائمة الرئيسية">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleSelectNav(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right ${
                active
                  ? 'bg-[#0d5c3e] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#f5dea9]' : 'text-slate-500'}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200 bg-slate-50">
        <div className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</div>
        <div className="text-xs text-slate-500 truncate mt-0.5">{user.role_name}</div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-xs font-semibold text-slate-700 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#f8faf9] text-slate-900">
      {/* Desktop Right Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] h-full z-10 shadow-xl">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="إغلاق القائمة"
              className="absolute left-3 top-3 p-1.5 rounded-lg bg-slate-100 text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar (Strict 3-zone contract, <=56px height) */}
        <header className="sticky top-0 z-30 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 no-print">
          {/* Zone 1: Menu toggle (mobile) + Breadcrumb / Home shortcut */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="فتح القائمة الجانبية"
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="text-slate-500 hover:text-[#0d5c3e] flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">الرئيسية</span>
              </button>
              <span className="text-slate-300" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 truncate">{activeLabel}</span>
            </div>
          </div>

          {/* Zone 2: Association Name */}
          <div className="hidden md:block text-sm font-semibold text-[#0d5c3e] truncate">
            {association?.name || 'جمعية الخير للتنمية الشاملة بالمراشدة'}
          </div>

          {/* Zone 3: Notifications + Quick Home */}
          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label="الإشعارات والتنبيهات"
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute left-0 top-12 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-900">التنبيهات والإشعارات</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={onMarkAllRead}
                      className="text-xs font-semibold text-[#0d5c3e] hover:underline"
                    >
                      تحديد الكل كمقروء
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">لا توجد إشعارات حاليًا.</div>
                  ) : (
                    notifications.slice(0, 15).map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          onMarkRead(n.id);
                          setNotifOpen(false);
                          const targetTab = (
                            n.section === 'inventory'
                              ? 'inventory'
                              : n.section === 'aids'
                                ? 'aids'
                                : n.section === 'donations'
                                  ? 'donations'
                                  : n.section === 'initiatives'
                                    ? 'initiatives'
                                    : 'dashboard'
                          ) as NavTabKey;
                          onNavigate(targetTab);
                        }}
                        className={`w-full text-right p-3.5 hover:bg-slate-50 transition-colors block ${
                          n.is_read === 0 ? 'bg-emerald-50/50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-900">{n.title}</span>
                          {n.is_read === 0 && (
                            <span className="text-[10px] font-semibold text-[#0d5c3e]">جديد</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
