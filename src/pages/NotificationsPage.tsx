import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCheck, Info, XCircle } from 'lucide-react';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { NotificationItem } from '../types.ts';

interface NotificationsPageProps {
  refreshSignal: number;
  onUnreadChange: (count: number) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ refreshSignal, onUnreadChange }) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications);
      onUnreadChange(res.unreadCount);
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, refreshSignal]);

  const handleMarkRead = async (id: number) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    await loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await loadNotifications();
  };

  const filtered =
    filterType === 'all' ? notifications : notifications.filter((n) => n.type === filterType);

  const renderIcon = (severity: NotificationItem['severity']) => {
    if (severity === 'error') return <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />;
    if (severity === 'warning') return <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />;
    return <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />;
  };

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Event Notification Center
            </h2>
            <p className="text-xs text-slate-500">
              Generated strictly from real incoming messages, workflow failures, API errors, and handover requests.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter notifications by event type"
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
          >
            <option value="all">All Event Types</option>
            <option value="new_message">New WhatsApp Message</option>
            <option value="new_customer">New Customer</option>
            <option value="human_handover">Human Handover Request</option>
            <option value="workflow_failed">Failed Workflow</option>
            <option value="api_error">API Connection Failure</option>
            <option value="sync_failure">Synchronization Failure</option>
          </select>

          <button
            type="button"
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All Read</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No Data Available</p>
            <p className="text-xs text-slate-400 mt-1">No system events have triggered notifications yet.</p>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 ${
                n.is_read === 0 ? 'bg-emerald-50/40 dark:bg-emerald-950/15' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                {renderIcon(n.severity)}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{n.title}</p>
                    <span className="text-[11px] text-slate-400 capitalize">{n.type.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                  <p className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                    {formatDateTime(n.created_at)}
                  </p>
                </div>
              </div>
              {n.is_read === 0 && (
                <button
                  type="button"
                  onClick={() => void handleMarkRead(n.id)}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  Mark Read
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
