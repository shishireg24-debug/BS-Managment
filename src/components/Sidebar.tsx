import React from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LayoutDashboard,
  MessageSquare,
  Plug,
  Settings,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { PageId } from '../types.ts';
import { BrandMark } from './BrandMark.tsx';

export interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview Dashboard', icon: LayoutDashboard },
  { id: 'inbox', label: 'WhatsApp Inbox', icon: MessageSquare },
  { id: 'ai-agent', label: 'AI Agent', icon: Bot },
  { id: 'customers', label: 'Customers / CRM', icon: Users },
  { id: 'automations', label: 'Automation Control Center', icon: Workflow },
  { id: 'google-sheets', label: 'Google Sheets', icon: FileSpreadsheet },
  { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activePage: PageId;
  onSelectPage: (page: PageId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  unreadNotifications: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onSelectPage,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  unreadNotifications,
}) => {
  const renderNavContent = (isMobile = false) => (
    <div className="flex flex-col h-full bg-[#0F172A] text-slate-300 border-r border-slate-800">
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
        <BrandMark collapsed={!isMobile && collapsed} lightText />
        {isMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activePage === item.id;
          const isCollapsed = !isMobile && collapsed;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectPage(item.id);
                if (isMobile) onCloseMobile();
              }}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              } ${isCollapsed ? 'justify-center' : ''}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate flex-1 text-left">{item.label}</span>}
              {item.id === 'notifications' && unreadNotifications > 0 && (
                <span
                  className={`font-mono tabular-nums text-xs ${
                    isActive ? 'text-emerald-100' : 'text-emerald-400'
                  } ${isCollapsed ? 'sr-only' : ''}`}
                >
                  {unreadNotifications}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {(!collapsed || isMobile) && (
        <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
          <p className="font-medium text-slate-400">BS Management</p>
          <p className="mt-0.5">AI Automation Suite</p>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 transition-all duration-200 ${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        }`}
      >
        {renderNavContent(false)}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-950/70" onClick={onCloseMobile} />
          <div className="relative w-72 max-w-[85vw] h-full z-10">{renderNavContent(true)}</div>
        </div>
      )}
    </>
  );
};
