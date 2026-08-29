import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { 
  ArrowLeft, Ticket, Loader, CheckCircle2, AlertCircle
} from 'lucide-react';

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
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-x-hidden">
      {/* Navbar Header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm justify-between">
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Workspace Tickets Hub</span>
            <h1 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <Ticket size={18} className="text-brand-600" /> Customer Support Tickets
            </h1>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Support tickets filed by workspace agents</h2>
            <button 
              onClick={fetchTickets}
              className="text-xs text-brand-600 font-semibold hover:text-brand-700"
            >
              Refresh Tickets
            </button>
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
                  {tickets.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-slate-50/20">
                      <td className="py-4 px-5 font-mono text-[10px] text-slate-400 max-w-[80px] truncate" title={ticket.id}>
                        {ticket.id}
                      </td>
                      <td className="py-4 px-5 font-bold text-slate-900">{ticket.agent_name}</td>
                      <td className="py-4 px-5 font-semibold text-slate-800">{ticket.subject}</td>
                      <td className="py-4 px-5 max-w-sm truncate text-slate-500" title={ticket.description}>
                        {ticket.description}
                      </td>
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                          ticket.status === 'open' 
                            ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          {ticket.status === 'open' ? <AlertCircle size={10} /> : <CheckCircle2 size={10} />}
                          {ticket.status}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-slate-400">
                        {new Date(ticket.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}

                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No support tickets have been opened in this workspace yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
