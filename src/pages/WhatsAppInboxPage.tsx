import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, CheckCheck, MessageSquare, Search, Send, UserCheck, XCircle } from 'lucide-react';
import { StatusText } from '../components/StatusText.tsx';
import { apiFetch, formatDateTime } from '../lib/api.ts';
import { Conversation, IntegrationStatus, Message, PageId } from '../types.ts';

interface WhatsAppInboxPageProps {
  refreshSignal: number;
  onNavigate: (page: PageId) => void;
}

export const WhatsAppInboxPage: React.FC<WhatsAppInboxPageProps> = ({ refreshSignal, onNavigate }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [whatsappStatus, setWhatsappStatus] = useState<IntegrationStatus>('configuration_required');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [loadingList, setLoadingList] = useState(true);

  const loadConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch<{ conversations: Conversation[]; whatsappStatus: IntegrationStatus }>(
        `/api/conversations?${params.toString()}`
      );
      setConversations(res.conversations);
      setWhatsappStatus(res.whatsappStatus);
    } finally {
      setLoadingList(false);
    }
  }, [search, statusFilter]);

  const loadMessages = useCallback(async (convId: number) => {
    const res = await apiFetch<{ conversation: Conversation; messages: Message[] }>(
      `/api/conversations/${convId}/messages`
    );
    setActiveConv(res.conversation);
    setMessages(res.messages);
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations, refreshSignal]);

  useEffect(() => {
    if (selectedId !== null) {
      void loadMessages(selectedId);
    }
  }, [selectedId, loadMessages, refreshSignal]);

  // Real-time inbox refresh polling every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      void loadConversations();
      if (selectedId !== null) {
        void loadMessages(selectedId);
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [loadConversations, loadMessages, selectedId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      await apiFetch(`/api/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text: draft.trim() }),
      });
      setDraft('');
      await Promise.all([loadMessages(selectedId), loadConversations()]);
    } catch (err: unknown) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message');
      await loadMessages(selectedId);
    } finally {
      setSending(false);
    }
  };

  const handleToggleAi = async () => {
    if (!activeConv) return;
    const nextAi = activeConv.ai_enabled !== 1;
    await apiFetch(`/api/conversations/${activeConv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ aiEnabled: nextAi, status: nextAi ? 'open' : 'human_handover' }),
    });
    await Promise.all([loadMessages(activeConv.id), loadConversations()]);
  };

  const handleChangeStatus = async (status: 'open' | 'resolved' | 'human_handover') => {
    if (!activeConv) return;
    await apiFetch(`/api/conversations/${activeConv.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    await Promise.all([loadMessages(activeConv.id), loadConversations()]);
  };

  const renderDeliveryIcon = (msg: Message) => {
    if (msg.direction === 'inbound') return null;
    if (msg.delivery_status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1 text-red-500" title={msg.error_message || 'Delivery failed'}>
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    }
    if (msg.delivery_status === 'read') {
      return (
        <span className="inline-flex items-center gap-0.5 text-emerald-500">
          <CheckCheck className="w-3 h-3" /> Read
        </span>
      );
    }
    if (msg.delivery_status === 'delivered') {
      return (
        <span className="inline-flex items-center gap-0.5 text-slate-400">
          <CheckCheck className="w-3 h-3" /> Delivered
        </span>
      );
    }
    if (msg.delivery_status === 'sent') {
      return (
        <span className="inline-flex items-center gap-0.5 text-slate-400">
          <Check className="w-3 h-3" /> Sent
        </span>
      );
    }
    return <span className="text-slate-400 capitalize">{msg.delivery_status}</span>;
  };

  return (
    <div className="space-y-4">
      {whatsappStatus !== 'connected' && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">WhatsApp Business Cloud API: Configuration Required</p>
              <p className="mt-0.5">
                Configure your Meta Access Token, Phone Number ID, and Webhook Verify Token in Settings to receive and send live WhatsApp messages.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium whitespace-nowrap self-start sm:self-center"
          >
            Configure WhatsApp API
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[620px]">
        {/* Left: Customer List */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col">
          <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-900 dark:text-white">Conversations</span>
              <StatusText status={whatsappStatus} />
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer or message..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
              {[
                { id: 'all', label: 'All' },
                { id: 'open', label: 'Open' },
                { id: 'human_handover', label: 'Handover' },
                { id: 'resolved', label: 'Resolved' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70">
            {loadingList ? (
              <div className="p-6 text-xs text-slate-500 text-center">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No Data Available</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Incoming WhatsApp messages or CRM contacts will appear here.
                </p>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    selectedId === conv.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {conv.customer_name}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                      {formatDateTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {conv.last_message_preview || `+${conv.whatsapp_number}`}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-mono tabular-nums font-semibold shrink-0">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                    <span>{conv.ai_enabled === 1 ? 'AI Mode' : 'Human Mode'}</span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{conv.status.replace('_', ' ')}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Active Chat Window */}
        <div className="lg:col-span-8 flex flex-col">
          {!activeConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Select a Conversation</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                Choose a customer from the list to view full WhatsApp message history, toggle AI auto-reply, or send a manual response.
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {activeConv.customer_name}
                  </h3>
                  <p className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    +{activeConv.whatsapp_number}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleAi}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                      activeConv.ai_enabled === 1
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {activeConv.ai_enabled === 1 ? <Bot className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                    <span>{activeConv.ai_enabled === 1 ? 'AI Mode Active' : 'Human Takeover'}</span>
                  </button>

                  <select
                    value={activeConv.status}
                    onChange={(e) => handleChangeStatus(e.target.value as 'open' | 'resolved' | 'human_handover')}
                    aria-label="Conversation status"
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="open">Status: Open</option>
                    <option value="human_handover">Status: Human Handover</option>
                    <option value="resolved">Status: Resolved</option>
                  </select>
                </div>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-[#0B1120]/50">
                {messages.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-500">
                    No messages recorded in this conversation yet.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                        <div
                          className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed border ${
                            isOutbound
                              ? 'bg-[#0F172A] dark:bg-emerald-700 text-white border-slate-800 dark:border-emerald-600'
                              : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-2 text-[10px] opacity-75 mb-1">
                            <span>
                              {msg.sender_type === 'ai'
                                ? 'Gemini AI Agent'
                                : msg.sender_type === 'human'
                                ? 'Human Agent'
                                : activeConv.customer_name}
                            </span>
                            {msg.ai_intent && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Intent: {msg.ai_intent}</span>
                              </>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          {msg.delivery_status === 'failed' && msg.error_message && (
                            <p className="mt-1.5 text-[11px] text-red-300 dark:text-red-200">
                              Error: {msg.error_message}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-[11px] font-mono tabular-nums text-slate-400">
                          <span>{formatDateTime(msg.created_at)}</span>
                          {renderDeliveryIcon(msg)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer */}
              <form
                onSubmit={handleSend}
                className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A] space-y-2"
              >
                {sendError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{sendError}</p>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Type a WhatsApp reply (English or বাংলা)..."
                    className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors whitespace-nowrap shrink-0"
                  >
                    <Send className="w-4 h-4" />
                    <span>{sending ? 'Sending...' : 'Send'}</span>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
