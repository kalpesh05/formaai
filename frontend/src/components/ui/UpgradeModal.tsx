import { useNavigate } from 'react-router-dom';
import Modal from './Modal';
import Button from './Button';
import { Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  reason?: 'agent_limit' | 'form_limit' | 'message_quota' | 'module_locked' | 'trial_expired';
  currentPlan?: string;
}

export default function UpgradeModal({
  isOpen,
  onClose,
  title,
  message,
  reason = 'agent_limit',
  currentPlan = 'Starter',
}: UpgradeModalProps) {
  const navigate = useNavigate();

  const getDetails = () => {
    switch (reason) {
      case 'agent_limit':
        return {
          defaultTitle: 'Agent Limit Reached',
          defaultMessage: `Your current ${currentPlan} plan includes a limit on the number of active AI chatbots. Upgrade your plan to deploy additional agents.`,
          recommended: 'Growth Plan ($79/mo)',
          perk: 'Deploy up to 3 AI Agents with custom branding and lead capture forms.',
        };
      case 'form_limit':
        return {
          defaultTitle: 'Form Builder Limit Reached',
          defaultMessage: `You have reached the form creation quota for your ${currentPlan} tier.`,
          recommended: 'Growth Plan or Business Suite',
          perk: 'Create unlimited forms, gather unbounded leads, and unlock step-by-step presentation.',
        };
      case 'message_quota':
        return {
          defaultTitle: 'Monthly Message Quota Reached',
          defaultMessage: `You have utilized 100% of your allocated monthly AI conversations for this workspace.`,
          recommended: 'Higher Usage Tier',
          perk: 'Keep your website chatbot running 24/7 without interruption or paused responses.',
        };
      case 'trial_expired':
        return {
          defaultTitle: '14-Day Free Trial Concluded',
          defaultMessage: `We hope you enjoyed test-driving Forma AI! Choose a plan to re-enable your active chatbot widgets and knowledge base.`,
          recommended: 'Starter ($29/mo) or Growth ($79/mo)',
          perk: 'All your prompt configurations, embeddings, and forms are safely saved.',
        };
      case 'module_locked':
      default:
        return {
          defaultTitle: 'Module Locked',
          defaultMessage: `This feature module is available on advanced plans or currently in early access beta.`,
          recommended: 'Business Suite',
          perk: 'Unlock the complete automated front-office with Mailbox and Ticket escalation.',
        };
    }
  };

  const details = getDetails();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || details.defaultTitle}
      maxWidth="md"
    >
      <div className="space-y-4 pt-1">
        <div className="p-3 bg-brand-50 border border-brand-200 rounded-xl flex items-start gap-3">
          <div className="p-2 bg-brand-600 text-white rounded-lg shrink-0 mt-0.5">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="text-xs font-bold text-brand-900">
              Recommended: {details.recommended}
            </p>
            <p className="text-[11px] text-brand-700 mt-0.5">
              {details.perk}
            </p>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          {message || details.defaultMessage}
        </p>

        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-500 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
            <ShieldCheck size={14} className="text-emerald-600" /> Instant activation
          </div>
          <p className="text-[11px] text-slate-500">
            Upgrades apply immediately with zero disruption to your deployed website widgets.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <Button variant="secondary" onClick={onClose} size="sm">
            Maybe Later
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              navigate('/pricing');
            }}
            className="flex items-center gap-1"
          >
            View Plans &amp; Pricing <ArrowRight size={13} />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
