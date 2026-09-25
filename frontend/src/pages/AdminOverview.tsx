import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Bot, MessageSquare, Calendar, Ticket,
  Plus, Search, Mail, ExternalLink,
  Building2, ChevronRight, KeyRound, Copy, Check, RefreshCw
} from 'lucide-react';
import { apiRequest } from '../services/api';
import Button from '../components/ui/Button';
import Badge, { BadgeStatus } from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';

interface AdminStats {
  kpis: {
    total_clients: number;
    total_agents: number;
    live_agents: number;
    total_conversations: number;
    total_messages: number;
    total_tickets: number;
    open_tickets: number;
    total_bookings: number;
    total_actions: number;
    failed_actions: number;
  };
  pipeline_breakdown: { onboarding_status: string; count: number }[];
  recent_activity: {
    id: string;
    action_type: string;
    status: string;
    created_at: string;
    agent_name: string;
    client_name: string;
    workspace_id: string;
  }[];
}

interface CustomerItem {
  id: string;
  client_name: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  website_url?: string;
  industry?: string;
  onboarding_status: BadgeStatus;
  plan_tier: string;
  admin_notes?: string;
  created_at: string;
  agent_count: number;
  live_agent_count: number;
  conversation_count: number;
  ticket_count: number;
  last_conversation_at?: string;
}

