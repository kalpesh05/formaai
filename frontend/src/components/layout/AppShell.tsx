import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Plus, LogOut, LayoutDashboard,
  FileText, Ticket, Loader,
} from 'lucide-react';
import { removeToken } from '../../services/api';
import { useWorkspace } from '../../context/WorkspaceContext';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate();
  const {
    workspaces,
    selectedWs,
    setSelectedWs,
    loadingWs,
  } = useWorkspace();

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  // Derive nav link classes based on active state
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-slate-800 text-white'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shadow-lg flex-shrink-0">
        <div>
          {/* Logo */}
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
                  className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500 truncate"
                  style={{ maxWidth: '160px' }}
                >
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.client_name}</option>
                  ))}
                  {workspaces.length === 0 && (
                    <option value="">No Client Workspaces</option>
                  )}
                </select>
                <NavLink
                  to="/"
                  onClick={(e) => {
                    e.preventDefault();
                    // Signal Dashboard to open the "Add Workspace" modal
                    navigate('/?newWorkspace=1');
                  }}
                  className="p-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white transition-colors"
                  title="Add Client Workspace"
                >
                  <Plus size={16} />
                </NavLink>
              </div>
            )}
          </div>

          {/* Nav Links */}
          <nav className="p-4 space-y-1.5">
            <NavLink to="/" end className={navLinkClass}>
              <LayoutDashboard size={18} />
              <span>Agents Overview</span>
            </NavLink>

            {selectedWs && (
              <>
                <NavLink
                  to={`/workspaces/${selectedWs.id}/logs`}
                  className={navLinkClass}
                >
                  <FileText size={18} />
                  <span>Execution Logs</span>
                </NavLink>
                <NavLink
                  to={`/workspaces/${selectedWs.id}/tickets`}
                  className={navLinkClass}
                >
                  <Ticket size={18} />
                  <span>Customer Tickets</span>
                </NavLink>
              </>
            )}

            {!selectedWs && !loadingWs && (
              <div className="px-3 py-2 text-xs text-slate-600 italic">
                Create a workspace to see logs &amp; tickets
              </div>
            )}
          </nav>
        </div>

        {/* Footer */}
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

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
