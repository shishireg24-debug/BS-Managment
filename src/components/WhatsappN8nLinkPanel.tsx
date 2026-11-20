import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Link2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Save,
  Workflow,
} from 'lucide-react';
import { StatusText } from './StatusText.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { WhatsappN8nLinkPayload } from '../types.ts';

interface WhatsappN8nLinkPanelProps {
  refreshSignal: number;
  onUpdated?: () => void;
}

export const WhatsappN8nLinkPanel: React.FC<WhatsappN8nLinkPanelProps> = ({ refreshSignal, onUpdated }) => {
  const [data, setData] = useState<WhatsappN8nLinkPayload | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [replyMode, setReplyMode] = useState<'backend_gemini' | 'n8n_orchestrated' | 'forward_only'>('backend_gemini');
  const [linkedWorkflowId, setLinkedWorkflowId] = useState<string>('');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [forwardInbound, setForwardInbound] = useState(true);
  const [forwardOutbound, setForwardOutbound] = useState(true);
  const [forwardStatuses, setForwardStatuses] = useState(false);

  const [showSecret, setShowSecret] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadLink = useCallback(async () => {
    const res = await apiFetch<WhatsappN8nLinkPayload>('/api/links/whatsapp-n8n');
    setData(res);
    setEnabled(res.link.enabled);
    setReplyMode(res.link.replyMode);
    setLinkedWorkflowId(res.link.linkedWorkflowId ? String(res.link.linkedWorkflowId) : '');
    setN8nWebhookUrl(res.link.n8nWebhookUrl || '');
    setForwardInbound(res.link.forwardInbound);
    setForwardOutbound(res.link.forwardOutbound);
    setForwardStatuses(res.link.forwardStatuses);
  }, []);

  useEffect(() => {
    void loadLink();
  }, [loadLink, refreshSignal]);

  const handleSelectWorkflow = (wfIdStr: string) => {
    setLinkedWorkflowId(wfIdStr);
    if (!wfIdStr || !data) return;
    const match = data.workflows.find((w) => String(w.id) === wfIdStr);
    if (match?.webhook_url) {
      setN8nWebhookUrl(match.webhook_url);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/links/whatsapp-n8n', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          replyMode,
          n8nWebhookUrl,
          linkedWorkflowId: linkedWorkflowId ? Number(linkedWorkflowId) : null,
          forwardInbound,
          forwardOutbound,
          forwardStatuses,
        }),
      });
      setMsg('WhatsApp & n8n Link configuration saved.');
      await loadLink();
      onUpdated?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save link configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleTestLink = async () => {
    setTesting(true);
    setMsg('');
    setErr('');
    try {
      // Save current URL before testing so user doesn't test stale value
      await apiFetch('/api/links/whatsapp-n8n', {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          replyMode,
          n8nWebhookUrl,
          linkedWorkflowId: linkedWorkflowId ? Number(linkedWorkflowId) : null,
          forwardInbound,
          forwardOutbound,
          forwardStatuses,
        }),
      });
      const res = await apiFetch<{ ok: boolean; status?: number }>('/api/links/whatsapp-n8n/test', {
        method: 'POST',
      });
      setMsg(`Link verified! n8n webhook responded with HTTP ${res.status ?? 200}.`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Link verification failed');
    } finally {
      setTesting(false);
      await loadLink();
      onUpdated?.();
    }
  };

  const handleRotateSecret = async () => {
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      await apiFetch('/api/links/whatsapp-n8n', {
        method: 'PUT',
        body: JSON.stringify({ rotateSecret: true }),
      });
      setMsg('Generated a new X-BS-Webhook-Secret. Update your n8n HTTP Request node header with the new secret.');
      await loadLink();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to rotate secret');
    } finally {
      setSaving(false);
    }
  };

  const copyText = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (!data) {
    return (
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-xs text-slate-500">
        Loading WhatsApp &amp; n8n Link configuration...
      </div>
    );
  }

  const fullMetaWebhook = data.endpoints.whatsappWebhookUrl.startsWith('http')
    ? data.endpoints.whatsappWebhookUrl
    : `${window.location.origin}${data.endpoints.whatsappWebhookUrl}`;

  const fullCallbackUrl = data.endpoints.n8nCallbackUrl.startsWith('http')
    ? data.endpoints.n8nCallbackUrl
    : `${window.location.origin}${data.endpoints.n8nCallbackUrl}`;

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              WhatsApp &amp; n8n Two-Way Link System
            </h2>
            <StatusText status={data.link.status} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Connect incoming Meta WhatsApp Business events to a published n8n workflow webhook and accept authenticated replies back from n8n.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <a
            href="/api/links/whatsapp-n8n/template"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export n8n Workflow JSON</span>
          </a>
          <button
            type="button"
            onClick={() => setEnabled((prev) => !prev)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              enabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {enabled ? 'Link Active: ON' : 'Link Active: OFF'}
          </button>
        </div>
      </div>

      {/* Live Topology Strip */}
      <div className="px-5 py-4 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">Meta WhatsApp Cloud API</p>
            <StatusText status={data.whatsappStatus} />
          </div>
        </div>

        <div className="flex items-center justify-start md:justify-center gap-3 text-xs">
          <ArrowLeftRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="font-mono tabular-nums text-[11px] text-slate-600 dark:text-slate-300">
            <span>Forwarded: {data.link.totalForwarded}</span>
            <span className="mx-2 text-slate-400">·</span>
            <span>Callbacks: {data.link.totalCallbacks}</span>
          </div>
        </div>

        <div className="flex items-center md:justify-end gap-3">
          <div className="md:text-right min-w-0">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">n8n Workflow Engine</p>
            <StatusText status={data.n8nStatus} />
          </div>
          <div className="p-2 rounded-lg bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 text-emerald-600 dark:text-emerald-400">
            <Workflow className="w-4 h-4" />
          </div>
        </div>
      </div>

      {msg && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
          {msg}
        </div>
      )}
      {(err || data.link.lastError) && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {err || data.link.lastError}
        </div>
      )}

      <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6 text-xs">
        {/* Left: Routing & Webhook Configuration */}
        <form onSubmit={handleSave} className="xl:col-span-7 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Linked Registered Workflow (Optional)
              </label>
              <select
                value={linkedWorkflowId}
                onChange={(e) => handleSelectWorkflow(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="">Custom Production Webhook URL</option>
                {data.workflows.map((wf) => (
                  <option key={wf.id} value={String(wf.id)}>
                    {wf.name} ({wf.n8n_workflow_id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                Reply Orchestration Mode
              </label>
              <select
                value={replyMode}
                onChange={(e) =>
                  setReplyMode(e.target.value as 'backend_gemini' | 'n8n_orchestrated' | 'forward_only')
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="backend_gemini">BS Gemini AI Replies + Forward to n8n</option>
                <option value="n8n_orchestrated">n8n Orchestrated Reply (via Callback API)</option>
                <option value="forward_only">Forward to n8n Only (Manual Inbox Reply)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              Target n8n Production Webhook URL *
            </label>
            <input
              type="url"
              value={n8nWebhookUrl}
              onChange={(e) => setN8nWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-instance.com/webhook/bs-whatsapp-inbound"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
            />
          </div>

          <div>
            <p className="font-medium text-slate-700 dark:text-slate-300 mb-2">Events Forwarded from WhatsApp to n8n</p>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forwardInbound}
                  onChange={(e) => setForwardInbound(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Incoming Customer Messages</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forwardOutbound}
                  onChange={(e) => setForwardOutbound(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Outgoing AI / Human Replies</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forwardStatuses}
                  onChange={(e) => setForwardStatuses(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                />
                <span>Delivery Status Receipts</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Link Settings'}</span>
            </button>
            <button
              type="button"
              onClick={handleTestLink}
              disabled={testing || !n8nWebhookUrl.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing Link...' : 'Test WhatsApp → n8n Link'}</span>
            </button>
            {data.link.lastLinkedTestAt && (
              <span className="text-[11px] font-mono text-slate-400">
                Last tested: {formatDateTime(data.link.lastLinkedTestAt)}
              </span>
            )}
          </div>
        </form>

        {/* Right: Callback Endpoints & Secret */}
        <div className="xl:col-span-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Two-Way Endpoint &amp; Auth Reference
          </h3>

          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-1">
              1. Meta WhatsApp Webhook URL (Inbound to BS Management)
            </p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 px-2.5 py-1.5 rounded bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 font-mono text-[11px] truncate">
                {fullMetaWebhook}
              </code>
              <button
                type="button"
                onClick={() => void copyText('meta', fullMetaWebhook)}
                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                title="Copy Meta Webhook URL"
              >
                {copiedField === 'meta' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-medium text-slate-500 mb-1">
              2. n8n Callback URL (n8n HTTP Request Node &rarr; WhatsApp Reply)
            </p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 px-2.5 py-1.5 rounded bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 font-mono text-[11px] truncate">
                {fullCallbackUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyText('callback', fullCallbackUrl)}
                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                title="Copy n8n Callback URL"
              >
                {copiedField === 'callback' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-medium text-slate-500">
                3. Callback Auth Header (<code className="font-mono">X-BS-Webhook-Secret</code>)
              </p>
              <button
                type="button"
                onClick={handleRotateSecret}
                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                <RotateCcw className="w-3 h-3" /> Rotate
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 px-2.5 py-1.5 rounded bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 font-mono text-[11px] truncate">
                {showSecret ? data.link.callbackSecret : '••••••••••••••••••••••••••••••••'}
              </code>
              <button
                type="button"
                onClick={() => setShowSecret((s) => !s)}
                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                title={showSecret ? 'Hide secret' : 'Reveal secret'}
              >
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => void copyText('secret', data.link.callbackSecret)}
                className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A]"
                title="Copy callback secret"
              >
                {copiedField === 'secret' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
