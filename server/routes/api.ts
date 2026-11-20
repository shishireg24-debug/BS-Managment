import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  maskSecret,
  verifyPassword,
} from '../crypto.ts';
import {
  db,
  getAppSettingsMap,
  getIntegrationRecord,
  getWhatsappN8nLink,
  logSecurityEvent,
  rotateWhatsappN8nSecret,
  saveIntegrationConfig,
  saveWhatsappN8nLink,
} from '../db.ts';
import {
  AuthUser,
  getSessionUser,
  requireAuth,
  requireRole,
  SESSION_COOKIE_NAME,
} from '../middleware/auth.ts';
import {
  generateCustomerReply,
  getAiSettings,
  hasGeminiApiKey,
  testGeminiConnection,
} from '../services/geminiService.ts';
import {
  getN8nConfig,
  retryAutomationLog,
  testN8nConnection,
  toggleWorkflowState,
  triggerWorkflowWebhook,
} from '../services/n8nService.ts';
import {
  getCategoryRecords,
  getSheetsConfig,
  SheetCategory,
  syncCategoryToSheets,
  testSheetsConnection,
} from '../services/sheetsService.ts';
import {
  getWhatsAppConfig,
  sendWhatsAppMessage,
  testWhatsAppConnection,
  testWhatsappN8nLink,
} from '../services/whatsappService.ts';

export const apiRouter = express.Router();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please slow down requests.' },
});

apiRouter.use(apiRateLimiter);

