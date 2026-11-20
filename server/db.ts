import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { decryptSecret, encryptSecret, hashPassword } from './crypto.ts';

const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bs_management.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'operator')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      whatsapp_number TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('active', 'lead', 'inactive', 'blocked')),
      last_contact_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'human_handover')),
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      unread_count INTEGER NOT NULL DEFAULT 0,
      last_message_preview TEXT DEFAULT '',
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      external_message_id TEXT UNIQUE,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'ai', 'human')),
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      delivery_status TEXT NOT NULL DEFAULT 'received' CHECK (delivery_status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
      error_message TEXT DEFAULT '',
      ai_intent TEXT DEFAULT '',
      ai_confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

    CREATE TABLE IF NOT EXISTS ai_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      model_name TEXT NOT NULL DEFAULT 'gemini-4-hydrogen',
      business_name TEXT NOT NULL DEFAULT 'BS Management',
      business_info TEXT NOT NULL DEFAULT '',
      system_instructions TEXT NOT NULL DEFAULT 'You are a helpful, accurate customer support representative. Answer politely in the customer''s language (Bengali or English). Only use facts from the configured Business Information. Never invent prices, stock availability, or policies. If information is missing or the customer asks for a human agent, request human handover.',
      personality TEXT NOT NULL DEFAULT 'Professional, concise, courteous, and accurate',
      languages TEXT NOT NULL DEFAULT 'Bengali & English',
      fallback_response TEXT NOT NULL DEFAULT 'Thank you for your message. A human team member will review your inquiry and respond shortly.',
      handover_keywords TEXT NOT NULL DEFAULT '["human","agent","manager","complaint","refund","support","কথা বলতে চাই","মানুষ","ম্যানেজার"]',
      handover_rules TEXT NOT NULL DEFAULT 'Hand over immediately if the customer explicitly asks for a human agent, expresses frustration or complaints, or asks about pricing/orders/policies not found in Business Information.',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS integrations (
      key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'configuration_required', 'connected', 'error')),
      config_json TEXT NOT NULL DEFAULT '{}',
      last_tested_at TEXT,
      last_error TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      n8n_workflow_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      webhook_url TEXT DEFAULT '',
      trigger_event TEXT NOT NULL DEFAULT 'whatsapp_inbound',
      is_active INTEGER NOT NULL DEFAULT 0,
      last_execution_at TEXT,
      last_execution_status TEXT DEFAULT '',
      last_error TEXT DEFAULT '',
      execution_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER,
      workflow_name TEXT NOT NULL,
      trigger_source TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'running', 'pending')),
      request_payload TEXT DEFAULT '',
      response_payload TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      duration_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('new_message', 'workflow_failed', 'api_error', 'new_customer', 'human_handover', 'sync_failure')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')),
      is_read INTEGER NOT NULL DEFAULT 0,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sheet_sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      worksheet_name TEXT NOT NULL,
      records_synced INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
      error_message TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS security_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      actor_email TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS whatsapp_n8n_links (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 0,
      reply_mode TEXT NOT NULL DEFAULT 'backend_gemini' CHECK (reply_mode IN ('backend_gemini', 'n8n_orchestrated', 'forward_only')),
      n8n_webhook_url TEXT NOT NULL DEFAULT '',
      linked_workflow_id INTEGER,
      forward_inbound INTEGER NOT NULL DEFAULT 1,
      forward_outbound INTEGER NOT NULL DEFAULT 1,
      forward_statuses INTEGER NOT NULL DEFAULT 0,
      callback_secret_enc TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'configuration_required', 'connected', 'error')),
      last_linked_test_at TEXT,
      last_error TEXT DEFAULT '',
      total_forwarded INTEGER NOT NULL DEFAULT 0,
      total_callbacks INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (linked_workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
    );
  `);

  // Seed singleton AI settings row if missing
  db.prepare(`INSERT OR IGNORE INTO ai_settings (id) VALUES (1)`).run();

  // Seed default integration states (honest unconfigured defaults)
  const integrations = ['whatsapp', 'n8n', 'gemini', 'google_sheets'];
  const insertIntegration = db.prepare(`INSERT OR IGNORE INTO integrations (key, status, config_json) VALUES (?, ?, '{}')`);
  for (const key of integrations) {
    const hasGeminiEnv = key === 'gemini' && Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    const initialStatus = key === 'google_sheets' ? 'not_connected' : hasGeminiEnv ? 'configuration_required' : 'configuration_required';
    insertIntegration.run(key, initialStatus);
  }

  // Seed default app settings
  const defaultAppSettings: Record<string, string> = {
    company_name: 'BS Management',
    timezone: 'Asia/Dhaka',
    default_language: 'en',
    date_format: 'YYYY-MM-DD HH:mm',
    notify_new_message: 'true',
    notify_workflow_failed: 'true',
    notify_api_error: 'true',
    notify_human_handover: 'true',
    notify_sync_failure: 'true',
    require_webhook_signature: 'true',
    rate_limit_rpm: '60',
  };
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaultAppSettings)) {
    insertSetting.run(k, v);
  }

  // Seed singleton WhatsApp <-> n8n link row if missing
  db.prepare(`INSERT OR IGNORE INTO whatsapp_n8n_links (id) VALUES (1)`).run();
  const linkRow = db.prepare(`SELECT callback_secret_enc FROM whatsapp_n8n_links WHERE id = 1`).get() as
    | { callback_secret_enc: string }
    | undefined;
  if (linkRow && !linkRow.callback_secret_enc) {
    const newSecret = crypto.randomBytes(24).toString('hex');
    db.prepare(`UPDATE whatsapp_n8n_links SET callback_secret_enc = ? WHERE id = 1`).run(encryptSecret(newSecret));
  }

  // Optional env-based initial admin seed (never hardcoded fallback credentials!)
  const userCount = (db.prepare(`SELECT COUNT(*) as count FROM users`).get() as { count: number }).count;
  if (userCount === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const adminName = process.env.ADMIN_NAME || 'Administrator';
    db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'super_admin')`)
      .run(adminName, process.env.ADMIN_EMAIL.toLowerCase().trim(), hashPassword(process.env.ADMIN_PASSWORD));
  }
}

