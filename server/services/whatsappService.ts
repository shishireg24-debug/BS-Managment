import {
  createNotification,
  db,
  getIntegrationRecord,
  getWhatsappN8nLink,
  updateIntegrationStatus,
} from '../db.ts';
import { generateCustomerReply, getAiSettings, hasGeminiApiKey } from './geminiService.ts';
import { triggerWorkflowWebhook } from './n8nService.ts';

function getCallbackUrl(): string {
  const appUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL.replace(/\/+$/, '') : '';
  return appUrl ? `${appUrl}/api/webhooks/n8n-callback` : '/api/webhooks/n8n-callback';
}

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  verifyToken: string;
  appSecret: string;
}

export function getWhatsAppConfig(): WhatsAppConfig {
  const rec = getIntegrationRecord('whatsapp');
  const c = rec.config;
  return {
    accessToken: c.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: c.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: c.businessAccountId || process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    verifyToken: c.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || '',
    appSecret: c.appSecret || process.env.WHATSAPP_APP_SECRET || '',
  };
}

export async function testWhatsAppConnection(): Promise<{
  ok: boolean;
  verifiedName?: string;
  displayPhoneNumber?: string;
  qualityRating?: string;
  error?: string;
}> {
  const cfg = getWhatsAppConfig();
  if (!cfg.accessToken || !cfg.phoneNumberId) {
    const err = 'Configuration Required: WhatsApp Access Token and Phone Number ID are required.';
    updateIntegrationStatus('whatsapp', 'configuration_required', err, true);
    return { ok: false, error: err };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}?fields=verified_name,display_phone_number,quality_rating`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json()) as {
      verified_name?: string;
      display_phone_number?: string;
      quality_rating?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      throw new Error(data.error?.message || `Meta Graph API returned HTTP ${res.status}`);
    }

    updateIntegrationStatus('whatsapp', 'connected', '', true);
    return {
      ok: true,
      verifiedName: data.verified_name,
      displayPhoneNumber: data.display_phone_number,
      qualityRating: data.quality_rating,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'WhatsApp Cloud API connection test failed';
    updateIntegrationStatus('whatsapp', 'error', msg, true);
    createNotification('api_error', 'WhatsApp API Connection Failure', msg, 'error');
    return { ok: false, error: msg };
  }
}

export async function sendWhatsAppMessage(params: {
  to: string;
  text: string;
  conversationId: number;
  customerId: number;
  senderType: 'ai' | 'human';
  aiIntent?: string;
  aiConfidence?: number;
}): Promise<{ ok: boolean; messageId: number; externalMessageId?: string; error?: string }> {
  const cfg = getWhatsAppConfig();
  const cleanRecipient = params.to.replace(/[^\d]/g, '');

  const insertStmt = db.prepare(`
    INSERT INTO messages (
      conversation_id, customer_id, direction, sender_type, content, message_type, delivery_status, ai_intent, ai_confidence
    ) VALUES (?, ?, 'outbound', ?, ?, 'text', 'queued', ?, ?)
  `);
  const resInfo = insertStmt.run(
    params.conversationId,
    params.customerId,
    params.senderType,
    params.text,
    params.aiIntent || '',
    params.aiConfidence ?? null
  );
  const msgId = Number(resInfo.lastInsertRowid);

  if (!cfg.accessToken || !cfg.phoneNumberId) {
    const errMsg = 'WhatsApp Business Cloud API is not configured.';
    db.prepare(`UPDATE messages SET delivery_status = 'failed', error_message = ? WHERE id = ?`).run(errMsg, msgId);
    updateConversationPreview(params.conversationId, params.customerId, params.text);
    return { ok: false, messageId: msgId, error: errMsg };
  }

  try {
    const apiRes = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'text',
        text: { preview_url: false, body: params.text },
      }),
      signal: AbortSignal.timeout(12000),
    });

    const data = (await apiRes.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };

    if (!apiRes.ok) {
      throw new Error(data.error?.message || `Meta Cloud API HTTP ${apiRes.status}`);
    }

    const externalId = data.messages?.[0]?.id || null;
    db.prepare(`
      UPDATE messages
      SET delivery_status = 'sent', external_message_id = ?, error_message = ''
      WHERE id = ?
    `).run(externalId, msgId);

    updateConversationPreview(params.conversationId, params.customerId, params.text);
    updateIntegrationStatus('whatsapp', 'connected', '', false);

    // Forward outbound event to WhatsApp <-> n8n Link if enabled
    const link = getWhatsappN8nLink();
    if (link.enabled && link.forwardOutbound && link.n8nWebhookUrl) {
      void triggerWorkflowWebhook({
        workflowId: link.linkedWorkflowId ?? undefined,
        workflowName: 'WhatsApp <-> n8n Link (Outbound)',
        webhookUrl: link.n8nWebhookUrl,
        triggerSource: 'whatsapp_outbound',
        payload: {
          event: 'whatsapp_outbound',
          messageId: externalId || String(msgId),
          to: cleanRecipient,
          conversationId: params.conversationId,
          customerId: params.customerId,
          senderType: params.senderType,
          content: params.text,
          aiIntent: params.aiIntent || '',
          timestamp: new Date().toISOString(),
        },
      }).then((r) => {
        if (r.ok) {
          db.prepare(`UPDATE whatsapp_n8n_links SET total_forwarded = total_forwarded + 1 WHERE id = 1`).run();
        }
      });
    }

    return { ok: true, messageId: msgId, externalMessageId: externalId ?? undefined };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Failed to send WhatsApp message';
    db.prepare(`UPDATE messages SET delivery_status = 'failed', error_message = ? WHERE id = ?`).run(errMsg, msgId);
    updateConversationPreview(params.conversationId, params.customerId, params.text);
    createNotification('api_error', 'WhatsApp Delivery Failed', `To ${params.to}: ${errMsg}`, 'error');
    return { ok: false, messageId: msgId, error: errMsg };
  }
}

function updateConversationPreview(conversationId: number, customerId: number, preview: string) {
  db.prepare(`
    UPDATE conversations
    SET last_message_preview = ?, last_message_at = datetime('now')
    WHERE id = ?
  `).run(preview.slice(0, 140), conversationId);

  db.prepare(`
    UPDATE customers
    SET last_contact_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(customerId);
}

