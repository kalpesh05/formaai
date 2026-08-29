import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { 
  ArrowLeft, FileText, Loader, CheckCircle2, XCircle, 
  ChevronDown, ChevronUp
} from 'lucide-react';

interface ActionLog {
  id: string;
  agent_name: string;
  action_type: string;
  action_input: any;
  action_result: any;
  status: 'success' | 'failed';
  created_at: string;
}

export default function WorkspaceLogs() {
  const { wsId } = useParams();
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  }, [wsId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/logs`, 'GET');
      setLogs(data);
    } catch (err: any) {
      console.error('Failed to load logs:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-x-hidden">
      {/* Navbar header */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm justify-between">
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Workspace Audit Trails</span>
            <h1 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              <FileText size={18} className="text-brand-600" /> Tool Execution logs
            </h1>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-8 max-w-6xl w-full mx-auto">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800">Action Invocation Trace logs</h2>
            <button 
              onClick={fetchLogs}
              className="text-xs text-brand-600 font-semibold hover:text-brand-700"
            >
              Refresh Logs
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-20 text-slate-500 text-sm gap-2">
              <Loader className="animate-spin text-brand-600" size={18} /> Loading execution traces...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-medium uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-5">Agent</th>
                    <th className="py-3 px-5">Action Type</th>
                    <th className="py-3 px-5">Status</th>
                    <th className="py-3 px-5">Executed At</th>
                    <th className="py-3 px-5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {logs.map(log => (
                    <React.Fragment key={log.id}>
                      <tr 
                        onClick={() => toggleRow(log.id)}
                        className="hover:bg-slate-50/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-5 font-bold text-slate-900">{log.agent_name}</td>
                        <td className="py-3 px-5 font-mono text-slate-500">{log.action_type}</td>
                        <td className="py-3 px-5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            log.status === 'success' 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                              : 'bg-red-50 text-red-700 border border-red-100'
                          }`}>
                            {log.status === 'success' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-5 text-right text-slate-400">
                          {expandedRow === log.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </td>
                      </tr>

                      {/* Expandable JSON Detail Area */}
                      {expandedRow === log.id && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="py-4 px-8 border-t border-b border-slate-100">
                            <div className="grid grid-cols-2 gap-6">
                              <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Action Arguments Input</span>
                                <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-950 leading-relaxed">
                                  {JSON.stringify(log.action_input, null, 2)}
                                </pre>
                              </div>
                              <div>
                                <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Execution Response Output</span>
                                <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-950 leading-relaxed">
                                  {JSON.stringify(log.action_result, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}

                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">
                        No actions have been executed by agents in this workspace yet.
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
