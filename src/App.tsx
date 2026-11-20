import React, { useCallback, useEffect, useState } from 'react';
import { AuthPage } from './components/AuthPage.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { apiFetch } from './lib/api.ts';
import { AiAgentPage } from './pages/AiAgentPage.tsx';
import { AnalyticsReportsPage } from './pages/AnalyticsReportsPage.tsx';
import { AutomationControlPage } from './pages/AutomationControlPage.tsx';
import { CustomersCrmPage } from './pages/CustomersCrmPage.tsx';
import { GoogleSheetsPage } from './pages/GoogleSheetsPage.tsx';
import { IntegrationsPage } from './pages/IntegrationsPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { OverviewDashboardPage } from './pages/OverviewDashboardPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { WhatsAppInboxPage } from './pages/WhatsAppInboxPage.tsx';
import { AuthUser, PageId } from './types.ts';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [hasUsers, setHasUsers] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [activePage, setActivePage] = useState<PageId>('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('bs_mgmt_theme') === 'dark';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('bs_mgmt_theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage quota errors
    }
  }, [darkMode]);

  const checkAuth = useCallback(async () => {
    try {
      const res = await apiFetch<{ hasUsers: boolean; user: AuthUser | null }>('/api/auth/status');
      setHasUsers(res.hasUsers);
      setUser(res.user);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ unreadCount: number }>('/api/notifications')
      .then((res) => setUnreadNotifications(res.unreadCount))
      .catch(() => {});
  }, [user, refreshSignal]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    await checkAuth();
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B1120] text-sm text-slate-500">
        Loading BS Management...
      </div>
    );
  }

  if (!user) {
    return (
      <AuthPage
        hasUsers={hasUsers}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((prev) => !prev)}
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          setHasUsers(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      <Sidebar
        activePage={activePage}
        onSelectPage={setActivePage}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        unreadNotifications={unreadNotifications}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activePage={activePage}
          user={user}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((prev) => !prev)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onRefresh={() => setRefreshSignal((n) => n + 1)}
          onLogout={handleLogout}
        />

        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto">
            {activePage === 'overview' && (
              <OverviewDashboardPage refreshSignal={refreshSignal} onNavigate={setActivePage} />
            )}
            {activePage === 'inbox' && (
              <WhatsAppInboxPage refreshSignal={refreshSignal} onNavigate={setActivePage} />
            )}
            {activePage === 'ai-agent' && <AiAgentPage refreshSignal={refreshSignal} />}
            {activePage === 'customers' && <CustomersCrmPage refreshSignal={refreshSignal} />}
            {activePage === 'automations' && (
              <AutomationControlPage refreshSignal={refreshSignal} onNavigate={setActivePage} />
            )}
            {activePage === 'google-sheets' && <GoogleSheetsPage refreshSignal={refreshSignal} />}
            {activePage === 'analytics' && <AnalyticsReportsPage refreshSignal={refreshSignal} />}
            {activePage === 'notifications' && (
              <NotificationsPage refreshSignal={refreshSignal} onUnreadChange={setUnreadNotifications} />
            )}
            {activePage === 'integrations' && (
              <IntegrationsPage refreshSignal={refreshSignal} onNavigate={setActivePage} />
            )}
            {activePage === 'settings' && (
              <SettingsPage refreshSignal={refreshSignal} currentUser={user} onNavigate={setActivePage} />
            )}
          </div>
        </main>

        <footer className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#0F172A]">
          <span>BS Management — Business Automation &amp; AI Operations</span>
          <span>Google Cloud Starter Tier Compatible</span>
        </footer>
      </div>
    </div>
  );
}