function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function csvEscape(val: unknown): string {
  const s = val === null || val === undefined ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ==========================================
// 1. AUTHENTICATION & USER MANAGEMENT
// ==========================================
apiRouter.get('/auth/status', (req: Request, res: Response) => {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
  const user = getSessionUser(req);
  res.json({ hasUsers: count > 0, user });
});

apiRouter.post('/auth/setup', authRateLimiter, (req: Request, res: Response) => {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
  if (count > 0) {
    res.status(403).json({ error: 'Initial administrator account already exists. Please sign in.' });
    return;
  }

  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Name, valid email, and password (minimum 8 characters) are required.' });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const info = db
    .prepare(`INSERT INTO users (name, email, password_hash, role, last_login_at) VALUES (?, ?, ?, 'super_admin', datetime('now'))`)
    .run(name.trim(), cleanEmail, hashPassword(password));

  const userId = Number(info.lastInsertRowid);
  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)`).run(
    hashSessionToken(rawToken),
    userId,
    expiresAt,
    req.ip || '',
    req.get('user-agent') || ''
  );

  logSecurityEvent('initial_admin_setup', cleanEmail, req.ip || '', 'Initial super_admin account created');
  setSessionCookie(res, rawToken);
  res.status(201).json({
    user: { id: userId, name: name.trim(), email: cleanEmail, role: 'super_admin' },
  });
});

apiRouter.post('/auth/login', authRateLimiter, (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email?.trim() || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const cleanEmail = email.toLowerCase().trim();
  const user = db
    .prepare(`SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = ?`)
    .get(cleanEmail) as
    | { id: number; name: string; email: string; password_hash: string; role: AuthUser['role']; is_active: number }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    logSecurityEvent('login_failed', cleanEmail, req.ip || '', 'Invalid credentials');
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (user.is_active !== 1) {
    logSecurityEvent('login_blocked', cleanEmail, req.ip || '', 'Inactive account attempted login');
    res.status(403).json({ error: 'This account has been deactivated.' });
    return;
  }

  const rawToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO sessions (id, user_id, expires_at, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)`).run(
    hashSessionToken(rawToken),
    user.id,
    expiresAt,
    req.ip || '',
    req.get('user-agent') || ''
  );
  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  logSecurityEvent('login_success', cleanEmail, req.ip || '', 'Session started');

  setSessionCookie(res, rawToken);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

apiRouter.post('/auth/logout', (req: Request, res: Response) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(hashSessionToken(token));
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

// Protect all remaining API endpoints
apiRouter.use(requireAuth);

apiRouter.get('/auth/users', requireRole('super_admin', 'admin'), (_req: Request, res: Response) => {
  const users = db
    .prepare(`SELECT id, name, email, role, is_active, last_login_at, created_at FROM users ORDER BY id ASC`)
    .all();
  res.json({ users });
});

apiRouter.post('/auth/users', requireRole('super_admin', 'admin'), (req: Request, res: Response) => {
  const { name, email, password, role } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: AuthUser['role'];
  };
  if (!name?.trim() || !email?.trim() || !password || password.length < 8) {
    res.status(400).json({ error: 'Name, email, and password (min 8 chars) are required.' });
    return;
  }
  const allowedRole: AuthUser['role'] = role === 'operator' ? 'operator' : 'admin';
  const cleanEmail = email.toLowerCase().trim();
  try {
    const info = db
      .prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`)
      .run(name.trim(), cleanEmail, hashPassword(password), allowedRole);
    logSecurityEvent('user_created', req.user!.email, req.ip || '', `Created ${allowedRole}: ${cleanEmail}`);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  } catch {
    res.status(409).json({ error: 'A user with this email already exists.' });
  }
});

apiRouter.patch('/auth/users/:id', requireRole('super_admin'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { isActive, role } = req.body as { isActive?: boolean; role?: AuthUser['role'] };
  if (id === req.user!.id && isActive === false) {
    res.status(400).json({ error: 'You cannot deactivate your own active session account.' });
    return;
  }
  if (typeof isActive === 'boolean') {
    db.prepare(`UPDATE users SET is_active = ? WHERE id = ?`).run(isActive ? 1 : 0, id);
  }
  if (role && ['admin', 'operator', 'super_admin'].includes(role)) {
    db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id);
  }
  res.json({ ok: true });
});

// ==========================================
// 2. OVERVIEW DASHBOARD & ANALYTICS (REAL DATA ONLY)
// ==========================================
apiRouter.get('/dashboard/summary', (_req: Request, res: Response) => {
  const totalCustomers = (db.prepare(`SELECT COUNT(*) as c FROM customers`).get() as { c: number }).c;
  const totalMessages = (db.prepare(`SELECT COUNT(*) as c FROM messages`).get() as { c: number }).c;
  const incomingMessages = (db.prepare(`SELECT COUNT(*) as c FROM messages WHERE direction = 'inbound'`).get() as { c: number }).c;
  const outgoingMessages = (db.prepare(`SELECT COUNT(*) as c FROM messages WHERE direction = 'outbound'`).get() as { c: number }).c;
  const aiGeneratedReplies = (db.prepare(`SELECT COUNT(*) as c FROM messages WHERE sender_type = 'ai'`).get() as { c: number }).c;
  const activeAutomations = (db.prepare(`SELECT COUNT(*) as c FROM workflows WHERE is_active = 1`).get() as { c: number }).c;
  const failedAutomations = (db.prepare(`SELECT COUNT(*) as c FROM automation_logs WHERE status = 'failed'`).get() as { c: number }).c;
  const totalAutomationRuns = (db.prepare(`SELECT COUNT(*) as c FROM automation_logs`).get() as { c: number }).c;
  const successAutomationRuns = (db.prepare(`SELECT COUNT(*) as c FROM automation_logs WHERE status = 'success'`).get() as { c: number }).c;

  const todayActivity = (
    db.prepare(`SELECT COUNT(*) as c FROM messages WHERE date(created_at) = date('now')`).get() as { c: number }
  ).c;
  const monthlyActivity = (
    db.prepare(`SELECT COUNT(*) as c FROM messages WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get() as {
      c: number;
    }
  ).c;

  const thisMonthCustomers = (
    db.prepare(`SELECT COUNT(*) as c FROM customers WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`).get() as {
      c: number;
    }
  ).c;
  const prevMonthCustomers = (
    db
      .prepare(`SELECT COUNT(*) as c FROM customers WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', date('now', '-1 month'))`)
      .get() as { c: number }
  ).c;

  const customerGrowthPct =
    prevMonthCustomers > 0
      ? Math.round(((thisMonthCustomers - prevMonthCustomers) / prevMonthCustomers) * 100)
      : thisMonthCustomers > 0
      ? 100
      : null;

  const dailyMessagesSeries = db
    .prepare(`
      SELECT date(created_at) as day,
             SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as incoming,
             SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outgoing,
             SUM(CASE WHEN sender_type = 'ai' THEN 1 ELSE 0 END) as ai_replies
      FROM messages
      WHERE created_at >= datetime('now', '-14 days')
      GROUP BY date(created_at)
      ORDER BY day ASC
    `)
    .all();

  const monthlyGrowthSeries = db
    .prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
             COUNT(*) as new_customers
      FROM customers
      WHERE created_at >= datetime('now', '-6 months')
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month ASC
    `)
    .all();

  const aiReplyStats = {
    totalAiReplies: aiGeneratedReplies,
    totalHumanReplies: (db.prepare(`SELECT COUNT(*) as c FROM messages WHERE sender_type = 'human'`).get() as { c: number }).c,
    handoverCount: (db.prepare(`SELECT COUNT(*) as c FROM conversations WHERE status = 'human_handover'`).get() as { c: number }).c,
    avgConfidence: (
      db.prepare(`SELECT AVG(ai_confidence) as avg_conf FROM messages WHERE sender_type = 'ai' AND ai_confidence IS NOT NULL`).get() as {
        avg_conf: number | null;
      }
    ).avg_conf,
  };

  const integrationRows = db.prepare(`SELECT key, status, last_tested_at, last_error FROM integrations`).all();
  const unreadNotifications = (db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE is_read = 0`).get() as { c: number }).c;

  res.json({
    metrics: {
      totalCustomers,
      totalMessages,
      incomingMessages,
      outgoingMessages,
      aiGeneratedReplies,
      activeAutomations,
      failedAutomations,
      totalAutomationRuns,
      successAutomationRuns,
      todayActivity,
      monthlyActivity,
      thisMonthCustomers,
      customerGrowthPct,
      unreadNotifications,
    },
    charts: {
      dailyMessagesSeries,
      monthlyGrowthSeries,
      aiReplyStats,
    },
    integrations: integrationRows,
  });
});

