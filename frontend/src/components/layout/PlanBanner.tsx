import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Sparkles, AlertTriangle, ArrowRight, Clock } from 'lucide-react';

export default function PlanBanner() {
  const { selectedWs } = useWorkspace();
  const navigate = useNavigate();

  if (!selectedWs || !selectedWs.usage) return null;

  const { usage } = selectedWs;
  const isTrial = selectedWs.plan_tier === 'trial' || usage.subscription_status === 'trialing';
  const isExpired = usage.is_trial_expired || usage.subscription_status === 'expired';
  const isHighUsage = !isExpired && usage.messages.percentage >= 80;

  if (isExpired) {
    return (
      <div className="bg-red-600 text-white px-4 py-2.5 shadow-sm text-xs font-medium flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-white shrink-0" />
          <span>
            <strong>Trial Period Expired:</strong> Your 14-day trial has concluded. Inbound chatbot queries and widgets are paused.
          </span>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="bg-white text-red-700 hover:bg-red-50 font-bold px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 shrink-0"
        >
          Select a Plan to Reactivate <ArrowRight size={13} />
        </button>
      </div>
    );
  }

  if (isHighUsage) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 text-xs font-medium flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          <span>
            <strong>Message Quota Warning:</strong> You have used {usage.messages.current} of {usage.messages.limit} messages ({usage.messages.percentage}%) for this billing cycle.
          </span>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="bg-white text-amber-900 hover:bg-amber-50 font-bold px-2.5 py-0.5 rounded text-xs transition-colors flex items-center gap-1 shrink-0"
        >
          Upgrade Quota <ArrowRight size={12} />
        </button>
      </div>
    );
  }

  if (isTrial) {
    return (
      <div className="bg-gradient-to-r from-brand-900 via-indigo-900 to-slate-900 text-white px-4 py-2 text-xs font-medium flex items-center justify-between flex-wrap gap-2 border-b border-brand-800/40">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-500/30 text-brand-200 text-[11px] font-bold border border-brand-400/30">
            <Clock size={12} /> {usage.trial_days_remaining} Days Remaining
          </span>
          <span className="text-slate-300">
            You're currently exploring Forma AI on the <strong>14-Day All-Access Trial</strong> ({usage.messages.current} / {usage.messages.limit} test messages used).
          </span>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="bg-brand-500 hover:bg-brand-600 text-white font-bold px-3 py-1 rounded text-xs transition-all shadow-xs flex items-center gap-1 shrink-0"
        >
          <Sparkles size={12} /> View Plans &amp; Upgrade
        </button>
      </div>
    );
  }

  return null;
}
