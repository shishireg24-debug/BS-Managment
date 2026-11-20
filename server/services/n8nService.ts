import {
  createNotification,
  db,
  getIntegrationRecord,
  saveIntegrationConfig,
  updateIntegrationStatus,
} from '../db.ts';

export interface N8nConfig {
  baseUrl: string;
  webhookUrl: string;
  authType: 'none' | 'header_auth' | 'bearer' | 'basic';
  authHeaderName: string;
  authValue: string;
  apiKey: string;
}

export function getN8nConfig(): N8nConfig {
  const rec = getIntegrationRecord('n8n');
  const c = rec.config;
  return {
    baseUrl: (c.baseUrl || process.env.N8N_BASE_URL || '').replace(/\/+$/, ''),
    webhookUrl: c.webhookUrl || '',
    authType: (c.authType as N8nConfig['authType']) || 'none',
    authHeaderName: c.authHeaderName || 'X-N8N-API-KEY',
    authValue: c.authValue || '',
    apiKey: c.apiKey || process.env.N8N_API_KEY || '',
  };
}

function buildAuthHeaders(cfg: N8nConfig, forRestApi = false): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (forRestApi && cfg.apiKey) {
    headers['X-N8N-API-KEY'] = cfg.apiKey;
    return headers;
  }
  if (cfg.authType === 'header_auth' && cfg.authHeaderName && cfg.authValue) {
    headers[cfg.authHeaderName] = cfg.authValue;
  } else if (cfg.authType === 'bearer' && cfg.authValue) {
    headers['Authorization'] = `Bearer ${cfg.authValue}`;
  } else if (cfg.authType === 'basic' && cfg.authValue) {
    headers['Authorization'] = `Basic ${Buffer.from(cfg.authValue).toString('base64')}`;
  }
  return headers;
}

