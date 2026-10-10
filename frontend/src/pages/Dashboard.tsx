import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import {
  Building2, Plus, Bot, ArrowRight, Sparkles, Users, Terminal, Layout, ShieldCheck
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';
import UpgradeModal from '../components/ui/UpgradeModal';

export type TemplateType = 'support' | 'sales' | 'hr' | 'backend_dev' | 'frontend_dev' | 'qa_tester' | 'router';

interface Agent {
  id: string;
  template_type: TemplateType;
  name: string;
  llm_provider: string;
  llm_model: string;
  status: 'draft' | 'live';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { workspaces, selectedWs, loadingWs, addWorkspace } = useWorkspace();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);

  // Modal state
  const [showWsModal, setShowWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  const [showAgentModal, setShowAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentTemplate, setNewAgentTemplate] = useState<TemplateType>('backend_dev');

  // Upgrade Modal state
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<'agent_limit' | 'trial_expired'>('agent_limit');
  const [upgradeMessage, setUpgradeMessage] = useState('');

  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const handleOpenCreateAgent = () => {
    if (selectedWs?.usage?.is_trial_expired) {
      setUpgradeReason('trial_expired');
      setUpgradeMessage('Your 14-day free trial has expired. Upgrade your plan to create and deploy new chatbot agents.');
      setShowUpgradeModal(true);
      return;
    }
    if (selectedWs?.usage?.agents && !selectedWs.usage.agents.can_create) {
      setUpgradeReason('agent_limit');
      setUpgradeMessage(`You have reached the ${selectedWs.usage.agents.limit}-Agent limit on your ${selectedWs.usage.plan_name} plan. Upgrade to Growth or Business to deploy additional agents.`);
      setShowUpgradeModal(true);
      return;
    }
    setShowAgentModal(true);
  };

  // Open workspace modal when navigated here via sidebar "+" button
  useEffect(() => {
    if (location.search.includes('newWorkspace=1')) {
      setShowWsModal(true);
      window.history.replaceState({}, '', '/');
    }
  }, [location.search]);

  // Load agents when selected workspace changes
  useEffect(() => {
    if (selectedWs) {
      fetchAgents(selectedWs.id);
    } else {
      setAgents([]);
    }
  }, [selectedWs]);

  const fetchAgents = async (wsId: string) => {
    setLoadingAgents(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/agents`, 'GET');
      setAgents(data);
    } catch (err: any) {
      console.error('Failed to fetch agents:', err.message);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setActionError('');
    setActionLoading(true);

    try {
      const ws = await apiRequest('/workspaces', 'POST', { client_name: newWsName });
      addWorkspace(ws);
      setNewWsName('');
      setShowWsModal(false);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create workspace');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWs || !newAgentName.trim()) return;
    setActionError('');
    setActionLoading(true);

    try {
      const agent = await apiRequest(`/workspaces/${selectedWs.id}/agents`, 'POST', {
        template_type: newAgentTemplate,
        name: newAgentName,
      });
      setAgents([agent, ...agents]);
      setNewAgentName('');
      setShowAgentModal(false);
      navigate(`/workspaces/${selectedWs.id}/agents/${agent.id}`);
    } catch (err: any) {
      if (err.message?.includes('AGENT_LIMIT_REACHED') || err.message?.includes('limit')) {
        setShowAgentModal(false);
        setUpgradeReason('agent_limit');
        setUpgradeMessage(err.message);
        setShowUpgradeModal(true);
      } else if (err.message?.includes('TRIAL_EXPIRED')) {
        setShowAgentModal(false);
        setUpgradeReason('trial_expired');
        setUpgradeMessage(err.message);
        setShowUpgradeModal(true);
      } else {
        setActionError(err.message || 'Failed to create agent');
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Page Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-xs flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Bot className="text-brand-600" size={20} />
            {selectedWs ? `${selectedWs.client_name} — AI Chatbots & Agents` : 'AI Chatbots & Agents'}
          </h1>
          <p className="text-[11px] text-slate-500">
            Build, train, and deploy customer-facing AI chatbots with knowledge base grounding and real-time tools
          </p>
        </div>
        {selectedWs && (
          <Button
            onClick={handleOpenCreateAgent}
            icon={<Plus size={16} />}
            variant="primary"
            size="md"
            className="shadow-sm font-semibold text-xs"
          >
            Create New Chatbot Agent
          </Button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl w-full mx-auto space-y-6">

          {/* Chatbot Platform Quick-Start Banner */}
          {selectedWs && (
            <div className="bg-gradient-to-r from-slate-900 via-brand-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-brand-500/20 border border-brand-400/30 flex items-center justify-center text-brand-400">
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white tracking-wide">
                      Forma AI Chatbot &amp; Agent Studio
                    </h2>
                    <p className="text-xs text-slate-400">
                      Your 4-step workflow to launch a custom 24/7 AI chatbot on your website
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-wider bg-brand-900/60 text-brand-300 border border-brand-700/60 px-2.5 py-1 rounded-full">
                    Flagship Core Platform
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/10 text-xs">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-brand-400 font-bold text-[11px]">
                    <span>1.</span> Persona &amp; Rules
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Set system prompt guidelines, select Gemini models, and configure response tone.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-indigo-400 font-bold text-[11px]">
                    <span>2.</span> Knowledge Ingestion
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Automatically crawl client URLs or upload PDF/DOCX files for noise-free RAG grounding.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-[11px]">
                    <span>3.</span> Live Sandbox
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Test bot responses in real-time with session state, simulated users, and vector inspect.
                  </p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-purple-400 font-bold text-[11px]">
                    <span>4.</span> Embed Widget
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Copy 1-line script tag to launch the floating chatbot widget on Webflow or WordPress.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Empty state: no workspaces */}
          {!loadingWs && workspaces.length === 0 && (
            <EmptyState
              icon={<Building2 size={44} className="text-slate-400" />}
              title="Create a Client Workspace"
              description="To start building customer-facing support and sales agents, register your first client workspace."
              action={
                <Button
                  onClick={() => setShowWsModal(true)}
                  variant="primary"
                  size="md"
                  icon={<Plus size={16} />}
                >
                  Create Workspace
                </Button>
              }
              className="mt-12"
            />
          )}

          {/* Agents grid */}
          {selectedWs && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">AI Agents</h2>

              {loadingAgents ? (
                <div className="flex justify-center items-center py-16 text-slate-500 text-sm gap-2">
                  <span className="animate-spin text-brand-600">●</span> Loading agents...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => navigate(`/workspaces/${selectedWs.id}/agents/${agent.id}`)}
                      className="group bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-brand-300 transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Badge status={agent.status} size="sm" />
                          <span className="text-xs text-slate-400 capitalize bg-slate-50 border border-slate-200 px-2 py-0.5 rounded font-mono">
                            {agent.template_type} template
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                          <Bot size={18} className="text-brand-600" />
                          {agent.name}
                        </h3>
                        <p className="text-xs text-slate-500">
                          Model: <span className="font-semibold text-slate-700">{agent.llm_model}</span> ({agent.llm_provider})
                        </p>
                      </div>

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-semibold text-brand-600">
                        <span>Configure Settings</span>
                        <ArrowRight
                          size={16}
                          className="transition-transform group-hover:translate-x-1"
                        />
                      </div>
                    </div>
                  ))}

                  {/* Empty state: no agents */}
                  {agents.length === 0 && (
                    <div className="col-span-full">
                      <EmptyState
                        icon={<Bot size={40} className="text-slate-400" />}
                        title="No AI agents in this workspace yet"
                        description="Click 'Create AI Agent' to deploy your first client assistant template."
                        action={
                          <Button
                            onClick={handleOpenCreateAgent}
                            variant="secondary"
                            size="sm"
                            icon={<Plus size={14} />}
                          >
                            Deploy First Agent
                          </Button>
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── MODALS ── */}

      {/* Create Workspace Modal */}
      <Modal
        isOpen={showWsModal}
        onClose={() => { setShowWsModal(false); setNewWsName(''); setActionError(''); }}
        title="Add Client Workspace"
        icon={<Building2 size={22} />}
      >
        <form onSubmit={handleCreateWorkspace} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Client / Company Name
            </label>
            <input
              type="text"
              required
              value={newWsName}
              onChange={(e) => setNewWsName(e.target.value)}
              className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
              placeholder="e.g. Acme Corp"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => { setShowWsModal(false); setNewWsName(''); setActionError(''); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={actionLoading}
            >
              Add Workspace
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create Agent Modal */}
      <Modal
        isOpen={showAgentModal}
        onClose={() => { setShowAgentModal(false); setNewAgentName(''); setActionError(''); }}
        title="Create AI Agent"
        icon={<Bot size={22} />}
      >
        <form onSubmit={handleCreateAgent} className="space-y-4">
          {actionError && <Alert type="error">{actionError}</Alert>}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Agent Name
            </label>
            <input
              type="text"
              required
              value={newAgentName}
              onChange={(e) => setNewAgentName(e.target.value)}
              className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
              placeholder="e.g. Support Bot v1"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select Agent Specialty
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-80 overflow-y-auto pr-1">
              {/* Backend Dev */}
              <div
                onClick={() => setNewAgentTemplate('backend_dev')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'backend_dev'
                    ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-indigo-700 font-bold text-xs">
                  <Terminal size={14} /> Backend Engineer
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Diagnoses crashes, writes Jest tests & patch diffs</div>
              </div>

              {/* Frontend Dev */}
              <div
                onClick={() => setNewAgentTemplate('frontend_dev')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'frontend_dev'
                    ? 'border-sky-600 bg-sky-50/60 ring-1 ring-sky-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-sky-700 font-bold text-xs">
                  <Layout size={14} /> Frontend UI Specialist
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Fixes React components, responsive layouts & CSS</div>
              </div>

              {/* QA Tester */}
              <div
                onClick={() => setNewAgentTemplate('qa_tester')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'qa_tester'
                    ? 'border-purple-600 bg-purple-50/60 ring-1 ring-purple-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-purple-700 font-bold text-xs">
                  <ShieldCheck size={14} /> QA & Automation
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Writes test suites, edge-case matrix & verifies PRs</div>
              </div>

              {/* HR Concierge */}
              <div
                onClick={() => setNewAgentTemplate('hr')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'hr'
                    ? 'border-emerald-600 bg-emerald-50/60 ring-1 ring-emerald-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                  <Users size={14} /> HR & People Ops
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Internal staff concierge for policy, leave & handbook</div>
              </div>

              {/* Customer Support */}
              <div
                onClick={() => setNewAgentTemplate('support')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'support'
                    ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-brand-700 font-bold text-xs">
                  <Sparkles size={14} /> Support Engineer
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Customer Q&A, DB queries & escalation tickets</div>
              </div>

              {/* Product Sales */}
              <div
                onClick={() => setNewAgentTemplate('sales')}
                className={`border rounded-lg p-3 cursor-pointer hover:border-brand-500 transition-all text-left space-y-1 ${
                  newAgentTemplate === 'sales'
                    ? 'border-amber-600 bg-amber-50/60 ring-1 ring-amber-600'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                  <Sparkles size={14} /> Sales & Booking
                </div>
                <div className="text-[11px] text-slate-500 leading-tight">Inbound lead qualification & Cal.com demo booking</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => { setShowAgentModal(false); setNewAgentName(''); setActionError(''); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={actionLoading}
            >
              Create Agent
            </Button>
          </div>
        </form>
      </Modal>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason={upgradeReason}
        message={upgradeMessage}
        currentPlan={selectedWs?.usage?.plan_name}
      />
    </div>
  );
}
