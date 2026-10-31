import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AdminLogin from './pages/AdminLogin';
import AdminOverview from './pages/AdminOverview';
import AdminCustomerDetail from './pages/AdminCustomerDetail';
import AdminPlans from './pages/AdminPlans';
import AdminLayout from './components/layout/AdminLayout';
import { getToken, getUser, isTokenExpired, getTokenRemainingTime, logoutAdminSession, removeToken } from './services/api';

/**
 * Route protection wrapper for Super Admin session.
 * Rejects expired or missing tokens immediately and redirects to login.
 */
function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  const user = getUser();

  if (!token || isTokenExpired(token) || user?.role !== 'super_admin') {
    removeToken();
    return <Navigate to="/login?expired=true" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

/**
 * Real-time Super Admin session watchdog.
 * Proactively triggers auto-logout when the token expires (timer, tab refocus, or cross-tab logout)
 * preventing administrators from operating on stale or wrong customer/platform data.
 */
function AdminAuthWatchdog() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/login') return;

    const performLogout = () => {
      logoutAdminSession('expired');
      navigate('/login?expired=true', { replace: true });
    };

    const token = getToken();
    const user = getUser();
    if (!token || isTokenExpired(token) || user?.role !== 'super_admin') {
      performLogout();
      return;
    }

    const checkToken = () => {
      const currentToken = getToken();
      const currentUser = getUser();
      if (!currentToken || isTokenExpired(currentToken) || currentUser?.role !== 'super_admin') {
        performLogout();
        return null;
      }
      const remainingMs = getTokenRemainingTime(currentToken);
      if (remainingMs <= 0) {
        performLogout();
        return null;
      }
      return setTimeout(() => {
        performLogout();
      }, remainingMs);
    };

    let timer = checkToken();

    const handleResume = () => {
      if (timer) clearTimeout(timer);
      timer = checkToken();
    };

    window.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('storage', handleResume);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('storage', handleResume);
    };
  }, [location.pathname, navigate]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AdminAuthWatchdog />
      <Routes>
        {/* Public Admin Login */}
        <Route path="/login" element={<AdminLogin />} />

        {/* Protected Super Admin Dashboard Routes */}
        <Route
          path="/"
          element={
            <ProtectedAdminRoute>
              <AdminOverview />
            </ProtectedAdminRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <ProtectedAdminRoute>
              <AdminOverview />
            </ProtectedAdminRoute>
          }
        />

        <Route
          path="/customers/:id"
          element={
            <ProtectedAdminRoute>
              <AdminCustomerDetail />
            </ProtectedAdminRoute>
          }
        />

        <Route
          path="/plans"
          element={
            <ProtectedAdminRoute>
              <AdminPlans />
            </ProtectedAdminRoute>
          }
        />

        {/* Wildcard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