apiRouter.get('/analytics', (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'daily';
  const groupExpr =
    period === 'monthly'
      ? `strftime('%Y-%m', created_at)`
      : period === 'weekly'
      ? `strftime('%Y-W%W', created_at)`
      : `date(created_at)`;

  const messageBreakdown = db
    .prepare(`
      SELECT ${groupExpr} as label,
             COUNT(*) as total_messages,
             SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as incoming,
             SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outgoing,
             SUM(CASE WHEN sender_type = 'ai' THEN 1 ELSE 0 END) as ai_replies,
             SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries
      FROM messages
      GROUP BY label
      ORDER BY label DESC
      LIMIT 30
    `)
    .all();

  const customerBreakdown = db
    .prepare(`
      SELECT ${groupExpr} as label, COUNT(*) as new_customers
      FROM customers
      GROUP BY label
      ORDER BY label DESC
      LIMIT 30
    `)
    .all();

  const automationBreakdown = db
    .prepare(`
      SELECT ${groupExpr} as label,
             COUNT(*) as total_runs,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_runs,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_runs,
             AVG(duration_ms) as avg_duration_ms
      FROM automation_logs
      GROUP BY label
      ORDER BY label DESC
      LIMIT 30
    `)
    .all();

  const totalConversations = (db.prepare(`SELECT COUNT(*) as c FROM conversations`).get() as { c: number }).c;

  res.json({
    period,
    totalConversations,
    messageBreakdown,
    customerBreakdown,
    automationBreakdown,
  });
});

apiRouter.get('/analytics/export', (req: Request, res: Response) => {
  const period = (req.query.period as string) || 'daily';
  const groupExpr =
    period === 'monthly'
      ? `strftime('%Y-%m', created_at)`
      : period === 'weekly'
      ? `strftime('%Y-W%W', created_at)`
      : `date(created_at)`;

  const rows = db
    .prepare(`
      SELECT ${groupExpr} as period_label,
             COUNT(*) as total_messages,
             SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) as incoming,
             SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) as outgoing,
             SUM(CASE WHEN sender_type = 'ai' THEN 1 ELSE 0 END) as ai_replies,
             SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) as failed_deliveries
      FROM messages
      GROUP BY period_label
      ORDER BY period_label DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const headers = ['period_label', 'total_messages', 'incoming', 'outgoing', 'ai_replies', 'failed_deliveries'];
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="bs-management-analytics-${period}.csv"`);
  res.send(csv);
});

