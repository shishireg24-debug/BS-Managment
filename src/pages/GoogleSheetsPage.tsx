import React, { useCallback, useEffect, useState } from 'react';
import { Database, FileSpreadsheet, RefreshCw, Save, UploadCloud } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { IntegrationStatus, SheetSyncLog } from '../types.ts';

interface GoogleSheetsPageProps {
  refreshSignal: number;
}

const CATEGORIES = [
  { id: 'customers', label: 'Customers' },
  { id: 'whatsapp_messages', label: 'WhatsApp Messages' },
  { id: 'conversation_history', label: 'Conversation History' },
  { id: 'ai_response_logs', label: 'AI Response Logs' },
  { id: 'automation_logs', label: 'Automation Logs' },
  { id: 'business_reports', label: 'Business Reports' },
] as const;

export const GoogleSheetsPage: React.FC<GoogleSheetsPageProps> = ({ refreshSignal }) => {
  const [status, setStatus] = useState<IntegrationStatus>('not_connected');
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState('');
  const [logs, setLogs] = useState<SheetSyncLog[]>([]);

  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [spreadsheetName, setSpreadsheetName] = useState('');
  const [worksheetName, setWorksheetName] = useState('');
  const [n8nSyncWebhookUrl, setN8nSyncWebhookUrl] = useState('');

  const [selectedCategory, setSelectedCategory] = useState<string>('customers');
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [feedback, setFeedback] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await apiFetch<{
      status: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
      config: {
        spreadsheetId: string;
        spreadsheetName: string;
        worksheetName: string;
        n8nSyncWebhookUrl: string;
      };
      logs: SheetSyncLog[];
    }>('/api/sheets/status');
    setStatus(res.status);
    setLastTestedAt(res.lastTestedAt);
    setLastError(res.lastError);
    setSpreadsheetId(res.config.spreadsheetId || '');
    setSpreadsheetName(res.config.spreadsheetName || '');
    setWorksheetName(res.config.worksheetName || '');
    setN8nSyncWebhookUrl(res.config.n8nSyncWebhookUrl || '');
    setLogs(res.logs);
  }, []);

  const loadPreview = useCallback(async (cat: string) => {
    const res = await apiFetch<{ records: Array<Record<string, unknown>> }>(`/api/sheets/preview/${cat}`);
    setPreviewRows(res.records);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus, refreshSignal]);

  useEffect(() => {
    void loadPreview(selectedCategory);
  }, [selectedCategory, loadPreview, refreshSignal]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFeedback('');
    setErrorMsg('');
    try {
      await apiFetch('/api/sheets/config', {
        method: 'PUT',
        body: JSON.stringify({ spreadsheetId, spreadsheetName, worksheetName, n8nSyncWebhookUrl }),
      });
      setFeedback('Google Sheets sync configuration saved.');
      await loadStatus();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; message?: string }>('/api/sheets/test', { method: 'POST' });
      setFeedback(res.message || 'Connection verified.');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setBusy(false);
      await loadStatus();
    }
  };

  const handleSync = async (operation: 'append' | 'update' | 'read') => {
    setBusy(true);
    setFeedback('');
    setErrorMsg('');
    try {
      const res = await apiFetch<{ ok: boolean; recordsSynced: number; data?: Array<Record<string, unknown>> }>(
        '/api/sheets/sync',
        {
          method: 'POST',
          body: JSON.stringify({ category: selectedCategory, operation }),
        }
      );
      if (operation === 'read' && Array.isArray(res.data)) {
        setPreviewRows(res.data);
        setFeedback(`Read ${res.data.length} record(s) from Google Sheets.`);
      } else {
        setFeedback(`Synchronized ${res.recordsSynced} record(s) (${operation}) for ${selectedCategory}.`);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Synchronization failed');
    } finally {
      setBusy(false);
      await loadStatus();
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Google Sheets Synchronization
            </h2>
            <StatusText status={status} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Direct Google OAuth2 was not enabled. Connect your Spreadsheet through a published n8n Google Sheets workflow webhook to read, append, and update deduplicated records.
          </p>
          {lastTestedAt && (
            <p className="text-[11px] font-mono text-slate-400 mt-1">Last tested: {formatDateTime(lastTestedAt)}</p>
          )}
          {lastError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{lastError}</p>}
        </div>

        <button
          type="button"
          onClick={handleTest}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 self-start md:self-center whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Test Connection</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
          {feedback}
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configuration Panel */}
        <form
          onSubmit={handleSaveConfig}
          className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 text-xs"
        >
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Spreadsheet &amp; n8n Bridge Configuration
          </h3>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Spreadsheet ID</label>
            <input
              type="text"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.target.value)}
              placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Spreadsheet Name</label>
            <input
              type="text"
              value={spreadsheetName}
              onChange={(e) => setSpreadsheetName(e.target.value)}
              placeholder="BS Management Master Ledger"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Target Worksheet Tab</label>
            <input
              type="text"
              value={worksheetName}
              onChange={(e) => setWorksheetName(e.target.value)}
              placeholder="Customers"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
              n8n Google Sheets Sync Webhook URL
            </label>
            <input
              type="url"
              value={n8nSyncWebhookUrl}
              onChange={(e) => setN8nSyncWebhookUrl(e.target.value)}
              placeholder="https://your-n8n-host/webhook/sheets-sync"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Configuration</span>
          </button>
        </form>

        {/* Sync Controls & Preview */}
        <div className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              Data Categories &amp; Sync Actions
            </h3>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Select data category"
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSync('read')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Read Spreadsheet Records</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSync('append')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Append New Records</span>
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSync('update')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Update Existing Records</span>
            </button>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Current Local Records Ready for Sync ({previewRows.length})
            </p>
            {previewRows.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                <p className="text-sm font-medium text-slate-500">No Data Available</p>
              </div>
            ) : (
              <div className="max-h-60 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      {Object.keys(previewRows[0])
                        .slice(0, 5)
                        .map((col) => (
                          <th key={col} className="py-2 px-3 font-medium">
                            {col}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.slice(0, 15).map((row, idx) => (
                      <tr key={idx}>
                        {Object.keys(previewRows[0])
                          .slice(0, 5)
                          .map((col) => (
                            <td key={col} className="py-2 px-3 text-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                              {String(row[col] ?? '—')}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sync History */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Synchronization History
          </h3>
        </div>
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">No Data Available</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Worksheet</th>
                  <th className="py-3 px-4">Records</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Error</th>
                  <th className="py-3 px-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-medium">{l.category}</td>
                    <td className="py-2.5 px-4 font-mono">{l.worksheet_name}</td>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{l.records_synced}</td>
                    <td className="py-2.5 px-4 capitalize">
                      <span className={l.status === 'success' ? 'text-emerald-600' : 'text-red-600'}>{l.status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-red-500 truncate max-w-xs">{l.error_message || '—'}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                      {formatDateTime(l.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
