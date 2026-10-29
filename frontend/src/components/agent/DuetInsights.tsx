import { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { 
  Sparkles, RefreshCw, CheckCircle2, 
  BookOpen, ChevronDown, ChevronUp, Check, X, TrendingUp 
} from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

export interface DuetGap {
  id: string;
  agent_id: string;
  topic_title: string;
  frequency: number;
  sample_queries: string[];
  impact_score: 'critical' | 'high' | 'medium';
  status: 'pending' | 'approved' | 'dismissed';
  draft_content: string;
  suggested_aop?: Record<string, any>;
  created_at: string;
  resolved_at?: string;
}

interface DuetInsightsProps {
  agentId: string;
}

export default function DuetInsights({ agentId }: DuetInsightsProps) {
  const [gaps, setGaps] = useState<DuetGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [filter, setFilter] = useState<'pending' | 'approved' | 'all'>('pending');

  useEffect(() => {
    loadGaps();
  }, [agentId]);

  const loadGaps = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/duet/gaps`, 'GET');
      setGaps(res.gaps || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load Duet discovery insights');
    } finally {
      setLoading(false);
    }
  };

  const handleRunScan = async () => {
    setScanning(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/duet/run-analysis`, 'POST');
      setGaps(res.gaps || []);
      setSuccessMsg('Active Learning scan completed. Unresolved topics clustered into draft solutions.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete Duet analysis');
    } finally {
      setScanning(false);
    }
  };

  const handleApprove = async (gapId: string) => {
    setApprovingId(gapId);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/duet/gaps/${gapId}/approve`, 'POST');
      setGaps(prev => prev.map(g => g.id === gapId ? { ...g, status: 'approved' } : g));
      setSuccessMsg(res.message || 'Knowledge gap successfully vectorized and deployed to agent knowledge base!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve knowledge gap');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDismiss = async (gapId: string) => {
    try {
      await apiRequest(`/agents/${agentId}/duet/gaps/${gapId}/dismiss`, 'POST');
      setGaps(prev => prev.map(g => g.id === gapId ? { ...g, status: 'dismissed' } : g));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to dismiss recommendation');
    }
  };

  const filteredGaps = gaps.filter(g => {
    if (filter === 'pending') return g.status === 'pending';
    if (filter === 'approved') return g.status === 'approved';
    return true;
  });

  const pendingCount = gaps.filter(g => g.status === 'pending').length;
  const approvedCount = gaps.filter(g => g.status === 'approved').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-600">
              <Sparkles size={20} />
            </div>
            <h2 className="text-base font-bold text-slate-800">Duet Active Learning &amp; Discovery</h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              Self-Improving AI
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Autonomous Active Learning. Scans live conversations and tickets, clusters unanswered topics, and drafts solutions for 1-click deployment.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={handleRunScan}
          loading={scanning}
          icon={<RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />}
        >
          {scanning ? 'Clustering Topics...' : 'Run Discovery Scan'}
        </Button>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Unresolved Gaps Detected</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">{pendingCount}</div>
          <div className="text-[11px] text-amber-600 font-medium mt-1">Ready for 1-click resolution</div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Auto-Resolved &amp; Deployed</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{approvedCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Vectorized into knowledge base</div>
        </div>

        <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4">
          <div className="text-xs font-medium text-purple-700 flex items-center gap-1.5">
            <TrendingUp size={14} />
            Estimated Resolution Lift
          </div>
          <div className="text-2xl font-bold text-purple-800 mt-1">
            +{Math.min(pendingCount * 4, 18)}%
          </div>
          <div className="text-[11px] text-purple-600 font-medium mt-1">Projected autonomous gain</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'pending' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Pending Gaps ({pendingCount})
          </button>
          <button
            onClick={() => setFilter('approved')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'approved' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Deployed ({approvedCount})
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              filter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All History
          </button>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && <Alert type="error">{errorMsg}</Alert>}
      {successMsg && <Alert type="success">{successMsg}</Alert>}

      {/* Content */}
      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
          <RefreshCw size={24} className="animate-spin text-purple-600" />
          <span className="text-xs font-medium">Loading Duet Knowledge Discovery...</span>
        </div>
      ) : filteredGaps.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8">
          <Sparkles size={36} className="mx-auto text-purple-400 mb-3" />
          <h3 className="text-sm font-bold text-slate-700">No {filter === 'pending' ? 'Pending' : ''} Knowledge Gaps</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
            Click "Run Discovery Scan" to analyze recent conversations and tickets to identify unresolved inquiry clusters.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunScan}
            loading={scanning}
            icon={<Sparkles size={14} />}
          >
            Run Discovery Scan Now
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGaps.map((gap) => {
            const isExpanded = expandedGapId === gap.id;
            const isApproving = approvingId === gap.id;

            return (
              <div
                key={gap.id}
                className={`border rounded-xl p-5 transition-all ${
                  gap.status === 'approved'
                    ? 'border-emerald-200 bg-emerald-50/20'
                    : 'border-slate-200 bg-white hover:border-purple-300 shadow-sm'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{gap.topic_title}</h3>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        gap.impact_score === 'critical'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : gap.impact_score === 'high'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {gap.impact_score} Impact
                      </span>
                      {gap.status === 'approved' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          Vectorized &amp; Deployed
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          ~{gap.frequency} inquiries detected
                        </span>
                      )}
                    </div>

                    {/* Sample Queries */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-medium text-slate-400">Sample inquiries:</span>
                      {(gap.sample_queries || []).map((query, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 max-w-xs truncate"
                          title={query}
                        >
                          "{query}"
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {gap.status === 'pending' && (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleApprove(gap.id)}
                          loading={isApproving}
                          icon={<Check size={14} />}
                        >
                          Approve &amp; Ingest
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleDismiss(gap.id)}
                          icon={<X size={14} />}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                    <button
                      onClick={() => setExpandedGapId(isExpanded ? null : gap.id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title={isExpanded ? 'Collapse Draft' : 'View Draft Article'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Draft Content */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span className="flex items-center gap-1.5">
                        <BookOpen size={14} className="text-purple-600" />
                        AI-Generated Knowledge Article Draft
                      </span>
                      {gap.suggested_aop && (
                        <span className="text-[10px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                          + Includes Suggested AOP Procedure
                        </span>
                      )}
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                      {gap.draft_content}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
