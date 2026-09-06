import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  ArrowLeft, FileText, Loader, 
  ChevronDown, ChevronUp, RefreshCw, Download, ChevronLeft, ChevronRight,
  Filter
} from 'lucide-react';
import Badge from '../components/ui/Badge';

interface ActionLog {
  id: string;
  agent_name: string;
  action_type: string;
  action_input: any;
  action_result: any;
  status: 'success' | 'failed';
  created_at: string;
}

type DateRange = 'all' | 'today' | 'week' | 'month';

export default function WorkspaceLogs() {
  const { wsId } = useParams();
  const { workspaces } = useWorkspace();
  const currentWs = workspaces.find(w => w.id === wsId);
  const wsName = currentWs?.client_name || 'Workspace';

  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<DateRange>('all');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

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

  // Distinct agent names for dropdown
  const agentNames = useMemo(() => {
    return Array.from(new Set(logs.map(l => l.agent_name))).filter(Boolean);
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const sevenDays = 7 * oneDay;
    const thirtyDays = 30 * oneDay;

    return logs.filter(log => {
      // Agent filter
      if (selectedAgent !== 'all' && log.agent_name !== selectedAgent) {
        return false;
      }

      // Date filter
      if (dateFilter !== 'all') {
        const logTime = new Date(log.created_at).getTime();
        const diff = now - logTime;
        if (dateFilter === 'today' && diff > oneDay) return false;
        if (dateFilter === 'week' && diff > sevenDays) return false;
        if (dateFilter === 'month' && diff > thirtyDays) return false;
      }

      return true;
    });
  }, [logs, selectedAgent, dateFilter]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, selectedAgent]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // CSV Export handler
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;

    const headers = ['Agent Name', 'Action Type', 'Status', 'Executed At', 'Input JSON', 'Result JSON'];
    const rows = filteredLogs.map(log => [
      `"${(log.agent_name || '').replace(/"/g, '""')}"`,
      `"${(log.action_type || '').replace(/"/g, '""')}"`,
      `"${log.status}"`,
      `"${new Date(log.created_at).toISOString()}"`,
      `"${JSON.stringify(log.action_input || {}).replace(/"/g, '""')}"`,
      `"${JSON.stringify(log.action_result || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${wsName.toLowerCase().replace(/\s+/g, '_')}_audit_logs.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Navbar header */}
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
              <FileText size={18} className="text-brand-600" /> Tool Execution Logs
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md font-medium text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            title="Export filtered logs to CSV"
          >
            <Download size={14} className="text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button 
            onClick={fetchLogs}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md font-medium text-xs transition-colors"
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl w-full mx-auto space-y-4">
          
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 pl-1">
                <Filter size={13} /> Timeframe:
              </span>
              <div className="flex items-center gap-1">
                {(['all', 'today', 'week', 'month'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setDateFilter(range)}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                      dateFilter === range
                        ? 'bg-brand-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {range === 'all' ? 'All Time' : range === 'today' ? 'Today' : range === 'week' ? 'Past 7 Days' : 'Past 30 Days'}
                  </button>
                ))}
              </div>
            </div>

            {/* Agent filter dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Agent:</span>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="all">All Agents ({logs.length})</option>
                {agentNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Action Invocation Trace Logs</h2>
                <p className="text-xs text-slate-500 mt-0.5">Every external tool execution triggered by agents in {wsName}</p>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Showing {paginatedLogs.length} of {filteredLogs.length} events
              </span>
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
                    {paginatedLogs.map(log => (
                      <React.Fragment key={log.id}>
                        <tr 
                          onClick={() => toggleRow(log.id)}
                          className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-5 font-bold text-slate-900">{log.agent_name}</td>
                          <td className="py-3 px-5 font-mono text-slate-500">{log.action_type}</td>
                          <td className="py-3 px-5">
                            <Badge status={log.status} size="sm" />
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
                                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Action Arguments Input</span>
                                  <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-48 border border-slate-950 leading-relaxed">
                                    {JSON.stringify(log.action_input, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Execution Response Output</span>
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

                    {filteredLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          {logs.length === 0
                            ? 'No actions have been executed by agents in this workspace yet.'
                            : 'No execution logs match the selected timeframe and agent filters.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredLogs.length > pageSize && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <span className="text-xs text-slate-500">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
