import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AgentConfig from './pages/AgentConfig';
import WorkspaceLogs from './pages/WorkspaceLogs';
import WorkspaceTickets from './pages/WorkspaceTickets';
import AppShell from './components/layout/AppShell';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { getToken } from './services/api';

/**
 * Route protection wrapper. Redirects unauthenticated agency sessions
 * to the login card.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
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
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protected routes — all wrapped in AppShell with persistent sidebar */}
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

        {/* Wildcard redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
