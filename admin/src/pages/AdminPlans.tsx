import React, { useState, useEffect } from 'react';
import {
  CreditCard, Plus, Shield, RefreshCw, CheckCircle2,
  DollarSign, Users
} from 'lucide-react';
import { apiRequest } from '../services/api';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';

interface PlanRecord {
  id: string;
  name: string;
  tagline: string;
  monthly_price: number;
  yearly_monthly_price: number;
  currency: string;
  max_agents: number;
  monthly_message_limit: number;
  max_forms: number;
  max_ingest_urls: number;
  white_label: boolean;
  custom_colors: boolean;
  rank: number;
  highlight: boolean;
  is_active: boolean;
  is_public: boolean;
  payment_provider: 'stripe' | 'razorpay' | 'both' | 'manual';
  stripe_product_id?: string;
  stripe_price_monthly_id?: string;
  stripe_price_yearly_id?: string;
  razorpay_plan_monthly_id?: string;
  razorpay_plan_yearly_id?: string;
  active_subscribers?: number;
  total_workspaces?: number;
  estimated_mrr?: number;
}

interface SubscriberRecord {
  workspace_id: string;
  workspace_name: string;
  industry: string;
  plan_tier: string;
  subscription_status: string;
  billing_interval: string;
  trial_ends_at: string | null;
  owner_email: string;
  owner_name: string;
  plan_name: string;
  current_monthly_price: number;
  current_yearly_price: number;
  subscription_uuid: string;
  provider: string;
  subscription_id: string;
  locked_price: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  subscribed_at: string;
  is_grandfathered: boolean;
}