// ==========================================
// 3. WHATSAPP INBOX & LIVE CHAT
// ==========================================
apiRouter.get('/conversations', (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').trim();
  const status = ((req.query.status as string) || '').trim();

  let sql = `
    SELECT conv.id, conv.customer_id, conv.status, conv.ai_enabled, conv.unread_count,
           conv.last_message_preview, conv.last_message_at,
           c.name as customer_name, c.phone_number, c.whatsapp_number, c.tags, c.status as customer_status
    FROM conversations conv
    JOIN customers c ON conv.customer_id = c.id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (search) {
    sql += ` AND (c.name LIKE ? OR c.whatsapp_number LIKE ? OR c.phone_number LIKE ? OR conv.last_message_preview LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (status && status !== 'all') {
    sql += ` AND conv.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY COALESCE(conv.last_message_at, conv.created_at) DESC`;

  const conversations = db.prepare(sql).all(...params);
  const waRec = getIntegrationRecord('whatsapp');
  res.json({
    conversations,
    whatsappStatus: waRec.status,
  });
});

apiRouter.get('/conversations/:id/messages', (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  const conv = db
    .prepare(`
      SELECT conv.*, c.name as customer_name, c.phone_number, c.whatsapp_number, c.tags, c.notes, c.status as customer_status
      FROM conversations conv
      JOIN customers c ON conv.customer_id = c.id
      WHERE conv.id = ?
    `)
    .get(convId);

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  db.prepare(`UPDATE conversations SET unread_count = 0 WHERE id = ?`).run(convId);
  const messages = db
    .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC`)
    .all(convId);

  res.json({ conversation: conv, messages });
});

apiRouter.post('/conversations/:id/messages', async (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    res.status(400).json({ error: 'Message content cannot be empty.' });
    return;
  }

  const conv = db
    .prepare(`
      SELECT conv.id, conv.customer_id, c.whatsapp_number
      FROM conversations conv
      JOIN customers c ON conv.customer_id = c.id
      WHERE conv.id = ?
    `)
    .get(convId) as { id: number; customer_id: number; whatsapp_number: string } | undefined;

  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const result = await sendWhatsAppMessage({
    to: conv.whatsapp_number,
    text: text.trim(),
    conversationId: conv.id,
    customerId: conv.customer_id,
    senderType: 'human',
  });

  if (!result.ok) {
    res.status(502).json({ error: result.error || 'Failed to send WhatsApp message', messageId: result.messageId });
    return;
  }

  res.status(201).json(result);
});

apiRouter.patch('/conversations/:id', (req: Request, res: Response) => {
  const convId = Number(req.params.id);
  const { aiEnabled, status } = req.body as { aiEnabled?: boolean; status?: string };

  if (typeof aiEnabled === 'boolean') {
    db.prepare(`UPDATE conversations SET ai_enabled = ? WHERE id = ?`).run(aiEnabled ? 1 : 0, convId);
  }
  if (status && ['open', 'resolved', 'human_handover'].includes(status)) {
    db.prepare(`UPDATE conversations SET status = ? WHERE id = ?`).run(status, convId);
  }
  res.json({ ok: true });
});

// ==========================================
// 4. CUSTOMER CRM
// ==========================================
apiRouter.get('/customers', (req: Request, res: Response) => {
  const search = ((req.query.search as string) || '').trim();
  const status = ((req.query.status as string) || '').trim();

  let sql = `SELECT * FROM customers WHERE 1=1`;
  const params: unknown[] = [];
  if (search) {
    sql += ` AND (name LIKE ? OR phone_number LIKE ? OR whatsapp_number LIKE ? OR email LIKE ? OR tags LIKE ?)`;
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY COALESCE(last_contact_at, updated_at, created_at) DESC`;

  const customers = db.prepare(sql).all(...params);
  res.json({ customers });
});

apiRouter.post('/customers', (req: Request, res: Response) => {
  const { name, phoneNumber, whatsappNumber, email, tags, notes, status } = req.body as {
    name?: string;
    phoneNumber?: string;
    whatsappNumber?: string;
    email?: string;
    tags?: string[];
    notes?: string;
    status?: string;
  };

  if (!name?.trim() || !whatsappNumber?.trim()) {
    res.status(400).json({ error: 'Customer name and WhatsApp number are required.' });
    return;
  }

  const cleanWa = whatsappNumber.replace(/[^\d]/g, '');
  if (!cleanWa) {
    res.status(400).json({ error: 'Enter a valid WhatsApp number with country code digits.' });
    return;
  }

  const cleanPhone = (phoneNumber || `+${cleanWa}`).trim();
  const validStatus = status && ['active', 'lead', 'inactive', 'blocked'].includes(status) ? status : 'lead';
  const tagsJson = JSON.stringify(Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : []);

  try {
    const info = db
      .prepare(`
        INSERT INTO customers (name, phone_number, whatsapp_number, email, tags, notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(name.trim(), cleanPhone, cleanWa, (email || '').trim(), tagsJson, (notes || '').trim(), validStatus);

    const customerId = Number(info.lastInsertRowid);
    db.prepare(`INSERT INTO conversations (customer_id, status, ai_enabled) VALUES (?, 'open', 1)`).run(customerId);
    res.status(201).json({ id: customerId });
  } catch {
    res.status(409).json({ error: 'A customer with this WhatsApp number already exists.' });
  }
});

apiRouter.get('/customers/export/csv', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT * FROM customers ORDER BY id DESC`).all() as Array<Record<string, unknown>>;
  const headers = ['id', 'name', 'phone_number', 'whatsapp_number', 'email', 'tags', 'status', 'notes', 'last_contact_at', 'created_at'];
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bs-management-customers.csv"');
  res.send(csv);
});

apiRouter.get('/customers/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const customer = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  const conversation = db.prepare(`SELECT * FROM conversations WHERE customer_id = ?`).get(id) as
    | { id: number }
    | undefined;
  const messages = conversation
    ? db.prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC`).all(conversation.id)
    : [];

  res.json({ customer, conversation: conversation || null, messages });
});

apiRouter.patch('/customers/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const { name, phoneNumber, whatsappNumber, email, tags, notes, status } = req.body as {
    name?: string;
    phoneNumber?: string;
    whatsappNumber?: string;
    email?: string;
    tags?: string[];
    notes?: string;
    status?: string;
  };

  db.prepare(`
    UPDATE customers
    SET name = COALESCE(?, name),
        phone_number = COALESCE(?, phone_number),
        whatsapp_number = COALESCE(?, whatsapp_number),
        email = COALESCE(?, email),
        tags = COALESCE(?, tags),
        notes = COALESCE(?, notes),
        status = COALESCE(?, status),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name?.trim() ?? null,
    phoneNumber?.trim() ?? null,
    whatsappNumber ? whatsappNumber.replace(/[^\d]/g, '') : null,
    email?.trim() ?? null,
    Array.isArray(tags) ? JSON.stringify(tags.map((t) => String(t).trim()).filter(Boolean)) : null,
    notes ?? null,
    status && ['active', 'lead', 'inactive', 'blocked'].includes(status) ? status : null,
    id
  );
  res.json({ ok: true });
});

apiRouter.delete('/customers/:id', requireRole('super_admin', 'admin'), (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM customers WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ==========================================
// 5. GEMINI AI AGENT
// ==========================================
apiRouter.get('/ai/settings', (_req: Request, res: Response) => {
  const settings = getAiSettings();
  const integration = getIntegrationRecord('gemini');
  res.json({
    settings,
    geminiConfigured: hasGeminiApiKey(),
    integrationStatus: integration.status,
    lastTestedAt: integration.lastTestedAt,
    lastError: integration.lastError,
  });
});

apiRouter.put('/ai/settings', (req: Request, res: Response) => {
  const {
    enabled,
    modelName,
    businessName,
    businessInfo,
    systemInstructions,
    personality,
    languages,
    fallbackResponse,
    handoverKeywords,
    handoverRules,
  } = req.body as Record<string, unknown>;

  const safeModel = modelName === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';
  const keywordsJson = Array.isArray(handoverKeywords)
    ? JSON.stringify(handoverKeywords.map((k) => String(k).trim()).filter(Boolean))
    : typeof handoverKeywords === 'string'
    ? JSON.stringify(
        handoverKeywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      )
    : undefined;

  db.prepare(`
    UPDATE ai_settings
    SET enabled = COALESCE(?, enabled),
        model_name = ?,
        business_name = COALESCE(?, business_name),
        business_info = COALESCE(?, business_info),
        system_instructions = COALESCE(?, system_instructions),
        personality = COALESCE(?, personality),
        languages = COALESCE(?, languages),
        fallback_response = COALESCE(?, fallback_response),
        handover_keywords = COALESCE(?, handover_keywords),
        handover_rules = COALESCE(?, handover_rules),
        updated_at = datetime('now')
    WHERE id = 1
  `).run(
    typeof enabled === 'boolean' ? (enabled ? 1 : 0) : null,
    safeModel,
    typeof businessName === 'string' ? businessName : null,
    typeof businessInfo === 'string' ? businessInfo : null,
    typeof systemInstructions === 'string' ? systemInstructions : null,
    typeof personality === 'string' ? personality : null,
    typeof languages === 'string' ? languages : null,
    typeof fallbackResponse === 'string' ? fallbackResponse : null,
    keywordsJson ?? null,
    typeof handoverRules === 'string' ? handoverRules : null
  );

  res.json({ ok: true, settings: getAiSettings() });
});

apiRouter.post('/ai/test', async (_req: Request, res: Response) => {
  const result = await testGeminiConnection();
  res.status(result.ok ? 200 : 502).json(result);
});

apiRouter.post('/ai/preview', async (req: Request, res: Response) => {
  const { message, customerName } = req.body as { message?: string; customerName?: string };
  if (!message?.trim()) {
    res.status(400).json({ error: 'Provide a sample customer message to test the AI Agent.' });
    return;
  }
  try {
    const result = await generateCustomerReply({
      customerMessage: message.trim(),
      customerName: customerName?.trim() || 'Test Customer',
      conversationHistory: [],
    });
    res.json({ ok: true, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to generate preview reply';
    res.status(502).json({ ok: false, error: msg });
  }
});

// ==========================================
// 6. N8N AUTOMATION CONTROL CENTER
// ==========================================
apiRouter.get('/workflows', (_req: Request, res: Response) => {
  const workflows = db.prepare(`SELECT * FROM workflows ORDER BY updated_at DESC, id DESC`).all();
  const logs = db.prepare(`SELECT * FROM automation_logs ORDER BY id DESC LIMIT 100`).all();
  const n8n = getIntegrationRecord('n8n');
  res.json({
    workflows,
    logs,
    n8nStatus: n8n.status,
    n8nLastTestedAt: n8n.lastTestedAt,
    n8nLastError: n8n.lastError,
  });
});

apiRouter.post('/workflows', (req: Request, res: Response) => {
  const { n8nWorkflowId, name, webhookUrl, triggerEvent } = req.body as {
    n8nWorkflowId?: string;
    name?: string;
    webhookUrl?: string;
    triggerEvent?: string;
  };
  if (!name?.trim() || !webhookUrl?.trim()) {
    res.status(400).json({ error: 'Workflow Name and Production Webhook URL are required.' });
    return;
  }

  const wfId = (n8nWorkflowId || `manual-${Date.now()}`).trim();
  const info = db
    .prepare(`
      INSERT INTO workflows (n8n_workflow_id, name, webhook_url, trigger_event, is_active)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(n8n_workflow_id) DO UPDATE SET
        name = excluded.name,
        webhook_url = excluded.webhook_url,
        trigger_event = excluded.trigger_event,
        updated_at = datetime('now')
    `)
    .run(wfId, name.trim(), webhookUrl.trim(), (triggerEvent || 'whatsapp_inbound').trim());

  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

apiRouter.post('/workflows/:id/toggle', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { active } = req.body as { active?: boolean };
  const result = await toggleWorkflowState(id, Boolean(active));
  if (!result.ok) {
    res.status(502).json(result);
    return;
  }
  res.json(result);
});

apiRouter.post('/workflows/:id/trigger', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id) as
    | { id: number; name: string; webhook_url: string; trigger_event: string }
    | undefined;
  if (!wf) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  const result = await triggerWorkflowWebhook({
    workflowId: wf.id,
    workflowName: wf.name,
    webhookUrl: wf.webhook_url,
    triggerSource: 'manual_admin_trigger',
    payload: {
      event: 'manual_test',
      workflowName: wf.name,
      triggeredBy: req.user!.email,
      timestamp: new Date().toISOString(),
      ...(req.body?.payload || {}),
    },
  });

  res.status(result.ok ? 200 : 502).json(result);
});

apiRouter.delete('/workflows/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
  res.json({ ok: true });
});

apiRouter.get('/automations/logs', (_req: Request, res: Response) => {
  const logs = db.prepare(`SELECT * FROM automation_logs ORDER BY id DESC LIMIT 150`).all();
  res.json({ logs });
});

apiRouter.post('/automations/logs/:id/retry', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const result = await retryAutomationLog(id);
  res.status(result.ok ? 200 : 502).json(result);
});

// ==========================================
// 7. GOOGLE SHEETS INTEGRATION
// ==========================================
apiRouter.get('/sheets/status', (_req: Request, res: Response) => {
  const rec = getIntegrationRecord('google_sheets');
  const cfg = getSheetsConfig();
  const logs = db.prepare(`SELECT * FROM sheet_sync_logs ORDER BY id DESC LIMIT 50`).all();
  res.json({
    status: rec.status,
    lastTestedAt: rec.lastTestedAt,
    lastError: rec.lastError,
    config: cfg,
    logs,
  });
});

apiRouter.put('/sheets/config', (req: Request, res: Response) => {
  const { spreadsheetId, spreadsheetName, worksheetName, n8nSyncWebhookUrl } = req.body as Record<string, string>;
  const hasConfig = Boolean(spreadsheetId?.trim() && n8nSyncWebhookUrl?.trim());
  saveIntegrationConfig(
    'google_sheets',
    {
      syncMode: hasConfig ? 'n8n_webhook' : 'not_configured',
      spreadsheetId: (spreadsheetId || '').trim(),
      spreadsheetName: (spreadsheetName || '').trim(),
      worksheetName: (worksheetName || '').trim(),
      n8nSyncWebhookUrl: (n8nSyncWebhookUrl || '').trim(),
    },
    hasConfig ? 'configuration_required' : 'not_connected',
    ''
  );
  res.json({ ok: true });
});

apiRouter.post('/sheets/test', async (_req: Request, res: Response) => {
  const result = await testSheetsConnection();
  res.status(result.ok ? 200 : 400).json(result);
});

apiRouter.post('/sheets/sync', async (req: Request, res: Response) => {
  const { category, operation } = req.body as { category?: SheetCategory; operation?: 'append' | 'update' | 'read' };
  const validCategories: SheetCategory[] = [
    'customers',
    'whatsapp_messages',
    'conversation_history',
    'ai_response_logs',
    'automation_logs',
    'business_reports',
  ];
  if (!category || !validCategories.includes(category)) {
    res.status(400).json({ error: 'Invalid sync category.' });
    return;
  }
  const op = operation === 'read' || operation === 'update' ? operation : 'append';
  const result = await syncCategoryToSheets(category, op);
  res.status(result.ok ? 200 : 400).json(result);
});

apiRouter.get('/sheets/preview/:category', (req: Request, res: Response) => {
  const category = req.params.category as SheetCategory;
  try {
    const records = getCategoryRecords(category);
    res.json({ records });
  } catch {
    res.status(400).json({ error: 'Invalid category' });
  }
});

// ==========================================
// 8. NOTIFICATIONS
// ==========================================
apiRouter.get('/notifications', (_req: Request, res: Response) => {
  const notifications = db.prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 100`).all();
  const unreadCount = (db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE is_read = 0`).get() as { c: number }).c;
  res.json({ notifications, unreadCount });
});

