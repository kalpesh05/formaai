import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, removeToken } from '../services/api';
import { useNavigate } from 'react-router-dom';

export interface WorkspaceUsage {
  workspace_id: string;
  plan_tier: string;
  plan_name: string;
  billing_interval: string;
  subscription_status: string;
  trial_ends_at: string | null;
  trial_days_remaining: number;
  is_trial_expired: boolean;
  agents: {
    current: number;
    limit: number;
    can_create: boolean;
  };
  messages: {
    current: number;
    limit: number;
    percentage: number;
    is_quota_exceeded: boolean;
  };
  forms: {
    current: number;
    limit: number;
    can_create: boolean;
  };
  modules_access: {
    forms: boolean;
    mailbox: boolean;
    tickets: boolean;
    logs: boolean;
    [key: string]: boolean;
  };
}

export interface Workspace {
  id: string;
  client_name: string;
  created_at: string;
  plan_tier?: string;
  billing_interval?: string;
  subscription_status?: string;
  trial_ends_at?: string | null;
  monthly_message_count?: number;
  feature_flags?: {
    forms?: boolean;
    mailbox?: boolean;
    tickets?: boolean;
    logs?: boolean;
    [key: string]: boolean | undefined;
  };
  usage?: WorkspaceUsage;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  selectedWs: Workspace | null;
  setSelectedWs: (ws: Workspace) => void;
  loadingWs: boolean;
  refreshWorkspaces: () => Promise<void>;
  addWorkspace: (ws: Workspace) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<Workspace | null>(null);
  const [loadingWs, setLoadingWs] = useState(true);
  const navigate = useNavigate();

  const refreshWorkspaces = useCallback(async () => {
    setLoadingWs(true);
    try {
      const data: Workspace[] = await apiRequest('/workspaces', 'GET');
      setWorkspaces(data);
      // Auto-select first workspace if none selected or previously selected no longer exists
      setSelectedWs(prev => {
        if (prev && data.find(w => w.id === prev.id)) return prev;
        return data.length > 0 ? data[0] : null;
      });
    } catch (err: any) {
      if (err.message?.includes('Unauthorized') || err.message?.includes('failed')) {
        removeToken();
        navigate('/login');
      }
    } finally {
      setLoadingWs(false);
    }
  }, [navigate]);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  const addWorkspace = (ws: Workspace) => {
    setWorkspaces(prev => [...prev, ws]);
    setSelectedWs(ws);
  };

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      selectedWs,
      setSelectedWs,
      loadingWs,
      refreshWorkspaces,
      addWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  return ctx;
}
