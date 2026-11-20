import React, { useCallback, useEffect, useState } from 'react';
import { Play, Plus, Power, RefreshCw, RotateCcw, Trash2, Workflow, X } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { WhatsappN8nLinkPanel } from '../components/WhatsappN8nLinkPanel.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { AutomationLog, IntegrationStatus, PageId, WorkflowItem } from '../types.ts';

interface AutomationControlPageProps {
  refreshSignal: number;
  onNavigate: (page: PageId) => void;
}

export const AutomationControlPage: React.FC<AutomationControlPageProps> = ({ refreshSignal, onNavigate }) => {
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [n8nStatus, setN8nStatus] = useState<IntegrationStatus>('configuration_required');
  const [n8nLastError, setN8nLastError] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newWf, setNewWf] = useState({
    name: '',
    n8nWorkflowId: '',
    webhookUrl: '',
    triggerEvent: 'whatsapp_inbound',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        workflows: WorkflowItem[];
        logs: AutomationLog[];
        n8nStatus: IntegrationStatus;
        n8nLastError: string;
      }>('/api/workflows');
      setWorkflows(res.workflows);
      setLogs(res.logs);
      setN8nStatus(res.n8nStatus);
      setN8nLastError(res.n8nLastError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshSignal]);

  const handleTestN8n = async () => {
    setActionMsg('');
    setActionErr('');
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; error?: string }>('/api/integrations/n8n/test', {
        method: 'POST',
      });
      setActionMsg(res.message || 'n8n connection verified.');
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'n8n connection test failed');
    } finally {
      await loadData();
    }
  };

  const handleToggleWorkflow = async (wf: WorkflowItem) => {
    setActionMsg('');
    setActionErr('');
    try {
      await apiFetch(`/api/workflows/${wf.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ active: wf.is_active !== 1 }),
      });
      setActionMsg(`Workflow "${wf.name}" ${wf.is_active === 1 ? 'disabled' : 'enabled'}.`);
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Failed to update workflow state');
    } finally {
      await loadData();
    }
  };

  const handleTriggerWorkflow = async (wf: WorkflowItem) => {
    setActionMsg('');
    setActionErr('');
    try {
      const res = await apiFetch<{ ok: boolean; status: number }>(`/api/workflows/${wf.id}/trigger`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setActionMsg(`Triggered "${wf.name}" successfully (HTTP ${res.status}).`);
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Workflow execution failed');
    } finally {
      await loadData();
    }
  };

  const handleRetryLog = async (logId: number) => {
    setActionMsg('');
    setActionErr('');
    try {
      await apiFetch(`/api/automations/logs/${logId}/retry`, { method: 'POST' });
      setActionMsg('Retry execution succeeded.');
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      await loadData();
    }
  };

  const handleCreateWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionErr('');
    try {
      await apiFetch('/api/workflows', {
        method: 'POST',
        body: JSON.stringify(newWf),
      });
      setShowAddModal(false);
      setNewWf({ name: '', n8nWorkflowId: '', webhookUrl: '', triggerEvent: 'whatsapp_inbound' });
      await loadData();
    } catch (err: unknown) {
      setActionErr(err instanceof Error ? err.message : 'Failed to register workflow');
    }
  };

  const handleDeleteWorkflow = async (id: number) => {
    await apiFetch(`/api/workflows/${id}`, { method: 'DELETE' });
    await loadData();
  };

  return (
    <div className="space-y-6">
      {/* n8n Engine Header */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Workflow className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              n8n Automation Control Center
            </h2>
            <StatusText status={n8nStatus} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Only workflows configured in n8n or registered with a real production webhook are shown. Never claims active without verification.
          </p>
          {n8nLastError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">{n8nLastError}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            n8n Credentials
          </button>
          <button
            type="button"
            onClick={handleTestN8n}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Test &amp; Sync n8n</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Register Workflow</span>
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
          {actionMsg}
        </div>
      )}
      {actionErr && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {actionErr}
        </div>
      )}

      {/* WhatsApp <-> n8n Link Bridge */}
      <WhatsappN8nLinkPanel refreshSignal={refreshSignal} onUpdated={() => void loadData()} />

      {/* Workflows Table */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Configured Workflows ({workflows.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading workflows...</div>
        ) : workflows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No Data Available</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Connect your n8n instance via Settings or register a published workflow production webhook URL above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Automation Name</th>
                  <th className="py-3 px-4">Workflow ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Execution</th>
                  <th className="py-3 px-4">Result / Error</th>
                  <th className="py-3 px-4 text-right">Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {workflows.map((wf) => (
                  <tr key={wf.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">{wf.name}</p>
                      <p className="text-[11px] font-mono text-slate-400 truncate max-w-xs">
                        {wf.webhook_url || 'No webhook URL set'}
                      </p>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">{wf.n8n_workflow_id}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium ${
                          wf.is_active === 1
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {wf.is_active === 1 ? 'Active' : 'Stopped'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                      {formatDateTime(wf.last_execution_at)}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      {wf.last_error ? (
                        <span className="text-red-600 dark:text-red-400 line-clamp-2">{wf.last_error}</span>
                      ) : wf.last_execution_status ? (
                        <span className="capitalize text-slate-700 dark:text-slate-300">{wf.last_execution_status}</span>
                      ) : (
                        <span className="text-slate-400">Not executed</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleToggleWorkflow(wf)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Power className="w-3 h-3" />
                          <span>{wf.is_active === 1 ? 'Stop' : 'Start'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleTriggerWorkflow(wf)}
                          disabled={!wf.webhook_url}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white"
                        >
                          <Play className="w-3 h-3" />
                          <span>Test</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteWorkflow(wf.id)}
                          title="Remove workflow"
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Logs */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Execution Logs ({logs.length})
          </h3>
        </div>

        {logs.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No Data Available</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Real execution history and errors will appear here when workflows run.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Workflow</th>
                  <th className="py-3 px-4">Trigger</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Error Information</th>
                  <th className="py-3 px-4 text-right">Timestamp / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{log.workflow_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{log.trigger_source}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-medium capitalize ${
                          log.status === 'success'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : log.status === 'failed'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-500">{log.duration_ms} ms</td>
                    <td className="py-3 px-4 text-red-600 dark:text-red-400 max-w-xs truncate">
                      {log.error_message || '—'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      <div className="inline-flex items-center gap-2">
                        <span>{formatDateTime(log.created_at)}</span>
                        {log.status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => void handleRetryLog(log.id)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Workflow Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Register n8n Published Workflow
              </h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateWorkflow} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Automation Name *</label>
                <input
                  type="text"
                  required
                  value={newWf.name}
                  onChange={(e) => setNewWf({ ...newWf, name: e.target.value })}
                  placeholder="WhatsApp Inbound Processor"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  n8n Workflow Identifier
                </label>
                <input
                  type="text"
                  value={newWf.n8nWorkflowId}
                  onChange={(e) => setNewWf({ ...newWf, n8nWorkflowId: e.target.value })}
                  placeholder="Optional n8n workflow ID"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Production Webhook URL *
                </label>
                <input
                  type="url"
                  required
                  value={newWf.webhookUrl}
                  onChange={(e) => setNewWf({ ...newWf, webhookUrl: e.target.value })}
                  placeholder="https://your-n8n-host/webhook/..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Trigger Event</label>
                <select
                  value={newWf.triggerEvent}
                  onChange={(e) => setNewWf({ ...newWf, triggerEvent: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="whatsapp_inbound">Incoming WhatsApp Message</option>
                  <option value="manual">Manual Trigger Only</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Register Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
