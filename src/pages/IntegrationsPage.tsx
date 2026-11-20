import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Check, Copy, FileSpreadsheet, MessageSquare, RefreshCw, Settings as SettingsIcon, Workflow } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { WhatsappN8nLinkPanel } from '../components/WhatsappN8nLinkPanel.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { IntegrationsPayload, PageId } from '../types.ts';

interface IntegrationsPageProps {
  refreshSignal: number;
  onNavigate: (page: PageId) => void;
}

export const IntegrationsPage: React.FC<IntegrationsPageProps> = ({ refreshSignal, onNavigate }) => {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    const res = await apiFetch<IntegrationsPayload>('/api/integrations');
    setData(res);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  const handleTest = async (key: string) => {
    setTestingKey(key);
    setFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; verifiedName?: string; error?: string }>(
        `/api/integrations/${key}/test`,
        { method: 'POST' }
      );
      const msg = res.message || (res.verifiedName ? `Connected (${res.verifiedName})` : 'Connection verified.');
      setFeedback({ key, ok: true, text: msg });
    } catch (err: unknown) {
      setFeedback({ key, ok: false, text: err instanceof Error ? err.message : 'Connection test failed' });
    } finally {
      setTestingKey(null);
      await loadData();
    }
  };

  const handleCopyWebhook = async () => {
    if (!data) return;
    const fullUrl = data.webhookCallbackUrl.startsWith('http')
      ? data.webhookCallbackUrl
      : `${window.location.origin}${data.webhookCallbackUrl}`;
    await navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!data) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading integrations...</div>;
  }

  const fullWebhookUrl = data.webhookCallbackUrl.startsWith('http')
    ? data.webhookCallbackUrl
    : `${window.location.origin}${data.webhookCallbackUrl}`;

  const cards = [
    {
      key: 'whatsapp',
      title: 'Meta WhatsApp Business Cloud API',
      description: 'Official Graph API v21.0 messaging, incoming webhooks, delivery receipts, and customer conversations.',
      icon: MessageSquare,
      status: data.integrations.whatsapp.status,
      lastTestedAt: data.integrations.whatsapp.lastTestedAt,
      lastError: data.integrations.whatsapp.lastError,
      meta: data.integrations.whatsapp.config.phoneNumberId
        ? `Phone Number ID: ${data.integrations.whatsapp.config.phoneNumberId}`
        : 'Phone Number ID not set',
      configurePage: 'settings' as PageId,
    },
    {
      key: 'n8n',
      title: 'n8n Automation Engine',
      description: 'Primary workflow orchestration engine via production webhooks and n8n REST API.',
      icon: Workflow,
      status: data.integrations.n8n.status,
      lastTestedAt: data.integrations.n8n.lastTestedAt,
      lastError: data.integrations.n8n.lastError,
      meta: data.integrations.n8n.config.baseUrl
        ? `Base URL: ${data.integrations.n8n.config.baseUrl}`
        : data.integrations.n8n.config.webhookUrl
        ? 'Production webhook configured'
        : 'Base URL not set',
      configurePage: 'automations' as PageId,
    },
    {
      key: 'gemini',
      title: 'Google Gemini AI',
      description: 'Server-side @google/genai intelligence for bilingual Bengali & English replies and intent detection.',
      icon: Bot,
      status: data.integrations.gemini.status,
      lastTestedAt: data.integrations.gemini.lastTestedAt,
      lastError: data.integrations.gemini.lastError,
      meta: `Model: ${data.integrations.gemini.modelName} · Server Env: ${
        data.integrations.gemini.configuredViaEnv ? 'Present' : 'Missing'
      }`,
      configurePage: 'ai-agent' as PageId,
    },
    {
      key: 'google_sheets',
      title: 'Google Sheets Sync',
      description: 'Synchronize CRM customers, messages, AI logs, and reports via n8n Google Sheets workflow.',
      icon: FileSpreadsheet,
      status: data.integrations.google_sheets.status,
      lastTestedAt: data.integrations.google_sheets.lastTestedAt,
      lastError: data.integrations.google_sheets.lastError,
      meta: data.integrations.google_sheets.config.spreadsheetId
        ? `Spreadsheet: ${data.integrations.google_sheets.config.spreadsheetId}`
        : 'No spreadsheet linked',
      configurePage: 'google-sheets' as PageId,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Bidirectional WhatsApp <-> n8n Link System */}
      <WhatsappN8nLinkPanel refreshSignal={refreshSignal} onUpdated={() => void loadData()} />

      {/* Meta Webhook Endpoint Reference */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
          WhatsApp Cloud API Webhook Endpoint
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">
          Register this HTTPS callback URL in your Meta App Dashboard under WhatsApp &rarr; Configuration.
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code className="flex-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 break-all">
            {fullWebhookUrl}
          </code>
          <button
            type="button"
            onClick={handleCopyWebhook}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy URL'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-900 text-emerald-600 dark:text-emerald-400">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                        {card.title}
                      </h3>
                      <StatusText status={card.status} />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 leading-relaxed">{card.description}</p>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-2">{card.meta}</p>
                {card.lastTestedAt && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    Last tested: {formatDateTime(card.lastTestedAt)}
                  </p>
                )}
                {card.lastError && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{card.lastError}</p>}
              </div>

              <div className="flex items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => void handleTest(card.key)}
                  disabled={testingKey === card.key}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testingKey === card.key ? 'animate-spin' : ''}`} />
                  <span>{testingKey === card.key ? 'Testing...' : 'Test Connection'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(card.configurePage)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <SettingsIcon className="w-3.5 h-3.5" />
                  <span>Configure</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
