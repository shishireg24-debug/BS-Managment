import {
  createNotification,
  db,
  getIntegrationRecord,
  saveIntegrationConfig,
  updateIntegrationStatus,
} from '../db.ts';

export type SheetCategory =
  | 'customers'
  | 'whatsapp_messages'
  | 'conversation_history'
  | 'ai_response_logs'
  | 'automation_logs'
  | 'business_reports';

export interface SheetsConfig {
  syncMode: 'not_configured' | 'n8n_webhook';
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  n8nSyncWebhookUrl: string;
}

export function getSheetsConfig(): SheetsConfig {
  const rec = getIntegrationRecord('google_sheets');
  const c = rec.config;
  return {
    syncMode: (c.syncMode as SheetsConfig['syncMode']) || 'not_configured',
    spreadsheetId: c.spreadsheetId || '',
    spreadsheetName: c.spreadsheetName || '',
    worksheetName: c.worksheetName || '',
    n8nSyncWebhookUrl: c.n8nSyncWebhookUrl || '',
  };
}

export function getCategoryRecords(category: SheetCategory): Array<Record<string, unknown>> {
  switch (category) {
    case 'customers':
      return db.prepare(`
        SELECT id, name, phone_number, whatsapp_number, email, tags, status, last_contact_at, created_at
        FROM customers ORDER BY id DESC LIMIT 500
      `).all() as Array<Record<string, unknown>>;
    case 'whatsapp_messages':
      return db.prepare(`
        SELECT m.id, m.external_message_id, c.name as customer_name, c.whatsapp_number, m.direction, m.sender_type, m.content, m.delivery_status, m.created_at
        FROM messages m JOIN customers c ON m.customer_id = c.id
        ORDER BY m.id DESC LIMIT 500
      `).all() as Array<Record<string, unknown>>;
    case 'conversation_history':
      return db.prepare(`
        SELECT conv.id, c.name as customer_name, c.whatsapp_number, conv.status, conv.ai_enabled, conv.unread_count, conv.last_message_preview, conv.last_message_at
        FROM conversations conv JOIN customers c ON conv.customer_id = c.id
        ORDER BY conv.last_message_at DESC LIMIT 500
      `).all() as Array<Record<string, unknown>>;
    case 'ai_response_logs':
      return db.prepare(`
        SELECT m.id, c.name as customer_name, m.content as ai_reply, m.ai_intent, m.ai_confidence, m.delivery_status, m.created_at
        FROM messages m JOIN customers c ON m.customer_id = c.id
        WHERE m.sender_type = 'ai'
        ORDER BY m.id DESC LIMIT 500
      `).all() as Array<Record<string, unknown>>;
    case 'automation_logs':
      return db.prepare(`
        SELECT id, workflow_name, trigger_source, status, error_message, duration_ms, created_at
        FROM automation_logs ORDER BY id DESC LIMIT 500
      `).all() as Array<Record<string, unknown>>;
    case 'business_reports':
      return db.prepare(`
        SELECT date(created_at) as report_date,
               COUNT(*) as total_messages,
               SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as incoming,
               SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outgoing,
               SUM(CASE WHEN sender_type = 'ai' THEN 1 ELSE 0 END) as ai_replies
        FROM messages
        GROUP BY date(created_at)
        ORDER BY report_date DESC LIMIT 90
      `).all() as Array<Record<string, unknown>>;
  }
}

export async function testSheetsConnection(): Promise<{ ok: boolean; error?: string; message?: string }> {
  const cfg = getSheetsConfig();
  if (!cfg.n8nSyncWebhookUrl || !cfg.spreadsheetId) {
    const err = 'Not Connected: Google Workspace OAuth is disabled; configure an n8n Google Sheets Sync Webhook and Spreadsheet ID to sync.';
    updateIntegrationStatus('google_sheets', 'not_connected', err, true);
    return { ok: false, error: err };
  }

  try {
    const res = await fetch(cfg.n8nSyncWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_connection',
        spreadsheetId: cfg.spreadsheetId,
        worksheetName: cfg.worksheetName || 'Sheet1',
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Sync webhook returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    updateIntegrationStatus('google_sheets', 'connected', '', true);
    saveIntegrationConfig('google_sheets', { syncMode: 'n8n_webhook' });
    return { ok: true, message: 'Google Sheets n8n sync bridge verified.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Google Sheets sync test failed';
    updateIntegrationStatus('google_sheets', 'error', msg, true);
    createNotification('sync_failure', 'Google Sheets Connection Failure', msg, 'error');
    return { ok: false, error: msg };
  }
}

export async function syncCategoryToSheets(
  category: SheetCategory,
  operation: 'append' | 'update' | 'read'
): Promise<{ ok: boolean; recordsSynced: number; data?: Array<Record<string, unknown>>; error?: string }> {
  const cfg = getSheetsConfig();
  if (!cfg.n8nSyncWebhookUrl || !cfg.spreadsheetId) {
    const err = 'Not Connected: Configure an n8n Google Sheets Sync Webhook and Spreadsheet ID first.';
    return { ok: false, recordsSynced: 0, error: err };
  }

  const records = operation === 'read' ? [] : getCategoryRecords(category);

  try {
    const res = await fetch(cfg.n8nSyncWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: operation,
        category,
        spreadsheetId: cfg.spreadsheetId,
        worksheetName: cfg.worksheetName || category,
        dedupeKey: 'id',
        records,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 250)}`);
    }

    const json = (await res.json().catch(() => ({}))) as { rows?: Array<Record<string, unknown>> };
    db.prepare(`
      INSERT INTO sheet_sync_logs (category, spreadsheet_id, worksheet_name, records_synced, status)
      VALUES (?, ?, ?, ?, 'success')
    `).run(category, cfg.spreadsheetId, cfg.worksheetName || category, records.length);

    updateIntegrationStatus('google_sheets', 'connected', '', false);
    return { ok: true, recordsSynced: records.length, data: json.rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Sheet sync failed';
    db.prepare(`
      INSERT INTO sheet_sync_logs (category, spreadsheet_id, worksheet_name, records_synced, status, error_message)
      VALUES (?, ?, ?, 0, 'failed', ?)
    `).run(category, cfg.spreadsheetId, cfg.worksheetName || category, msg);

    createNotification('sync_failure', `Google Sheets Sync Failed (${category})`, msg, 'error');
    return { ok: false, recordsSynced: 0, error: msg };
  }
}
