import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AgentConfig from './pages/AgentConfig';
import WorkspaceLogs from './pages/WorkspaceLogs';
import WorkspaceTickets from './pages/WorkspaceTickets';
import WorkspaceMailbox from './pages/WorkspaceMailbox';
import WorkspaceForms from './pages/WorkspaceForms';
import FormDetail from './pages/FormDetail';
import PublicFormView from './pages/PublicFormView';
import Documentation from './pages/Documentation';
import Pricing from './pages/Pricing';
import AppShell from './components/layout/AppShell';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { getToken, isTokenExpired, getTokenRemainingTime, logoutSession, removeToken } from './services/api';

/**
 * Route protection wrapper. Redirects unauthenticated or expired agency sessions
 * to the login card.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  if (!token || isTokenExpired(token)) {
    removeToken();
    return <Navigate to="/login?expired=true" replace />;
  }
  return <>{children}</>;
}

/**
 * Real-time session watchdog.
 * Proactively triggers auto-logout when the token expires (timer, tab refocus, or cross-tab logout)
 * so the user never stays on protected screens with stale or erroneous data.
 */
function AuthWatchdog() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isPublicPath =
      location.pathname === '/login' ||
      location.pathname === '/signup' ||
      location.pathname.startsWith('/f/');

    if (isPublicPath) return;

    const performLogout = () => {
      logoutSession('expired');
      navigate('/login?expired=true', { replace: true });
    };

    const token = getToken();
    if (!token || isTokenExpired(token)) {
      performLogout();
      return;
    }

    const checkToken = () => {
      const currentToken = getToken();
      if (!currentToken || isTokenExpired(currentToken)) {
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

/**
 * Wraps a page in the persistent AppShell sidebar layout.
 * WorkspaceProvider is placed inside BrowserRouter so it can use
 * useNavigate for auth-expiry redirects.
 */
function ShellRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <WorkspaceProvider>
        <AppShell>
          {children}
        </AppShell>
      </WorkspaceProvider>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthWatchdog />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/f/:formId" element={<PublicFormView />} />

        {/* Protected Client Workspace routes */}
        <Route
          path="/"
          element={
            <ShellRoute>
              <Dashboard />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/agents/:agentId"
          element={
            <ShellRoute>
              <AgentConfig />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/forms"
          element={
            <ShellRoute>
              <WorkspaceForms />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/forms/:formId"
          element={
            <ShellRoute>
              <FormDetail />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/logs"
          element={
            <ShellRoute>
              <WorkspaceLogs />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/tickets"
          element={
            <ShellRoute>
              <WorkspaceTickets />
            </ShellRoute>
          }
        />

        <Route
          path="/workspaces/:wsId/mailbox"
          element={
            <ShellRoute>
              <WorkspaceMailbox />
            </ShellRoute>
          }
        />

        <Route
          path="/docs"
          element={
            <ShellRoute>
              <Documentation />
            </ShellRoute>
          }
        />

        <Route
          path="/pricing"
          element={
            <ShellRoute>
              <Pricing />
            </ShellRoute>
          }
        />

        {/* Wildcard redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
