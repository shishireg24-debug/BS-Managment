import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Bot, MessageSquare, Users, Workflow } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { DashboardSummary, PageId } from '../types.ts';

interface OverviewDashboardPageProps {
  refreshSignal: number;
  onNavigate: (page: PageId) => void;
}

export const OverviewDashboardPage: React.FC<OverviewDashboardPageProps> = ({ refreshSignal, onNavigate }) => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    apiFetch<DashboardSummary>('/api/dashboard/summary')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard metrics');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshSignal]);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 animate-pulse p-4"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { metrics, charts, integrations } = data;

  const kpiCards = [
    { label: 'Total Customers', value: metrics.totalCustomers.toLocaleString(), sub: 'CRM records' },
    { label: 'Total WhatsApp Messages', value: metrics.totalMessages.toLocaleString(), sub: 'All time' },
    { label: 'Incoming Messages', value: metrics.incomingMessages.toLocaleString(), sub: 'From customers' },
    { label: 'Outgoing Messages', value: metrics.outgoingMessages.toLocaleString(), sub: 'AI & human sent' },
    { label: 'AI Generated Replies', value: metrics.aiGeneratedReplies.toLocaleString(), sub: 'Gemini Agent' },
    { label: 'Active Automations', value: metrics.activeAutomations.toLocaleString(), sub: 'Enabled workflows' },
    { label: 'Failed Automations', value: metrics.failedAutomations.toLocaleString(), sub: 'Execution errors' },
    { label: "Today's Activity", value: metrics.todayActivity.toLocaleString(), sub: 'Messages today' },
    { label: 'Monthly Activity', value: metrics.monthlyActivity.toLocaleString(), sub: 'Current month' },
    {
      label: 'Customer Growth',
      value: metrics.customerGrowthPct !== null ? `${metrics.customerGrowthPct > 0 ? '+' : ''}${metrics.customerGrowthPct}%` : 'No Data Available',
      sub: `${metrics.thisMonthCustomers} this month`,
    },
  ];

  const maxDaily = Math.max(
    1,
    ...charts.dailyMessagesSeries.map((d) => Math.max(d.incoming, d.outgoing, d.ai_replies))
  );
  const maxGrowth = Math.max(1, ...charts.monthlyGrowthSeries.map((m) => m.new_customers));

  const aiTotalReplies = charts.aiReplyStats.totalAiReplies + charts.aiReplyStats.totalHumanReplies;
  const aiSharePct = aiTotalReplies > 0 ? Math.round((charts.aiReplyStats.totalAiReplies / aiTotalReplies) * 100) : 0;

  const autoTotal = metrics.totalAutomationRuns;
  const autoSuccessRate = autoTotal > 0 ? Math.round((metrics.successAutomationRuns / autoTotal) * 100) : 0;

  const integrationMeta: Record<string, { label: string; page: PageId }> = {
    whatsapp: { label: 'WhatsApp Business Cloud API', page: 'inbox' },
    n8n: { label: 'n8n Automation Engine', page: 'automations' },
    gemini: { label: 'Google Gemini AI', page: 'ai-agent' },
    google_sheets: { label: 'Google Sheets Sync', page: 'google-sheets' },
  };

  return (
    <div className="space-y-6">
      {/* Real-time End-to-End Pipeline Summary */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              System Integration Status
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live verified status of connected services. Only connections verified against real APIs display Connected.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('integrations')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start whitespace-nowrap"
          >
            <span>Manage Integrations</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {integrations.map((item) => {
            const meta = integrationMeta[item.key] || { label: item.key, page: 'integrations' as PageId };
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(meta.page)}
                className="text-left p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 dark:hover:border-emerald-500/60 bg-slate-50/70 dark:bg-slate-900/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{meta.label}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </div>
                <StatusText status={item.status} />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                  {item.last_tested_at ? `Verified ${formatDateTime(item.last_tested_at)}` : 'Not yet tested'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 10 Real-time KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{card.label}</p>
            <p
              className={`mt-2 font-mono tabular-nums font-semibold tracking-tight ${
                card.value === 'No Data Available'
                  ? 'text-sm text-slate-500 dark:text-slate-400'
                  : 'text-2xl text-slate-900 dark:text-white'
              }`}
            >
              {card.value}
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 font-mono tabular-nums">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* 4 Real Data Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Messages Chart */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">Daily Messages Chart</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Last 14 days incoming vs outgoing</p>
            </div>
            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          {charts.dailyMessagesSeries.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No Data Available</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Messages received or sent via WhatsApp Cloud API will appear here.
              </p>
            </div>
          ) : (
            <div>
              <div className="h-44 flex items-end gap-2 pt-4">
                {charts.dailyMessagesSeries.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full h-36 flex items-end justify-center gap-1">
                      <div
                        title={`${d.day} Incoming: ${d.incoming}`}
                        className="w-2.5 rounded-t bg-slate-800 dark:bg-slate-300 transition-all"
                        style={{ height: `${Math.max(4, Math.round((d.incoming / maxDaily) * 100))}%` }}
                      />
                      <div
                        title={`${d.day} Outgoing: ${d.outgoing}`}
                        className="w-2.5 rounded-t bg-emerald-600 transition-all"
                        style={{ height: `${Math.max(4, Math.round((d.outgoing / maxDaily) * 100))}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 truncate w-full text-center">
                      {d.day.slice(5)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-slate-800 dark:bg-slate-300" /> Incoming
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" /> Outgoing
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Monthly Customer Growth */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Monthly Customer Growth
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">New customers recorded over last 6 months</p>
            </div>
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          {charts.monthlyGrowthSeries.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No Data Available</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Customer records created via WhatsApp or CRM will appear here.
              </p>
            </div>
          ) : (
            <div className="h-52 flex items-end gap-3 pt-4">
              {charts.monthlyGrowthSeries.map((m) => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
                    {m.new_customers}
                  </span>
                  <div className="w-full max-w-[44px] h-32 flex items-end">
                    <div
                      className="w-full rounded-t bg-emerald-600"
                      style={{ height: `${Math.max(8, Math.round((m.new_customers / maxGrowth) * 100))}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-slate-500">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* AI Reply Statistics */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">AI Reply Statistics</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Gemini Agent vs Human responses</p>
            </div>
            <Bot className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          {aiTotalReplies === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No Data Available</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Outbound AI and human replies will populate these statistics.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600 dark:text-slate-400">AI Automation Share</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {aiSharePct}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${aiSharePct}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">AI Replies</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                    {charts.aiReplyStats.totalAiReplies}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Human Replies</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                    {charts.aiReplyStats.totalHumanReplies}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Handovers</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                    {charts.aiReplyStats.handoverCount}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Automation Performance */}
        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                Automation Performance
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">n8n workflow execution reliability</p>
            </div>
            <Workflow className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>

          {autoTotal === 0 ? (
            <div className="h-44 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No Data Available</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Trigger a published n8n workflow to record execution performance.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-600 dark:text-slate-400">Execution Success Rate</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                    {autoSuccessRate}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${autoSuccessRate}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Total Runs</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                    {autoTotal}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Succeeded</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {metrics.successAutomationRuns}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                  <p className="text-[11px] text-slate-500">Failed</p>
                  <p className="font-mono tabular-nums text-lg font-semibold text-red-600 dark:text-red-400 mt-0.5">
                    {metrics.failedAutomations}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