apiRouter.post('/notifications/:id/read', (req: Request, res: Response) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

apiRouter.post('/notifications/read-all', (_req: Request, res: Response) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`).run();
  res.json({ ok: true });
});

// ==========================================
// 9. INTEGRATIONS & SETTINGS
// ==========================================
apiRouter.get('/integrations', (_req: Request, res: Response) => {
  const wa = getWhatsAppConfig();
  const waRec = getIntegrationRecord('whatsapp');
  const n8n = getN8nConfig();
  const n8nRec = getIntegrationRecord('n8n');
  const geminiRec = getIntegrationRecord('gemini');
  const sheetsRec = getIntegrationRecord('google_sheets');
  const sheetsCfg = getSheetsConfig();

  const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : '';

  res.json({
    webhookCallbackUrl: appUrl ? `${appUrl.replace(/\/+$/, '')}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp',
    integrations: {
      whatsapp: {
        status: waRec.status,
        lastTestedAt: waRec.lastTestedAt,
        lastError: waRec.lastError,
        config: {
          phoneNumberId: wa.phoneNumberId,
          businessAccountId: wa.businessAccountId,
          accessTokenMasked: maskSecret(wa.accessToken),
          hasAccessToken: Boolean(wa.accessToken),
          verifyTokenMasked: maskSecret(wa.verifyToken),
          hasVerifyToken: Boolean(wa.verifyToken),
          appSecretMasked: maskSecret(wa.appSecret),
          hasAppSecret: Boolean(wa.appSecret),
        },
      },
      n8n: {
        status: n8nRec.status,
        lastTestedAt: n8nRec.lastTestedAt,
        lastError: n8nRec.lastError,
        config: {
          baseUrl: n8n.baseUrl,
          webhookUrl: n8n.webhookUrl,
          authType: n8n.authType,
          authHeaderName: n8n.authHeaderName,
          authValueMasked: maskSecret(n8n.authValue),
          hasAuthValue: Boolean(n8n.authValue),
          apiKeyMasked: maskSecret(n8n.apiKey),
          hasApiKey: Boolean(n8n.apiKey),
        },
      },
      gemini: {
        status: geminiRec.status,
        lastTestedAt: geminiRec.lastTestedAt,
        lastError: geminiRec.lastError,
        configuredViaEnv: hasGeminiApiKey(),
        modelName: getAiSettings().model_name,
      },
      google_sheets: {
        status: sheetsRec.status,
        lastTestedAt: sheetsRec.lastTestedAt,
        lastError: sheetsRec.lastError,
        config: sheetsCfg,
      },
    },
  });
});

