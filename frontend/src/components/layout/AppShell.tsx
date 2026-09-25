import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Plus, LogOut, LayoutDashboard,
  FileText, Ticket, Loader, Shield, BarChart3, Users,
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
    `flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
      isActive
        ? 'bg-slate-800 text-white font-semibold'
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
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white tracking-wide leading-none">Forma AI</span>
              <span className="text-[10px] text-slate-400 font-medium tracking-wider">PLATFORM ENGINE</span>
            </div>
          </div>

          {/* Product Owner Admin Section */}
          <div className="p-3 border-b border-slate-800">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-bold text-brand-400 uppercase tracking-wider flex items-center gap-1">
                <Shield size={12} /> Product Owner
              </span>
              <span className="bg-brand-500/20 text-brand-300 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                Admin
              </span>
            </div>
            <div className="space-y-1">
              <NavLink to="/admin" end className={navLinkClass}>
                <BarChart3 size={16} />
                <span>Platform Overview</span>
              </NavLink>
              <NavLink to="/admin/customers" className={navLinkClass}>
                <Users size={16} />
                <span>Customer CRM</span>
              </NavLink>
            </div>
          </div>

          {/* Workspace Switcher */}
          <div className="p-4 border-b border-slate-800">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Client Workspace View
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
