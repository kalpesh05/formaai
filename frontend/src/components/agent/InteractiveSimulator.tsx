import { useState } from 'react';
import {
  Sparkles, Play, CheckCircle2, GitPullRequest, GitBranch,
  Layers, Cpu, RefreshCw, Check, Zap
} from 'lucide-react';
import Button from '../ui/Button';

type SimulatorMode = 'autofix' | 'architect';

interface CrashScenario {
  id: string;
  name: string;
  icon: string;
  tag: string;
  error: string;
  file: string;
  line: number;
  trace: string;
  rootCause: string;
  reproductionTest: string;
  diffBefore: string;
  diffAfter: string;
  prTitle: string;
  branch: string;
}

const CRASH_SCENARIOS: CrashScenario[] = [
  {
    id: 'checkout_null',
    name: 'Checkout White Screen',
    icon: '🛒',
    tag: 'Frontend TypeError',
    error: "TypeError: Cannot read properties of undefined (reading 'price')",
    file: 'src/components/CartSummary.tsx',
    line: 48,
    trace: `TypeError: Cannot read properties of undefined (reading 'price')
    at CartSummary.calculateTotal (src/components/CartSummary.tsx:48:22)
    at HTMLButtonElement.handleCheckout (src/pages/Checkout.tsx:112:9)`,
    rootCause: "Discounted coupon items passed to the cart had null price objects instead of a numerical fallback, throwing an unhandled TypeError during reduce.",
    reproductionTest: `import { describe, it, expect } from 'vitest';
import { calculateCartTotal } from './CartSummary';

describe('CartSummary - Crash Safeguard', () => {
  it('should not throw TypeError when coupon item has undefined price', () => {
    const items = [
      { id: 'item_1', name: 'Shoes', price: 80, quantity: 1 },
      { id: 'item_promo', name: 'VIP Coupon', price: undefined, quantity: 1 }
    ];
    const total = calculateCartTotal(items);
    expect(total).toBe(80);
    expect(total).not.toBeNaN();
  });
});`,
    diffBefore: `  const subtotal = items.reduce((sum, item) => {
-   return sum + (item.price * item.quantity);
  }, 0);`,
    diffAfter: `  const subtotal = items.reduce((sum, item) => {
+   // Guarded by KromaDesk Auto-Fix: safe nullish coalescing
+   const unitPrice = typeof item?.price === 'number' ? item.price : 0;
+   return sum + (unitPrice * (item?.quantity || 1));
  }, 0);`,
    prTitle: 'Fix: Safeguard calculateCartTotal against undefined coupon price in CartSummary.tsx',
    branch: 'fix/fa-checkout-cartsummary'
  },
  {
    id: 'export_date',
    name: 'Report Export Null Pointer',
    icon: '📊',
    tag: 'Runtime Exception',
    error: "TypeError: Cannot read properties of undefined (reading 'startDate')",
    file: 'src/analytics/ReportGenerator.js',
    line: 140,
    trace: `TypeError: Cannot read properties of undefined (reading 'startDate')
    at ReportGenerator.exportBatch (src/analytics/ReportGenerator.js:140:35)
    at ExportWorker.processTask (src/workers/ExportWorker.js:52:14)`,
    rootCause: "Client triggered 'Download CSV' before date picker populated default start and end dates. Direct property access crashed the background export worker.",
    reproductionTest: `import { describe, it, expect } from 'vitest';
import { exportBatch } from './ReportGenerator';

describe('ReportGenerator - Date Range Safety', () => {
  it('should fallback to 30-day window when dateRange is omitted or null', () => {
    const options = { format: 'csv', dateRange: undefined };
    const result = exportBatch(options);
    expect(result.status).toBe('success');
    expect(result.recordCount).toBeGreaterThanOrEqual(0);
  });
});`,
    diffBefore: `  exportBatch(options) {
-   const fromDate = options.dateRange.startDate.toISOString();
-   const toDate = options.dateRange.endDate.toISOString();
    return queryDatabase(fromDate, toDate);
  }`,
    diffAfter: `  exportBatch(options) {
+   // Guarded by KromaDesk Auto-Fix: default 30-day sliding window fallback
+   const now = new Date();
+   const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
+   const fromDate = options?.dateRange?.startDate ? options.dateRange.startDate.toISOString() : thirtyDaysAgo.toISOString();
+   const toDate = options?.dateRange?.endDate ? options.dateRange.endDate.toISOString() : now.toISOString();
    return queryDatabase(fromDate, toDate);
  }`,
    prTitle: 'Fix: Provide safe fallback when dateRange is null in ReportGenerator.js',
    branch: 'fix/fa-reportgenerator-daterange'
  },
  {
    id: 'webhook_json',
    name: 'Corrupted Webhook Ingestion',
    icon: '⚡',
    tag: 'Backend SyntaxError',
    error: "SyntaxError: Unexpected token < in JSON at position 0",
    file: 'src/services/webhookHandler.ts',
    line: 24,
    trace: `SyntaxError: Unexpected token < in JSON at position 0
    at JSON.parse (<anonymous>)
    at handleInboundWebhook (src/services/webhookHandler.ts:24:26)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)`,
    rootCause: "Upstream third-party payment gateway dispatched an HTML 502 error gateway response instead of JSON during a gateway blip, crashing the Express route.",
    reproductionTest: `import { describe, it, expect } from 'vitest';
import { handleInboundWebhook } from './webhookHandler';

describe('webhookHandler - HTML Fallback Safety', () => {
  it('should reject non-JSON payloads gracefully without crashing Node process', async () => {
    const rawHtmlPayload = '<html><body>502 Bad Gateway</body></html>';
    const res = await handleInboundWebhook(rawHtmlPayload);
    expect(res.statusCode).toBe(400);
    expect(res.error).toBe('Invalid JSON payload');
  });
});`,
    diffBefore: `  async function handleInboundWebhook(rawPayload: string) {
-   const data = JSON.parse(rawPayload);
    return processPaymentEvent(data);
  }`,
    diffAfter: `  async function handleInboundWebhook(rawPayload: string) {
+   let data: any;
+   try {
+     data = JSON.parse(rawPayload);
+   } catch (err) {
+     return { statusCode: 400, error: 'Invalid JSON payload' };
+   }
    return processPaymentEvent(data);
  }`,
    prTitle: 'Fix: Guard JSON.parse against malformed non-JSON payloads in webhookHandler.ts',
    branch: 'fix/fa-webhook-json-guard'
  }
];