apiRouter.put('/integrations/:key', (req: Request, res: Response) => {
  const key = req.params.key;
  if (!['whatsapp', 'n8n', 'google_sheets'].includes(key)) {
    res.status(400).json({ error: 'Unsupported integration key' });
    return;
  }

  const body = req.body as Record<string, string>;
  saveIntegrationConfig(key, body, 'configuration_required', '');
  logSecurityEvent('integration_updated', req.user!.email, req.ip || '', `Updated configuration for ${key}`);
  res.json({ ok: true });
});

apiRouter.post('/integrations/:key/test', async (req: Request, res: Response) => {
  const key = req.params.key;
  if (key === 'whatsapp') {
    const result = await testWhatsAppConnection();
    res.status(result.ok ? 200 : 502).json(result);
    return;
  }
  if (key === 'n8n') {
    const result = await testN8nConnection();
    res.status(result.ok ? 200 : 502).json(result);
    return;
  }
  if (key === 'gemini') {
    const result = await testGeminiConnection();
    res.status(result.ok ? 200 : 502).json(result);
    return;
  }
  if (key === 'google_sheets') {
    const result = await testSheetsConnection();
    res.status(result.ok ? 200 : 400).json(result);
    return;
  }
  res.status(400).json({ error: 'Unknown integration key' });
});

