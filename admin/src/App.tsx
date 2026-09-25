import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from './pages/AdminLogin';
import AdminOverview from './pages/AdminOverview';
import AdminCustomerDetail from './pages/AdminCustomerDetail';
import AdminLayout from './components/layout/AdminLayout';
import { getToken, getUser } from './services/api';

/**
 * Route protection wrapper for Super Admin session.
 */
function ProtectedAdminRoute({ children }: { children: React.ReactNode }) {
  const token = getToken();
  const user = getUser();

  if (!token || user?.role !== 'super_admin') {
    return <Navigate to="/login" replace />;
  }

  return <AdminLayout>{children}</AdminLayout>;
}

function App() {
  return (
    <BrowserRouter>
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

        {/* Wildcard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
