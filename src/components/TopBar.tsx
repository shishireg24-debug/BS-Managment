import React from 'react';
import { LogOut, Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import { AuthUser, PageId } from '../types.ts';
import { NAV_ITEMS } from './Sidebar.tsx';

interface TopBarProps {
  activePage: PageId;
  user: AuthUser;
  darkMode: boolean;
  onToggleDark: () => void;
  onOpenMobileMenu: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activePage,
  user,
  darkMode,
  onToggleDark,
  onOpenMobileMenu,
  onRefresh,
  onLogout,
}) => {
  const currentItem = NAV_ITEMS.find((item) => item.id === activePage);

  return (
    <header className="h-16 px-4 lg:px-6 bg-white dark:bg-[#0F172A] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
            BS Management
          </span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">
            /
          </span>
          <h1 className="font-display font-semibold text-slate-900 dark:text-white truncate">
            {currentItem?.label || 'Overview Dashboard'}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={onRefresh}
          title="Refresh view data"
          aria-label="Refresh data"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleDark}
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle color theme"
          className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs">
          <div className="text-right">
            <p className="font-medium text-slate-900 dark:text-white leading-tight">{user.name}</p>
            <p className="text-slate-500 dark:text-slate-400 capitalize">{user.role.replace('_', ' ')}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>
    </header>
  );
};