// ==========================================
// 9B. WHATSAPP <-> N8N LINK SYSTEM
// ==========================================
apiRouter.get('/links/whatsapp-n8n', (_req: Request, res: Response) => {
  const link = getWhatsappN8nLink();
  const waRec = getIntegrationRecord('whatsapp');
  const n8nRec = getIntegrationRecord('n8n');
  const workflows = db.prepare(`SELECT id, n8n_workflow_id, name, webhook_url, is_active FROM workflows ORDER BY name ASC`).all();
  const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL.replace(/\/+$/, '') : '';

  res.json({
    link: {
      enabled: link.enabled,
      replyMode: link.replyMode,
      n8nWebhookUrl: link.n8nWebhookUrl,
      linkedWorkflowId: link.linkedWorkflowId,
      forwardInbound: link.forwardInbound,
      forwardOutbound: link.forwardOutbound,
      forwardStatuses: link.forwardStatuses,
      callbackSecret: link.callbackSecret,
      status: link.status,
      lastLinkedTestAt: link.lastLinkedTestAt,
      lastError: link.lastError,
      totalForwarded: link.totalForwarded,
      totalCallbacks: link.totalCallbacks,
      updatedAt: link.updatedAt,
    },
    whatsappStatus: waRec.status,
    n8nStatus: n8nRec.status,
    workflows,
    endpoints: {
      whatsappWebhookUrl: appUrl ? `${appUrl}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp',
      n8nCallbackUrl: appUrl ? `${appUrl}/api/webhooks/n8n-callback` : '/api/webhooks/n8n-callback',
    },
  });
});

apiRouter.put('/links/whatsapp-n8n', (req: Request, res: Response) => {
  const {
    enabled,
    replyMode,
    n8nWebhookUrl,
    linkedWorkflowId,
    forwardInbound,
    forwardOutbound,
    forwardStatuses,
    rotateSecret,
  } = req.body as {
    enabled?: boolean;
    replyMode?: 'backend_gemini' | 'n8n_orchestrated' | 'forward_only';
    n8nWebhookUrl?: string;
    linkedWorkflowId?: number | null;
    forwardInbound?: boolean;
    forwardOutbound?: boolean;
    forwardStatuses?: boolean;
    rotateSecret?: boolean;
  };

  if (rotateSecret) {
    rotateWhatsappN8nSecret();
    logSecurityEvent('n8n_callback_secret_rotated', req.user!.email, req.ip || '', 'Rotated WhatsApp-n8n callback secret');
  }

  saveWhatsappN8nLink({
    enabled,
    replyMode,
    n8nWebhookUrl,
    linkedWorkflowId,
    forwardInbound,
    forwardOutbound,
    forwardStatuses,
  });

  logSecurityEvent('whatsapp_n8n_link_updated', req.user!.email, req.ip || '', `Mode: ${replyMode || 'unchanged'}`);
  res.json({ ok: true, link: getWhatsappN8nLink() });
});

apiRouter.post('/links/whatsapp-n8n/test', async (_req: Request, res: Response) => {
  const result = await testWhatsappN8nLink();
  res.status(result.ok ? 200 : 502).json(result);
});

apiRouter.get('/links/whatsapp-n8n/template', (req: Request, res: Response) => {
  const link = getWhatsappN8nLink();
  const origin = `${req.protocol}://${req.get('host')}`;
  const appUrl =
    process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL.replace(/\/+$/, '') : origin;
  const callbackUrl = `${appUrl}/api/webhooks/n8n-callback`;

  const workflowTemplate = {
    name: 'BS Management - WhatsApp Inbound & Reply Bridge',
    nodes: [
      {
        parameters: {
          httpMethod: 'POST',
          path: 'bs-whatsapp-inbound',
          responseMode: 'onReceived',
          options: {},
        },
        name: 'BS Management Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [240, 300],
      },
      {
        parameters: {
          method: 'POST',
          url: callbackUrl,
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: 'X-BS-Webhook-Secret',
                value: link.callbackSecret || 'YOUR_BS_CALLBACK_SECRET',
              },
            ],
          },
          sendBody: true,
          specifyBody: 'json',
          jsonBody:
            '={{ { "conversationId": $json.body.conversation.id, "to": $json.body.customer.whatsappNumber, "replyText": $json.replyText || "Thank you for contacting us.", "senderType": "ai", "sendViaWhatsApp": true } }}',
        },
        name: 'Reply via BS Management',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4.2,
        position: [560, 300],
      },
    ],
    connections: {
      'BS Management Webhook': {
        main: [[{ node: 'Reply via BS Management', type: 'main', index: 0 }]],
      },
    },
    active: false,
  };

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="bs-management-whatsapp-n8n-workflow.json"');
  res.send(JSON.stringify(workflowTemplate, null, 2));
});

