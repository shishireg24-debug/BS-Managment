import React, { useEffect, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

interface AnalyticsReportsPageProps {
  refreshSignal: number;
}

interface AnalyticsPayload {
  period: string;
  totalConversations: number;
  messageBreakdown: Array<{
    label: string;
    total_messages: number;
    incoming: number;
    outgoing: number;
    ai_replies: number;
    failed_deliveries: number;
  }>;
  customerBreakdown: Array<{
    label: string;
    new_customers: number;
  }>;
  automationBreakdown: Array<{
    label: string;
    total_runs: number;
    success_runs: number;
    failed_runs: number;
    avg_duration_ms: number | null;
  }>;
}

export const AnalyticsReportsPage: React.FC<AnalyticsReportsPageProps> = ({ refreshSignal }) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch<AnalyticsPayload>(`/api/analytics?period=${period}`)
      .then((res) => setData(res))
      .finally(() => setLoading(false));
  }, [period, refreshSignal]);

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Business Analytics &amp; Reports
            </h2>
            <p className="text-xs text-slate-500">All figures calculated strictly from recorded database rows.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  period === p
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <a
            href={`/api/analytics/export?period=${period}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {loading || !data ? (
        <div className="p-10 text-center text-xs text-slate-500">Loading analytics reports...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Total Conversations</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white mt-1">
                {data.totalConversations.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Message Periods Recorded</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white mt-1">
                {data.messageBreakdown.length}
              </p>
            </div>
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500">Automation Periods Recorded</p>
              <p className="font-mono tabular-nums text-2xl font-semibold text-slate-900 dark:text-white mt-1">
                {data.automationBreakdown.length}
              </p>
            </div>
          </div>

          {/* WhatsApp & AI Message Report */}
          <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                WhatsApp Message &amp; AI Reply Report ({period})
              </h3>
            </div>
            {data.messageBreakdown.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No Data Available</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-right">Incoming</th>
                      <th className="py-3 px-4 text-right">Outgoing</th>
                      <th className="py-3 px-4 text-right">AI Replies</th>
                      <th className="py-3 px-4 text-right">Failed Deliveries</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.messageBreakdown.map((r) => (
                      <tr key={r.label}>
                        <td className="py-3 px-4 font-mono font-medium text-slate-900 dark:text-white">{r.label}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.total_messages}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.incoming}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{r.outgoing}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {r.ai_replies}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                          {r.failed_deliveries}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer Growth & Failed Automation Report */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Customer Growth Report
                </h3>
              </div>
              {data.customerBreakdown.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">No Data Available</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4 text-right">New Customers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.customerBreakdown.map((c) => (
                      <tr key={c.label}>
                        <td className="py-2.5 px-4 font-mono">{c.label}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                          {c.new_customers}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Automation &amp; Failure Report
                </h3>
              </div>
              {data.automationBreakdown.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">No Data Available</div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4 text-right">Runs</th>
                      <th className="py-3 px-4 text-right">Succeeded</th>
                      <th className="py-3 px-4 text-right">Failed</th>
                      <th className="py-3 px-4 text-right">Avg Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {data.automationBreakdown.map((a) => (
                      <tr key={a.label}>
                        <td className="py-2.5 px-4 font-mono">{a.label}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums">{a.total_runs}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-600">
                          {a.success_runs}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-600">{a.failed_runs}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          {a.avg_duration_ms ? `${Math.round(a.avg_duration_ms)} ms` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
