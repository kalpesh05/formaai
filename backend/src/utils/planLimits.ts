import pool from '../config/db';
import {
  getPlanDefinition,
  isPlanSufficient,
  DEFAULT_MODULE_LIFECYCLE,
  GlobalModules,
} from '../config/plans';

/**
 * Fetch dynamic module lifecycle settings from DB
 */
export async function getGlobalModuleLifecycle(): Promise<GlobalModules> {
  try {
    const res = await pool.query(
      'SELECT value FROM platform_settings WHERE key = $1',
      ['module_lifecycle']
    );
    if (res.rows.length > 0 && res.rows[0].value) {
      return { ...DEFAULT_MODULE_LIFECYCLE, ...res.rows[0].value };
    }
  } catch (err) {
    console.warn('[PLAN_LIMITS] Failed to fetch module_lifecycle from DB, using defaults', err);
  }
  return DEFAULT_MODULE_LIFECYCLE;
}

/**
 * Evaluates whether a workspace can access a specific feature module.
 * Logic:
 * 1. If module status is 'live' and workspace plan meets or exceeds min_plan -> ALLOWED.
 * 2. If workspace has an explicit feature_flags override -> ALLOWED.
 * 3. Otherwise -> BLOCKED (or in Beta waiting for invite).
 */
export function canWorkspaceAccessModule(
  workspace: { plan_tier?: string; feature_flags?: any },
  moduleKey: string,
  globalModules: GlobalModules = DEFAULT_MODULE_LIFECYCLE
): boolean {
  const flags = workspace.feature_flags || {};
  // Explicit per-workspace override from Super Admin always takes precedence
  if (flags[moduleKey] === true) {
    return true;
  }

  const mod = globalModules[moduleKey];
  if (!mod) return false;

  // If feature is LIVE for all, check if client's plan tier is sufficient
  if (mod.status === 'live') {
    return isPlanSufficient(workspace.plan_tier || 'trial', mod.min_plan);
  }

  // If feature is BETA or INTERNAL, requires explicit feature_flags override
  return false;
}

export interface WorkspaceUsageReport {
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
  modules_access: Record<string, boolean>;
}

/**
 * Get comprehensive usage and quota report for a workspace
 */
export async function getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsageReport | null> {
  const wsRes = await pool.query(
    `SELECT id, plan_tier, billing_interval, trial_ends_at, subscription_status,
            COALESCE(monthly_message_count, 0) as monthly_message_count,
            COALESCE(feature_flags, '{}'::jsonb) as feature_flags
     FROM client_workspaces
     WHERE id = $1`,
    [workspaceId]
  );

  if (wsRes.rows.length === 0) return null;
  const ws = wsRes.rows[0];

  const [agentCountRes, formCountRes, globalModules] = await Promise.all([
    pool.query('SELECT COUNT(*)::int as count FROM agents WHERE client_workspace_id = $1', [workspaceId]),
    pool.query('SELECT COUNT(*)::int as count FROM forms WHERE client_workspace_id = $1', [workspaceId]),
    getGlobalModuleLifecycle(),
  ]);

  const agentCount = agentCountRes.rows[0]?.count || 0;
  const formCount = formCountRes.rows[0]?.count || 0;
  const messageCount = ws.monthly_message_count || 0;

  const plan = getPlanDefinition(ws.plan_tier);

  // Compute trial status
  let trialDaysRemaining = 0;
  let isTrialExpired = false;

  if (ws.subscription_status === 'trialing' && ws.trial_ends_at) {
    const trialEnd = new Date(ws.trial_ends_at).getTime();
    const now = Date.now();
    const diffDays = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    trialDaysRemaining = Math.max(0, diffDays);
    isTrialExpired = now > trialEnd;
  } else if (ws.subscription_status === 'expired') {
    isTrialExpired = true;
  }

  const messageLimit = plan.monthlyMessageLimit;
  const isQuotaExceeded = messageCount >= messageLimit;
  const percentage = Math.min(100, Math.round((messageCount / messageLimit) * 100));

  const modulesAccess: Record<string, boolean> = {
    forms: canWorkspaceAccessModule(ws, 'forms', globalModules),
    mailbox: canWorkspaceAccessModule(ws, 'mailbox', globalModules),
    tickets: canWorkspaceAccessModule(ws, 'tickets', globalModules),
    logs: canWorkspaceAccessModule(ws, 'logs', globalModules),
  };

  return {
    workspace_id: ws.id,
    plan_tier: plan.id,
    plan_name: plan.name,
    billing_interval: ws.billing_interval || 'monthly',
    subscription_status: isTrialExpired && ws.subscription_status === 'trialing' ? 'expired' : ws.subscription_status,
    trial_ends_at: ws.trial_ends_at,
    trial_days_remaining: trialDaysRemaining,
    is_trial_expired: isTrialExpired,
    agents: {
      current: agentCount,
      limit: plan.maxAgents,
      can_create: !isTrialExpired && agentCount < plan.maxAgents,
    },
    messages: {
      current: messageCount,
      limit: messageLimit,
      percentage,
      is_quota_exceeded: isQuotaExceeded,
    },
    forms: {
      current: formCount,
      limit: plan.maxForms,
      can_create: !isTrialExpired && modulesAccess.forms && formCount < plan.maxForms,
    },
    modules_access: modulesAccess,
  };
}

