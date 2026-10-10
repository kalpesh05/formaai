import { useState, useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { PLANS_CONFIG, PlanInfo } from '../config/plans';
import { apiRequest } from '../services/api';
import Button from '../components/ui/Button';
import {
  Check, Sparkles, HelpCircle, Bot, ArrowRight,
  ChevronDown
} from 'lucide-react';

export default function Pricing() {
  const { selectedWs } = useWorkspace();
  const [isYearly, setIsYearly] = useState(false);
  const [liveModules, setLiveModules] = useState<Record<string, { status: string; min_plan: string; name: string }>>({});
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    // Fetch live module lifecycle settings from backend
    apiRequest('/plans', 'GET')
      .then((res: any) => {
        if (res?.modules) {
          setLiveModules(res.modules);
        }
      })
      .catch((err) => console.warn('Failed to load dynamic plan modules:', err));
  }, []);

  const currentPlanId = selectedWs?.plan_tier || 'trial';

  const faqs = [
    {
      q: 'How are monthly AI conversations counted?',
      a: 'Each user query received and responded to by your AI Chatbot or email auto-responder counts as 1 conversation message. Quotas reset automatically at the beginning of each billing cycle.',
    },
    {
      q: 'What happens when my 14-day Free Trial ends?',
      a: 'When your trial concludes, your website widgets are gracefully paused until you select a paid plan. Your knowledge base embeddings, custom prompts, and forms are safely saved and never deleted.',
    },
    {
      q: 'What are "Beta Add-ons" and how do I get access?',
      a: 'Forma AI is primarily an AI Chatbot & Agent platform. Extended features like Support Mailbox and Form Builder are currently in Early Access Beta. You can request access or be granted testing access directly from the platform administrator.',
    },
    {
      q: 'Can I switch between monthly and annual billing?',
      a: 'Yes! You can switch at any time. When upgrading to an Annual plan, you immediately receive the 20% discount (equivalent to 2 months free per year).',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 p-6 md:p-10">
      {/* Page Header */}
      <div className="max-w-5xl mx-auto text-center mb-10">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-xs font-bold mb-3 shadow-2xs">
          <Sparkles size={13} /> Transparent, Predictable SaaS Pricing
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          Power Your Business with Autonomous AI Agents
        </h1>
        <p className="text-sm md:text-base text-slate-600 mt-2 max-w-2xl mx-auto">
          Deploy an intelligent AI agent on your website that handles visitor questions, captures qualified leads, and escalates to human support.
        </p>

        {/* Monthly vs Yearly Toggle Switch */}
        <div className="mt-6 inline-flex items-center gap-3 bg-white p-1.5 rounded-xl border border-slate-200 shadow-xs">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              !isYearly
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              isYearly
                ? 'bg-brand-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Annual Billing</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${
              isYearly ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              SAVE 20% (2 MO FREE)
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {PLANS_CONFIG.map((plan: PlanInfo) => {
          const isCurrent = currentPlanId === plan.id;
          const displayPrice = isYearly ? plan.yearlyMonthlyPrice : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={`rounded-2xl bg-white border transition-all flex flex-col justify-between relative shadow-sm ${
                plan.highlight
                  ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-md'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-brand-600 text-white text-[11px] font-extrabold px-3 py-0.5 rounded-full shadow-xs uppercase tracking-wider">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  {isCurrent && (
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 min-h-[36px] line-clamp-2">
                  {plan.tagline}
                </p>

                {/* Price Display */}
                <div className="mt-4 mb-4 pb-4 border-b border-slate-100">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">${displayPrice}</span>
                    <span className="text-xs text-slate-500 font-medium">/ month</span>
                  </div>
                  {isYearly && plan.monthlyPrice > 0 && (
                    <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                      Billed annually (${displayPrice * 12}/year)
                    </p>
                  )}
                </div>

                {/* Primary Metrics */}
                <div className="space-y-2 mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs text-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Bot size={13} className="text-brand-600" /> AI Agents:
                    </span>
                    <span className="font-bold text-slate-900">
                      {plan.maxAgents >= 999 ? 'Unlimited' : `${plan.maxAgents} Agent${plan.maxAgents > 1 ? 's' : ''}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Monthly Msgs:</span>
                    <span className="font-bold text-slate-900">{plan.monthlyMessageLimit.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Knowledge URLs:</span>
                    <span className="font-bold text-slate-900">
                      {plan.maxIngestUrls >= 999 ? 'Unlimited' : `Up to ${plan.maxIngestUrls}`}
                    </span>
                  </div>
                </div>

                {/* Checklist */}
                <div className="space-y-2.5">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Included Capabilities:
                  </p>
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                      <Check size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}

                  {/* Add-ons Display based on live server state */}
                  {plan.id === 'growth' && (
                    <div className="flex items-start gap-2 text-xs text-slate-600 pt-1">
                      <Check size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                      <span>
                        Forma Forms{' '}
                        {liveModules.forms?.status === 'beta' ? (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded ml-1">
                            BETA
                          </span>
                        ) : null}
                      </span>
                    </div>
                  )}

                  {(plan.id === 'business' || plan.id === 'enterprise') && (
                    <>
                      <div className="flex items-start gap-2 text-xs text-slate-600 pt-1">
                        <Check size={14} className="text-purple-500 shrink-0 mt-0.5" />
                        <span>
                          Support Mailbox Connector{' '}
                          {liveModules.mailbox?.status === 'beta' ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded ml-1">
                              BETA
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-xs text-slate-600">
                        <Check size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <span>
                          Ticket Helpdesk Escalation{' '}
                          {liveModules.tickets?.status === 'beta' ? (
                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded ml-1">
                              BETA
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="p-6 pt-0">
                {isCurrent ? (
                  <Button
                    variant="secondary"
                    className="w-full text-xs font-bold text-slate-400 border-slate-200 cursor-default bg-slate-50"
                    disabled
                  >
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    variant={plan.highlight ? 'primary' : 'secondary'}
                    className={`w-full text-xs font-bold flex items-center justify-center gap-1.5 ${
                      plan.highlight ? 'shadow-sm' : ''
                    }`}
                    onClick={() => {
                      alert(`To upgrade to the ${plan.name} plan, please contact your account manager or platform administrator.`);
                    }}
                  >
                    {plan.id === 'enterprise' ? 'Contact Sales' : `Upgrade to ${plan.name}`} <ArrowRight size={13} />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 mb-16">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-slate-900">Feature Comparison by Tier</h2>
          <p className="text-xs text-slate-500 mt-1">
            See everything included with each plan tier at a glance.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase text-[10px]">
                <th className="py-3 px-4 font-bold">Feature</th>
                <th className="py-3 px-4 font-bold text-center">Starter ($29)</th>
                <th className="py-3 px-4 font-bold text-center text-brand-600">Growth ($79)</th>
                <th className="py-3 px-4 font-bold text-center">Business ($199)</th>
                <th className="py-3 px-4 font-bold text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">AI Chatbots &amp; Personas</td>
                <td className="py-3 px-4 text-center">1 Agent</td>
                <td className="py-3 px-4 text-center font-bold text-brand-600">3 Agents</td>
                <td className="py-3 px-4 text-center">Unlimited</td>
                <td className="py-3 px-4 text-center">Unlimited</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Monthly AI Messages</td>
                <td className="py-3 px-4 text-center">1,000</td>
                <td className="py-3 px-4 text-center font-bold text-brand-600">5,000</td>
                <td className="py-3 px-4 text-center">20,000</td>
                <td className="py-3 px-4 text-center">50,000+</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Custom Colors &amp; Launcher</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Included</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Included</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Included</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Remove "Powered by Forma"</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Full White-Label</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Full White-Label</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Forma AI Form Builder</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">5 Forms (Beta)</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Unlimited</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Unlimited</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Support Mailbox Connector</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-purple-600 font-bold">Included (Beta)</td>
                <td className="py-3 px-4 text-center text-purple-600 font-bold">Included</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Customer Ticket Helpdesk</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-amber-600 font-bold">Included (Beta)</td>
                <td className="py-3 px-4 text-center text-amber-600 font-bold">Included</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-semibold text-slate-900">Telemetry &amp; Auto-Fix PRs</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-slate-300">—</td>
                <td className="py-3 px-4 text-center text-emerald-600 font-bold">Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <HelpCircle size={14} /> Questions &amp; Answers
          </div>
          <h2 className="text-xl font-bold text-slate-900 mt-1">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 font-bold text-sm text-slate-900 hover:bg-slate-50/50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180 text-brand-600' : ''}`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-4 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
