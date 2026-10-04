import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  ArrowLeft, Ticket, Loader, RefreshCw, Plus, Play, CheckCircle2, 
  Terminal, ShieldCheck, Users, Sparkles, GitPullRequest, Code, Eye, AlertCircle
} from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';

export interface WorkTicket {
  id: string;
  agent_id: string;
  assigned_agent_id?: string;
  agent_name: string;
  assigned_agent_name?: string;
  assigned_agent_type?: string;
  subject: string;
  description: string;
  department: 'support' | 'engineering' | 'hr' | 'qa';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'pending' | 'closed';
  automated_status: 'idle' | 'in_progress' | 'ready_for_review' | 'resolved';
  resolution_summary?: string;
  github_pr_url?: string;
  branch_name?: string;
  patch_diff?: string;
  reproduction_test?: string;
  created_at: string;
}

interface WorkspaceAgent {
  id: string;
  name: string;
  template_type: string;
}

export default function WorkspaceTickets() {
  const { wsId } = useParams();
  const { workspaces } = useWorkspace();
  const currentWs = workspaces.find(w => w.id === wsId);
  const wsName = currentWs?.client_name || 'Workspace';

  const [tickets, setTickets] = useState<WorkTicket[]>([]);
  const [workspaceAgents, setWorkspaceAgents] = useState<WorkspaceAgent[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
  const [deptFilter, setDeptFilter] = useState<'all' | 'engineering' | 'support' | 'hr' | 'qa'>('all');
  const [loading, setLoading] = useState(true);

  // New ticket modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDepartment, setNewDepartment] = useState<'support' | 'engineering' | 'hr' | 'qa'>('engineering');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [newAssignedAgent, setNewAssignedAgent] = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  // Review & Resolution Drawer modal
  const [activeReviewTicket, setActiveReviewTicket] = useState<WorkTicket | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTickets();
    fetchWorkspaceAgents();
  }, [wsId]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/tickets`, 'GET');
      setTickets(data);
    } catch (err: any) {
      console.error('Failed to fetch tickets:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaceAgents = async () => {
    try {
      const data = await apiRequest(`/workspaces/${wsId}/agents`, 'GET');
      setWorkspaceAgents(data);
      if (data.length > 0 && !newAssignedAgent) {
        setNewAssignedAgent(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to fetch workspace agents:', err.message);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || !newDescription.trim()) return;
    setCreateLoading(true);
    setActionMessage(null);

    try {
      await apiRequest(`/workspaces/${wsId}/tickets`, 'POST', {
        subject: newSubject,
        description: newDescription,
        department: newDepartment,
        priority: newPriority,
        assigned_agent_id: newAssignedAgent || undefined
      });
      setShowCreateModal(false);
      setNewSubject('');
      setNewDescription('');
      setActionMessage({ type: 'success', text: 'Task / Ticket filed successfully.' });
      fetchTickets();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create ticket' });
    } finally {
      setCreateLoading(false);
    }
  };

  const handleTriggerResolve = async (ticket: WorkTicket) => {
    setResolvingId(ticket.id);
    setActionMessage(null);
    try {
      const res = await apiRequest(`/workspaces/${wsId}/tickets/${ticket.id}/resolve`, 'POST', {
        agent_id: ticket.assigned_agent_id
      });
      setActionMessage({ 
        type: 'success', 
        text: `Autonomous resolution completed by ${res.agentName} (${res.templateType}). Solution ready for review!` 
      });
      await fetchTickets();
      // Auto open review modal
      const updated = tickets.find(t => t.id === ticket.id);
      if (updated) {
        setActiveReviewTicket({ ...updated, ...res.details, automated_status: 'ready_for_review', resolution_summary: res.resolutionSummary });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Resolution failed: ${err.message}` });
    } finally {
      setResolvingId(null);
    }
  };

  const handleApproveResolution = async (ticketId: string) => {
    try {
      await apiRequest(`/workspaces/${wsId}/tickets/${ticketId}`, 'PATCH', {
        status: 'closed'
      });
      setActiveReviewTicket(null);
      setActionMessage({ type: 'success', text: 'Ticket approved and marked as resolved.' });
      fetchTickets();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: `Failed to close ticket: ${err.message}` });
    }
  };

  const handleAssignAgent = async (ticketId: string, agentId: string) => {
    try {
      await apiRequest(`/workspaces/${wsId}/tickets/${ticketId}`, 'PATCH', {
        assigned_agent_id: agentId || null
      });
      fetchTickets();
    } catch (err: any) {
      console.error('Failed to reassign agent:', err.message);
    }
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (deptFilter !== 'all' && t.department !== deptFilter) return false;
    return true;
  });

  const getDeptBadge = (dept: string) => {
    switch (dept) {
      case 'engineering':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"><Terminal size={10} /> Engineering</span>;
      case 'hr':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"><Users size={10} /> HR & People</span>;
      case 'qa':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200"><ShieldCheck size={10} /> QA</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Sparkles size={10} /> Support</span>;
    }
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800">Urgent</span>;
      case 'high':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">High</span>;
      case 'medium':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">Medium</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500">Low</span>;
    }
  };

  const getAutomatedBadge = (autoStatus: string) => {
    switch (autoStatus) {
      case 'ready_for_review':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300 animate-pulse"><AlertCircle size={10} /> Ready for Review</span>;
      case 'in_progress':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"><Loader size={10} className="animate-spin" /> Resolving...</span>;
      case 'resolved':
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300"><CheckCircle2 size={10} /> AI Solved</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500">Idle</span>;
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Navbar Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
            title="Back to Overview"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold tracking-wider uppercase">
              <Link to="/" className="hover:text-slate-600 transition-colors">Workspaces</Link>
              <span>/</span>
              <span className="text-slate-600">{wsName}</span>
            </div>
            <h1 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <Ticket size={18} className="text-brand-600" /> Multi-Agent Problem Resolution Desk
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
          >
            New Task / Bug Ticket
          </Button>

          <button 
            onClick={fetchTickets}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md font-medium text-xs transition-colors"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl w-full mx-auto space-y-4">
          
          {actionMessage && (
            <Alert type={actionMessage.type}>
              <div className="flex items-center justify-between w-full">
                <span>{actionMessage.text}</span>
                <button 
                  onClick={() => setActionMessage(null)}
                  className="text-xs underline ml-4 hover:opacity-80"
                >
                  Dismiss
                </button>
              </div>
            </Alert>
          )}

          {/* Department & Status Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Status:</span>
              {(['all', 'open', 'pending', 'closed'] as const).map(filter => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    statusFilter === filter
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Department:</span>
              {(['all', 'engineering', 'support', 'hr', 'qa'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDeptFilter(d)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                    deptFilter === d
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d === 'all' ? 'All Depts' : d}
                </button>
              ))}
            </div>
          </div>

          {/* Tickets Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Tickets & Automated Tasks</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tickets can be picked up, diagnosed, and resolved autonomously by your AI workforce</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Showing {filteredTickets.length} of {tickets.length} tickets
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20 text-slate-500 text-sm gap-2">
                <Loader className="animate-spin text-brand-600" size={18} /> Loading tickets & agent workers...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider text-[10px] bg-slate-50/70">
                      <th className="py-3 px-4">Ticket</th>
                      <th className="py-3 px-4">Dept / Priority</th>
                      <th className="py-3 px-4">Assigned Agent</th>
                      <th className="py-3 px-4">Subject & Problem</th>
                      <th className="py-3 px-4">AI State</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredTickets.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-4 px-4 font-mono text-[11px] text-slate-600 font-semibold" title={ticket.id}>
                          #{ticket.id.slice(0, 8)}
                        </td>
                        <td className="py-4 px-4 space-y-1">
                          <div>{getDeptBadge(ticket.department || 'support')}</div>
                          <div>{getPriorityBadge(ticket.priority || 'medium')}</div>
                        </td>
                        <td className="py-4 px-4">
                          <select
                            value={ticket.assigned_agent_id || ''}
                            onChange={(e) => handleAssignAgent(ticket.id, e.target.value)}
                            className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-brand-500"
                          >
                            <option value="">Unassigned</option>
                            {workspaceAgents.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.template_type})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-4 px-4 max-w-xs">
                          <div className="font-bold text-slate-900 truncate" title={ticket.subject}>
                            {ticket.subject}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5" title={ticket.description}>
                            {ticket.description}
                          </div>
                        </td>
                        <td className="py-4 px-4 whitespace-nowrap">
                          {getAutomatedBadge(ticket.automated_status)}
                        </td>
                        <td className="py-4 px-4">
                          <Badge status={ticket.status} size="sm" />
                        </td>
                        <td className="py-4 px-4 text-right whitespace-nowrap space-x-2">
                          {ticket.resolution_summary || ticket.automated_status === 'ready_for_review' ? (
                            <button
                              onClick={() => setActiveReviewTicket(ticket)}
                              className="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              <Eye size={12} /> Review Solution
                            </button>
                          ) : (
                            <button
                              onClick={() => handleTriggerResolve(ticket)}
                              disabled={resolvingId === ticket.id}
                              className="inline-flex items-center gap-1 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 px-2.5 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {resolvingId === ticket.id ? (
                                <>
                                  <Loader size={12} className="animate-spin" /> Resolving...
                                </>
                              ) : (
                                <>
                                  <Play size={12} /> Resolve with AI
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-slate-400">
                          {tickets.length === 0 
                            ? 'No tickets filed in this workspace yet. Click "New Task / Bug Ticket" to test your AI team.'
                            : `No tickets match current filters.`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Ticket Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="File New Task / Bug Ticket for AI Team"
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Problem Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Uncaught TypeError in exportRow when formula is null"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Department</label>
              <select
                value={newDepartment}
                onChange={(e: any) => setNewDepartment(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="engineering">Engineering (Code / Bugs)</option>
                <option value="support">Customer Support</option>
                <option value="hr">HR & People Operations</option>
                <option value="qa">QA & Testing</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e: any) => setNewPriority(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assign To Agent</label>
            <select
              value={newAssignedAgent}
              onChange={(e) => setNewAssignedAgent(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white"
            >
              {workspaceAgents.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.template_type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Description / Stack Trace</label>
            <textarea
              required
              rows={4}
              placeholder="Describe the issue, paste error trace, or ask the HR/policy question..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:ring-1 focus:ring-brand-500 font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={createLoading}>
              Submit Ticket
            </Button>
          </div>
        </form>
      </Modal>

      {/* Review Resolution Modal */}
      {activeReviewTicket && (
        <Modal
          isOpen={!!activeReviewTicket}
          onClose={() => setActiveReviewTicket(null)}
          title={`Review AI Resolution: ${activeReviewTicket.subject}`}
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="font-bold text-slate-900">Original Description:</div>
              <div className="text-slate-600 whitespace-pre-wrap">{activeReviewTicket.description}</div>
            </div>

            {/* AI Summary */}
            <div className="space-y-1">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <Sparkles size={14} className="text-brand-600" />
                AI Diagnosis & Resolution Summary:
              </div>
              <div className="p-3 bg-brand-50/50 border border-brand-200 rounded-lg text-slate-800 whitespace-pre-wrap font-sans">
                {activeReviewTicket.resolution_summary || 'Resolution prepared.'}
              </div>
            </div>

            {/* Branch and GitHub PR details if code fix */}
            {activeReviewTicket.branch_name && (
              <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div>
                  <span className="font-bold text-indigo-900">Git Branch:</span>{' '}
                  <span className="font-mono text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200">{activeReviewTicket.branch_name}</span>
                </div>
                {activeReviewTicket.github_pr_url && (
                  <a
                    href={activeReviewTicket.github_pr_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded text-xs font-semibold"
                  >
                    <GitPullRequest size={12} /> View PR
                  </a>
                )}
              </div>
            )}

            {/* Patch Diff */}
            {activeReviewTicket.patch_diff && (
              <div className="space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <Code size={13} /> Code Patch Diff:
                </div>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto max-h-48">
                  {activeReviewTicket.patch_diff}
                </pre>
              </div>
            )}

            {/* Reproduction Test */}
            {activeReviewTicket.reproduction_test && (
              <div className="space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-1">
                  <ShieldCheck size={13} className="text-purple-600" /> Reproduction Test (Jest/Vitest):
                </div>
                <pre className="p-3 bg-slate-900 text-emerald-300 rounded-lg font-mono text-[11px] overflow-x-auto max-h-44">
                  {activeReviewTicket.reproduction_test}
                </pre>
              </div>
            )}

            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <span className="text-[11px] text-slate-400">
                Approving will mark this ticket as resolved and update system logs.
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActiveReviewTicket(null)}>
                  Close
                </Button>
                <Button 
                  variant="primary" 
                  size="sm" 
                  icon={<CheckCircle2 size={14} />}
                  onClick={() => handleApproveResolution(activeReviewTicket.id)}
                >
                  Approve & Resolve
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
