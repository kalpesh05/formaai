import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  ArrowLeft, Ticket, Loader, RefreshCw
} from 'lucide-react';
import Badge from '../components/ui/Badge';

interface SupportTicket {
  id: string;
  agent_name: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'closed';
  created_at: string;
}

export default function WorkspaceTickets() {
  const { wsId } = useParams();
  const { workspaces } = useWorkspace();
  const currentWs = workspaces.find(w => w.id === wsId);
  const wsName = currentWs?.client_name || 'Workspace';

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'closed'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTickets();
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

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    pending: tickets.filter(t => t.status === 'pending').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  const filteredTickets = tickets.filter(t => {
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

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
              <Ticket size={18} className="text-brand-600" /> Customer Support Tickets
            </h1>
          </div>
        </div>

        <button 
          onClick={fetchTickets}
          className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md font-medium text-xs transition-colors"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl w-full mx-auto space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            {(['all', 'open', 'pending', 'closed'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all flex items-center gap-2 ${
                  statusFilter === filter
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>{filter === 'all' ? 'All Tickets' : filter}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  statusFilter === filter
                    ? 'bg-brand-700/60 text-white'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {counts[filter]}
                </span>
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Support Tickets</h2>
                <p className="text-xs text-slate-500 mt-0.5">Tickets automatically filed by support assistants in {wsName}</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Showing {filteredTickets.length} of {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center items-center py-20 text-slate-500 text-sm gap-2">
                <Loader className="animate-spin text-brand-600" size={18} /> Loading customer tickets...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-5">Ticket ID</th>
                      <th className="py-3 px-5">Agent</th>
                      <th className="py-3 px-5">Subject</th>
                      <th className="py-3 px-5">Description</th>
                      <th className="py-3 px-5">Status</th>
                      <th className="py-3 px-5">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredTickets.map(ticket => (
                      <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-5 font-mono text-[11px] text-slate-600" title={ticket.id}>
                          #{ticket.id.slice(0, 8)}
                        </td>
                        <td className="py-4 px-5 font-bold text-slate-900">{ticket.agent_name}</td>
                        <td className="py-4 px-5 font-semibold text-slate-800 max-w-xs truncate" title={ticket.subject}>
                          {ticket.subject}
                        </td>
                        <td className="py-4 px-5 max-w-sm truncate text-slate-500" title={ticket.description}>
                          {ticket.description}
                        </td>
                        <td className="py-4 px-5">
                          <Badge status={ticket.status} size="sm" />
                        </td>
                        <td className="py-4 px-5 text-slate-400 whitespace-nowrap">
                          {new Date(ticket.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}

                    {filteredTickets.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          {tickets.length === 0 
                            ? 'No support tickets have been opened in this workspace yet.'
                            : `No tickets found with "${statusFilter}" status.`}
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
    </div>
  );
}
