import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Bot, Database, FileSpreadsheet, Globe, MessageSquare, RefreshCw, Save, Shield, UserPlus, Workflow } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { apiFetch, formatBytes, formatDateTime } from '../lib/api.ts';
import { AuthUser, IntegrationsPayload, PageId } from '../types.ts';

interface SettingsPageProps {
  refreshSignal: number;
  currentUser: AuthUser;
  onNavigate: (page: PageId) => void;
}

type SettingsTab = 'general' | 'whatsapp' | 'gemini' | 'n8n' | 'sheets' | 'database' | 'security' | 'notifications';

export const SettingsPage: React.FC<SettingsPageProps> = ({ refreshSignal, currentUser, onNavigate }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<IntegrationsPayload | null>(null);
  const [dbStats, setDbStats] = useState<{ engine: string; sizeBytes: number; tableCounts: Record<string, number> } | null>(
    null
  );
  const [securityLogs, setSecurityLogs] = useState<
    Array<{ id: number; event_type: string; actor_email: string; ip_address: string; details: string; created_at: string }>
  >([]);
  const [teamUsers, setTeamUsers] = useState<
    Array<{ id: number; name: string; email: string; role: string; is_active: number; last_login_at: string | null }>
  >([]);

  // WhatsApp Form
  const [waPhoneId, setWaPhoneId] = useState('');
  const [waWabaId, setWaWabaId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');
  const [waVerifyToken, setWaVerifyToken] = useState('');
  const [waAppSecret, setWaAppSecret] = useState('');

  // n8n Form
  const [n8nBaseUrl, setN8nBaseUrl] = useState('');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [n8nAuthType, setN8nAuthType] = useState<'none' | 'header_auth' | 'bearer' | 'basic'>('none');
  const [n8nAuthHeaderName, setN8nAuthHeaderName] = useState('X-N8N-API-KEY');
  const [n8nAuthValue, setN8nAuthValue] = useState('');
  const [n8nApiKey, setN8nApiKey] = useState('');

  // Sheets Form
  const [sheetsId, setSheetsId] = useState('');
  const [sheetsName, setSheetsName] = useState('');
  const [sheetsTab, setSheetsTab] = useState('');
  const [sheetsWebhook, setSheetsWebhook] = useState('');

  // New team user form
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'operator'>('operator');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(async () => {
    const [settingsRes, intRes] = await Promise.all([
      apiFetch<{
        settings: Record<string, string>;
        database: { engine: string; sizeBytes: number; tableCounts: Record<string, number> };
        securityLogs: Array<{
          id: number;
          event_type: string;
          actor_email: string;
          ip_address: string;
          details: string;
          created_at: string;
        }>;
      }>('/api/settings'),
      apiFetch<IntegrationsPayload>('/api/integrations'),
    ]);

    setAppSettings(settingsRes.settings);
    setDbStats(settingsRes.database);
    setSecurityLogs(settingsRes.securityLogs);
    setIntegrations(intRes);

    const wa = intRes.integrations.whatsapp.config;
    setWaPhoneId(wa.phoneNumberId || '');
    setWaWabaId(wa.businessAccountId || '');
    setWaAccessToken(wa.accessTokenMasked || '');
    setWaVerifyToken(wa.verifyTokenMasked || '');
    setWaAppSecret(wa.appSecretMasked || '');

    const n8n = intRes.integrations.n8n.config;
    setN8nBaseUrl(n8n.baseUrl || '');
    setN8nWebhookUrl(n8n.webhookUrl || '');
    setN8nAuthType(n8n.authType || 'none');
    setN8nAuthHeaderName(n8n.authHeaderName || 'X-N8N-API-KEY');
    setN8nAuthValue(n8n.authValueMasked || '');
    setN8nApiKey(n8n.apiKeyMasked || '');

    const sh = intRes.integrations.google_sheets.config;
    setSheetsId(sh.spreadsheetId || '');
    setSheetsName(sh.spreadsheetName || '');
    setSheetsTab(sh.worksheetName || '');
    setSheetsWebhook(sh.n8nSyncWebhookUrl || '');

    if (currentUser.role !== 'operator') {
      try {
        const usersRes = await apiFetch<{
          users: Array<{ id: number; name: string; email: string; role: string; is_active: number; last_login_at: string | null }>;
        }>('/api/auth/users');
        setTeamUsers(usersRes.users);
      } catch {
        setTeamUsers([]);
      }
    }
  }, [currentUser.role]);

  useEffect(() => {
    void loadAll();
  }, [loadAll, refreshSignal]);

  const clearBanner = () => {
    setMsg('');
    setErr('');
  };

  const saveAppSettings = async (patch: Record<string, string>) => {
    clearBanner();
    setBusy(true);
    try {
      const res = await apiFetch<{ settings: Record<string, string> }>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setAppSettings(res.settings);
      setMsg('Settings updated.');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to update settings');
    } finally {
      setBusy(false);
    }
  };

  const saveIntegration = async (key: 'whatsapp' | 'n8n' | 'google_sheets', payload: Record<string, string>) => {
    clearBanner();
    setBusy(true);
    try {
      await apiFetch(`/api/integrations/${key}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setMsg(`${key.toUpperCase()} configuration saved securely.`);
      await loadAll();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to save credentials');
    } finally {
      setBusy(false);
    }
  };

  const testIntegration = async (key: 'whatsapp' | 'n8n' | 'gemini' | 'google_sheets') => {
    clearBanner();
    setBusy(true);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; verifiedName?: string }>(`/api/integrations/${key}/test`, {
        method: 'POST',
      });
      setMsg(res.message || (res.verifiedName ? `Connected: ${res.verifiedName}` : 'Connection verified.'));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setBusy(false);
      await loadAll();
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    clearBanner();
    setBusy(true);
    try {
      await apiFetch('/api/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPass,
          role: newUserRole,
        }),
      });
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPass('');
      setMsg('Team member account created.');
      await loadAll();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Failed to create team account');
    } finally {
      setBusy(false);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'general', label: 'A. General', icon: Globe },
    { id: 'whatsapp', label: 'B. WhatsApp API', icon: MessageSquare },
    { id: 'gemini', label: 'C. Gemini AI', icon: Bot },
    { id: 'n8n', label: 'D. n8n Integration', icon: Workflow },
    { id: 'sheets', label: 'E. Google Sheets', icon: FileSpreadsheet },
    { id: 'database', label: 'F. Database', icon: Database },
    { id: 'security', label: 'G. Security', icon: Shield },
    { id: 'notifications', label: 'H. Notifications', icon: Bell },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Settings Navigation */}
      <div className="lg:col-span-3 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-3 h-fit space-y-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                clearBanner();
                setActiveTab(t.id);
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                active
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right Settings Panel */}
      <div className="lg:col-span-9 space-y-4">
        {msg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300">
            {msg}
          </div>
        )}
        {err && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {err}
          </div>
        )}

        <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-xs space-y-5">
          {/* A. General Settings */}
          {activeTab === 'general' && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                A. General Settings
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Platform / Business Name</label>
                  <input
                    type="text"
                    value={appSettings.company_name || 'BS Management'}
                    onChange={(e) => setAppSettings({ ...appSettings, company_name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Operational Timezone</label>
                  <input
                    type="text"
                    value={appSettings.timezone || 'Asia/Dhaka'}
                    onChange={(e) => setAppSettings({ ...appSettings, timezone: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Default Language</label>
                  <select
                    value={appSettings.default_language || 'en'}
                    onChange={(e) => setAppSettings({ ...appSettings, default_language: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  >
                    <option value="en">English</option>
                    <option value="bn">Bengali (বাংলা)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Date Format</label>
                  <input
                    type="text"
                    value={appSettings.date_format || 'YYYY-MM-DD HH:mm'}
                    onChange={(e) => setAppSettings({ ...appSettings, date_format: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveAppSettings(appSettings)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save General Settings</span>
              </button>
            </div>
          )}

          {/* B. WhatsApp API Settings */}
          {activeTab === 'whatsapp' && integrations && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  B. Meta WhatsApp Business Cloud API Settings
                </h2>
                <StatusText status={integrations.integrations.whatsapp.status} />
              </div>
              <p className="text-slate-500">
                Credentials are encrypted at rest on the backend using AES-256-GCM and never exposed to browser scripts.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Phone Number ID *</label>
                  <input
                    type="text"
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    placeholder="e.g. 104928374612345"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    WhatsApp Business Account ID
                  </label>
                  <input
                    type="text"
                    value={waWabaId}
                    onChange={(e) => setWaWabaId(e.target.value)}
                    placeholder="Optional WABA ID"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Permanent System User Access Token *
                </label>
                <input
                  type="password"
                  value={waAccessToken}
                  onChange={(e) => setWaAccessToken(e.target.value)}
                  placeholder="EAAG..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Webhook Verify Token *
                  </label>
                  <input
                    type="password"
                    value={waVerifyToken}
                    onChange={(e) => setWaVerifyToken(e.target.value)}
                    placeholder="Custom secret verify token"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Meta App Secret (for HMAC Signature Verification)
                  </label>
                  <input
                    type="password"
                    value={waAppSecret}
                    onChange={(e) => setWaAppSecret(e.target.value)}
                    placeholder="Meta App Secret"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveIntegration('whatsapp', {
                      phoneNumberId: waPhoneId,
                      businessAccountId: waWabaId,
                      accessToken: waAccessToken,
                      verifyToken: waVerifyToken,
                      appSecret: waAppSecret,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save WhatsApp Credentials</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void testIntegration('whatsapp')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Test Connection</span>
                </button>
              </div>
            </div>
          )}

          {/* C. Gemini AI Settings */}
          {activeTab === 'gemini' && integrations && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  C. Google Gemini AI Settings
                </h2>
                <StatusText status={integrations.integrations.gemini.status} />
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Gemini AI runs exclusively on the secure Express backend using the runtime <code className="font-mono">GEMINI_API_KEY</code> secret managed in your AI Studio Secrets panel.
              </p>
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                <p>
                  <span className="text-slate-500">Server Secret Status:</span>{' '}
                  <span className="font-medium text-slate-900 dark:text-white">
                    {integrations.integrations.gemini.configuredViaEnv ? 'Configured in Environment' : 'Missing'}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Active Model:</span>{' '}
                  <span className="font-mono text-slate-900 dark:text-white">{integrations.integrations.gemini.modelName}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void testIntegration('gemini')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Test Gemini Connection</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('ai-agent')}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Open AI Agent Instructions &amp; Business Info
                </button>
              </div>
            </div>
          )}

          {/* D. n8n Integration Settings */}
          {activeTab === 'n8n' && integrations && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  D. n8n Integration Settings
                </h2>
                <StatusText status={integrations.integrations.n8n.status} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">n8n Base URL</label>
                  <input
                    type="url"
                    value={n8nBaseUrl}
                    onChange={(e) => setN8nBaseUrl(e.target.value)}
                    placeholder="https://n8n.yourdomain.com"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Default Production Webhook URL
                  </label>
                  <input
                    type="url"
                    value={n8nWebhookUrl}
                    onChange={(e) => setN8nWebhookUrl(e.target.value)}
                    placeholder="https://n8n.yourdomain.com/webhook/..."
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Webhook Authentication Type
                  </label>
                  <select
                    value={n8nAuthType}
                    onChange={(e) => setN8nAuthType(e.target.value as 'none' | 'header_auth' | 'bearer' | 'basic')}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="none">None</option>
                    <option value="header_auth">Header Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="basic">Basic Auth (user:pass)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Header Name</label>
                  <input
                    type="text"
                    value={n8nAuthHeaderName}
                    onChange={(e) => setN8nAuthHeaderName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Webhook Auth Credential
                  </label>
                  <input
                    type="password"
                    value={n8nAuthValue}
                    onChange={(e) => setN8nAuthValue(e.target.value)}
                    placeholder="Token or secret"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  n8n REST API Key (for syncing &amp; toggling workflows)
                </label>
                <input
                  type="password"
                  value={n8nApiKey}
                  onChange={(e) => setN8nApiKey(e.target.value)}
                  placeholder="n8n_api_..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveIntegration('n8n', {
                      baseUrl: n8nBaseUrl,
                      webhookUrl: n8nWebhookUrl,
                      authType: n8nAuthType,
                      authHeaderName: n8nAuthHeaderName,
                      authValue: n8nAuthValue,
                      apiKey: n8nApiKey,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save n8n Configuration</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void testIntegration('n8n')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Test &amp; Sync n8n</span>
                </button>
              </div>
            </div>
          )}

          {/* E. Google Sheets Settings */}
          {activeTab === 'sheets' && integrations && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  E. Google Sheets Settings
                </h2>
                <StatusText status={integrations.integrations.google_sheets.status} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Spreadsheet ID</label>
                  <input
                    type="text"
                    value={sheetsId}
                    onChange={(e) => setSheetsId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Spreadsheet Name</label>
                  <input
                    type="text"
                    value={sheetsName}
                    onChange={(e) => setSheetsName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Worksheet Name</label>
                  <input
                    type="text"
                    value={sheetsTab}
                    onChange={(e) => setSheetsTab(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    n8n Google Sheets Sync Webhook URL
                  </label>
                  <input
                    type="url"
                    value={sheetsWebhook}
                    onChange={(e) => setSheetsWebhook(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void saveIntegration('google_sheets', {
                      syncMode: sheetsId && sheetsWebhook ? 'n8n_webhook' : 'not_configured',
                      spreadsheetId: sheetsId,
                      spreadsheetName: sheetsName,
                      worksheetName: sheetsTab,
                      n8nSyncWebhookUrl: sheetsWebhook,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Sheets Settings</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void testIntegration('google_sheets')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Test Connection</span>
                </button>
              </div>
            </div>
          )}

          {/* F. Database Settings */}
          {activeTab === 'database' && dbStats && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                F. Database Settings &amp; Storage Metrics
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Database Engine</p>
                  <p className="font-mono font-semibold text-slate-900 dark:text-white mt-1">{dbStats.engine}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-slate-500">Persistent File Size</p>
                  <p className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-1">
                    {formatBytes(dbStats.sizeBytes)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(dbStats.tableCounts).map(([table, count]) => (
                  <div
                    key={table}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                  >
                    <p className="text-[11px] text-slate-500 capitalize">{table}</p>
                    <p className="font-mono tabular-nums text-lg font-semibold text-slate-900 dark:text-white mt-0.5">
                      {count}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* G. Security Settings */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  G. Security &amp; Access Control
                </h2>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.require_webhook_signature !== 'false'}
                    onChange={(e) =>
                      setAppSettings({ ...appSettings, require_webhook_signature: e.target.checked ? 'true' : 'false' })
                    }
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                  />
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    Enforce Meta X-Hub-Signature-256 HMAC verification when App Secret is configured
                  </span>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveAppSettings(appSettings)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Security Policy</span>
                </button>
              </div>

              {currentUser.role !== 'operator' && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    Team Accounts (RBAC)
                  </h3>
                  <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <input
                      type="text"
                      required
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      placeholder="Full Name"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="email"
                      required
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      placeholder="Email"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newUserPass}
                      onChange={(e) => setNewUserPass(e.target.value)}
                      placeholder="Password (8+ chars)"
                      className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <div className="flex gap-2">
                      <select
                        value={newUserRole}
                        onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'operator')}
                        className="flex-1 px-2.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                      >
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </form>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500">
                          <th className="py-2.5 px-3">Name</th>
                          <th className="py-2.5 px-3">Email</th>
                          <th className="py-2.5 px-3">Role</th>
                          <th className="py-2.5 px-3 text-right">Last Login</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {teamUsers.map((u) => (
                          <tr key={u.id}>
                            <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">{u.name}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-300">{u.email}</td>
                            <td className="py-2.5 px-3 capitalize">{u.role.replace('_', ' ')}</td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-500">
                              {formatDateTime(u.last_login_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-2.5">
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  Recent Security Audit Log
                </h3>
                {securityLogs.length === 0 ? (
                  <p className="text-slate-500">No security events recorded.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                    {securityLogs.map((log) => (
                      <div key={log.id} className="p-2.5 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-mono font-medium text-slate-900 dark:text-white">{log.event_type}</span>
                          <span className="text-slate-500 ml-2">{log.actor_email}</span>
                          {log.details && <p className="text-slate-500">{log.details}</p>}
                        </div>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* H. Notification Settings */}
          {activeTab === 'notifications' && (
            <div className="space-y-4">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                H. Notification Preferences
              </h2>
              <div className="space-y-3">
                {[
                  { key: 'notify_new_message', label: 'New Incoming WhatsApp Message alerts' },
                  { key: 'notify_workflow_failed', label: 'Failed n8n Workflow alerts' },
                  { key: 'notify_api_error', label: 'API Connection Failure alerts' },
                  { key: 'notify_human_handover', label: 'AI Human Handover Request alerts' },
                  { key: 'notify_sync_failure', label: 'Google Sheets Synchronization Failure alerts' },
                ].map((pref) => (
                  <label key={pref.key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings[pref.key] !== 'false'}
                      onChange={(e) =>
                        setAppSettings({ ...appSettings, [pref.key]: e.target.checked ? 'true' : 'false' })
                      }
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                    />
                    <span className="text-slate-700 dark:text-slate-200">{pref.label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveAppSettings(appSettings)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Notification Preferences</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
