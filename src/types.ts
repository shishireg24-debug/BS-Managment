export type UserRole = 'super_admin' | 'admin' | 'operator';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export type PageId =
  | 'overview'
  | 'inbox'
  | 'ai-agent'
  | 'customers'
  | 'automations'
  | 'google-sheets'
  | 'analytics'
  | 'notifications'
  | 'integrations'
  | 'settings';

export type IntegrationStatus = 'connected' | 'not_connected' | 'configuration_required' | 'error';

export interface DashboardSummary {
  metrics: {
    totalCustomers: number;
    totalMessages: number;
    incomingMessages: number;
    outgoingMessages: number;
    aiGeneratedReplies: number;
    activeAutomations: number;
    failedAutomations: number;
    totalAutomationRuns: number;
    successAutomationRuns: number;
    todayActivity: number;
    monthlyActivity: number;
    thisMonthCustomers: number;
    customerGrowthPct: number | null;
    unreadNotifications: number;
  };
  charts: {
    dailyMessagesSeries: Array<{
      day: string;
      incoming: number;
      outgoing: number;
      ai_replies: number;
    }>;
    monthlyGrowthSeries: Array<{
      month: string;
      new_customers: number;
    }>;
    aiReplyStats: {
      totalAiReplies: number;
      totalHumanReplies: number;
      handoverCount: number;
      avgConfidence: number | null;
    };
  };
  integrations: Array<{
    key: string;
    status: IntegrationStatus;
    last_tested_at: string | null;
    last_error: string;
  }>;
}

export interface Customer {
  id: number;
  name: string;
  phone_number: string;
  whatsapp_number: string;
  email: string;
  tags: string;
  notes: string;
  status: 'active' | 'lead' | 'inactive' | 'blocked';
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: number;
  customer_id: number;
  status: 'open' | 'resolved' | 'human_handover';
  ai_enabled: number;
  unread_count: number;
  last_message_preview: string;
  last_message_at: string | null;
  customer_name: string;
  phone_number: string;
  whatsapp_number: string;
  tags: string;
  notes?: string;
  customer_status: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  customer_id: number;
  external_message_id: string | null;
  direction: 'inbound' | 'outbound';
  sender_type: 'customer' | 'ai' | 'human';
  content: string;
  message_type: string;
  delivery_status: 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  error_message: string;
  ai_intent: string;
  ai_confidence: number | null;
  created_at: string;
}

export interface AiSettings {
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

export interface WorkflowItem {
  id: number;
  n8n_workflow_id: string;
  name: string;
  webhook_url: string;
  trigger_event: string;
  is_active: number;
  last_execution_at: string | null;
  last_execution_status: string;
  last_error: string;
  execution_count: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  id: number;
  workflow_id: number | null;
  workflow_name: string;
  trigger_source: string;
  status: 'success' | 'failed' | 'running' | 'pending';
  request_payload: string;
  response_payload: string;
  error_message: string;
  duration_ms: number;
  created_at: string;
}

export interface NotificationItem {
  id: number;
  type: 'new_message' | 'workflow_failed' | 'api_error' | 'new_customer' | 'human_handover' | 'sync_failure';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  is_read: number;
  metadata_json: string;
  created_at: string;
}

export interface IntegrationsPayload {
  webhookCallbackUrl: string;
  integrations: {
    whatsapp: {
      status: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
      config: {
        phoneNumberId: string;
        businessAccountId: string;
        accessTokenMasked: string;
        hasAccessToken: boolean;
        verifyTokenMasked: string;
        hasVerifyToken: boolean;
        appSecretMasked: string;
        hasAppSecret: boolean;
      };
    };
    n8n: {
      status: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
      config: {
        baseUrl: string;
        webhookUrl: string;
        authType: 'none' | 'header_auth' | 'bearer' | 'basic';
        authHeaderName: string;
        authValueMasked: string;
        hasAuthValue: boolean;
        apiKeyMasked: string;
        hasApiKey: boolean;
      };
    };
    gemini: {
      status: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
      configuredViaEnv: boolean;
      modelName: string;
    };
    google_sheets: {
      status: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
      config: {
        syncMode: 'not_configured' | 'n8n_webhook';
        spreadsheetId: string;
        spreadsheetName: string;
        worksheetName: string;
        n8nSyncWebhookUrl: string;
      };
    };
  };
}

export interface SheetSyncLog {
  id: number;
  category: string;
  spreadsheet_id: string;
  worksheet_name: string;
  records_synced: number;
  status: 'success' | 'failed';
  error_message: string;
  created_at: string;
}

export interface WhatsappN8nLinkPayload {
  link: {
    enabled: boolean;
    replyMode: 'backend_gemini' | 'n8n_orchestrated' | 'forward_only';
    n8nWebhookUrl: string;
    linkedWorkflowId: number | null;
    forwardInbound: boolean;
    forwardOutbound: boolean;
    forwardStatuses: boolean;
    callbackSecret: string;
    status: IntegrationStatus;
    lastLinkedTestAt: string | null;
    lastError: string;
    totalForwarded: number;
    totalCallbacks: number;
    updatedAt: string;
  };
  whatsappStatus: IntegrationStatus;
  n8nStatus: IntegrationStatus;
  workflows: Array<{
    id: number;
    n8n_workflow_id: string;
    name: string;
    webhook_url: string;
    is_active: number;
  }>;
  endpoints: {
    whatsappWebhookUrl: string;
    n8nCallbackUrl: string;
  };
}

