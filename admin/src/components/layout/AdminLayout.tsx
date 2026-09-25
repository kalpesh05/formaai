import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart3, Users, Shield, LogOut, KeyRound, Check
} from 'lucide-react';
import { removeToken, getUser, apiRequest } from '../../services/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const user = getUser();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleLogout = () => {
    removeToken();
    navigate('/login');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');
    setPasswordLoading(true);

    try {
      await apiRequest('/auth/change-password', 'POST', {
        currentPassword,
        newPassword,
      });
      setPasswordSuccess('Password successfully updated!');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
      isActive
        ? 'bg-slate-800 text-white font-semibold'
        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* ── Admin Sidebar ── */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col justify-between shadow-lg flex-shrink-0">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6 bg-slate-950 gap-2.5">
            <div className="h-8 w-8 rounded bg-brand-500 flex items-center justify-center text-white font-bold text-lg">
              F
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white tracking-wide leading-none">Forma AI</span>
              <span className="text-[10px] text-brand-400 font-bold tracking-wider mt-0.5">ADMIN TOWER</span>
            </div>
          </div>

          {/* Navigation */}
          <div className="p-4 space-y-1.5">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Shield size={12} className="text-brand-400" /> Platform Control
              </span>
              <span className="bg-brand-500/20 text-brand-300 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                Super Admin
              </span>
            </div>

            <NavLink to="/" end className={navLinkClass}>
              <BarChart3 size={16} />
              <span>Platform Overview</span>
            </NavLink>

            <NavLink to="/customers" className={navLinkClass}>
              <Users size={16} />
              <span>Customer CRM</span>
            </NavLink>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 space-y-1">
          {user && (
            <div className="px-3 py-1.5 rounded bg-slate-950/60 mb-2 border border-slate-800/80 flex items-center justify-between">
              <div className="truncate mr-2">
                <p className="text-xs font-semibold text-slate-200 truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase bg-brand-900 text-brand-300">
                Owner
              </span>
            </div>
          )}

          <button
            onClick={() => setShowPasswordModal(true)}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <KeyRound size={16} />
            <span>Change Password</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3 py-2 w-full rounded-md text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Change Admin Password"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <p className="text-xs text-slate-500 -mt-2">
            Update your master admin login password.
          </p>

          {passwordError && <Alert type="error">{passwordError}</Alert>}
          {passwordSuccess && (
            <Alert type="success">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Check size={14} /> {passwordSuccess}
              </div>
            </Alert>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Password (min 6 characters) *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new secure password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPasswordModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={passwordLoading}>
              {passwordLoading ? 'Updating Password...' : 'Save New Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
