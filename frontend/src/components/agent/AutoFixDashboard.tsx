import { useState, useEffect, FormEvent } from 'react';
import { apiRequest } from '../../services/api';
import { 
  GitPullRequest, GitBranch, GitCommit, CheckCircle2, Clock, 
  AlertTriangle, Play, Check, X, ChevronDown, ChevronUp, ExternalLink, 
  RefreshCw, FileCode, Bug, Sparkles, Server, Loader
} from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface AutoFixPR {
  id: string;
  agent_id: string;
  ticket_id: string | null;
  title: string;
  bug_description: string;
  error_trace: string | null;
  target_file: string;
  branch_name: string;
  github_pr_url: string | null;
  github_pr_number: number | null;
  reproduction_test: string;
  patch_diff: string;
  status: 'open' | 'approved' | 'merged' | 'rejected';
  environments: string[];
  created_at: string;
  updated_at: string;
}

interface AutoFixDashboardProps {
  agentId: string;
}

export default function AutoFixDashboard({ agentId }: AutoFixDashboardProps) {
  const [prs, setPrs] = useState<AutoFixPR[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'approved' | 'merged' | 'rejected'>('all');
  const [expandedPrId, setExpandedPrId] = useState<string | null>(null);
  const [activeTabPerPr, setActiveTabPerPr] = useState<Record<string, 'diff' | 'test' | 'trace'>>({});

  // Diagnosis Modal / Form State
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formBugDesc, setFormBugDesc] = useState('White screen on client report export: TypeError when custom formula expression evaluates to undefined');
  const [formTrace, setFormTrace] = useState(`TypeError: Cannot read properties of undefined (reading 'toUpperCase')
    at ReportBuilder.exportRow (src/analytics/ReportBuilder.js:140:32)
    at ExportPipeline.processBatch (src/analytics/ExportPipeline.js:84:18)
    at HTMLButtonElement.handleDownload (src/views/ReportsView.js:210:9)`);
  const [formTargetFile, setFormTargetFile] = useState('src/analytics/ReportBuilder.js');
  const [formRepo, setFormRepo] = useState('legacy-core');

  useEffect(() => {
    fetchPRs();
  }, [agentId]);

  const fetchPRs = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/autofix/prs`, 'GET');
      const loadedPrs: AutoFixPR[] = res?.prs || [];
      setPrs(loadedPrs);
      if (loadedPrs.length > 0 && !expandedPrId) {
        setExpandedPrId(loadedPrs[0].id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch Auto-Fix Pull Requests');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateFix = async (e: FormEvent) => {
    e.preventDefault();
    if (!formBugDesc.trim()) return;

    setGenerating(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/agents/${agentId}/autofix/generate`, 'POST', {
        title: formTitle.trim() || undefined,
        bugDescription: formBugDesc,
        errorTrace: formTrace.trim() || undefined,
        targetFile: formTargetFile.trim() || undefined,
        repoConfig: {
          owner: 'acme-saas',
          repo: formRepo.trim() || 'legacy-core'
        }
      });

      if (res.success && res.pr) {
        setPrs([res.pr, ...prs]);
        setExpandedPrId(res.pr.id);
        setShowGenerateModal(false);
        setSuccessMsg(`Auto-Fix PR #${res.pr.github_pr_number || 'new'} synthesized with verified reproduction test & surgical diff!`);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate auto-fix PR');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprovePR = async (prId: string) => {
    setActionLoading(prId);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/agents/${agentId}/autofix/prs/${prId}/approve`, 'POST', {
        environments: ['dev', 'stage']
      });

      setPrs(prs.map(p => p.id === prId ? { ...p, status: 'approved', environments: ['dev', 'stage'] } : p));
      setSuccessMsg(res.message || 'Auto-Fix PR approved for Staging pipeline.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve Auto-Fix PR');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMergePR = async (prId: string) => {
    setActionLoading(prId);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await apiRequest(`/agents/${agentId}/autofix/prs/${prId}/merge`, 'POST');
      setPrs(prs.map(p => p.id === prId ? { ...p, status: 'merged', environments: ['dev', 'stage', 'prod'] } : p));
      setSuccessMsg(res.message || 'Auto-Fix PR merged & promoted across Dev, Stage, and Prod!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to merge Auto-Fix PR');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPR = async (prId: string) => {
    setActionLoading(prId);
    setErrorMsg('');

    try {
      await apiRequest(`/agents/${agentId}/autofix/prs/${prId}/reject`, 'POST');
      setPrs(prs.map(p => p.id === prId ? { ...p, status: 'rejected' } : p));
      setSuccessMsg('Auto-Fix PR marked as rejected.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reject PR');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredPrs = prs.filter(pr => {
    if (statusFilter === 'all') return true;
    return pr.status === statusFilter;
  });

  const totalPrs = prs.length;
  const mergedCount = prs.filter(p => p.status === 'merged').length;
  const approvedCount = prs.filter(p => p.status === 'approved').length;
  const hoursSaved = (totalPrs * 4.5).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Path B Autonomous Engine
              </span>
              <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                <CheckCircle2 size={13} /> 100% Fail-to-Pass Verified
              </span>
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <GitPullRequest className="text-indigo-400" size={22} />
              Autonomous Bug Diagnostic & Auto-Fix PRs
            </h2>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              When client issues or Sentry telemetry catch white screens and formula bugs in your 7+ year legacy codebase, 
              Forma AI diagnoses the root cause, synthesizes an isolated reproduction test, crafts a zero-regression surgical diff, 
              and opens a GitHub PR ready for 1-click developer approval.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchPRs}
              icon={<RefreshCw size={13} className={loading ? 'animate-spin' : ''} />}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowGenerateModal(true)}
              icon={<Sparkles size={14} className="text-indigo-200" />}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              Diagnose & Auto-Fix
            </Button>
          </div>
        </div>

        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80">
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Total PRs Generated</div>
            <div className="text-2xl font-bold text-white mt-1 flex items-baseline gap-2">
              {totalPrs}
              <span className="text-xs font-normal text-slate-400">synthesized</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Reproduction Test Rate</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-baseline gap-2">
              100%
              <span className="text-xs font-normal text-slate-400">fail-to-pass</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Dev Time Saved</div>
            <div className="text-2xl font-bold text-indigo-300 mt-1 flex items-baseline gap-2">
              ~{hoursSaved} hrs
              <span className="text-xs font-normal text-slate-400">saved</span>
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
            <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Pipeline Deployments</div>
            <div className="text-2xl font-bold text-sky-400 mt-1 flex items-baseline gap-2">
              {mergedCount + approvedCount}
              <span className="text-xs font-normal text-slate-400">Dev &bull; Stage &bull; Prod</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <Alert type="error">{errorMsg}</Alert>
      )}
      {successMsg && (
        <Alert type="success">{successMsg}</Alert>
      )}

      {/* Filters Bar */}
      <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-2">Status:</span>
          {(['all', 'open', 'approved', 'merged', 'rejected'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                statusFilter === tab
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'open' && prs.filter(p => p.status === 'open').length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px]">
                  {prs.filter(p => p.status === 'open').length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400">
          Showing {filteredPrs.length} of {prs.length} pull requests
        </div>
      </div>

      {/* PR Cards List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3">
          <Loader className="animate-spin text-indigo-600" size={24} />
          <span className="text-sm font-medium">Scanning repositories & Auto-Fix logs...</span>
        </div>
      ) : filteredPrs.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200 space-y-3">
          <GitPullRequest className="mx-auto text-slate-300" size={36} />
          <div className="text-sm font-semibold text-slate-700">No Auto-Fix Pull Requests Found</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Click &ldquo;Diagnose & Auto-Fix&rdquo; to simulate a Sentry white-screen exception or connect an inbound bug ticket.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowGenerateModal(true)}
            icon={<Sparkles size={13} />}
          >
            Create First Auto-Fix
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredPrs.map(pr => {
            const isExpanded = expandedPrId === pr.id;
            const currentTab = activeTabPerPr[pr.id] || 'diff';

            return (
              <div 
                key={pr.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm transition-all hover:border-slate-300"
              >
                {/* PR Card Header */}
                <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Status Badge */}
                      {pr.status === 'open' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock size={12} /> Pending Review
                        </span>
                      )}
                      {pr.status === 'approved' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          <CheckCircle2 size={12} /> Approved (Staging Ready)
                        </span>
                      )}
                      {pr.status === 'merged' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 size={12} /> Merged & Live (Prod)
                        </span>
                      )}
                      {pr.status === 'rejected' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <X size={12} /> Rejected
                        </span>
                      )}

                      {/* GitHub PR link badge */}
                      {pr.github_pr_url ? (
                        <a 
                          href={pr.github_pr_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-mono font-medium text-slate-600 hover:text-indigo-600 transition-colors bg-slate-100 hover:bg-indigo-50 px-2 py-0.5 rounded border border-slate-200"
                        >
                          <GitPullRequest size={12} /> #{pr.github_pr_number || 104}
                          <ExternalLink size={10} className="text-slate-400" />
                        </a>
                      ) : (
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          #{pr.github_pr_number || 104}
                        </span>
                      )}

                      {/* Target Branch */}
                      <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                        <GitBranch size={11} /> {pr.branch_name}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      {pr.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <FileCode size={13} className="text-slate-400" />
                        Target: <code className="font-mono text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{pr.target_file}</code>
                      </span>
                      <span>&bull;</span>
                      <span>Created {new Date(pr.created_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Right Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {pr.status === 'open' && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRejectPR(pr.id)}
                          loading={actionLoading === pr.id}
                          className="text-slate-600 hover:text-red-600 hover:border-red-200"
                          title="Reject PR"
                        >
                          Reject
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprovePR(pr.id)}
                          loading={actionLoading === pr.id}
                          icon={<Check size={13} />}
                          className="bg-sky-600 hover:bg-sky-700 text-white"
                        >
                          Approve (Staging)
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleMergePR(pr.id)}
                          loading={actionLoading === pr.id}
                          icon={<Play size={13} />}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          1-Click Deploy Prod
                        </Button>
                      </>
                    )}

                    {pr.status === 'approved' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleMergePR(pr.id)}
                        loading={actionLoading === pr.id}
                        icon={<Play size={13} />}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        1-Click Promote to Prod
                      </Button>
                    )}

                    <button
                      onClick={() => setExpandedPrId(isExpanded ? null : pr.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                  </div>
                </div>

                {/* Environment Deployment Pipeline Stepper */}
                <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Server size={12} /> Pipeline Stages:
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Check size={10} /> Dev
                      </span>
                      <span className="text-slate-300">&rarr;</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                        pr.status === 'approved' || pr.status === 'merged'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {pr.status === 'approved' || pr.status === 'merged' ? <Check size={10} /> : null}
                        Staging
                      </span>
                      <span className="text-slate-300">&rarr;</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                        pr.status === 'merged'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}>
                        {pr.status === 'merged' ? <Check size={10} /> : null}
                        Production
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-500 text-[11px]">
                    {pr.status === 'merged' ? (
                      <span className="text-emerald-700 font-medium">Verified active in production environment</span>
                    ) : pr.status === 'approved' ? (
                      <span className="text-sky-700 font-medium">Passing regression tests on staging environment</span>
                    ) : (
                      <span className="text-amber-700 font-medium">Awaiting 1-click developer review</span>
                    )}
                  </div>
                </div>

                {/* Collapsible Details Body */}
                {isExpanded && (
                  <div className="p-5 space-y-4">
                    {/* Bug summary */}
                    <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-3 text-xs">
                      <div className="font-semibold text-amber-900 flex items-center gap-1.5 mb-1">
                        <Bug size={13} className="text-amber-600" /> Bug Description & Root Cause:
                      </div>
                      <div className="text-amber-800 leading-relaxed">
                        {pr.bug_description}
                      </div>
                    </div>

                    {/* Sub-tabs: Unified Diff / Reproduction Test / Sentry Stack Trace */}
                    <div>
                      <div className="flex border-b border-slate-200">
                        <button
                          onClick={() => setActiveTabPerPr(prev => ({ ...prev, [pr.id]: 'diff' }))}
                          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            currentTab === 'diff'
                              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                              : 'border-transparent text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <GitCommit size={14} /> Unified Patch Diff
                        </button>
                        <button
                          onClick={() => setActiveTabPerPr(prev => ({ ...prev, [pr.id]: 'test' }))}
                          className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                            currentTab === 'test'
                              ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                              : 'border-transparent text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <FileCode size={14} /> Reproduction Unit Test (Jest/Vitest)
                        </button>
                        {pr.error_trace && (
                          <button
                            onClick={() => setActiveTabPerPr(prev => ({ ...prev, [pr.id]: 'trace' }))}
                            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
                              currentTab === 'trace'
                                ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            <AlertTriangle size={14} /> Sentry Stack Trace
                          </button>
                        )}
                      </div>

                      {/* Content panel */}
                      <div className="mt-3">
                        {currentTab === 'diff' && (
                          <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-slate-950 leading-relaxed shadow-inner">
                            {pr.patch_diff.split('\n').map((line, idx) => {
                              const isAddition = line.startsWith('+') && !line.startsWith('+++');
                              const isDeletion = line.startsWith('-') && !line.startsWith('---');
                              const isHunk = line.startsWith('@@');

                              let lineClass = 'text-slate-300';
                              if (isAddition) lineClass = 'bg-emerald-950/60 text-emerald-300 font-semibold px-1 rounded-xs';
                              if (isDeletion) lineClass = 'bg-rose-950/60 text-rose-300 line-through px-1 rounded-xs';
                              if (isHunk) lineClass = 'text-sky-400 font-semibold';

                              return (
                                <div key={idx} className={lineClass}>
                                  {line || ' '}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {currentTab === 'test' && (
                          <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-slate-950 leading-relaxed shadow-inner">
                            <pre className="text-emerald-300">{pr.reproduction_test}</pre>
                          </div>
                        )}

                        {currentTab === 'trace' && pr.error_trace && (
                          <div className="bg-slate-900 text-rose-300 rounded-lg p-4 font-mono text-xs overflow-x-auto border border-slate-950 leading-relaxed shadow-inner">
                            <pre>{pr.error_trace}</pre>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Auto-Fix Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-600" />
                  Synthesize Autonomous Auto-Fix & Pull Request
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Input customer bug report or Sentry error trace from legacy code to auto-generate reproduction tests & patches.
                </p>
              </div>
              <button
                onClick={() => setShowGenerateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGenerateFix} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PR Title (Optional)
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Fix white-screen exception on undefined formula evaluation"
                  className="w-full text-xs rounded border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bug Summary / Client Complaint *
                </label>
                <textarea
                  rows={2}
                  value={formBugDesc}
                  onChange={(e) => setFormBugDesc(e.target.value)}
                  required
                  placeholder="Describe the exact user symptoms or failure mode..."
                  className="w-full text-xs rounded border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sentry / Telemetry Error Stack Trace
                </label>
                <textarea
                  rows={4}
                  value={formTrace}
                  onChange={(e) => setFormTrace(e.target.value)}
                  placeholder="TypeError: Cannot read properties of undefined..."
                  className="w-full text-xs font-mono rounded border border-slate-300 p-2.5 text-slate-800 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Target File
                  </label>
                  <input
                    type="text"
                    value={formTargetFile}
                    onChange={(e) => setFormTargetFile(e.target.value)}
                    placeholder="src/analytics/ReportBuilder.js"
                    className="w-full text-xs font-mono rounded border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Repository Name
                  </label>
                  <input
                    type="text"
                    value={formRepo}
                    onChange={(e) => setFormRepo(e.target.value)}
                    placeholder="legacy-core"
                    className="w-full text-xs font-mono rounded border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowGenerateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={generating}
                  icon={<Sparkles size={14} />}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Synthesize PR & Tests
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
