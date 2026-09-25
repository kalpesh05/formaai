import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, setToken, setUser } from '../services/api';
import { Shield, Lock, Mail, Loader, Eye, EyeOff } from 'lucide-react';
import Alert from '../components/ui/Alert';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiRequest('/auth/login', 'POST', { email, password });
      
      // Verify Super Admin privileges
      if (data.agency?.role !== 'super_admin') {
        throw new Error('Access denied. This portal is strictly for Platform Owners.');
      }

      setToken(data.token);
      setUser(data.agency);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-slate-950 p-8 rounded-2xl shadow-2xl border border-slate-800 text-white">
        <div className="text-center">
          <div className="mx-auto h-14 w-14 rounded-xl bg-brand-500 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            <Shield size={32} />
          </div>
          <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
            Forma AI Master Admin
          </h2>
          <p className="mt-1.5 text-xs text-slate-400">
            Internal control tower for platform founders &amp; operators
          </p>
        </div>

        {error && (
          <Alert type="error">
            {error}
          </Alert>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Admin Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@formaai.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 font-semibold text-sm text-white transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
          >
            {loading ? <Loader className="animate-spin" size={16} /> : <Shield size={16} />}
            {loading ? 'Authenticating...' : 'Sign in to Admin Tower'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 text-center">
          <p className="text-[11px] text-slate-500">
            Unauthorized access attempts are logged and monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