apiRouter.get('/settings', (_req: Request, res: Response) => {
  const settings = getAppSettingsMap();
  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'bs_management.db');
  let dbSizeBytes = 0;
  try {
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {
    dbSizeBytes = 0;
  }

  const tableCounts = {
    users: (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c,
    customers: (db.prepare(`SELECT COUNT(*) as c FROM customers`).get() as { c: number }).c,
    conversations: (db.prepare(`SELECT COUNT(*) as c FROM conversations`).get() as { c: number }).c,
    messages: (db.prepare(`SELECT COUNT(*) as c FROM messages`).get() as { c: number }).c,
    workflows: (db.prepare(`SELECT COUNT(*) as c FROM workflows`).get() as { c: number }).c,
    automationLogs: (db.prepare(`SELECT COUNT(*) as c FROM automation_logs`).get() as { c: number }).c,
    notifications: (db.prepare(`SELECT COUNT(*) as c FROM notifications`).get() as { c: number }).c,
  };

  const securityLogs = db.prepare(`SELECT * FROM security_logs ORDER BY id DESC LIMIT 30`).all();

  res.json({
    settings,
    database: {
      engine: 'SQLite (WAL)',
      sizeBytes: dbSizeBytes,
      tableCounts,
    },
    securityLogs,
  });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  const allowedKeys = new Set([
    'company_name',
    'timezone',
    'default_language',
    'date_format',
    'notify_new_message',
    'notify_workflow_failed',
    'notify_api_error',
    'notify_human_handover',
    'notify_sync_failure',
    'require_webhook_signature',
    'rate_limit_rpm',
  ]);

  const stmt = db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  for (const [k, v] of Object.entries(updates)) {
    if (allowedKeys.has(k) && v !== undefined) {
      stmt.run(k, String(v));
    }
  }
  logSecurityEvent('settings_updated', req.user!.email, req.ip || '', 'Updated system settings');
  res.json({ ok: true, settings: getAppSettingsMap() });
});