export default function AdminPlans() {
  const [activeTab, setActiveTab] = useState<'plans' | 'subscribers'>('plans');
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [subscribers, setSubscribers] = useState<SubscriberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Create / Edit modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncLogs, setSyncLogs] = useState<string[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    tagline: '',
    monthly_price: 29,
    yearly_monthly_price: 24,
    currency: 'usd',
    max_agents: 1,
    monthly_message_limit: 1000,
    max_forms: 0,
    max_ingest_urls: 20,
    white_label: false,
    custom_colors: false,
    payment_provider: 'stripe' as 'stripe' | 'razorpay' | 'both' | 'manual',
    rank: 1,
    highlight: false,
    is_public: true,
    grandfather_existing: true,
  });

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [plansData, subsData] = await Promise.all([
        apiRequest('/admin/plans', 'GET'),
        apiRequest('/admin/subscriptions', 'GET'),
      ]);
      setPlans(plansData);
      setSubscribers(subsData);
    } catch (err: any) {
      setError(err.message || 'Failed to load billing plans');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenCreate = () => {
    setIsEditing(false);
    setSyncLogs([]);
    setFormData({
      id: '',
      name: '',
      tagline: '',
      monthly_price: 49,
      yearly_monthly_price: 39,
      currency: 'usd',
      max_agents: 2,
      monthly_message_limit: 2500,
      max_forms: 2,
      max_ingest_urls: 50,
      white_label: false,
      custom_colors: true,
      payment_provider: 'stripe',
      rank: 2,
      highlight: false,
      is_public: true,
      grandfather_existing: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (plan: PlanRecord) => {
    setIsEditing(true);
    setSyncLogs([]);
    setFormData({
      id: plan.id,
      name: plan.name,
      tagline: plan.tagline || '',
      monthly_price: Number(plan.monthly_price),
      yearly_monthly_price: Number(plan.yearly_monthly_price),
      currency: plan.currency || 'usd',
      max_agents: plan.max_agents,
      monthly_message_limit: plan.monthly_message_limit,
      max_forms: plan.max_forms,
      max_ingest_urls: plan.max_ingest_urls,
      white_label: plan.white_label,
      custom_colors: plan.custom_colors,
      payment_provider: plan.payment_provider || 'stripe',
      rank: plan.rank,
      highlight: plan.highlight,
      is_public: plan.is_public,
      grandfather_existing: true,
    });
    setIsModalOpen(true);
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMessage('');
    setSyncLogs([]);

    try {
      if (isEditing) {
        const res = await apiRequest(`/admin/plans/${formData.id}`, 'PUT', formData);
        setSuccessMessage(`Plan '${formData.name}' successfully updated!`);
        if (res.sync_logs && res.sync_logs.length > 0) {
          setSyncLogs(res.sync_logs);
        }
      } else {
        const res = await apiRequest('/admin/plans', 'POST', formData);
        setSuccessMessage(`New plan '${formData.name}' created and synced with payment gateway!`);
        if (res.sync_logs && res.sync_logs.length > 0) {
          setSyncLogs(res.sync_logs);
        }
      }
      await fetchData();
      setTimeout(() => {
        setIsModalOpen(false);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const handleMigrateSubscriber = async (workspaceId: string, workspaceName: string) => {
    if (!window.confirm(`Are you sure you want to migrate ${workspaceName} to the current plan price and limits?`)) {
      return;
    }
    try {
      await apiRequest(`/admin/subscriptions/${workspaceId}/migrate`, 'POST');
      setSuccessMessage(`Customer ${workspaceName} migrated to latest rates.`);
      await fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to migrate subscriber');
    }
  };

  // Metrics
  const totalSubscribers = subscribers.filter((s) => s.subscription_status === 'active').length;
  const grandfatheredCount = subscribers.filter((s) => s.is_grandfathered).length;
  const totalEstimatedMRR = plans.reduce((acc, p) => acc + Number(p.estimated_mrr || 0), 0);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 lg:p-8">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Billing & Plans Tower</h1>
            <span className="bg-brand-50 text-brand-700 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border border-brand-200">
              Dynamic Gateway Sync
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Manage SaaS subscription tiers, sync with Stripe/Razorpay, and safeguard grandfathered client rates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={fetchData} disabled={loading} className="gap-2 text-xs">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          <Button onClick={handleOpenCreate} className="gap-2 text-xs">
            <Plus size={14} />
            Create New Plan / Add-On
          </Button>
        </div>
      </div>

      {/* ── KPI Scorecards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Subscribers</span>
            <Users size={18} className="text-brand-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{totalSubscribers}</div>
          <span className="text-[11px] text-emerald-600 font-medium">Paying client workspaces</span>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Estimated Monthly MRR</span>
            <DollarSign size={18} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">${totalEstimatedMRR.toLocaleString()}</div>
          <span className="text-[11px] text-slate-500">Run-rate recurring revenue</span>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Grandfathered Accounts</span>
            <Shield size={18} className="text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{grandfatheredCount}</div>
          <span className="text-[11px] text-amber-600 font-medium">Locked on legacy pricing</span>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Plan Tiers</span>
            <CreditCard size={18} className="text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{plans.filter((p) => p.is_active).length}</div>
          <span className="text-[11px] text-indigo-600 font-medium">Live on checkout & app</span>
        </div>
      </div>

      {/* ── Tabs Navigation ── */}
      <div className="flex border-b border-slate-200 mb-6 gap-6">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'plans'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CreditCard size={16} />
          <span>Configured Plans ({plans.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('subscribers')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'subscribers'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users size={16} />
          <span>Subscribers & Grandfathered Accounts ({subscribers.length})</span>
        </button>
      </div>

      {successMessage && (
        <Alert type="success" className="mb-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{successMessage}</span>
          </div>
        </Alert>
      )}

      {error && <Alert type="error" className="mb-6">{error}</Alert>}

      {/* ── TAB 1: PLANS GRID ── */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-xl border flex flex-col justify-between transition-all shadow-xs ${
                plan.highlight
                  ? 'border-brand-500 ring-2 ring-brand-500/20'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-lg">{plan.name}</h3>
                      {plan.highlight && (
                        <span className="bg-brand-50 text-brand-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {plan.id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${plan.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    {plan.is_active ? 'Active' : 'Archived'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 mb-4 line-clamp-2 min-h-[32px]">{plan.tagline}</p>

                {/* Price Display */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-slate-900">${plan.monthly_price}</span>
                    <span className="text-xs text-slate-500 font-medium">/ month</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
                    ${plan.yearly_monthly_price}/mo billed annually (Save ~18%)
                  </div>
                </div>

                {/* Quotas & Features */}
                <div className="space-y-2 text-xs text-slate-700 mb-6">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">AI Messages / mo</span>
                    <span className="font-bold">{plan.monthly_message_limit.toLocaleString()} msgs</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Max Agents</span>
                    <span className="font-bold">{plan.max_agents >= 999 ? 'Unlimited' : plan.max_agents}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Form Builder</span>
                    <span className="font-bold">{plan.max_forms === 0 ? 'Disabled' : plan.max_forms >= 999 ? 'Unlimited' : `${plan.max_forms} Forms`}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">Knowledge Ingestion</span>
                    <span className="font-bold">{plan.max_ingest_urls >= 999 ? 'Unlimited' : `${plan.max_ingest_urls} URLs`}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-500">White-Label Branding</span>
                    <span className="font-bold">{plan.white_label ? 'Included (100%)' : 'Powered by badge'}</span>
                  </div>
                </div>

                {/* Gateway Sync Badges */}
                <div className="space-y-1.5 pt-2 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-500 flex items-center justify-between">
                    <span>Payment Gateway</span>
                    <span className="uppercase text-[10px] font-mono text-slate-700 font-bold bg-slate-100 px-2 py-0.5 rounded">
                      {plan.payment_provider}
                    </span>
                  </div>
                  {plan.stripe_price_monthly_id && (
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      Stripe: {plan.stripe_price_monthly_id}
                    </div>
                  )}
                  {plan.razorpay_plan_monthly_id && (
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      Razorpay: {plan.razorpay_plan_monthly_id}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 rounded-b-xl flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  <strong className="text-slate-900">{plan.active_subscribers || 0}</strong> subscribers
                </span>
                <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(plan)}>
                  Edit & Adjust
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB 2: SUBSCRIBERS TABLE ── */}
      {activeTab === 'subscribers' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Client Subscriptions & Price Lock State</h3>
              <p className="text-xs text-slate-500">
                Shows live paying accounts, locked grandfathered rates, and next renewal schedules.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-md border border-slate-200">
              {subscribers.length} Workspaces Registered
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-100/70 text-slate-500 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Workspace / Owner</th>
                  <th className="py-3 px-4">Plan & Tier</th>
                  <th className="py-3 px-4">Locked Billing Rate</th>
                  <th className="py-3 px-4">Grandfather Status</th>
                  <th className="py-3 px-4">Gateway / Sub ID</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscribers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No customer workspaces found.
                    </td>
                  </tr>
                ) : (
                  subscribers.map((sub) => (
                    <tr key={sub.workspace_id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{sub.workspace_name}</div>
                        <div className="text-[11px] text-slate-400">{sub.owner_email || 'No email registered'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800 uppercase">{sub.plan_name || sub.plan_tier}</span>
                        <div className="text-[10px] text-slate-400 capitalize">{sub.billing_interval || 'monthly'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                        ${sub.locked_price !== null ? sub.locked_price : (sub.billing_interval === 'yearly' ? sub.current_yearly_price : sub.current_monthly_price)} / mo
                      </td>
                      <td className="py-3.5 px-4">
                        {sub.is_grandfathered ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Shield size={10} /> Grandfathered (Old Rate)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            Current Standard Rate
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500">
                        <span className="uppercase font-bold text-slate-700 block">{sub.provider || 'stripe'}</span>
                        <span className="truncate max-w-[120px] block">{sub.subscription_id || 'manual_sub'}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${sub.subscription_status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : sub.subscription_status === 'trialing' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                          {sub.subscription_status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {sub.is_grandfathered && (
                          <button
                            onClick={() => handleMigrateSubscriber(sub.workspace_id, sub.workspace_name)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-semibold underline"
                          >
                            Migrate to New Rate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT PLAN MODAL ── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={isEditing ? `Edit Plan: ${formData.name}` : 'Create New Subscription Plan'}
      >
        <form onSubmit={handleSavePlan} className="space-y-4 max-h-[75vh] overflow-y-auto px-1">
          {error && <Alert type="error">{error}</Alert>}
          {syncLogs.length > 0 && (
            <div className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-xs space-y-1">
              <div className="text-slate-400 font-bold mb-1">Gateway Sync Log:</div>
              {syncLogs.map((log, idx) => (
                <div key={idx}>{log}</div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Identifier (Slug) *</label>
              <input
                type="text"
                required
                disabled={isEditing}
                value={formData.id}
                onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                placeholder="e.g. agency_scale"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Plan Display Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Agency Pro"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Marketing Tagline</label>
            <input
              type="text"
              value={formData.tagline}
              onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
              placeholder="e.g. Complete automated front-office with full white-labeling"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly Price ($) *</label>
              <input
                type="number"
                min="0"
                required
                value={formData.monthly_price}
                onChange={(e) => setFormData({ ...formData, monthly_price: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Yearly Rate ($/mo) *</label>
              <input
                type="number"
                min="0"
                required
                value={formData.yearly_monthly_price}
                onChange={(e) => setFormData({ ...formData, yearly_monthly_price: Number(e.target.value) })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Provider</label>
              <select
                value={formData.payment_provider}
                onChange={(e: any) => setFormData({ ...formData, payment_provider: e.target.value })}
                className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold"
              >
                <option value="stripe">Stripe</option>
                <option value="razorpay">Razorpay</option>
                <option value="both">Both (Stripe & Razorpay)</option>
                <option value="manual">Manual / Invoicing</option>
              </select>
            </div>
          </div>

          {/* Quotas */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Monthly AI Messages</label>
              <input
                type="number"
                min="100"
                value={formData.monthly_message_limit}
                onChange={(e) => setFormData({ ...formData, monthly_message_limit: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Agents (999=Unlimited)</label>
              <input
                type="number"
                min="1"
                value={formData.max_agents}
                onChange={(e) => setFormData({ ...formData, max_agents: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Forms (0=Disabled, 999=Unlimited)</label>
              <input
                type="number"
                min="0"
                value={formData.max_forms}
                onChange={(e) => setFormData({ ...formData, max_forms: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Ingest URLs</label>
              <input
                type="number"
                min="5"
                value={formData.max_ingest_urls}
                onChange={(e) => setFormData({ ...formData, max_ingest_urls: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.white_label}
                onChange={(e) => setFormData({ ...formData, white_label: e.target.checked })}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="font-semibold text-slate-800">100% White-Label Branding (Remove "Powered by KromaDesk")</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.highlight}
                onChange={(e) => setFormData({ ...formData, highlight: e.target.checked })}
                className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="font-semibold text-slate-800">Highlight as "Most Popular" Card</span>
            </label>
          </div>

          {/* Grandfathering Protection Callout (If Editing) */}
          {isEditing && (
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-1">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <Shield size={14} className="text-amber-600" />
                Customer Price Protection (Grandfathering)
              </div>
              <label className="flex items-start gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formData.grandfather_existing}
                  onChange={(e) => setFormData({ ...formData, grandfather_existing: e.target.checked })}
                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 mt-0.5"
                />
                <span className="text-amber-800 leading-relaxed">
                  <strong>Keep existing paying customers grandfathered</strong> on their original price and quotas. New price applies only to future customer signups.
                </span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Syncing with Gateway...' : isEditing ? 'Save & Sync Plan' : 'Create & Sync Plan'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