export default function AdminOverview() {
  const navigate = useNavigate();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Concierge Onboarding Modal
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [planTier, setPlanTier] = useState('growth');
  const [onboardingStatus, setOnboardingStatus] = useState<BadgeStatus>('requested');
  const [adminNotes, setAdminNotes] = useState('');
  const [initialAgentTemplate, setInitialAgentTemplate] = useState<'support' | 'sales'>('sales');
  const [onboardLoading, setOnboardLoading] = useState(false);
  const [onboardError, setOnboardError] = useState('');

  // Client Credential Provisioning state
  const [createCredentials, setCreateCredentials] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{
    email: string;
    temp_password: string;
    client_name: string;
    workspace_id: string;
  } | null>(null);
  const [copiedWelcome, setCopiedWelcome] = useState(false);

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setTempPassword(`Client#${pwd}`);
  };

  useEffect(() => {
    fetchAdminData();
  }, [statusFilter]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsData, customersData] = await Promise.all([
        apiRequest('/admin/stats', 'GET'),
        apiRequest(`/admin/customers?status=${statusFilter}${search ? `&search=${encodeURIComponent(search)}` : ''}`, 'GET'),
      ]);
      setStats(statsData);
      setCustomers(customersData);
    } catch (err: any) {
      console.error('Failed to load admin data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchAdminData();
  };

  const handleOnboardCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setOnboardError('Client / Company Name is required');
      return;
    }

    setOnboardLoading(true);
    setOnboardError('');

    try {
      const res = await apiRequest('/admin/customers', 'POST', {
        client_name: clientName,
        contact_name: contactName || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined,
        website_url: websiteUrl || undefined,
        industry: industry || undefined,
        plan_tier: planTier,
        onboarding_status: onboardingStatus,
        admin_notes: adminNotes || undefined,
        initial_agent_template: initialAgentTemplate,
        create_login_credentials: createCredentials,
        login_email: loginEmail || contactEmail || undefined,
        temp_password: tempPassword || undefined,
      });

      setShowOnboardModal(false);
      resetOnboardForm();
      fetchAdminData();

      if (res.credentials) {
        setCreatedCredentials({
          email: res.credentials.email,
          temp_password: res.credentials.temp_password,
          client_name: res.workspace.client_name,
          workspace_id: res.workspace.id,
        });
      } else {
        navigate(`/admin/customers/${res.workspace.id}`);
      }
    } catch (err: any) {
      setOnboardError(err.message || 'Failed to onboard customer');
    } finally {
      setOnboardLoading(false);
    }
  };

  const resetOnboardForm = () => {
    setClientName('');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setWebsiteUrl('');
    setIndustry('');
    setPlanTier('growth');
    setOnboardingStatus('requested');
    setAdminNotes('');
    setOnboardError('');
    setCreateCredentials(true);
    setLoginEmail('');
    setTempPassword('');
  };

  const filteredCustomers = customers.filter(c => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (
      c.client_name.toLowerCase().includes(s) ||
      (c.contact_email && c.contact_email.toLowerCase().includes(s)) ||
      (c.contact_name && c.contact_name.toLowerCase().includes(s)) ||
      (c.website_url && c.website_url.toLowerCase().includes(s))
    );
  });

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              Product Owner Mode
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Platform Master Control</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage clients, setup bots on their behalf, and monitor platform-wide analytics &amp; diagnostics.
          </p>
        </div>

        <Button
          onClick={() => {
            resetOnboardForm();
            setShowOnboardModal(true);
          }}
          className="shadow-sm flex items-center gap-2"
        >
          <Plus size={16} /> Onboard New Client
        </Button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Clients</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">
              {stats?.kpis.total_clients ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {stats?.kpis.live_agents ?? 0} active live bots
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Conversations</p>
            <p className="text-3xl font-extrabold text-slate-900 mt-1">
              {stats?.kpis.total_conversations ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {stats?.kpis.total_messages ?? 0} messages handled
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center">
            <MessageSquare size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Bookings Generated</p>
            <p className="text-3xl font-extrabold text-emerald-600 mt-1">
              {stats?.kpis.total_bookings ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              via Cal.com sales loop
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Calendar size={24} />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Support Escalations</p>
            <p className="text-3xl font-extrabold text-amber-600 mt-1">
              {stats?.kpis.total_tickets ?? 0}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {stats?.kpis.open_tickets ?? 0} currently open
            </p>
          </div>
          <div className="h-12 w-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Ticket size={24} />
          </div>
        </div>
      </div>

      {/* Main Content Area: Customers List & Pipeline */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        {/* Table Controls & Filter Bar */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Search clients by name, email, or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </form>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Status:</span>
            {['all', 'requested', 'configuring', 'ready_for_review', 'live', 'paused'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Customer Directory Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-6">Customer / Company</th>
                <th className="py-3.5 px-6">Primary Contact</th>
                <th className="py-3.5 px-6">Onboarding Stage</th>
                <th className="py-3.5 px-6">Tier</th>
                <th className="py-3.5 px-6">Agents</th>
                <th className="py-3.5 px-6">Chats</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading customer accounts...
                  </td>
                </tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <Building2 className="mx-auto text-slate-300 mb-2" size={32} />
                    <p className="font-semibold text-slate-700">No client accounts found</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Onboard New Client" to set up a customer profile.</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => (
                  <tr
                    key={cust.id}
                    onClick={() => navigate(`/admin/customers/${cust.id}`)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-4 px-6">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        {cust.client_name}
                        {cust.website_url && (
                          <a
                            href={cust.website_url.startsWith('http') ? cust.website_url : `https://${cust.website_url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-400 hover:text-brand-600"
                            title="Open client website"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {cust.industry || 'General Business'} • Joined {new Date(cust.created_at).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      {cust.contact_email ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-medium text-slate-800 flex items-center gap-1.5">
                            <Mail size={12} className="text-slate-400" />
                            {cust.contact_email}
                          </div>
                          {cust.contact_name && (
                            <div className="text-[11px] text-slate-500">{cust.contact_name}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No contact details</span>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      <Badge status={cust.onboarding_status} />
                    </td>

                    <td className="py-4 px-6">
                      <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize border border-slate-200">
                        {cust.plan_tier}
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                        <Bot size={14} className="text-brand-500" />
                        <span>{cust.agent_count}</span>
                        {cust.live_agent_count > 0 && (
                          <span className="text-emerald-600">({cust.live_agent_count} live)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <div className="text-xs font-semibold text-slate-900">
                        {cust.conversation_count}
                      </div>
                      {cust.last_conversation_at && (
                        <div className="text-[10px] text-slate-400">
                          {new Date(cust.last_conversation_at).toLocaleDateString()}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/customers/${cust.id}`);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800"
                      >
                        Manage &amp; Analytics <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Concierge Onboarding Modal */}
      <Modal
        isOpen={showOnboardModal}
        onClose={() => setShowOnboardModal(false)}
        title="Onboard New Client (Concierge Setup)"
      >
        <form onSubmit={handleOnboardCustomer} className="space-y-4">
          <p className="text-xs text-slate-500 -mt-2">
            Provision a new client workspace and configure their AI assistant directly on their behalf.
          </p>

          {onboardError && <Alert type="error">{onboardError}</Alert>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Company / Client Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Health Inc"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Website URL
              </label>
              <input
                type="url"
                placeholder="https://acmehealth.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Primary Contact Name
              </label>
              <input
                type="text"
                placeholder="e.g. Sarah Connor (CEO)"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Email
              </label>
              <input
                type="email"
                placeholder="sarah@acmehealth.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                placeholder="+1 555-0199"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Industry
              </label>
              <input
                type="text"
                placeholder="e.g. Healthcare, B2B SaaS"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Plan Tier
              </label>
              <select
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-brand-50 rounded-lg border border-brand-100">
            <label className="block text-xs font-semibold text-brand-900 mb-1.5">
              Initial Agent Preset to Configure
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 ${
                initialAgentTemplate === 'sales'
                  ? 'border-brand-500 bg-white text-brand-900 font-semibold shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <input
                  type="radio"
                  name="agentTemplate"
                  checked={initialAgentTemplate === 'sales'}
                  onChange={() => setInitialAgentTemplate('sales')}
                  className="hidden"
                />
                <Calendar size={14} className="text-brand-500" />
                <span>Sales &amp; Booking Assistant</span>
              </label>

              <label className={`p-2.5 rounded-lg border text-xs cursor-pointer flex items-center gap-2 ${
                initialAgentTemplate === 'support'
                  ? 'border-brand-500 bg-white text-brand-900 font-semibold shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}>
                <input
                  type="radio"
                  name="agentTemplate"
                  checked={initialAgentTemplate === 'support'}
                  onChange={() => setInitialAgentTemplate('support')}
                  className="hidden"
                />
                <Ticket size={14} className="text-brand-500" />
                <span>Customer Support Assistant</span>
              </label>
            </div>
          </div>

          {/* Client Login Account Provisioning */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2.5">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={createCredentials}
                onChange={(e) => {
                  setCreateCredentials(e.target.checked);
                  if (e.target.checked && !tempPassword) {
                    generateRandomPassword();
                  }
                }}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <KeyRound size={14} className="text-brand-500" />
              <span>Create Client Dashboard Login Account</span>
            </label>

            {createCredentials && (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Client Login Email
                  </label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={contactEmail || "client@company.com"}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Will use contact email if left empty.</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Temporary Password *
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[10px] text-brand-600 hover:text-brand-800 font-semibold flex items-center gap-1"
                    >
                      <RefreshCw size={10} /> Generate Random
                    </button>
                  </div>
                  <input
                    type="text"
                    required={createCredentials}
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    placeholder="e.g. Acme#Pass2026!"
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-md text-xs font-mono focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Client will be prompted to change this password after their first login.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Internal Admin Notes / Customer Requirements
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Wants Cal.com integration for 30min sales demos. Knowledge base from acme.com/docs."
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowOnboardModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={onboardLoading}>
              {onboardLoading ? 'Setting up Client...' : 'Create & Open Configurator'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Hand-off Credentials Modal */}
      {createdCredentials && (
        <Modal
          isOpen={true}
          onClose={() => {
            const wsId = createdCredentials.workspace_id;
            setCreatedCredentials(null);
            navigate(`/admin/customers/${wsId}`);
          }}
          title="Client Account &amp; Credentials Ready"
        >
          <div className="space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2">
              <Check size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">Client Workspace &amp; Login Provisioned!</strong>
                <p className="mt-0.5 text-emerald-700">
                  You can now configure their bot and share these credentials with the client:
                </p>
              </div>
            </div>

            <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-xs space-y-2 border border-slate-800">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Portal URL:</span>
                <span className="text-emerald-400 font-bold">{window.location.origin}/login</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Client Email:</span>
                <span className="text-white font-bold">{createdCredentials.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Temp Password:</span>
                <span className="text-amber-400 font-bold">{createdCredentials.temp_password}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  const msg = `Hello ${createdCredentials.client_name} Team,\n\nYour Forma AI assistant workspace is set up and ready!\n\nYou can log in to view your bot, test conversations, and manage leads:\n\n• Login URL: ${window.location.origin}/login\n• Email: ${createdCredentials.email}\n• Temporary Password: ${createdCredentials.temp_password}\n\nPlease change your temporary password under your account profile after logging in.`;
                  navigator.clipboard.writeText(msg);
                  setCopiedWelcome(true);
                  setTimeout(() => setCopiedWelcome(false), 2000);
                }}
                className="flex-1 flex items-center justify-center gap-1.5"
              >
                {copiedWelcome ? (
                  <>
                    <Check size={14} className="text-emerald-400" /> Copied Welcome Message!
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy Welcome Message &amp; Credentials
                  </>
                )}
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const wsId = createdCredentials.workspace_id;
                  setCreatedCredentials(null);
                  navigate(`/admin/customers/${wsId}`);
                }}
              >
                Proceed to Setup Bot
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
