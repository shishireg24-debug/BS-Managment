import 'dotenv/config';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import path from 'path';
import { verifyMetaSignature } from './server/crypto.ts';
import { createNotification, getAppSettingsMap, getWhatsappN8nLink, initDatabase, logSecurityEvent } from './server/db.ts';
import { apiRouter } from './server/routes/api.ts';
import { getWhatsAppConfig, processIncomingWhatsAppWebhook, processN8nCallback } from './server/services/whatsappService.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.use(cookieParser());

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'BS Management', timestamp: new Date().toISOString() });
});

// Meta WhatsApp Business Cloud API Webhook Verification
app.get('/api/webhooks/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const cfg = getWhatsAppConfig();
  if (mode === 'subscribe' && cfg.verifyToken && token === cfg.verifyToken) {
    res.status(200).send(String(challenge || ''));
    return;
  }

  logSecurityEvent('whatsapp_webhook_verify_failed', 'meta_webhook', req.ip || '', 'Invalid verify token');
  res.sendStatus(403);
});

// Meta WhatsApp Business Cloud API Incoming Webhook (raw body for HMAC signature verification)
app.post(
  '/api/webhooks/whatsapp',
  express.raw({ type: 'application/json', limit: '2mb' }),
  async (req: Request, res: Response) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const cfg = getWhatsAppConfig();
    const settings = getAppSettingsMap();
    const requireSig = settings.require_webhook_signature !== 'false';

    if (requireSig && cfg.appSecret) {
      const signature = req.get('X-Hub-Signature-256');
      if (!verifyMetaSignature(rawBody, signature, cfg.appSecret)) {
        logSecurityEvent('whatsapp_webhook_signature_invalid', 'meta_webhook', req.ip || '', 'HMAC verification failed');
        createNotification('api_error', 'Blocked Unverified Webhook', 'Incoming WhatsApp webhook failed HMAC-SHA256 signature verification.', 'warning');
        res.sendStatus(401);
        return;
      }
    }

    try {
      const payload = JSON.parse(rawBody.toString('utf8'));
      const result = await processIncomingWhatsAppWebhook(payload);
      res.status(200).json({ ok: true, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse webhook payload';
      createNotification('api_error', 'WhatsApp Webhook Processing Error', msg, 'error');
      res.status(400).json({ error: msg });
    }
  }
);

app.use(express.json({ limit: '2mb' }));

// Authenticated n8n -> BS Management / WhatsApp Callback Webhook
app.post('/api/webhooks/n8n-callback', async (req: Request, res: Response) => {
  const link = getWhatsappN8nLink();
  const headerSecret = req.get('X-BS-Webhook-Secret') || '';
  const authHeader = req.get('Authorization') || '';
  const bearerSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const provided = headerSecret || bearerSecret;

  if (!link.callbackSecret || !provided) {
    logSecurityEvent('n8n_callback_unauthorized', 'n8n_webhook', req.ip || '', 'Missing callback secret');
    res.status(401).json({ error: 'Missing X-BS-Webhook-Secret or Bearer token.' });
    return;
  }

  const expectedBuf = Buffer.from(link.callbackSecret, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    logSecurityEvent('n8n_callback_unauthorized', 'n8n_webhook', req.ip || '', 'Invalid callback secret');
    res.status(401).json({ error: 'Invalid callback secret.' });
    return;
  }

  const result = await processN8nCallback(req.body || {});
  res.status(result.ok ? 200 : 400).json(result);
});

app.use('/api', apiRouter);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BS Management server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BS Management server:', err);
  process.exit(1);
});