interface MetaWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: 'sent' | 'delivered' | 'read' | 'failed';
          errors?: Array<{ message?: string; title?: string }>;
        }>;
      };
    }>;
  }>;
}

export async function processIncomingWhatsAppWebhook(body: MetaWebhookBody): Promise<{
  processedMessages: number;
  processedStatuses: number;
}> {
  let processedMessages = 0;
  let processedStatuses = 0;

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // 1. Delivery status updates
      const linkForStatus = getWhatsappN8nLink();
      for (const st of value.statuses || []) {
        if (!st.id || !st.status) continue;
        const errMsg = st.errors?.[0]?.message || st.errors?.[0]?.title || '';
        const info = db
          .prepare(`UPDATE messages SET delivery_status = ?, error_message = COALESCE(NULLIF(?, ''), error_message) WHERE external_message_id = ?`)
          .run(st.status, errMsg, st.id);
        if (info.changes > 0) processedStatuses += 1;

        if (linkForStatus.enabled && linkForStatus.forwardStatuses && linkForStatus.n8nWebhookUrl) {
          void triggerWorkflowWebhook({
            workflowId: linkForStatus.linkedWorkflowId ?? undefined,
            workflowName: 'WhatsApp <-> n8n Link (Status)',
            webhookUrl: linkForStatus.n8nWebhookUrl,
            triggerSource: 'whatsapp_status',
            payload: {
              event: 'whatsapp_status',
              messageId: st.id,
              status: st.status,
              errorMessage: errMsg,
              timestamp: new Date().toISOString(),
            },
          });
        }
      }

      // 2. Incoming customer messages
      const contactsByWaId = new Map<string, string>();
      for (const c of value.contacts || []) {
        if (c.wa_id) contactsByWaId.set(c.wa_id, c.profile?.name || c.wa_id);
      }

      for (const msg of value.messages || []) {
        if (!msg.id || !msg.from) continue;

        // Deduplicate by Meta wamid
        const existingMsg = db
          .prepare(`SELECT id FROM messages WHERE external_message_id = ?`)
          .get(msg.id) as { id: number } | undefined;
        if (existingMsg) continue;

        const waNumber = msg.from;
        const customerName = contactsByWaId.get(waNumber) || `+${waNumber}`;
        const textBody =
          msg.type === 'text'
            ? msg.text?.body || ''
            : `[${msg.type || 'media'} message received]`;

        if (!textBody) continue;

        // Upsert customer
        let customer = db
          .prepare(`SELECT * FROM customers WHERE whatsapp_number = ?`)
          .get(waNumber) as { id: number; name: string } | undefined;

        if (!customer) {
          const custRes = db
            .prepare(`
              INSERT INTO customers (name, phone_number, whatsapp_number, status, last_contact_at)
              VALUES (?, ?, ?, 'active', datetime('now'))
            `)
            .run(customerName, `+${waNumber}`, waNumber);
          customer = { id: Number(custRes.lastInsertRowid), name: customerName };
          createNotification('new_customer', 'New WhatsApp Customer', `${customerName} (+${waNumber}) initiated a conversation.`, 'info', {
            customerId: customer.id,
          });
        } else {
          db.prepare(`UPDATE customers SET last_contact_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(
            customer.id
          );
        }

        // Upsert conversation
        let conv = db
          .prepare(`SELECT * FROM conversations WHERE customer_id = ?`)
          .get(customer.id) as { id: number; ai_enabled: number; status: string } | undefined;

        if (!conv) {
          const convRes = db
            .prepare(`
              INSERT INTO conversations (customer_id, status, ai_enabled, unread_count, last_message_preview, last_message_at)
              VALUES (?, 'open', 1, 1, ?, datetime('now'))
            `)
            .run(customer.id, textBody.slice(0, 140));
          conv = { id: Number(convRes.lastInsertRowid), ai_enabled: 1, status: 'open' };
        } else {
          db.prepare(`
            UPDATE conversations
            SET unread_count = unread_count + 1,
                last_message_preview = ?,
                last_message_at = datetime('now')
            WHERE id = ?
          `).run(textBody.slice(0, 140), conv.id);
        }

        // Insert inbound message
        db.prepare(`
          INSERT INTO messages (conversation_id, customer_id, external_message_id, direction, sender_type, content, message_type, delivery_status)
          VALUES (?, ?, ?, 'inbound', 'customer', ?, ?, 'received')
        `).run(conv.id, customer.id, msg.id, textBody, msg.type || 'text');

        processedMessages += 1;
        createNotification('new_message', `Message from ${customer.name}`, textBody.slice(0, 120), 'info', {
          conversationId: conv.id,
          customerId: customer.id,
        });

        // Primary WhatsApp <-> n8n Link forwarding
        const link = getWhatsappN8nLink();
        const aiCfg = getAiSettings();
        const forwardedUrls = new Set<string>();

        if (link.enabled && link.forwardInbound && link.n8nWebhookUrl) {
          forwardedUrls.add(link.n8nWebhookUrl);
          void triggerWorkflowWebhook({
            workflowId: link.linkedWorkflowId ?? undefined,
            workflowName: 'WhatsApp <-> n8n Link (Inbound)',
            webhookUrl: link.n8nWebhookUrl,
            triggerSource: 'whatsapp_n8n_link',
            payload: {
              event: 'whatsapp_inbound',
              messageId: msg.id,
              customer: { id: customer.id, name: customer.name, whatsappNumber: waNumber },
              conversation: { id: conv.id, status: conv.status, aiEnabled: conv.ai_enabled === 1 },
              content: textBody,
              replyMode: link.replyMode,
              aiContext: {
                businessName: aiCfg.business_name,
                businessInfo: aiCfg.business_info,
                systemInstructions: aiCfg.system_instructions,
                personality: aiCfg.personality,
                languages: aiCfg.languages,
                fallbackResponse: aiCfg.fallback_response,
              },
              callback: {
                url: getCallbackUrl(),
                headerName: 'X-BS-Webhook-Secret',
              },
              timestamp: new Date().toISOString(),
            },
          }).then((r) => {
            if (r.ok) {
              db.prepare(`UPDATE whatsapp_n8n_links SET total_forwarded = total_forwarded + 1, status = 'connected', last_error = '' WHERE id = 1`).run();
            } else {
              db.prepare(`UPDATE whatsapp_n8n_links SET status = 'error', last_error = ? WHERE id = 1`).run(r.error || 'Forwarding failed');
            }
          });
        }

        // Also trigger any other active n8n workflows subscribed to whatsapp_inbound
        const activeWorkflows = db
          .prepare(`SELECT * FROM workflows WHERE is_active = 1 AND trigger_event = 'whatsapp_inbound' AND webhook_url != ''`)
          .all() as Array<{ id: number; name: string; webhook_url: string }>;

        for (const wf of activeWorkflows) {
          if (forwardedUrls.has(wf.webhook_url)) continue;
          forwardedUrls.add(wf.webhook_url);
          void triggerWorkflowWebhook({
            workflowId: wf.id,
            workflowName: wf.name,
            webhookUrl: wf.webhook_url,
            triggerSource: 'whatsapp_inbound',
            payload: {
              event: 'whatsapp_inbound',
              messageId: msg.id,
              customer: { id: customer.id, name: customer.name, whatsappNumber: waNumber },
              conversationId: conv.id,
              content: textBody,
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Gemini AI auto-reply (skipped if link handles reply via n8n_orchestrated or forward_only)
        const shouldBackendReply =
          !link.enabled || link.replyMode === 'backend_gemini';

        if (shouldBackendReply && aiCfg.enabled === 1 && conv.ai_enabled === 1 && conv.status !== 'human_handover' && hasGeminiApiKey()) {
          try {
            const history = db
              .prepare(`SELECT direction, sender_type, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 12`)
              .all(conv.id) as Array<{ direction: string; sender_type: string; content: string; created_at: string }>;
            history.reverse();

            const aiResult = await generateCustomerReply({
              customerMessage: textBody,
              customerName: customer.name,
              conversationHistory: history,
            });

            if (aiResult.requiresHumanHandover) {
              db.prepare(`UPDATE conversations SET status = 'human_handover', ai_enabled = 0 WHERE id = ?`).run(conv.id);
              createNotification(
                'human_handover',
                `Human Handover Requested: ${customer.name}`,
                aiResult.handoverReason || 'AI flagged conversation for human review.',
                'warning',
                { conversationId: conv.id, customerId: customer.id }
              );
            }

            await sendWhatsAppMessage({
              to: waNumber,
              text: aiResult.reply,
              conversationId: conv.id,
              customerId: customer.id,
              senderType: 'ai',
              aiIntent: aiResult.intent,
              aiConfidence: aiResult.confidence,
            });
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'AI reply generation failed';
            createNotification('api_error', 'Gemini AI Reply Error', errMsg, 'error', { conversationId: conv.id });
          }
        }
      }
    }
  }

  return { processedMessages, processedStatuses };
}

export async function testWhatsappN8nLink(): Promise<{
  ok: boolean;
  status?: number;
  responseBody?: string;
  error?: string;
}> {
  const link = getWhatsappN8nLink();
  if (!link.n8nWebhookUrl) {
    const err = 'Configuration Required: Enter an n8n Production Webhook URL to test the link.';
    db.prepare(`UPDATE whatsapp_n8n_links SET status = 'configuration_required', last_error = ?, last_linked_test_at = datetime('now') WHERE id = 1`).run(err);
    return { ok: false, error: err };
  }

  const result = await triggerWorkflowWebhook({
    workflowId: link.linkedWorkflowId ?? undefined,
    workflowName: 'WhatsApp <-> n8n Link Verification',
    webhookUrl: link.n8nWebhookUrl,
    triggerSource: 'whatsapp_n8n_link_test',
    payload: {
      event: 'whatsapp_n8n_link_test',
      replyMode: link.replyMode,
      callbackUrl: getCallbackUrl(),
      timestamp: new Date().toISOString(),
    },
  });

  if (result.ok) {
    db.prepare(`
      UPDATE whatsapp_n8n_links
      SET status = 'connected',
          last_error = '',
          last_linked_test_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = 1
    `).run();
    return { ok: true, status: result.status, responseBody: result.responseBody };
  }

  db.prepare(`
    UPDATE whatsapp_n8n_links
    SET status = 'error',
        last_error = ?,
        last_linked_test_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = 1
  `).run(result.error || 'Link test failed');
  return { ok: false, status: result.status, error: result.error };
}

export async function processN8nCallback(payload: {
  to?: string;
  conversationId?: number;
  replyText?: string;
  senderType?: 'ai' | 'human';
  aiIntent?: string;
  aiConfidence?: number;
  requiresHumanHandover?: boolean;
  handoverReason?: string;
  sendViaWhatsApp?: boolean;
  externalMessageId?: string;
}): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  let conv: { id: number; customer_id: number; whatsapp_number: string; customer_name: string } | undefined;

  if (payload.conversationId) {
    conv = db
      .prepare(`
        SELECT conv.id, conv.customer_id, c.whatsapp_number, c.name as customer_name
        FROM conversations conv
        JOIN customers c ON conv.customer_id = c.id
        WHERE conv.id = ?
      `)
      .get(Number(payload.conversationId)) as typeof conv;
  } else if (payload.to) {
    const cleanWa = String(payload.to).replace(/[^\d]/g, '');
    conv = db
      .prepare(`
        SELECT conv.id, conv.customer_id, c.whatsapp_number, c.name as customer_name
        FROM conversations conv
        JOIN customers c ON conv.customer_id = c.id
        WHERE c.whatsapp_number = ?
      `)
      .get(cleanWa) as typeof conv;
  }

  if (!conv) {
    return { ok: false, error: 'Target conversation or WhatsApp number not found in BS Management.' };
  }

  if (payload.requiresHumanHandover) {
    db.prepare(`UPDATE conversations SET status = 'human_handover', ai_enabled = 0 WHERE id = ?`).run(conv.id);
    createNotification(
      'human_handover',
      `n8n Requested Human Handover: ${conv.customer_name}`,
      payload.handoverReason || 'n8n workflow escalated conversation to a human agent.',
      'warning',
      { conversationId: conv.id, customerId: conv.customer_id }
    );
  }

  let messageId: number | undefined;
  const senderType: 'ai' | 'human' = payload.senderType === 'human' ? 'human' : 'ai';

  if (payload.replyText && payload.replyText.trim()) {
    if (payload.sendViaWhatsApp === false) {
      const info = db
        .prepare(`
          INSERT INTO messages (
            conversation_id, customer_id, external_message_id, direction, sender_type, content, message_type, delivery_status, ai_intent, ai_confidence
          ) VALUES (?, ?, ?, 'outbound', ?, ?, 'text', 'sent', ?, ?)
        `)
        .run(
          conv.id,
          conv.customer_id,
          payload.externalMessageId || null,
          senderType,
          payload.replyText.trim(),
          payload.aiIntent || '',
          payload.aiConfidence ?? null
        );
      messageId = Number(info.lastInsertRowid);
      updateConversationPreview(conv.id, conv.customer_id, payload.replyText.trim());
    } else {
      const sendRes = await sendWhatsAppMessage({
        to: conv.whatsapp_number,
        text: payload.replyText.trim(),
        conversationId: conv.id,
        customerId: conv.customer_id,
        senderType,
        aiIntent: payload.aiIntent,
        aiConfidence: payload.aiConfidence,
      });
      messageId = sendRes.messageId;
      if (!sendRes.ok) {
        return { ok: false, messageId, error: sendRes.error };
      }
    }
  }

  db.prepare(`UPDATE whatsapp_n8n_links SET total_callbacks = total_callbacks + 1, status = 'connected', updated_at = datetime('now') WHERE id = 1`).run();
  return { ok: true, messageId };
}

