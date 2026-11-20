import React, { useState } from 'react';
import { ArrowRight, Bot, Lock, Mail, MessageSquare, Moon, ShieldCheck, Sun, User as UserIcon, Workflow } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { AuthUser } from '../types.ts';
import { BrandMark } from './BrandMark.tsx';

interface AuthPageProps {
  hasUsers: boolean;
  darkMode: boolean;
  onToggleDark: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ hasUsers, darkMode, onToggleDark, onAuthenticated }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = hasUsers ? '/api/auth/login' : '/api/auth/setup';
      const body = hasUsers ? { email, password } : { name, email, password };
      const res = await apiFetch<{ user: AuthUser }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onAuthenticated(res.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
      {/* Left Architectural Brand Panel */}
      <div className="lg:w-[46%] bg-[#0B1120] text-white p-8 lg:p-14 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="flex items-center justify-between">
          <BrandMark lightText />
          <button
            type="button"
            onClick={onToggleDark}
            aria-label="Toggle color theme"
            className="p-2 rounded-lg border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        <div className="my-12 lg:my-0 max-w-lg">
          <p className="text-xs font-medium tracking-wide text-emerald-400 mb-3">
            Enterprise Automation Platform
          </p>
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight text-white mb-4" style={{ textWrap: 'balance' }}>
            Unified WhatsApp, Gemini AI, and n8n Operations
          </h1>
          <p className="text-sm leading-relaxed text-slate-300 mb-8">
            Manage real-time customer conversations through Meta WhatsApp Business Cloud API, orchestrate published n8n workflows, govern bilingual AI support replies, and audit CRM data from one secure console.
          </p>

          <div className="space-y-4 border-t border-slate-800 pt-6">
            <div className="flex items-start gap-3">
              <MessageSquare className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Official Meta Cloud API</p>
                <p className="text-xs text-slate-400">Verified webhooks, delivery receipts, deduplication, and human handover.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Workflow className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">n8n Workflow Orchestration</p>
                <p className="text-xs text-slate-400">Trigger production webhooks, monitor executions, and retry failed runs.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Bot className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">Grounded Gemini AI Agent</p>
                <p className="text-xs text-slate-400">Bengali and English responses strictly grounded in configured business records.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/80 pt-6">
          <span>BS Management</span>
          <span>Encrypted Server Sessions</span>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-8">
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>{hasUsers ? 'Administrator Access' : 'Initial Workspace Setup'}</span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {hasUsers ? 'Sign in to BS Management' : 'Create Administrator Account'}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              {hasUsers
                ? 'Enter your credentials to access your business automation console.'
                : 'Set up the primary Super Admin account to secure this BS Management instance.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!hasUsers && (
              <div>
                <label htmlFor="setup-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="setup-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Administrator Name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={hasUsers ? 'Enter password' : 'Minimum 8 characters'}
                  className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors whitespace-nowrap"
            >
              <span>{loading ? 'Authenticating...' : hasUsers ? 'Sign In' : 'Create Admin Account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
