import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Globe, Mail, Phone, ExternalLink,
  Bot, Settings, BarChart2, MessageSquare, Calendar,
  Copy, Check, Search, AlertCircle, Save, ChevronRight
} from 'lucide-react';
import { apiRequest } from '../services/api';
import Button from '../components/ui/Button';
import Badge, { BadgeStatus } from '../components/ui/Badge';
import Alert from '../components/ui/Alert';

interface CustomerData {
  customer: {
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
    conversation_count: number;
    ticket_count: number;
  };
  agents: {
    id: string;
    name: string;
    template_type: string;
    status: 'draft' | 'live';
    llm_provider: string;
    llm_model: string;
    api_key?: string;
    created_at: string;
    data_source_count: number;
    tool_count: number;
  }[];
  recent_tickets: {
    id: string;
    subject: string;
    status: string;
    created_at: string;
    agent_name: string;
  }[];
}

interface AnalyticsData {
  summary: {
    total_conversations: number;
    total_messages: number;
    user_messages: number;
    assistant_messages: number;
  };
  actions: {
    action_type: string;
    total: number;
    success_count: number;
    failed_count: number;
  }[];
  daily_volume: {
    date: string;
    conversation_count: number;
    message_count: number;
  }[];
  recent_user_questions: {
    content: string;
    created_at: string;
    agent_name: string;
  }[];
}

interface ConversationItem {
  id: string;
  end_user_ref?: string;
  created_at: string;
  agent_id: string;
  agent_name: string;
  template_type: string;
  message_count: number;
  last_message?: string;
}

interface ConversationDetail {
  conversation: {
    id: string;
    end_user_ref?: string;
    created_at: string;
    agent_name: string;
    template_type: string;
    status: string;
  };
  messages: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }[];
  recent_agent_actions: {
    id: string;
    action_type: string;
    action_input: any;
    action_result: any;
    status: string;
    created_at: string;
  }[];
}

