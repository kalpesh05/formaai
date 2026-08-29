import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import AgentConfig from './pages/AgentConfig';
import WorkspaceLogs from './pages/WorkspaceLogs';
import WorkspaceTickets from './pages/WorkspaceTickets';
import { getToken } from './services/api';

/**
 * Route protection wrapper. Redirects unauthenticated agency sessions 
 * to the login card.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/workspaces/:wsId/agents/:agentId" 
          element={
            <ProtectedRoute>
              <AgentConfig />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/workspaces/:wsId/logs" 
          element={
            <ProtectedRoute>
              <WorkspaceLogs />
            </ProtectedRoute>
          } 
        />
        
        <Route 
          path="/workspaces/:wsId/tickets" 
          element={
            <ProtectedRoute>
              <WorkspaceTickets />
            </ProtectedRoute>
          } 
        />
        
        {/* Wildcard redirect handler */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