export default function InteractiveSimulator() {
  const [mode, setMode] = useState<SimulatorMode>('autofix');

  // Auto-Fix Simulator State
  const [selectedScenario, setSelectedScenario] = useState<CrashScenario>(CRASH_SCENARIOS[0]);
  const [simStep, setSimStep] = useState<number>(0);
  const [isRunning, setIsRunning] = useState(false);
  const [prMerged, setPrMerged] = useState(false);
  const [activeDiffTab, setActiveDiffTab] = useState<'diff' | 'test' | 'trace'>('diff');

  // System Architect Simulator State
  const [architectPrompt, setArchitectPrompt] = useState('Multi-tenant B2B analytics platform with real-time webhooks, Redis caching, and billing tier quotas');
  const [archGenerating, setArchGenerating] = useState(false);
  const [archCompleted, setArchCompleted] = useState(true);
  const [archTab, setArchTab] = useState<'topology' | 'schema' | 'api' | 'scaling'>('topology');

  // Run Auto-Fix Simulator Animation
  const handleRunAutoFix = () => {
    setIsRunning(true);
    setSimStep(1);
    setPrMerged(false);

    setTimeout(() => setSimStep(2), 700);
    setTimeout(() => setSimStep(3), 1500);
    setTimeout(() => setSimStep(4), 2200);
    setTimeout(() => {
      setSimStep(5);
      setIsRunning(false);
    }, 2800);
  };

  // Run Architect Generation Animation
  const handleGenerateArchitecture = () => {
    setArchGenerating(true);
    setArchCompleted(false);
    setTimeout(() => {
      setArchGenerating(false);
      setArchCompleted(true);
    }, 1200);
  };

  return (
    <div className="space-y-8">
      {/* Top Selector: Mode Switcher */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wider mb-2">
            <Zap size={12} /> 100% Online Interactive Playground
          </div>
          <h2 className="text-xl font-bold text-white">Experience the Software Factory in Action</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Test how our autonomous agents detect errors, synthesize verified reproduction tests, generate surgical patches, and design systems—right in your browser with zero installation.
          </p>
        </div>

        <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button
            onClick={() => setMode('autofix')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === 'autofix'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitPullRequest size={14} /> Auto-Fix Engine
          </button>
          <button
            onClick={() => setMode('architect')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              mode === 'architect'
                ? 'bg-teal-500 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers size={14} /> System Architect
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* MODE 1: AUTO-FIX & REPAIR SIMULATOR                       */}
      {/* ========================================================= */}
      {mode === 'autofix' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Scenario Selector */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center justify-between">
              <span>1. Select Crash Scenario</span>
              <span className="text-[10px] font-normal text-slate-400">3 pre-loaded samples</span>
            </h3>

            <div className="space-y-2.5">
              {CRASH_SCENARIOS.map((sc) => {
                const isSelected = selectedScenario.id === sc.id;
                return (
                  <div
                    key={sc.id}
                    onClick={() => {
                      setSelectedScenario(sc);
                      setSimStep(0);
                      setPrMerged(false);
                    }}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-brand-500 bg-brand-50/50 ring-1 ring-brand-500 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">{sc.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-slate-900">{sc.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-[200px]">
                            {sc.file}:{sc.line}
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                        {sc.tag}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Preview Card */}
            <div className="bg-slate-900 text-slate-200 rounded-xl p-4 text-[11px] font-mono space-y-2 border border-slate-800">
              <div className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                Captured Telemetry Stack Trace:
              </div>
              <pre className="text-slate-300 text-[10px] whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {selectedScenario.trace}
              </pre>
            </div>

            <Button
              onClick={handleRunAutoFix}
              disabled={isRunning}
              variant="primary"
              size="lg"
              className="w-full justify-center shadow-md py-3 text-sm font-bold flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  Synthesizing Fix &amp; PR...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Autonomous Auto-Fix
                </>
              )}
            </Button>
          </div>

          {/* Right Column: Animated Resolution Pipeline */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Live Auto-Remediation Pipeline</h3>
                <p className="text-xs text-slate-500 mt-0.5">Watch the 4-step autonomous closed loop execute in real time.</p>
              </div>

              {simStep === 5 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  PR Generated &amp; Test Passed
                </span>
              )}
            </div>

            {/* 4 Pipeline Steps */}
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
              <div className={`p-2.5 rounded-lg border transition-all ${
                simStep >= 1 ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-100 text-slate-400'
              }`}>
                1. Intercept Error
              </div>
              <div className={`p-2.5 rounded-lg border transition-all ${
                simStep >= 2 ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-100 text-slate-400'
              }`}>
                2. AI Root Cause
              </div>
              <div className={`p-2.5 rounded-lg border transition-all ${
                simStep >= 3 ? 'border-purple-400 bg-purple-50 text-purple-800' : 'border-slate-100 text-slate-400'
              }`}>
                3. Vitest Repro
              </div>
              <div className={`p-2.5 rounded-lg border transition-all ${
                simStep >= 4 ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-100 text-slate-400'
              }`}>
                4. GitHub PR
              </div>
            </div>

            {/* Output Display Area */}
            {simStep === 0 ? (
              <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <Play size={20} className="ml-1" />
                </div>
                <div className="text-sm font-semibold text-slate-700">Ready to simulate auto-fix</div>
                <div className="text-xs text-slate-400 max-w-sm mx-auto">
                  Click the <strong>"Run Autonomous Auto-Fix"</strong> button on the left to see the AI diagnose this crash, write the test, and open a PR.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Root Cause Banner */}
                {simStep >= 2 && (
                  <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-900 space-y-1">
                    <span className="font-bold flex items-center gap-1.5 text-indigo-700">
                      <Sparkles size={13} /> Root Cause Diagnosis:
                    </span>
                    <p className="leading-relaxed">{selectedScenario.rootCause}</p>
                  </div>
                )}

                {/* Diff / Test View Tabs */}
                {simStep >= 3 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-xs">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setActiveDiffTab('diff')}
                          className={`px-2.5 py-1 rounded font-semibold ${
                            activeDiffTab === 'diff' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Surgical Patch Diff
                        </button>
                        <button
                          onClick={() => setActiveDiffTab('test')}
                          className={`px-2.5 py-1 rounded font-semibold ${
                            activeDiffTab === 'test' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Reproduction Test (Vitest)
                        </button>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">{selectedScenario.file}</span>
                    </div>

                    <div className="p-4 bg-slate-950 font-mono text-xs overflow-x-auto text-slate-200 leading-relaxed max-h-64">
                      {activeDiffTab === 'diff' ? (
                        <div className="space-y-1">
                          <div className="text-rose-400">{selectedScenario.diffBefore}</div>
                          <div className="text-emerald-400">{selectedScenario.diffAfter}</div>
                        </div>
                      ) : (
                        <pre className="text-indigo-200">{selectedScenario.reproductionTest}</pre>
                      )}
                    </div>
                  </div>
                )}

                {/* GitHub PR Result Card */}
                {simStep >= 5 && (
                  <div className="bg-white border-2 border-emerald-500/30 rounded-xl p-4 shadow-sm space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          <GitPullRequest size={15} />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">{selectedScenario.prTitle}</div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1 font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              <GitBranch size={10} /> {selectedScenario.branch}
                            </span>
                            <span>•</span>
                            <span>Verified in sandbox: FAIL ➔ PASS</span>
                          </div>
                        </div>
                      </div>

                      {prMerged ? (
                        <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs">
                          <Check size={14} /> Merged to Staging &amp; Prod
                        </span>
                      ) : (
                        <Button
                          onClick={() => setPrMerged(true)}
                          variant="primary"
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          1-Click Merge &amp; Deploy
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODE 2: SYSTEM ARCHITECT SIMULATOR                       */}
      {/* ========================================================= */}
      {mode === 'architect' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-800">
              Transform Any Product Idea Into an Optimized Architecture Blueprint
            </h3>

            {/* Quick-Prompt Chips */}
            <div className="flex flex-wrap gap-2">
              {[
                'Multi-tenant B2B analytics platform with real-time webhooks, Redis caching, and billing tier quotas',
                'Uber for dog walking with real-time GPS tracking, push notifications, and Stripe escrow',
                'Notion-style collaborative document editor with offline sync, CRDTs, and workspace roles'
              ].map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setArchitectPrompt(p)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-400 hover:bg-teal-50/50 hover:text-teal-800 transition-all text-left"
                >
                  💡 {p.slice(0, 50)}...
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={architectPrompt}
                onChange={(e) => setArchitectPrompt(e.target.value)}
                placeholder="Describe your SaaS, mobile app, or backend architecture idea..."
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <Button
                onClick={handleGenerateArchitecture}
                disabled={archGenerating}
                variant="primary"
                size="md"
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-2 whitespace-nowrap px-5"
              >
                {archGenerating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Designing...
                  </>
                ) : (
                  <>
                    <Cpu size={14} /> Generate Blueprint
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Blueprint Viewer */}
          {archCompleted && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="text-teal-600" size={18} />
                    Production Architecture Blueprint
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">Generated with 3NF database normalization, async BullMQ workers, and scaling tiers.</p>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    onClick={() => setArchTab('topology')}
                    className={`px-3 py-1 text-xs font-semibold rounded ${
                      archTab === 'topology' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    C4 Topology
                  </button>
                  <button
                    onClick={() => setArchTab('schema')}
                    className={`px-3 py-1 text-xs font-semibold rounded ${
                      archTab === 'schema' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    SQL Schema
                  </button>
                  <button
                    onClick={() => setArchTab('api')}
                    className={`px-3 py-1 text-xs font-semibold rounded ${
                      archTab === 'api' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    API Contracts
                  </button>
                  <button
                    onClick={() => setArchTab('scaling')}
                    className={`px-3 py-1 text-xs font-semibold rounded ${
                      archTab === 'scaling' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    1k ➔ 1M Scaling
                  </button>
                </div>
              </div>

              {/* Topology Tab */}
              {archTab === 'topology' && (
                <div className="space-y-4">
                  <div className="p-6 bg-slate-900 rounded-xl text-slate-100 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed">
                    <pre className="text-teal-300">{`flowchart TD
    Client["Client Apps (Web / iOS / Android)"] -->|HTTPS / WSS| CDN["Cloudflare CDN & WAF"]
    CDN --> Gateway["API Gateway / Reverse Proxy (Nginx / Envoy)"]
    Gateway --> AuthSvc["Auth & Tenant Boundary Service"]
    Gateway --> CoreAPI["Core Domain API Service (Node.js/Go)"]
    CoreAPI --> Cache["Redis Cache & Rate Limiter (20ms P99)"]
    CoreAPI --> DB[(Primary PostgreSQL DB)]
    CoreAPI --> Queue["Message Queue (BullMQ / RabbitMQ)"]
    Queue --> Worker["Background Async Workers"]
    Worker --> ExtAPI["External Webhooks & Stripe Billing"]
    DB --> Replica[(Read Replicas with PgBouncer)]`}</pre>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800 block">Caching Strategy</span>
                      <span className="text-slate-500">Write-through Redis cache for tenant quotas and hot entities.</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800 block">Async Processing</span>
                      <span className="text-slate-500">BullMQ queues for webhook delivery and email dispatches.</span>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <span className="font-bold text-slate-800 block">Data Isolation</span>
                      <span className="text-slate-500">Row-Level Security (RLS) & workspace_id compound indexes.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Schema Tab */}
              {archTab === 'schema' && (
                <div className="p-5 bg-slate-950 rounded-xl text-emerald-300 font-mono text-xs overflow-x-auto leading-relaxed max-h-80 border border-slate-800">
                  <pre>{`-- Auto-Generated 3NF Schema with Compound Indexes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    plan_tier VARCHAR(50) DEFAULT 'starter',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE core_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workspaces_account ON workspaces(account_id);
CREATE INDEX idx_core_entities_workspace ON core_entities(workspace_id, status);
CREATE INDEX idx_core_entities_payload_gin ON core_entities USING gin (payload);`}</pre>
                </div>
              )}

              {/* API Tab */}
              {archTab === 'api' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="p-3">Method</th>
                        <th className="p-3">Route</th>
                        <th className="p-3">Description</th>
                        <th className="p-3">Auth</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      <tr>
                        <td className="p-3 font-mono font-bold text-emerald-700">POST</td>
                        <td className="p-3 font-mono text-slate-900">/api/v1/auth/register</td>
                        <td className="p-3">Registers account and issues tenant JWT session</td>
                        <td className="p-3 text-slate-400">Public</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono font-bold text-blue-700">GET</td>
                        <td className="p-3 font-mono text-slate-900">/api/v1/entities</td>
                        <td className="p-3">Lists workspace records with cursor pagination</td>
                        <td className="p-3 text-slate-600 font-semibold">Bearer JWT</td>
                      </tr>
                      <tr>
                        <td className="p-3 font-mono font-bold text-emerald-700">POST</td>
                        <td className="p-3 font-mono text-slate-900">/api/v1/entities</td>
                        <td className="p-3">Creates record and enqueues async background webhook</td>
                        <td className="p-3 text-slate-600 font-semibold">Bearer JWT</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Scaling Tab */}
              {archTab === 'scaling' && (
                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                    <span className="font-bold text-slate-900 block text-sm">Stage 1: 1,000 Users</span>
                    <span className="text-emerald-700 font-semibold block text-[11px]">$35 - $60 / month</span>
                    <p className="text-slate-600 leading-relaxed">
                      Single containerized API instance + Managed PostgreSQL (RDS t4g.small / Supabase) + Redis cache. Zero infrastructure overhead.
                    </p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                    <span className="font-bold text-slate-900 block text-sm">Stage 2: 100,000 Users</span>
                    <span className="text-indigo-700 font-semibold block text-[11px]">$250 - $400 / month</span>
                    <p className="text-slate-600 leading-relaxed">
                      Horizontal auto-scaling (HPA), PostgreSQL Read Replicas with PgBouncer connection pooling, and BullMQ cluster for background tasks.
                    </p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
                    <span className="font-bold text-slate-900 block text-sm">Stage 3: 1,000,000+ Users</span>
                    <span className="text-purple-700 font-semibold block text-[11px]">Multi-Region Clustered</span>
                    <p className="text-slate-600 leading-relaxed">
                      Database table partitioning by workspace_id, Kafka distributed event streams, Cloudflare Edge workers, and global CDN caching.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
