import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest, removeToken } from '../services/api';
import { 
  Building2, Plus, LogOut, Bot, LayoutDashboard, 
  FileText, Ticket, ArrowRight, Loader, Sparkles
} from 'lucide-react';

interface Workspace {
  id: string;
  client_name: string;
  created_at: string;
}

interface Agent {
  id: string;
  template_type: 'support' | 'sales';
  name: string;
  llm_provider: string;
  llm_model: string;
  status: 'draft' | 'live';
}

export default function Dashboard() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<Workspace | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  
  const [loadingWs, setLoadingWs] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  
  // Modals status
  const [showWsModal, setShowWsModal] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentTemplate, setNewAgentTemplate] = useState<'support' | 'sales'>('support');
  
  const [actionError, setActionError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  const navigate = useNavigate();

  // Load Workspaces
  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    setLoadingWs(true);
    try {
      const data = await apiRequest('/workspaces', 'GET');
      setWorkspaces(data);
      if (data.length > 0) {
        setSelectedWs(data[0]);
      }
    } catch (err: any) {
      if (err.message.includes('failed') || err.message.includes('Unauthorized')) {
        handleLogout();
      }
    } finally {
      setLoadingWs(false);
    }
  };

  // Load Agents when Workspace changes
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

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setActionError('');
    setActionLoading(true);

    try {
      const ws = await apiRequest('/workspaces', 'POST', { client_name: newWsName });
      setWorkspaces([...workspaces, ws]);
      setSelectedWs(ws);
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
        name: newAgentName
      });
      setAgents([agent, ...agents]);
      setNewAgentName('');
      setShowAgentModal(false);
      // Open settings page of the newly created agent
      navigate(`/workspaces/${selectedWs.id}/agents/${agent.id}`);
    } catch (err: any) {
      setActionError(err.message || 'Failed to create agent');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shadow-lg">
        <div>
          {/* Header logo */}
          <div className="h-16 flex items-center px-6 bg-slate-950 gap-2.5">
            <div className="h-8 w-8 rounded bg-brand-500 flex items-center justify-center text-white font-bold text-lg">
              F
            </div>
            <span className="text-xl font-bold text-white tracking-wide">Forma AI</span>
          </div>

          {/* Workspace Switcher */}
          <div className="p-4 border-b border-slate-800">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Client Workspace
            </label>
            {loadingWs ? (
              <div className="flex items-center text-sm gap-2 text-slate-400">
                <Loader className="animate-spin" size={14} /> Loading...
              </div>
            ) : (
              <div className="flex gap-1.5 items-center">
                <select
                  value={selectedWs?.id || ''}
                  onChange={(e) => {
                    const ws = workspaces.find(w => w.id === e.target.value);
                    if (ws) setSelectedWs(ws);
                  }}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.client_name}</option>
                  ))}
                  {workspaces.length === 0 && <option value="">No Client Workspaces</option>}
                </select>
                <button 
                  onClick={() => setShowWsModal(true)}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-colors"
                  title="Add Client Workspace"
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Menu Links */}
          <nav className="p-4 space-y-1.5">
            <Link 
              to="/" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium bg-slate-800 text-white transition-colors"
            >
              <LayoutDashboard size={18} />
              <span>Agents Overview</span>
            </Link>
            
            {selectedWs && (
              <>
                <Link 
                  to={`/workspaces/${selectedWs.id}/logs`} 
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileText size={18} />
                  <span>Execution Logs</span>
                </Link>
                <Link 
                  to={`/workspaces/${selectedWs.id}/tickets`} 
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Ticket size={18} />
                  <span>Customer Tickets</span>
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Footer Logout */}
        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">
            {selectedWs ? `${selectedWs.client_name} - Workspace Dashboard` : 'Forma AI Dashboard'}
          </h1>
          {selectedWs && (
            <button 
              onClick={() => setShowAgentModal(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md font-medium text-sm transition-colors shadow-sm"
            >
              <Plus size={16} />
              <span>Create AI Agent</span>
            </button>
          )}
        </header>

        <div className="p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* If no workspace exists */}
          {!loadingWs && workspaces.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto mt-12 shadow-sm">
              <Building2 className="mx-auto text-slate-400 mb-4" size={48} />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Create a Client Workspace</h3>
              <p className="text-slate-500 text-sm mb-6">
                To start building customer-facing support and sales agents, register your first client workspace account.
              </p>
              <button 
                onClick={() => setShowWsModal(true)}
                className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-md font-semibold text-sm transition-colors shadow-sm"
              >
                Create Workspace
              </button>
            </div>
          )}

          {/* Agents List Card grid */}
          {selectedWs && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-900">Active AI Chatbots</h2>
              
              {loadingAgents ? (
                <div className="flex justify-center items-center py-16 text-slate-500 text-sm gap-2">
                  <Loader className="animate-spin" size={18} /> Loading chatbot configurations...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {agents.map(agent => (
                    <div 
                      key={agent.id}
                      onClick={() => navigate(`/workspaces/${selectedWs.id}/agents/${agent.id}`)}
                      className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-brand-300 transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                            agent.status === 'live' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {agent.status}
                          </span>
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

                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-sm font-semibold text-brand-600 hover:text-brand-700">
                        <span>Configure Settings</span>
                        <ArrowRight size={16} />
                      </div>
                    </div>
                  ))}

                  {/* Empty state agents */}
                  {!loadingAgents && agents.length === 0 && (
                    <div className="col-span-full bg-white border border-dashed border-slate-300 rounded-xl py-12 px-6 text-center text-slate-500">
                      <Bot className="mx-auto text-slate-400 mb-3" size={36} />
                      <p className="text-sm font-medium mb-1">No AI agents configured in this workspace yet</p>
                      <p className="text-xs text-slate-400 mb-4">Click "Create AI Agent" to seed a preset assistant template.</p>
                      <button 
                        onClick={() => setShowAgentModal(true)}
                        className="bg-brand-50 border border-brand-200 text-brand-700 hover:bg-brand-100 px-4 py-2 rounded font-semibold text-xs transition-colors"
                      >
                        Deploy First Agent
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* -------------------- MODALS -------------------- */}

      {/* Create Workspace Modal */}
      {showWsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <form onSubmit={handleCreateWorkspace} className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="text-brand-600" size={24} />
              <h3 className="text-lg font-bold text-slate-900">Add Client Workspace</h3>
            </div>
            
            {actionError && (
              <div className="bg-red-50 text-red-700 text-xs p-3 rounded">{actionError}</div>
            )}

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
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowWsModal(false); setNewWsName(''); setActionError(''); }}
                className="px-4 py-2 rounded text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 flex items-center"
              >
                {actionLoading && <Loader className="animate-spin mr-1.5" size={14} />}
                Add Workspace
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Create Agent Modal */}
      {showAgentModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <form onSubmit={handleCreateAgent} className="bg-white rounded-xl shadow-xl border border-slate-200 p-6 w-full max-w-md space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="text-brand-600" size={24} />
              <h3 className="text-lg font-bold text-slate-900">Create AI Agent</h3>
            </div>

            {actionError && (
              <div className="bg-red-50 text-red-700 text-xs p-3 rounded">{actionError}</div>
            )}

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
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Agent Template Presets
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div 
                  onClick={() => setNewAgentTemplate('support')}
                  className={`border rounded-lg p-3.5 cursor-pointer hover:border-brand-500 transition-all text-center space-y-1 ${
                    newAgentTemplate === 'support' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-slate-200'
                  }`}
                >
                  <Sparkles className="mx-auto text-brand-600 mb-1" size={16} />
                  <div className="font-bold text-xs text-slate-900">Customer Support</div>
                  <div className="text-[10px] text-slate-400">Pre-seeded with ticket escalation</div>
                </div>
                <div 
                  onClick={() => setNewAgentTemplate('sales')}
                  className={`border rounded-lg p-3.5 cursor-pointer hover:border-brand-500 transition-all text-center space-y-1 ${
                    newAgentTemplate === 'sales' ? 'border-brand-600 bg-brand-50/50 ring-1 ring-brand-600' : 'border-slate-200'
                  }`}
                >
                  <Sparkles className="mx-auto text-brand-600 mb-1" size={16} />
                  <div className="font-bold text-xs text-slate-900">Product Sales</div>
                  <div className="text-[10px] text-slate-400">Pre-seeded with calendar bookings</div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowAgentModal(false); setNewAgentName(''); setActionError(''); }}
                className="px-4 py-2 rounded text-slate-600 hover:bg-slate-100 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm font-semibold transition-colors disabled:opacity-50 flex items-center"
              >
                {actionLoading && <Loader className="animate-spin mr-1.5" size={14} />}
                Create Agent
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