export async function testN8nConnection(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
  workflowsSynced?: number;
}> {
  const cfg = getN8nConfig();
  if (!cfg.baseUrl && !cfg.webhookUrl) {
    const err = 'Configuration Required: Provide an n8n Base URL or Production Webhook URL.';
    updateIntegrationStatus('n8n', 'configuration_required', err, true);
    return { ok: false, error: err };
  }

  try {
    if (cfg.baseUrl && cfg.apiKey) {
      const res = await fetch(`${cfg.baseUrl}/api/v1/workflows?limit=50`, {
        method: 'GET',
        headers: buildAuthHeaders(cfg, true),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`n8n API returned HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = (await res.json()) as { data?: Array<{ id: string; name: string; active: boolean }> };
      const list = Array.isArray(data.data) ? data.data : [];
      syncWorkflowListToDb(list, cfg.baseUrl);
      updateIntegrationStatus('n8n', 'connected', '', true);
      return {
        ok: true,
        message: `Connected to n8n REST API (${list.length} workflow(s) verified).`,
        workflowsSynced: list.length,
      };
    }

    if (cfg.webhookUrl) {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: buildAuthHeaders(cfg, false),
        body: JSON.stringify({ event: 'bs_management_connection_test', timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Production webhook returned HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      updateIntegrationStatus('n8n', 'connected', '', true);
      return {
        ok: true,
        message: `Production webhook reachable (HTTP ${res.status}).`,
        workflowsSynced: 0,
      };
    }

    const healthRes = await fetch(`${cfg.baseUrl}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(8000),
    });
    if (!healthRes.ok) {
      throw new Error(`n8n health endpoint returned HTTP ${healthRes.status}`);
    }
    updateIntegrationStatus('n8n', 'connected', '', true);
    return {
      ok: true,
      message: 'n8n instance health check passed. Add an n8n API key to sync workflows automatically.',
      workflowsSynced: 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to connect to n8n';
    updateIntegrationStatus('n8n', 'error', msg, true);
    createNotification('api_error', 'n8n Connection Failure', msg, 'error');
    return { ok: false, error: msg };
  }
}

function syncWorkflowListToDb(
  workflows: Array<{ id: string; name: string; active: boolean }>,
  baseUrl: string
) {
  const upsert = db.prepare(`
    INSERT INTO workflows (n8n_workflow_id, name, is_active, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(n8n_workflow_id) DO UPDATE SET
      name = excluded.name,
      is_active = excluded.is_active,
      updated_at = datetime('now')
  `);
  for (const wf of workflows) {
    upsert.run(String(wf.id), wf.name || `Workflow ${wf.id}`, wf.active ? 1 : 0);
  }
  saveIntegrationConfig('n8n', { baseUrl });
}

export async function triggerWorkflowWebhook(params: {
  workflowId?: number;
  workflowName: string;
  webhookUrl: string;
  triggerSource: string;
  payload: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; responseBody: string; error?: string; logId: number }> {
  const cfg = getN8nConfig();
  const start = Date.now();
  const payloadStr = JSON.stringify(params.payload);

  const insertLog = db.prepare(`
    INSERT INTO automation_logs (workflow_id, workflow_name, trigger_source, status, request_payload)
    VALUES (?, ?, ?, 'running', ?)
  `);
  const info = insertLog.run(params.workflowId ?? null, params.workflowName, params.triggerSource, payloadStr);
  const logId = Number(info.lastInsertRowid);

  try {
    if (!params.webhookUrl) {
      throw new Error('Production webhook URL is not configured for this workflow.');
    }
    const res = await fetch(params.webhookUrl, {
      method: 'POST',
      headers: buildAuthHeaders(cfg, false),
      body: payloadStr,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const duration = Date.now() - start;

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    db.prepare(`
      UPDATE automation_logs
      SET status = 'success', response_payload = ?, duration_ms = ?
      WHERE id = ?
    `).run(text.slice(0, 2000), duration, logId);

    if (params.workflowId) {
      db.prepare(`
        UPDATE workflows
        SET last_execution_at = datetime('now'),
            last_execution_status = 'success',
            last_error = '',
            execution_count = execution_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(params.workflowId);
    }

    return { ok: true, status: res.status, responseBody: text, logId };
  } catch (err: unknown) {
    const duration = Date.now() - start;
    const msg = err instanceof Error ? err.message : 'Workflow execution failed';

    db.prepare(`
      UPDATE automation_logs
      SET status = 'failed', error_message = ?, duration_ms = ?
      WHERE id = ?
    `).run(msg, duration, logId);

    if (params.workflowId) {
      db.prepare(`
        UPDATE workflows
        SET last_execution_at = datetime('now'),
            last_execution_status = 'failed',
            last_error = ?,
            execution_count = execution_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(msg, params.workflowId);
    }

    createNotification(
      'workflow_failed',
      `Workflow Failed: ${params.workflowName}`,
      msg,
      'error',
      { workflowId: params.workflowId, logId }
    );

    return { ok: false, status: 500, responseBody: '', error: msg, logId };
  }
}

export async function toggleWorkflowState(workflowDbId: number, activate: boolean): Promise<{ ok: boolean; error?: string }> {
  const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(workflowDbId) as
    | { id: number; n8n_workflow_id: string; name: string; webhook_url: string; is_active: number }
    | undefined;
  if (!wf) return { ok: false, error: 'Workflow not found' };

  const cfg = getN8nConfig();
  if (cfg.baseUrl && cfg.apiKey && !wf.n8n_workflow_id.startsWith('manual-')) {
    try {
      const action = activate ? 'activate' : 'deactivate';
      const res = await fetch(`${cfg.baseUrl}/api/v1/workflows/${encodeURIComponent(wf.n8n_workflow_id)}/${action}`, {
        method: 'POST',
        headers: buildAuthHeaders(cfg, true),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`n8n API returned HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle workflow in n8n';
      db.prepare(`UPDATE workflows SET last_error = ?, updated_at = datetime('now') WHERE id = ?`).run(msg, workflowDbId);
      return { ok: false, error: msg };
    }
  }

  db.prepare(`UPDATE workflows SET is_active = ?, last_error = '', updated_at = datetime('now') WHERE id = ?`).run(
    activate ? 1 : 0,
    workflowDbId
  );
  return { ok: true };
}

export async function retryAutomationLog(logId: number) {
  const log = db.prepare(`SELECT * FROM automation_logs WHERE id = ?`).get(logId) as
    | { id: number; workflow_id: number | null; workflow_name: string; request_payload: string }
    | undefined;
  if (!log) {
    return { ok: false, error: 'Automation log not found' };
  }

  let webhookUrl = getN8nConfig().webhookUrl;
  if (log.workflow_id) {
    const wf = db.prepare(`SELECT webhook_url FROM workflows WHERE id = ?`).get(log.workflow_id) as
      | { webhook_url: string }
      | undefined;
    if (wf?.webhook_url) webhookUrl = wf.webhook_url;
  }

  let parsedPayload: Record<string, unknown> = {};
  try {
    parsedPayload = JSON.parse(log.request_payload || '{}');
  } catch {
    parsedPayload = {};
  }

  return triggerWorkflowWebhook({
    workflowId: log.workflow_id ?? undefined,
    workflowName: log.workflow_name,
    webhookUrl,
    triggerSource: `retry_log_${log.id}`,
    payload: parsedPayload,
  });
}