/**
 * Validates whether an agent can be created in the given workspace
 */
export async function checkAgentCreationAllowed(workspaceId: string) {
  const usage = await getWorkspaceUsage(workspaceId);
  if (!usage) {
    return { allowed: false, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' };
  }

  if (usage.is_trial_expired) {
    return {
      allowed: false,
      error: 'Your trial period has expired. Please upgrade your plan to continue creating agents.',
      code: 'TRIAL_EXPIRED',
      plan_tier: usage.plan_tier,
    };
  }

  if (usage.agents.current >= usage.agents.limit) {
    return {
      allowed: false,
      error: `Agent limit reached (${usage.agents.current}/${usage.agents.limit}) for your ${usage.plan_name} plan. Upgrade to add more agents.`,
      code: 'AGENT_LIMIT_REACHED',
      current: usage.agents.current,
      limit: usage.agents.limit,
      plan_tier: usage.plan_tier,
    };
  }

  return { allowed: true, usage };
}

/**
 * Validates whether a form can be created in the given workspace
 */
export async function checkFormCreationAllowed(workspaceId: string) {
  const usage = await getWorkspaceUsage(workspaceId);
  if (!usage) {
    return { allowed: false, error: 'Workspace not found', code: 'WORKSPACE_NOT_FOUND' };
  }

  if (usage.is_trial_expired) {
    return {
      allowed: false,
      error: 'Your trial period has expired. Please upgrade your plan to build forms.',
      code: 'TRIAL_EXPIRED',
      plan_tier: usage.plan_tier,
    };
  }

  if (!usage.modules_access.forms) {
    return {
      allowed: false,
      error: 'The Forma Form Builder module is not enabled for your current plan or is in private beta.',
      code: 'MODULE_LOCKED',
      plan_tier: usage.plan_tier,
    };
  }

  if (usage.forms.current >= usage.forms.limit) {
    return {
      allowed: false,
      error: `Form limit reached (${usage.forms.current}/${usage.forms.limit}) for your ${usage.plan_name} plan. Upgrade to create more forms.`,
      code: 'FORM_LIMIT_REACHED',
      current: usage.forms.current,
      limit: usage.forms.limit,
      plan_tier: usage.plan_tier,
    };
  }

  return { allowed: true, usage };
}

/**
 * Validates whether a chat query can proceed for an agent
 */
export async function checkChatQueryAllowed(agentId: string) {
  const res = await pool.query(
    'SELECT client_workspace_id FROM agents WHERE id = $1',
    [agentId]
  );
  if (res.rows.length === 0) {
    return { allowed: false, error: 'Agent not found' };
  }

  const workspaceId = res.rows[0].client_workspace_id;
  const usage = await getWorkspaceUsage(workspaceId);
  if (!usage) {
    return { allowed: false, error: 'Workspace not found' };
  }

  if (usage.is_trial_expired) {
    return {
      allowed: false,
      error: 'Trial period has expired. Please upgrade to continue chatting.',
      code: 'TRIAL_EXPIRED',
      workspaceId,
    };
  }

  if (usage.messages.is_quota_exceeded) {
    return {
      allowed: false,
      error: `Monthly message quota of ${usage.messages.limit} messages reached. Please upgrade your plan.`,
      code: 'MESSAGE_QUOTA_EXCEEDED',
      workspaceId,
    };
  }

  return { allowed: true, workspaceId };
}
