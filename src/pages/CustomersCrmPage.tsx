import React, { useCallback, useEffect, useState } from 'react';
import { Download, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { apiFetch, formatDateTime, parseTags } from '../lib/api.ts';
import { Customer, Message } from '../types.ts';

interface CustomersCrmPageProps {
  refreshSignal: number;
}

export const CustomersCrmPage: React.FC<CustomersCrmPageProps> = ({ refreshSignal }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newForm, setNewForm] = useState({
    name: '',
    phoneNumber: '',
    whatsappNumber: '',
    email: '',
    tags: '',
    notes: '',
    status: 'lead',
  });
  const [formError, setFormError] = useState('');

  const [selectedProfile, setSelectedProfile] = useState<{
    customer: Customer;
    messages: Message[];
  } | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'lead' | 'inactive' | 'blocked'>('lead');
  const [savingProfile, setSavingProfile] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch<{ customers: Customer[] }>(`/api/customers?${params.toString()}`);
      setCustomers(res.customers);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers, refreshSignal]);

  const openProfile = async (id: number) => {
    const res = await apiFetch<{ customer: Customer; messages: Message[] }>(`/api/customers/${id}`);
    setSelectedProfile(res);
    setEditNotes(res.customer.notes || '');
    setEditTags(parseTags(res.customer.tags).join(', '));
    setEditStatus(res.customer.status);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          ...newForm,
          tags: newForm.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      setShowAddModal(false);
      setNewForm({ name: '', phoneNumber: '', whatsappNumber: '', email: '', tags: '', notes: '', status: 'lead' });
      await loadCustomers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create customer');
    }
  };

  const handleSaveProfile = async () => {
    if (!selectedProfile) return;
    setSavingProfile(true);
    try {
      await apiFetch(`/api/customers/${selectedProfile.customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          notes: editNotes,
          tags: editTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          status: editStatus,
        }),
      });
      await openProfile(selectedProfile.customer.id);
      await loadCustomers();
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    await apiFetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (selectedProfile?.customer.id === id) {
      setSelectedProfile(null);
    }
    await loadCustomers();
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, WhatsApp, or tags..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by customer status"
            className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="lead">Lead</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/api/customers/export/csv"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Directory Table */}
        <div
          className={`${
            selectedProfile ? 'xl:col-span-7' : 'xl:col-span-12'
          } bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden`}
        >
          {loading ? (
            <div className="p-8 text-center text-xs text-slate-500">Loading customer directory...</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No Data Available</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Customers added manually or synced from incoming WhatsApp messages will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">WhatsApp / Phone</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Tags</th>
                    <th className="py-3 px-4 text-right">Last Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-xs">
                  {customers.map((c) => {
                    const tags = parseTags(c.tags);
                    const isSelected = selectedProfile?.customer.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => void openProfile(c.id)}
                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                          isSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-900 dark:text-white">{c.name}</p>
                          {c.email && <p className="text-[11px] text-slate-400">{c.email}</p>}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                          +{c.whatsapp_number}
                        </td>
                        <td className="py-3 px-4 capitalize text-slate-700 dark:text-slate-300">{c.status}</td>
                        <td className="py-3 px-4 text-slate-500 dark:text-slate-400">
                          {tags.length > 0 ? tags.join(' · ') : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                          {formatDateTime(c.last_contact_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Customer Profile Inspector */}
        {selectedProfile && (
          <div className="xl:col-span-5 bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                  {selectedProfile.customer.name}
                </h3>
                <p className="text-xs font-mono tabular-nums text-slate-500 mt-0.5">
                  WhatsApp: +{selectedProfile.customer.whatsapp_number} · Phone: {selectedProfile.customer.phone_number}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleDeleteCustomer(selectedProfile.customer.id)}
                  title="Delete customer"
                  className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProfile(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as Customer['status'])}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  <option value="active">Active</option>
                  <option value="lead">Lead</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Tags (comma separated)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Customer Notes</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              >
                {savingProfile ? 'Saving...' : 'Save Profile Changes'}
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
              <h4 className="text-xs font-semibold text-slate-900 dark:text-white mb-2.5">
                Conversation History ({selectedProfile.messages.length})
              </h4>
              {selectedProfile.messages.length === 0 ? (
                <p className="text-xs text-slate-500">No messages recorded for this customer yet.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {selectedProfile.messages.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span className="capitalize">{m.sender_type}</span>
                        <span className="font-mono tabular-nums">{formatDateTime(m.created_at)}</span>
                      </div>
                      <p className="text-slate-800 dark:text-slate-200">{m.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                Add New Customer
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp Number (with country code, e.g. 88017XXXXXXXX) *
                </label>
                <input
                  type="text"
                  required
                  value={newForm.whatsappNumber}
                  onChange={(e) => setNewForm({ ...newForm, whatsappNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                <input
                  type="text"
                  value={newForm.phoneNumber}
                  onChange={(e) => setNewForm({ ...newForm, phoneNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={newForm.email}
                  onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Tags (comma separated)</label>
                <input
                  type="text"
                  value={newForm.tags}
                  onChange={(e) => setNewForm({ ...newForm, tags: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={newForm.notes}
                  onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                >
                  Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
