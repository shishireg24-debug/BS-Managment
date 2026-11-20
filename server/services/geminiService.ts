import { GoogleGenAI, Type } from '@google/genai';
import { createNotification, db, updateIntegrationStatus } from '../db.ts';

export interface AiSettingsRow {
  id: number;
  enabled: number;
  model_name: string;
  business_name: string;
  business_info: string;
  system_instructions: string;
  personality: string;
  languages: string;
  fallback_response: string;
  handover_keywords: string;
  handover_rules: string;
  updated_at: string;
}

export interface AiReplyResult {
  reply: string;
  intent: string;
  language: string;
  requiresHumanHandover: boolean;
  handoverReason: string;
  confidence: number;
}

const ALLOWED_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function getAiSettings(): AiSettingsRow {
  return db.prepare(`SELECT * FROM ai_settings WHERE id = 1`).get() as AiSettingsRow;
}

export function hasGeminiApiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 10);
}

export async function testGeminiConnection(): Promise<{ ok: boolean; model: string; latencyMs: number; message?: string; error?: string }> {
  const settings = getAiSettings();
  const model = ALLOWED_MODELS.has(settings.model_name) ? settings.model_name : 'gemini-4-hydrogen';
  const start = Date.now();
  try {
    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model,
      contents: 'Reply with OK in one word.',
    });
    const latencyMs = Date.now() - start;
    const replyText = (response.text ?? '').trim();
    if (!replyText) {
      throw new Error('Empty response received from Gemini API.');
    }
    updateIntegrationStatus('gemini', 'connected', '', true);
    return { ok: true, model, latencyMs, message: `Verified (${replyText})` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Gemini connection test failed';
    updateIntegrationStatus('gemini', 'error', msg, true);
    createNotification('api_error', 'Gemini AI Connection Failed', msg, 'error');
    return { ok: false, model, latencyMs: Date.now() - start, error: msg };
  }
}

export async function generateCustomerReply(params: {
  customerMessage: string;
  customerName: string;
  conversationHistory: Array<{ direction: string; sender_type: string; content: string; created_at: string }>;
}): Promise<AiReplyResult> {
  const settings = getAiSettings();
  const model = ALLOWED_MODELS.has(settings.model_name) ? settings.model_name : 'gemini-4-hydrogen';

  let keywords: string[] = [];
  try {
    keywords = JSON.parse(settings.handover_keywords || '[]');
  } catch {
    keywords = [];
  }

  const lowerMsg = params.customerMessage.toLowerCase();
  const matchedKeyword = keywords.find((kw) => kw && lowerMsg.includes(kw.toLowerCase()));
  if (matchedKeyword) {
    return {
      reply: settings.fallback_response,
      intent: 'human_handover_request',
      language: /[\u0980-\u09FF]/.test(params.customerMessage) ? 'Bengali' : 'English',
      requiresHumanHandover: true,
      handoverReason: `Matched handover keyword: "${matchedKeyword}"`,
      confidence: 1.0,
    };
  }

  const ai = getGeminiClient();

  const systemInstruction = [
    `Business Name: ${settings.business_name || 'BS Management'}`,
    `Personality: ${settings.personality}`,
    `Supported Languages: ${settings.languages}`,
    `System Instructions:\n${settings.system_instructions}`,
    `Configured Business Information (SOURCE OF TRUTH):\n${settings.business_info || 'No business catalog, pricing, or policy details have been configured yet.'}`,
    `Human Handover Rules:\n${settings.handover_rules}`,
    `Fallback Response if information is unavailable:\n${settings.fallback_response}`,
    `CRITICAL GROUNDING RULES:`,
    `1. Answer ONLY using the Configured Business Information above. NEVER invent prices, stock availability, discounts, shipping policies, or business facts.`,
    `2. Reply in the same language the customer used (Bengali or English).`,
    `3. If the answer is not in Configured Business Information or requires human assistance, set requiresHumanHandover=true and use the Fallback Response politely in the customer's language.`,
  ].join('\n\n');

  const historyLines = params.conversationHistory
    .slice(-10)
    .map((m) => `${m.direction === 'inbound' ? 'Customer' : m.sender_type === 'ai' ? 'AI Agent' : 'Human Agent'}: ${m.content}`)
    .join('\n');

  const prompt = [
    `Customer Name: ${params.customerName}`,
    historyLines ? `Recent Conversation History:\n${historyLines}` : 'Recent Conversation History: None',
    `Latest Customer Message: ${params.customerMessage}`,
  ].join('\n\n');

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: { type: Type.STRING, description: 'The customer-facing reply in Bengali or English.' },
          intent: { type: Type.STRING, description: 'Short snake_case customer intent label.' },
          language: { type: Type.STRING, description: 'Detected language (e.g. English or Bengali).' },
          requiresHumanHandover: { type: Type.BOOLEAN, description: 'True if a human agent needs to take over.' },
          handoverReason: { type: Type.STRING, description: 'Reason for human handover if required, otherwise empty string.' },
          confidence: { type: Type.NUMBER, description: 'Confidence score from 0 to 1.' },
        },
        required: ['reply', 'intent', 'language', 'requiresHumanHandover', 'handoverReason', 'confidence'],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  const parsed = JSON.parse(rawText) as AiReplyResult;
  updateIntegrationStatus('gemini', 'connected', '', false);
  return parsed;
}
