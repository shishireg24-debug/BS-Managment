import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Play, Save, ShieldAlert } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { AiSettings, IntegrationStatus } from '../types.ts';

interface AiAgentPageProps {
  refreshSignal: number;
}

export const AiAgentPage: React.FC<AiAgentPageProps> = ({ refreshSignal }) => {
  const [enabled, setEnabled] = useState(false);
  const [modelName, setModelName] = useState('gemini-4-hydrogen');
  const [businessName, setBusinessName] = useState('BS Management');
  const [businessInfo, setBusinessInfo] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [personality, setPersonality] = useState('');
  const [languages, setLanguages] = useState('Bengali & English');
  const [fallbackResponse, setFallbackResponse] = useState('');
  const [handoverKeywords, setHandoverKeywords] = useState('');
  const [handoverRules, setHandoverRules] = useState('');

  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [status, setStatus] = useState<IntegrationStatus>('configuration_required');
  const [lastTestedAt, setLastTestedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [testingConn, setTestingConn] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  const [previewInput, setPreviewInput] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOutput, setPreviewOutput] = useState<{
    reply: string;
    intent: string;
    language: string;
    requiresHumanHandover: boolean;
    handoverReason: string;
    confidence: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState('');

  const loadSettings = async () => {
    const res = await apiFetch<{
      settings: AiSettings;
      geminiConfigured: boolean;
      integrationStatus: IntegrationStatus;
      lastTestedAt: string | null;
      lastError: string;
    }>('/api/ai/settings');

    const s = res.settings;
    setEnabled(s.enabled === 1);
    setModelName(s.model_name || 'gemini-4-hydrogen');
    setBusinessName(s.business_name || 'BS Management');
    setBusinessInfo(s.business_info || '');
    setSystemInstructions(s.system_instructions || '');
    setPersonality(s.personality || '');
    setLanguages(s.languages || 'Bengali & English');
    setFallbackResponse(s.fallback_response || '');
    try {
      const kws = JSON.parse(s.handover_keywords || '[]');
      setHandoverKeywords(Array.isArray(kws) ? kws.join(', ') : '');
    } catch {
      setHandoverKeywords('');
    }
    setHandoverRules(s.handover_rules || '');

    setGeminiConfigured(res.geminiConfigured);
    setStatus(res.integrationStatus);
    setLastTestedAt(res.lastTestedAt);
    setLastError(res.lastError);
  };

  useEffect(() => {
    void loadSettings();
  }, [refreshSignal]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    try {
      await apiFetch('/api/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({
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
        }),
      });
      setSaveMessage('AI Agent configuration saved.');
      await loadSettings();
    } catch (err: unknown) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setTestResult(null);
    try {
      const res = await apiFetch<{ ok: boolean; message?: string; error?: string }>('/api/ai/test', {
        method: 'POST',
      });
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'Connection test failed' });
    } finally {
      setTestingConn(false);
      await loadSettings();
    }
  };

  const handleTestPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewInput.trim()) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewOutput(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        result: {
          reply: string;
          intent: string;
          language: string;
          requiresHumanHandover: boolean;
          handoverReason: string;
          confidence: number;
        };
      }>('/api/ai/preview', {
        method: 'POST',
        body: JSON.stringify({ message: previewInput.trim() }),
      });
      setPreviewOutput(res.result);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : 'Failed to generate AI preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Status Card */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-white">
              Google Gemini AI Customer Support Agent
            </h2>
            <StatusText status={status} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {geminiConfigured
              ? 'Server-side GEMINI_API_KEY detected. Strictly grounded in your configured Business Information.'
              : 'GEMINI_API_KEY environment secret is missing. Set it in your Secrets panel to enable Gemini AI.'}
          </p>
          {lastTestedAt && (
            <p className="text-[11px] font-mono text-slate-400 mt-1">
              Last tested: {formatDateTime(lastTestedAt)} {lastError ? `· Error: ${lastError}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testingConn}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            {testingConn ? 'Testing Gemini...' : 'Test Gemini Connection'}
          </button>

          <button
            type="button"
            onClick={() => setEnabled((prev) => !prev)}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              enabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {enabled ? 'AI Auto-Reply: ON' : 'AI Auto-Reply: OFF'}
          </button>
        </div>
      </div>

      {testResult && (
        <div
          className={`p-3.5 rounded-xl border text-xs ${
            testResult.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
          }`}
        >
          {testResult.ok ? testResult.message : testResult.error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Main Configuration Form */}
        <form
          onSubmit={handleSave}
          className="xl:col-span-8 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Gemini Model
              </label>
              <select
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="gemini-4-hydrogen">gemini-4-hydrogen (Recommended)</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Lite)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Configured Business Information (Source of Truth)
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
              Enter actual products, prices, delivery policies, hours, and FAQs. Gemini is strictly prohibited from inventing any business details outside this text.
            </p>
            <textarea
              rows={5}
              value={businessInfo}
              onChange={(e) => setBusinessInfo(e.target.value)}
              placeholder="Example: Business Hours: 9 AM - 8 PM (Sat-Thu). Delivery charge: 60 BDT inside Dhaka..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              System Instructions
            </label>
            <textarea
              rows={4}
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Custom AI Personality
              </label>
              <input
                type="text"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Language Support
              </label>
              <select
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="Bengali & English">Bengali &amp; English (Auto-detect)</option>
                <option value="Bengali Only">Bengali Only</option>
                <option value="English Only">English Only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Fallback Response (When info is unavailable)
            </label>
            <textarea
              rows={2}
              value={fallbackResponse}
              onChange={(e) => setFallbackResponse(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Human Handover Trigger Keywords (comma separated)
              </label>
              <input
                type="text"
                value={handoverKeywords}
                onChange={(e) => setHandoverKeywords(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Human Handover Rules
              </label>
              <input
                type="text"
                value={handoverRules}
                onChange={(e) => setHandoverRules(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-emerald-700 dark:text-emerald-400">{saveMessage}</span>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save AI Configuration'}</span>
            </button>
          </div>
        </form>

        {/* Right: Live Grounded Reply Sandbox */}
        <div className="xl:col-span-4 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            Test AI Agent Reply
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Send a sample Bengali or English customer query to verify intent detection, grounding, and handover behavior using your saved configuration.
          </p>

          <form onSubmit={handleTestPreview} className="space-y-3">
            <textarea
              rows={3}
              value={previewInput}
              onChange={(e) => setPreviewInput(e.target.value)}
              placeholder="e.g. আপনার ডেলিভারি চার্জ কত? or What are your opening hours?"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={previewLoading || !previewInput.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#0F172A] dark:bg-emerald-600 hover:opacity-90 disabled:opacity-50 text-white text-xs font-medium transition-opacity"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{previewLoading ? 'Generating Response...' : 'Run Live Gemini Test'}</span>
            </button>
          </form>

          {previewError && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {previewError}
            </div>
          )}

          {previewOutput && (
            <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
              <div>
                <p className="text-[11px] font-medium text-slate-500 mb-1">Generated Reply</p>
                <p className="text-sm text-slate-900 dark:text-white whitespace-pre-wrap">{previewOutput.reply}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-500">Intent:</span>{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">{previewOutput.intent}</span>
                </div>
                <div>
                  <span className="text-slate-500">Language:</span>{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200">{previewOutput.language}</span>
                </div>
                <div>
                  <span className="text-slate-500">Confidence:</span>{' '}
                  <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                    {Math.round(previewOutput.confidence * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {previewOutput.requiresHumanHandover ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                      <ShieldAlert className="w-3.5 h-3.5" /> Handover
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Auto-handled
                    </span>
                  )}
                </div>
              </div>
              {previewOutput.handoverReason && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">
                  Reason: {previewOutput.handoverReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
