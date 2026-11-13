import React, { useCallback, useEffect, useState } from 'react';
import type { AssociationSettings, NotificationRecord, UserRecord } from './shared/types';
import { apiRequest, getAuthToken, setAuthToken } from './utils/api';
import { AppShell, type NavTabKey } from './components/Layout';
import { LoginView } from './components/LoginView';
import { LoadingState, ToastContainer, type ToastMessage } from './components/UiPrimitives';
import { DashboardView } from './views/DashboardView';
import { AssociationView } from './views/AssociationView';
import { BeneficiariesView } from './views/BeneficiariesView';
import { AidsView } from './views/AidsView';
import { InitiativesView } from './views/InitiativesView';
import { FinanceView } from './views/FinanceView';
import { InventoryView } from './views/InventoryView';
import { StaffView } from './views/StaffView';
import { IdCardsView } from './views/IdCardsView';
import { AttendanceView } from './views/AttendanceView';
import { PartnersView } from './views/PartnersView';
import { AnnouncementsView } from './views/AnnouncementsView';
import { SuppliersView } from './views/SuppliersView';
import { ReportsView } from './views/ReportsView';
import { AdminView } from './views/AdminView';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserRecord | null>(null);
  const [association, setAssociation] = useState<AssociationSettings | null>(null);
  const [activeTab, setActiveTab] = useState<NavTabKey>('dashboard');
  const [idCardPersonId, setIdCardPersonId] = useState<number | null>(null);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const res = await apiRequest<{ notifications: NotificationRecord[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const assocRes = await apiRequest<{ association: AssociationSettings }>('/api/association');
        setAssociation(assocRes.association);

        if (getAuthToken()) {
          const meRes = await apiRequest<{ user: UserRecord }>('/api/auth/me');
          setUser(meRes.user);
        }
      } catch {
        setAuthToken('');
        setUser(null);
      } finally {
        setBooting(false);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user, activeTab, loadNotifications]);

  const handleLogout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setAuthToken('');
    setUser(null);
    setActiveTab('dashboard');
  };

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7f5] p-6">
        <LoadingState label="جاري تشغيل نظام خيرنا..." />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginView
          association={association}
          onLoginSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setActiveTab('dashboard');
            pushToast('success', `مرحبًا بك، ${loggedInUser.full_name}`);
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
      </>
    );
  }

  return (
    <>
      <AppShell
        user={user}
        association={association}
        activeTab={activeTab}
        onNavigate={(tab) => setActiveTab(tab)}
        onLogout={handleLogout}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAllRead={async () => {
          await apiRequest('/api/notifications/read-all', { method: 'POST' });
          loadNotifications();
        }}
        onMarkRead={async (id) => {
          await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
          loadNotifications();
        }}
      >
        {activeTab === 'dashboard' && (
          <DashboardView association={association} user={user} onNavigate={(t) => setActiveTab(t)} />
        )}
        {activeTab === 'association' && (
          <AssociationView
            association={association}
            user={user}
            onSaved={(updated) => setAssociation(updated)}
            onToast={pushToast}
          />
        )}
        {activeTab === 'beneficiaries' && (
          <BeneficiariesView user={user} association={association} onToast={pushToast} />
        )}
        {activeTab === 'aids' && <AidsView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'initiatives' && (
          <InitiativesView user={user} association={association} onToast={pushToast} />
        )}
        {activeTab === 'donations' && <FinanceView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'inventory' && <InventoryView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'staff' && (
          <StaffView
            user={user}
            association={association}
            onOpenIdCard={(personId) => {
              setIdCardPersonId(personId);
              setActiveTab('id_cards');
            }}
            onToast={pushToast}
          />
        )}
        {activeTab === 'id_cards' && (
          <IdCardsView
            user={user}
            association={association}
            initialPersonId={idCardPersonId}
            onToast={pushToast}
          />
        )}
        {activeTab === 'attendance' && <AttendanceView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'partners' && <PartnersView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'announcements' && (
          <AnnouncementsView user={user} association={association} onToast={pushToast} />
        )}
        {activeTab === 'suppliers' && <SuppliersView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'reports' && <ReportsView user={user} association={association} onToast={pushToast} />}
        {activeTab === 'admin' && <AdminView user={user} onToast={pushToast} />}
      </AppShell>
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </>
  );
}
