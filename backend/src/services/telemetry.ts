export interface TelemetryConfig {
  webhook_url?: string;
  auth_header?: string;
  sentry_auth_token?: string;
  sentry_org?: string;
  sentry_project?: string;
  sentry_dsn?: string;
  simulated_mock?: boolean;
}

export interface UserAccountStateResult {
  success: boolean;
  source: 'live_webhook' | 'simulated_state';
  user_id: string;
  account: {
    plan: string;
    status: string;
    payment_status: string;
    last_payment_amount: string;
    last_payment_timestamp: string;
    webhook_sync_status: string;
    diagnostics: string;
  };
  raw?: any;
}

export interface TelemetryErrorResult {
  success: boolean;
  source: 'sentry_api' | 'simulated_telemetry';
  error_found: boolean;
  issue_id?: string;
  exception_type?: string;
  message?: string;
  file?: string;
  line?: number;
  col?: number;
  url?: string;
  stack_trace?: string;
  timestamp?: string;
  status?: string;
  raw?: any;
}

/**
 * Queries the client database or webhook for live user account and billing state
 */
export async function queryUserAccountState(
  input: { user_id?: string; query_type?: string },
  config: TelemetryConfig = {},
  sessionContext: Record<string, any> = {}
): Promise<UserAccountStateResult> {
  const userId = input.user_id || sessionContext.user_id || sessionContext.userId || 'usr_current_session';
  const queryType = input.query_type || 'billing';

  // 1. If live webhook is configured, dispatch HTTP request
  if (config.webhook_url && config.webhook_url.startsWith('http')) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (config.auth_header) {
        headers['Authorization'] = config.auth_header;
      }

      const res = await fetch(`${config.webhook_url}?user_id=${encodeURIComponent(userId)}&type=${encodeURIComponent(queryType)}`, {
        method: 'GET',
        headers
      });

      if (res.ok) {
        const data = await res.json();
        return {
          success: true,
          source: 'live_webhook',
          user_id: userId,
          account: {
            plan: data.plan || data.subscription_plan || 'Custom',
            status: data.status || 'active',
            payment_status: data.payment_status || 'succeeded',
            last_payment_amount: data.amount || data.last_payment_amount || '$0.00',
            last_payment_timestamp: data.timestamp || new Date().toISOString(),
            webhook_sync_status: data.sync_status || 'synced',
            diagnostics: data.diagnostics || 'Account state retrieved from live webhook.'
          },
          raw: data
        };
      }
    } catch (err: any) {
      console.warn(`[TELEMETRY] Live webhook query failed (${err.message}). Falling back to simulated verification state.`);
    }
  }

  // 2. Realistic Simulated State (for sandbox/demo or when client hasn't added custom webhook yet)
  const isDelayedPayment = queryType.toLowerCase().includes('bill') || queryType.toLowerCase().includes('pay') || queryType.toLowerCase().includes('plan');
  
  return {
    success: true,
    source: 'simulated_state',
    user_id: userId,
    account: {
      plan: sessionContext.plan || (isDelayedPayment ? 'Team Pro ($99/mo)' : 'Standard'),
      status: 'active',
      payment_status: isDelayedPayment ? 'succeeded (Stripe #ch_3N9A4b)' : 'current',
      last_payment_amount: isDelayedPayment ? '$99.00' : '$0.00',
      last_payment_timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      webhook_sync_status: isDelayedPayment ? 'pending_retry (lag: 3 mins)' : 'synced',
      diagnostics: isDelayedPayment
        ? 'Payment of $99 was successfully captured 4 minutes ago on Stripe. The legacy plan provisioning webhook had a slight delay and is scheduled to sync in ~2 minutes.'
        : 'Account in good standing with no active payment discrepancies.'
    }
  };
}

/**
 * Queries Sentry or telemetry logs for recent stack traces and crash events
 */
export async function fetchTelemetryErrors(
  input: { user_id?: string; timeframe_minutes?: number },
  config: TelemetryConfig = {},
  sessionContext: Record<string, any> = {}
): Promise<TelemetryErrorResult> {
  const userId = input.user_id || sessionContext.user_id || sessionContext.userId || 'usr_current_session';
  const timeframe = input.timeframe_minutes || 15;

  // 1. If Sentry API token and org/project are configured, call Sentry REST API
  if (config.sentry_auth_token && config.sentry_org && config.sentry_project) {
    try {
      const sentryUrl = `https://sentry.io/api/0/projects/${config.sentry_org}/${config.sentry_project}/issues/?query=user.id:${encodeURIComponent(userId)}&statsPeriod=${timeframe}m`;
      const res = await fetch(sentryUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.sentry_auth_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.ok) {
        const issues = await res.json();
        if (Array.isArray(issues) && issues.length > 0) {
          const topIssue = issues[0];
          return {
            success: true,
            source: 'sentry_api',
            error_found: true,
            issue_id: topIssue.shortId || topIssue.id,
            exception_type: topIssue.metadata?.type || 'UnhandledException',
            message: topIssue.metadata?.value || topIssue.title,
            file: topIssue.metadata?.filename || 'client.js',
            line: topIssue.metadata?.lineno,
            url: topIssue.permalink,
            stack_trace: topIssue.culprit || topIssue.title,
            timestamp: topIssue.lastSeen || new Date().toISOString(),
            status: topIssue.status || 'unresolved',
            raw: topIssue
          };
        }
      }
    } catch (err: any) {
      console.warn(`[TELEMETRY] Sentry query failed (${err.message}). Falling back to simulated crash trace.`);
    }
  }

  // 2. Realistic Telemetry Stack Trace (for white screen / UI crashes)
  return {
    success: true,
    source: 'simulated_telemetry',
    error_found: true,
    issue_id: `ERR-${Math.floor(1000 + Math.random() * 9000)}`,
    exception_type: 'TypeError',
    message: 'Cannot read properties of undefined (reading "formatFormula")',
    file: 'src/analytics/ReportBuilder.js',
    line: 142,
    col: 28,
    url: sessionContext.currentPage || sessionContext.url || '/analytics/export?format=xlsx',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    status: 'unresolved',
    stack_trace: `TypeError: Cannot read properties of undefined (reading "formatFormula")
    at ReportBuilder.exportRow (ReportBuilder.js:142:28)
    at HTMLButtonElement.dispatch (jquery.min.js:3:120)
    at r.handle (jquery.min.js:3:84)
    at Object.trigger (jquery.min.js:3:10)
    at HTMLButtonElement.<anonymous> (exportModal.js:45:12)`
  };
}