export default function AdminCustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'conversations'>('overview');
  const [data, setData] = useState<CustomerData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
  const [loadingConvDetail, setLoadingConvDetail] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit Form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [planTier, setPlanTier] = useState('growth');
  const [onboardingStatus, setOnboardingStatus] = useState<BadgeStatus>('requested');
  const [adminNotes, setAdminNotes] = useState('');

  // Search filter in conversations
  const [convSearch, setConvSearch] = useState('');
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    if (id) {
      fetchCustomerData();
    }
  }, [id]);

  useEffect(() => {
    if (id && activeTab === 'analytics' && !analytics) {
      fetchAnalytics();
    }
    if (id && activeTab === 'conversations') {
      fetchConversations();
    }
  }, [id, activeTab]);

  const fetchCustomerData = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/admin/customers/${id}`, 'GET');
      setData(res);
      // Initialize edit fields
      setContactName(res.customer.contact_name || '');
      setContactEmail(res.customer.contact_email || '');
      setContactPhone(res.customer.contact_phone || '');
      setWebsiteUrl(res.customer.website_url || '');
      setIndustry(res.customer.industry || '');
      setPlanTier(res.customer.plan_tier || 'growth');
      setOnboardingStatus(res.customer.onboarding_status || 'requested');
      setAdminNotes(res.customer.admin_notes || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiRequest(`/admin/customers/${id}/analytics`, 'GET');
      setAnalytics(res);
    } catch (err: any) {
      console.error('Failed to load analytics:', err.message);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await apiRequest(`/admin/customers/${id}/conversations${convSearch ? `?search=${encodeURIComponent(convSearch)}` : ''}`, 'GET');
      setConversations(res);
      if (res.length > 0 && !selectedConvId) {
        loadConversationDetail(res[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load conversations:', err.message);
    }
  };

  const loadConversationDetail = async (convId: string) => {
    setSelectedConvId(convId);
    setLoadingConvDetail(true);
    try {
      const res = await apiRequest(`/admin/customers/${id}/conversations/${convId}`, 'GET');
      setConvDetail(res);
    } catch (err: any) {
      console.error('Failed to load conversation transcript:', err.message);
    } finally {
      setLoadingConvDetail(false);
    }
  };

  const handleUpdateStatus = async (newStatus: BadgeStatus) => {
    setOnboardingStatus(newStatus);
    try {
      await apiRequest(`/admin/customers/${id}`, 'PATCH', { onboarding_status: newStatus });
      if (data) {
        setData({
          ...data,
          customer: { ...data.customer, onboarding_status: newStatus }
        });
      }
    } catch (err: any) {
      alert(`Failed to update status: ${err.message}`);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await apiRequest(`/admin/customers/${id}`, 'PATCH', {
        contact_name: contactName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        website_url: websiteUrl,
        industry: industry,
        plan_tier: planTier,
        onboarding_status: onboardingStatus,
        admin_notes: adminNotes,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (data) {
        setData({
          ...data,
          customer: {
            ...data.customer,
            contact_name: contactName,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            website_url: websiteUrl,
            industry,
            plan_tier: planTier,
            onboarding_status: onboardingStatus,
            admin_notes: adminNotes,
          }
        });
      }
    } catch (err: any) {
      alert(`Failed to save changes: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
        Loading customer profile...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8">
        <Alert type="error">{error || 'Customer not found'}</Alert>
        <Button onClick={() => navigate('/customers')} className="mt-4">
          <ArrowLeft size={16} /> Back to Overview
        </Button>
      </div>
    );
  }

  const primaryAgent = data.agents[0];
  const widgetScriptTag = primaryAgent?.api_key
    ? `<script src="http://localhost:5000/widget.js" data-agent-key="${primaryAgent.api_key}" async></script>`
    : 'Deploy the agent in Configurator to generate production API Key';

  const copyWidgetCode = () => {
    if (primaryAgent?.api_key) {
      navigator.clipboard.writeText(widgetScriptTag);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-8">
      {/* Back Link */}
      <button
        onClick={() => navigate('/customers')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Customer Directory
      </button>

      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900">{data.customer.client_name}</h1>
              <Badge status={data.customer.onboarding_status} />
              <span className="px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize border border-slate-200">
                {data.customer.plan_tier} Plan
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 mt-2 flex-wrap">
              {data.customer.website_url && (
                <a
                  href={data.customer.website_url.startsWith('http') ? data.customer.website_url : `https://${data.customer.website_url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-brand-600 hover:underline"
                >
                  <Globe size={13} /> {data.customer.website_url} <ExternalLink size={11} />
                </a>
              )}
              {data.customer.contact_email && (
                <span className="flex items-center gap-1 text-slate-600">
                  <Mail size={13} /> {data.customer.contact_email}
                </span>
              )}
              {data.customer.contact_phone && (
                <span className="flex items-center gap-1 text-slate-600">
                  <Phone size={13} /> {data.customer.contact_phone}
                </span>
              )}
              <span>Joined: {new Date(data.customer.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Quick Actions & Status Stepper */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Stage:</label>
              <select
                value={data.customer.onboarding_status}
                onChange={(e) => handleUpdateStatus(e.target.value as BadgeStatus)}
                className="text-xs bg-slate-100 border border-slate-300 font-semibold rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-brand-500"
              >
                <option value="requested">1. Setup Requested</option>
                <option value="configuring">2. Configuring &amp; Ingesting</option>
                <option value="ready_for_review">3. Ready for Review</option>
                <option value="live">4. Live on Website</option>
                <option value="paused">5. Paused</option>
              </select>
            </div>

            {primaryAgent && (
              <Button
                onClick={() => navigate(`/workspaces/${data.customer.id}/agents/${primaryAgent.id}`)}
                className="shadow-sm flex items-center gap-1.5"
              >
                <Settings size={15} /> Configure / Tune Bot
              </Button>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-6 border-t border-slate-200 mt-6 pt-4 text-sm font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-2 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building2 size={16} /> Concierge Setup &amp; CRM Profile
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`pb-2 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'analytics'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <BarChart2 size={16} /> Analytics &amp; Volume
          </button>

          <button
            onClick={() => setActiveTab('conversations')}
            className={`pb-2 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'conversations'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <MessageSquare size={16} /> Conversation Debug Inspector
          </button>
        </div>
      </div>

      {/* ── TAB 1: OVERVIEW & CONCIERGE SETUP ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: CRM Profile Editor */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
                <span>Customer &amp; Stakeholder Details</span>
                {saveSuccess && (
                  <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                    <Check size={14} /> Saved successfully
                  </span>
                )}
              </h2>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Primary Contact Name
                    </label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="sarah@acme.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Phone / WhatsApp
                    </label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="+1 (555) 234-5678"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Website URL
                    </label>
                    <input
                      type="url"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      placeholder="https://acme.com"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Industry
                    </label>
                    <input
                      type="text"
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                      placeholder="e.g. Healthcare, B2B SaaS"
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Internal Admin Notes (Product Owner Scratchpad)
                  </label>
                  <textarea
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Specific client instructions, custom Cal.com booking link, special knowledge ingestion requirements..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving} className="flex items-center gap-1.5">
                    <Save size={15} /> {saving ? 'Saving...' : 'Save Profile Changes'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Configured Agents List */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-slate-900">Configured AI Agents</h2>
                <span className="text-xs text-slate-500">{data.agents.length} agent(s) provisioned</span>
              </div>

              <div className="space-y-3">
                {data.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="p-4 rounded-lg border border-slate-200 hover:border-brand-300 transition-colors flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{agent.name}</span>
                        <Badge status={agent.status} />
                        <span className="text-xs text-slate-400 capitalize">({agent.template_type})</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                        <span>Model: <code className="bg-slate-100 px-1 py-0.5 rounded">{agent.llm_model}</code></span>
                        <span>{agent.data_source_count} Data Sources</span>
                        <span>{agent.tool_count} Active Tools</span>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/workspaces/${data.customer.id}/agents/${agent.id}`)}
                      className="flex items-center gap-1"
                    >
                      Configure <ChevronRight size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Done-for-You Hand-off Script & Quick Stats */}
          <div className="space-y-6">
            {/* Widget Embed Code Box */}
            <div className="bg-slate-900 text-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Bot size={16} className="text-brand-400" />
                  Client Embed Script
                </h3>
                <button
                  onClick={copyWidgetCode}
                  disabled={!primaryAgent?.api_key}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white flex items-center gap-1 transition-colors"
                >
                  {copiedSnippet ? (
                    <>
                      <Check size={12} className="text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Copy Code
                    </>
                  )}
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-3">
                Send this 1-line script tag to the startup to paste in their HTML body tag:
              </p>

              <pre className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre-wrap break-all border border-slate-800">
                {widgetScriptTag}
              </pre>

              <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
                {primaryAgent?.api_key ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <Check size={12} /> API Key active &amp; ready for production
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertCircle size={12} /> Draft agent — deploy to generate key
                  </span>
                )}
              </div>
            </div>

            {/* Quick Metrics Snapshot */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Account Snapshot</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Total Conversations</span>
                  <span className="font-bold text-slate-900">{data.customer.conversation_count}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Escalated Tickets</span>
                  <span className="font-bold text-slate-900">{data.customer.ticket_count}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-500">Provisioned Bots</span>
                  <span className="font-bold text-slate-900">{data.customer.agent_count}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-500">Workspace Tenant ID</span>
                  <code className="text-[10px] text-slate-400 font-mono">{data.customer.id}</code>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ANALYTICS & VOLUME ── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase">Total Conversations</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">
                {analytics?.summary.total_conversations ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Visitor sessions started</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase">User Questions</p>
              <p className="text-3xl font-extrabold text-brand-600 mt-1">
                {analytics?.summary.user_messages ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Inquiries answered</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase">Assistant Responses</p>
              <p className="text-3xl font-extrabold text-emerald-600 mt-1">
                {analytics?.summary.assistant_messages ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Grounding responses</p>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-xs font-medium text-slate-500 uppercase">Actions Executed</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-1">
                {analytics?.actions.reduce((acc, a) => acc + a.total, 0) ?? 0}
              </p>
              <p className="text-xs text-slate-400 mt-1">Tools called automatically</p>
            </div>
          </div>

          {/* Daily Conversation Volume Trend & Tool Execution Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <BarChart2 size={16} className="text-brand-500" />
                Daily Conversation Volume (Last 14 Days)
              </h3>

              {analytics?.daily_volume.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No conversation activity recorded in the last 14 days.
                </div>
              ) : (
                <div className="space-y-3">
                  {analytics?.daily_volume.map((day) => (
                    <div key={day.date} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-slate-500 font-mono">{day.date}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden flex">
                        <div
                          className="bg-brand-500 h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.max(8, (day.conversation_count / 20) * 100))}%`
                          }}
                        />
                      </div>
                      <span className="font-semibold text-slate-800 w-12 text-right">
                        {day.conversation_count} chats
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tool Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Calendar size={16} className="text-emerald-500" />
                Automated Actions &amp; Tool Executions
              </h3>

              {analytics?.actions.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No tool actions triggered yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {analytics?.actions.map((act) => (
                    <div key={act.action_type} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900 capitalize">
                          {act.action_type.replace(/_/g, ' ')}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {act.success_count} successful • {act.failed_count} failed
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 text-sm">{act.total}</span>
                        <span className="text-slate-400 block text-[10px]">executions</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent Visitor Queries */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <MessageSquare size={16} className="text-brand-500" />
              What are Visitors Asking? (Recent Queries)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Real questions submitted by visitors on this client's site. Use this to expand their knowledge base.
            </p>

            {analytics?.recent_user_questions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No user questions recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {analytics?.recent_user_questions.map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-start justify-between gap-4"
                  >
                    <p className="text-slate-800 font-medium leading-relaxed">"{q.content}"</p>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 3: CONVERSATION DEBUG INSPECTOR ── */}
      {activeTab === 'conversations' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-3 min-h-[600px]">
          {/* Left Session List */}
          <div className="border-r border-slate-200 flex flex-col">
            <div className="p-3 border-b border-slate-200">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchConversations();
                }}
                className="relative"
              >
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search transcripts..."
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </form>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  No conversations found for this client.
                </div>
              ) : (
                conversations.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => loadConversationDetail(c.id)}
                    className={`p-3 cursor-pointer text-xs transition-colors ${
                      selectedConvId === c.id
                        ? 'bg-brand-50/70 border-l-4 border-brand-500'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span className="font-mono">{c.end_user_ref || 'Anonymous Visitor'}</span>
                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-slate-800 font-medium truncate">
                      {c.last_message || 'Empty conversation'}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                      <span>{c.agent_name}</span>
                      <span>{c.message_count} messages</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Session Transcript Inspector */}
          <div className="lg:col-span-2 flex flex-col bg-slate-50/50">
            {loadingConvDetail ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-slate-400">
                Loading transcript...
              </div>
            ) : !convDetail ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-slate-400">
                Select a conversation on the left to inspect full dialogue and tool traces.
              </div>
            ) : (
              <>
                {/* Session Header */}
                <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900">
                      Session Inspector: {convDetail.conversation.end_user_ref || 'Anonymous Visitor'}
                    </span>
                    <div className="text-slate-400 text-[11px] mt-0.5">
                      Handled by: <strong className="text-slate-600">{convDetail.conversation.agent_name}</strong> • {new Date(convDetail.conversation.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge status="success" label="Completed" />
                </div>

                {/* Messages Timeline */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {convDetail.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div className="text-[10px] text-slate-400 mb-1 px-1">
                        {m.role === 'user' ? 'Website Visitor' : convDetail.conversation.agent_name} •{' '}
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                          m.role === 'user'
                            ? 'bg-brand-600 text-white rounded-br-sm shadow-sm'
                            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm shadow-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tool Traces Drawer */}
                {convDetail.recent_agent_actions.length > 0 && (
                  <div className="p-3 bg-white border-t border-slate-200">
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block mb-2">
                      Recent Tool Execution Traces
                    </span>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {convDetail.recent_agent_actions.map((act) => (
                        <div
                          key={act.id}
                          className="p-2 rounded bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`h-1.5 w-1.5 rounded-full ${act.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                            <strong className="text-slate-700">{act.action_type}</strong>
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(act.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