export function createNotification(
  type: 'new_message' | 'workflow_failed' | 'api_error' | 'new_customer' | 'human_handover' | 'sync_failure',
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'info',
  metadata: Record<string, unknown> = {}
) {
  db.prepare(`
    INSERT INTO notifications (type, title, message, severity, metadata_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(type, title, message, severity, JSON.stringify(metadata));
}

export function logSecurityEvent(eventType: string, actorEmail: string, ipAddress: string, details: string) {
  db.prepare(`
    INSERT INTO security_logs (event_type, actor_email, ip_address, details)
    VALUES (?, ?, ?, ?)
  `).run(eventType, actorEmail, ipAddress, details);
}

const SECRET_FIELDS = new Set([
  'accessToken',
  'appSecret',
  'verifyToken',
  'apiKey',
  'authValue',
  'webhookSecret',
]);

export function getIntegrationRecord(key: string): {
  key: string;
  status: string;
  config: Record<string, string>;
  lastTestedAt: string | null;
  lastError: string;
} {
  const row = db.prepare(`SELECT * FROM integrations WHERE key = ?`).get(key) as
    | { key: string; status: string; config_json: string; last_tested_at: string | null; last_error: string }
    | undefined;
  if (!row) {
    return { key, status: 'not_connected', config: {}, lastTestedAt: null, lastError: '' };
  }
  let rawConfig: Record<string, string> = {};
  try {
    rawConfig = JSON.parse(row.config_json || '{}');
  } catch {
    rawConfig = {};
  }
  const decrypted: Record<string, string> = {};
  for (const [field, val] of Object.entries(rawConfig)) {
    if (SECRET_FIELDS.has(field) && typeof val === 'string' && val.includes(':')) {
      decrypted[field] = decryptSecret(val);
    } else {
      decrypted[field] = val;
    }
  }
  return {
    key: row.key,
    status: row.status,
    config: decrypted,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error || '',
  };
}

export function saveIntegrationConfig(
  key: string,
  updates: Record<string, string>,
  status?: string,
  lastError?: string
) {
  const existing = getIntegrationRecord(key);
  const merged: Record<string, string> = { ...existing.config };
  for (const [field, val] of Object.entries(updates)) {
    if (val === undefined) continue;
    // Do not overwrite existing secret if frontend passed masked value
    if (SECRET_FIELDS.has(field) && val.startsWith('••')) continue;
    merged[field] = val;
  }

  const toStore: Record<string, string> = {};
  for (const [field, val] of Object.entries(merged)) {
    if (SECRET_FIELDS.has(field) && val) {
      toStore[field] = encryptSecret(val);
    } else {
      toStore[field] = val;
    }
  }

  db.prepare(`
    UPDATE integrations
    SET config_json = ?,
        status = COALESCE(?, status),
        last_error = COALESCE(?, last_error),
        updated_at = datetime('now')
    WHERE key = ?
  `).run(JSON.stringify(toStore), status ?? null, lastError ?? null, key);
}

export function updateIntegrationStatus(key: string, status: string, lastError = '', tested = false) {
  db.prepare(`
    UPDATE integrations
    SET status = ?,
        last_error = ?,
        last_tested_at = CASE WHEN ? = 1 THEN datetime('now') ELSE last_tested_at END,
        updated_at = datetime('now')
    WHERE key = ?
  `).run(status, lastError, tested ? 1 : 0, key);
}

export function getAppSettingsMap(): Record<string, string> {
  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export interface WhatsappN8nLinkRecord {
  id: number;
  enabled: boolean;
  replyMode: 'backend_gemini' | 'n8n_orchestrated' | 'forward_only';
  n8nWebhookUrl: string;
  linkedWorkflowId: number | null;
  forwardInbound: boolean;
  forwardOutbound: boolean;
  forwardStatuses: boolean;
  callbackSecret: string;
  status: string;
  lastLinkedTestAt: string | null;
  lastError: string;
  totalForwarded: number;
  totalCallbacks: number;
  updatedAt: string;
}

export function getWhatsappN8nLink(): WhatsappN8nLinkRecord {
  const row = db.prepare(`SELECT * FROM whatsapp_n8n_links WHERE id = 1`).get() as
    | {
        id: number;
        enabled: number;
        reply_mode: 'backend_gemini' | 'n8n_orchestrated' | 'forward_only';
        n8n_webhook_url: string;
        linked_workflow_id: number | null;
        forward_inbound: number;
        forward_outbound: number;
        forward_statuses: number;
        callback_secret_enc: string;
        status: string;
        last_linked_test_at: string | null;
        last_error: string;
        total_forwarded: number;
        total_callbacks: number;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return {
      id: 1,
      enabled: false,
      replyMode: 'backend_gemini',
      n8nWebhookUrl: '',
      linkedWorkflowId: null,
      forwardInbound: true,
      forwardOutbound: true,
      forwardStatuses: false,
      callbackSecret: '',
      status: 'not_connected',
      lastLinkedTestAt: null,
      lastError: '',
      totalForwarded: 0,
      totalCallbacks: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    id: row.id,
    enabled: row.enabled === 1,
    replyMode: row.reply_mode,
    n8nWebhookUrl: row.n8n_webhook_url || '',
    linkedWorkflowId: row.linked_workflow_id,
    forwardInbound: row.forward_inbound === 1,
    forwardOutbound: row.forward_outbound === 1,
    forwardStatuses: row.forward_statuses === 1,
    callbackSecret: row.callback_secret_enc ? decryptSecret(row.callback_secret_enc) : '',
    status: row.status,
    lastLinkedTestAt: row.last_linked_test_at,
    lastError: row.last_error || '',
    totalForwarded: row.total_forwarded || 0,
    totalCallbacks: row.total_callbacks || 0,
    updatedAt: row.updated_at,
  };
}

export function saveWhatsappN8nLink(updates: {
  enabled?: boolean;
  replyMode?: 'backend_gemini' | 'n8n_orchestrated' | 'forward_only';
  n8nWebhookUrl?: string;
  linkedWorkflowId?: number | null;
  forwardInbound?: boolean;
  forwardOutbound?: boolean;
  forwardStatuses?: boolean;
  status?: string;
  lastError?: string;
}) {
  const current = getWhatsappN8nLink();
  const nextUrl = updates.n8nWebhookUrl !== undefined ? updates.n8nWebhookUrl.trim() : current.n8nWebhookUrl;
  const nextEnabled = updates.enabled !== undefined ? updates.enabled : current.enabled;
  const computedStatus =
    updates.status ?? (nextUrl ? (current.status === 'connected' ? 'connected' : 'configuration_required') : 'not_connected');

  db.prepare(`
    UPDATE whatsapp_n8n_links
    SET enabled = ?,
        reply_mode = ?,
        n8n_webhook_url = ?,
        linked_workflow_id = ?,
        forward_inbound = ?,
        forward_outbound = ?,
        forward_statuses = ?,
        status = ?,
        last_error = COALESCE(?, last_error),
        updated_at = datetime('now')
    WHERE id = 1
  `).run(
    nextEnabled ? 1 : 0,
    updates.replyMode ?? current.replyMode,
    nextUrl,
    updates.linkedWorkflowId !== undefined ? updates.linkedWorkflowId : current.linkedWorkflowId,
    (updates.forwardInbound !== undefined ? updates.forwardInbound : current.forwardInbound) ? 1 : 0,
    (updates.forwardOutbound !== undefined ? updates.forwardOutbound : current.forwardOutbound) ? 1 : 0,
    (updates.forwardStatuses !== undefined ? updates.forwardStatuses : current.forwardStatuses) ? 1 : 0,
    computedStatus,
    updates.lastError ?? null
  );
}

export function rotateWhatsappN8nSecret(): string {
  const newSecret = crypto.randomBytes(24).toString('hex');
  db.prepare(`UPDATE whatsapp_n8n_links SET callback_secret_enc = ?, updated_at = datetime('now') WHERE id = 1`).run(
    encryptSecret(newSecret)
  );
  return newSecret;
}


