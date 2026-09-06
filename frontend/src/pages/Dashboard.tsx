import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiRequest } from '../services/api';
import {
  Building2, Plus, Bot, ArrowRight, Sparkles,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Alert from '../components/ui/Alert';

interface Agent {
  id: string;
  template_type: 'support' | 'sales';
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
  const [newAgentTemplate, setNewAgentTemplate] = useState<'support' | 'sales'>('support');

  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

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
      setActionError(err.message || 'Failed to create agent');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Page Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm flex-shrink-0">
        <h1 className="text-xl font-bold text-slate-800">
          {selectedWs ? `${selectedWs.client_name}` : 'Forma AI Dashboard'}
        </h1>
        {selectedWs && (
          <Button
            onClick={() => setShowAgentModal(true)}
            icon={<Plus size={16} />}
            variant="primary"
            size="md"
          >
            Create AI Agent
          </Button>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl w-full mx-auto space-y-8">

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
                            onClick={() => setShowAgentModal(true)}
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
              Agent Template
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div
                onClick={() => setNewAgentTemplate('support')}
                className={`border rounded-lg p-3.5 cursor-pointer hover:border-brand-500 transition-all text-center space-y-1 ${
                  newAgentTemplate === 'support'
                    ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600'
                    : 'border-slate-200'
                }`}
              >
                <Sparkles className="mx-auto text-brand-600 mb-1" size={16} />
                <div className="font-bold text-xs text-slate-900">Customer Support</div>
                <div className="text-[10px] text-slate-400">Pre-seeded with ticket escalation</div>
              </div>
              <div
                onClick={() => setNewAgentTemplate('sales')}
                className={`border rounded-lg p-3.5 cursor-pointer hover:border-brand-500 transition-all text-center space-y-1 ${
                  newAgentTemplate === 'sales'
                    ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600'
                    : 'border-slate-200'
                }`}
              >
                <Sparkles className="mx-auto text-brand-600 mb-1" size={16} />
                <div className="font-bold text-xs text-slate-900">Product Sales</div>
                <div className="text-[10px] text-slate-400">Pre-seeded with calendar bookings</div>
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
    </div>
  );
}
