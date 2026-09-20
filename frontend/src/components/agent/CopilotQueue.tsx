import { useState, useEffect } from 'react';
import { apiRequest } from '../../services/api';
import { 
  UserCheck, Check, X, RefreshCw, Loader, MessageSquare, 
  Edit3
} from 'lucide-react';
import Button from '../ui/Button';
import Alert from '../ui/Alert';

interface CopilotDraft {
  id: string;
  agent_id: string;
  conversation_id: string | null;
  user_query: string;
  draft_reply: string;
  confidence_score: number;
  citations: Array<{ content: string; similarity: number }>;
  status: 'pending' | 'approved' | 'rejected' | 'edited';
  edited_reply: string | null;
  reviewed_by: string | null;
  created_at: string;
}

interface CopilotQueueProps {
  agentId: string;
}

export default function CopilotQueue({ agentId }: CopilotQueueProps) {
  const [drafts, setDrafts] = useState<CopilotDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  useEffect(() => {
    fetchDrafts();
  }, [agentId]);

  const fetchDrafts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/copilot/drafts`, 'GET');
      setDrafts(res || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to fetch copilot drafts');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (draft: CopilotDraft) => {
    setActionLoading(draft.id);
    setErrorMsg('');
    try {
      const payload: any = {};
      if (editingDraftId === draft.id && editedContent) {
        payload.edited_reply = editedContent;
      }

      await apiRequest(`/agents/${agentId}/copilot/drafts/${draft.id}/approve`, 'POST', payload);
      setSuccessMsg('Response approved and dispatched to customer.');
      setEditingDraftId(null);
      fetchDrafts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to approve draft');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (draftId: string) => {
    setActionLoading(draftId);
    setErrorMsg('');
    try {
      await apiRequest(`/agents/${agentId}/copilot/drafts/${draftId}/reject`, 'POST', { reason: 'Rejected by reviewer' });
      setSuccessMsg('Draft discarded.');
      fetchDrafts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to reject draft');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDrafts = drafts.filter(d => d.status === statusFilter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="text-brand-600" size={22} />
            <h2 className="text-lg font-bold text-slate-900">Support Copilot &amp; Shadow Mode Queue</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Review and approve AI-generated replies before they are dispatched to end users. Allows your support and engineering team to audit draft answers on legacy systems with 100% human oversight.
          </p>
        </div>

        <button
          onClick={fetchDrafts}
          className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
          title="Refresh Queue"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {errorMsg && <Alert type="error">{errorMsg}</Alert>}
      {successMsg && <Alert type="success">{successMsg}</Alert>}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            statusFilter === 'pending'
              ? 'bg-brand-50 text-brand-700 border border-brand-200'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <span>Pending Review</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-brand-200 text-brand-800">
            {drafts.filter(d => d.status === 'pending').length}
          </span>
        </button>

        <button
          onClick={() => setStatusFilter('approved')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            statusFilter === 'approved'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Approved ({drafts.filter(d => d.status === 'approved').length})
        </button>

        <button
          onClick={() => setStatusFilter('rejected')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            statusFilter === 'rejected'
              ? 'bg-rose-50 text-rose-700 border border-rose-200'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Rejected ({drafts.filter(d => d.status === 'rejected').length})
        </button>
      </div>

      {/* Drafts List */}
      {loading ? (
        <div className="text-center py-12">
          <Loader className="animate-spin mx-auto text-slate-400" size={24} />
          <div className="text-xs text-slate-500 mt-2">Loading copilot drafts...</div>
        </div>
      ) : filteredDrafts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500 text-xs">
          No drafts found in {statusFilter} queue.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDrafts.map((draft) => (
            <div key={draft.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-400">User Inquired:</div>
                  <div className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <MessageSquare size={16} className="text-brand-500 flex-shrink-0" />
                    <span>{draft.user_query}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-right">
                  <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {(Number(draft.confidence_score) * 100).toFixed(0)}% confidence
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(draft.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Draft Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Draft Response:</span>
                  {draft.status === 'pending' && (
                    <button
                      onClick={() => {
                        setEditingDraftId(draft.id);
                        setEditedContent(draft.edited_reply || draft.draft_reply);
                      }}
                      className="text-brand-600 hover:text-brand-700 flex items-center gap-1 font-normal"
                    >
                      <Edit3 size={12} /> Edit before approval
                    </button>
                  )}
                </div>

                {editingDraftId === draft.id ? (
                  <textarea
                    rows={4}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="w-full text-xs font-sans p-3 border border-brand-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
                  />
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 whitespace-pre-wrap">
                    {draft.edited_reply || draft.draft_reply}
                  </div>
                )}
              </div>

              {/* Retrieved Citations */}
              {draft.citations && draft.citations.length > 0 && (
                <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500">Verified Citations:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {draft.citations.map((c, i) => (
                      <div key={i} className="text-[10px] text-slate-600 bg-white border border-slate-200 p-2 rounded line-clamp-2">
                        {c.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons for Pending */}
              {draft.status === 'pending' && (
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button
                    onClick={() => handleReject(draft.id)}
                    loading={actionLoading === draft.id}
                    variant="secondary"
                    size="sm"
                    icon={<X size={13} />}
                  >
                    Discard Draft
                  </Button>
                  <Button
                    onClick={() => handleApprove(draft)}
                    loading={actionLoading === draft.id}
                    variant="primary"
                    size="sm"
                    icon={<Check size={13} />}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    Approve &amp; Dispatch
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
