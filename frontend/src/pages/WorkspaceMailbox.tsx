import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import {
  ArrowLeft,
  Mail,
  Loader,
  RefreshCw,
  Send,
  Sparkles,
  Bot,
  User,
  Settings,
  Search,
  CheckCircle2,
  Clock,
  Play,
  Copy,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';

export interface MailboxThread {
  id: string;
  client_workspace_id: string;
  agent_id?: string;
  agent_name?: string;
  subject: string;
  customer_email: string;
  customer_name?: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  ai_status: 'auto_replied' | 'draft_ready' | 'needs_review' | 'manual_handled' | 'failed';
  last_message_preview?: string;
  message_count?: number;
  pending_drafts_count?: number;
  last_message_at: string;
  created_at: string;
}

export interface MailboxMessage {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  sender_email: string;
  sender_name?: string;
  recipient_email: string;
  subject: string;
  body_text: string;
  ai_generated: boolean;
  created_at: string;
}

export interface CopilotDraft {
  id: string;
  user_query: string;
  draft_reply: string;
  confidence_score: string;
  citations?: any[];
  status: string;
  created_at: string;
}

export interface MailboxSettings {
  mailbox_support_email: string;
  mailbox_forwarding_address: string;
  mailbox_mode: 'autonomous' | 'copilot' | 'manual';
  mailbox_auto_threshold: number;
  mailbox_assigned_agent_id?: string;
}

export default function WorkspaceMailbox() {
  const { wsId } = useParams();
  const { workspaces } = useWorkspace();
  const currentWs = workspaces.find((w) => w.id === wsId);
  const wsName = currentWs?.client_name || 'Workspace';

  // Thread list state
  const [threads, setThreads] = useState<MailboxThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [activeThreadData, setActiveThreadData] = useState<{
    thread: MailboxThread;
    messages: MailboxMessage[];
    pendingDraft: CopilotDraft | null;
  } | null>(null);

  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingActiveThread, setLoadingActiveThread] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'pending' | 'resolved' | 'closed'>('all');
  const [aiFilter, setAiFilter] = useState<'all' | 'draft_ready' | 'auto_replied' | 'needs_review'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Reply Composer state
  const [replyText, setReplyText] = useState('');
  const [closeOnSend, setCloseOnSend] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [actionAlert, setActionAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Settings Modal State
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settings, setSettings] = useState<MailboxSettings>({
    mailbox_support_email: '',
    mailbox_forwarding_address: `inbound+${wsId}@mail.formaai.com`,
    mailbox_mode: 'copilot',
    mailbox_auto_threshold: 0.75,
    mailbox_assigned_agent_id: '',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [agentsList, setAgentsList] = useState<{ id: string; name: string }[]>([]);

  // Simulator Modal State
  const [simulatorModalOpen, setSimulatorModalOpen] = useState(false);
  const [simName, setSimName] = useState('Alex Customer');
  const [simEmail, setSimEmail] = useState('customer@example.com');
  const [simSubject, setSimSubject] = useState('Question regarding subscription plan');
  const [simMessage, setSimMessage] = useState(
    'Hi Support,\nCan you explain what features are included in your Pro tier and how calendar appointments work?\nThanks!'
  );
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  useEffect(() => {
    fetchThreads();
    fetchSettings();
    fetchAgents();
  }, [wsId]);

  useEffect(() => {
    if (selectedThreadId) {
      fetchThreadDetails(selectedThreadId);
    } else {
      setActiveThreadData(null);
    }
  }, [selectedThreadId]);

  const fetchThreads = async () => {
    setLoadingThreads(true);
    try {
      let queryParams = `status=${statusFilter}&ai_status=${aiFilter}`;
      if (searchQuery.trim()) {
        queryParams += `&search=${encodeURIComponent(searchQuery.trim())}`;
      }
      const data = await apiRequest(`/workspaces/${wsId}/mailbox/threads?${queryParams}`, 'GET');
      setThreads(data || []);
      if (data && data.length > 0 && !selectedThreadId) {
        setSelectedThreadId(data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to fetch threads:', err.message);
    } finally {
      setLoadingThreads(false);
    }
  };

  const fetchThreadDetails = async (threadId: string) => {
    setLoadingActiveThread(true);
    try {
      const data = await apiRequest(`/workspaces/${wsId}/mailbox/threads/${threadId}`, 'GET');
      setActiveThreadData(data);
      // Pre-fill composer if a draft exists
      if (data.pendingDraft && !replyText) {
        setReplyText(data.pendingDraft.draft_reply);
      }
    } catch (err: any) {
      console.error('Failed to fetch thread details:', err.message);
    } finally {
      setLoadingActiveThread(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await apiRequest(`/workspaces/${wsId}/mailbox/settings`, 'GET');
      if (data) {
        setSettings({
          mailbox_support_email: data.mailbox_support_email || '',
          mailbox_forwarding_address: data.mailbox_forwarding_address || `inbound+${wsId}@mail.formaai.com`,
          mailbox_mode: data.mailbox_mode || 'copilot',
          mailbox_auto_threshold: parseFloat(data.mailbox_auto_threshold) || 0.75,
          mailbox_assigned_agent_id: data.mailbox_assigned_agent_id || '',
        });
      }
    } catch (err: any) {
      console.error('Failed to fetch mailbox settings:', err.message);
    }
  };

  const fetchAgents = async () => {
    try {
      const data = await apiRequest(`/workspaces/${wsId}/agents`, 'GET');
      if (data) {
        setAgentsList(data.map((a: any) => ({ id: a.id, name: a.name })));
      }
    } catch (err: any) {
      console.error('Failed to fetch agents:', err.message);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await apiRequest(`/workspaces/${wsId}/mailbox/settings`, 'PUT', settings);
      setSettingsModalOpen(false);
      setActionAlert({ type: 'success', text: 'Mailbox configuration saved successfully.' });
      setTimeout(() => setActionAlert(null), 3000);
    } catch (err: any) {
      setActionAlert({ type: 'error', text: err.message || 'Failed to save settings' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendReply = async (draftId?: string) => {
    if (!replyText.trim() || !selectedThreadId) return;
    setSendingReply(true);
    try {
      await apiRequest(`/workspaces/${wsId}/mailbox/threads/${selectedThreadId}/reply`, 'POST', {
        reply_text: replyText.trim(),
        draft_id: draftId,
        close_thread: closeOnSend,
      });

      setReplyText('');
      setActionAlert({ type: 'success', text: 'Reply sent and delivered via SMTP.' });
      setTimeout(() => setActionAlert(null), 3500);

      // Refresh current thread and list
      await fetchThreadDetails(selectedThreadId);
      await fetchThreads();
    } catch (err: any) {
      setActionAlert({ type: 'error', text: err.message || 'Failed to dispatch reply' });
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: 'open' | 'pending' | 'resolved' | 'closed') => {
    if (!selectedThreadId) return;
    try {
      await apiRequest(`/workspaces/${wsId}/mailbox/threads/${selectedThreadId}`, 'PATCH', {
        status: newStatus,
      });
      fetchThreadDetails(selectedThreadId);
      fetchThreads();
    } catch (err: any) {
      console.error('Failed to update status:', err.message);
    }
  };

  const handleRunSimulator = async () => {
    setSimLoading(true);
    setSimResult(null);
    try {
      const res = await apiRequest(`/workspaces/${wsId}/mailbox/simulate`, 'POST', {
        customer_name: simName,
        customer_email: simEmail,
        subject: simSubject,
        message: simMessage,
      });
      setSimResult(res);
      fetchThreads();
      if (res.threadId) {
        setSelectedThreadId(res.threadId);
      }
    } catch (err: any) {
      setSimResult({ error: err.message });
    } finally {
      setSimLoading(false);
    }
  };

  const renderAiBadge = (status: string) => {
    switch (status) {
      case 'draft_ready':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 text-purple-800 border border-purple-200">
            <Sparkles size={11} className="text-purple-600 animate-pulse" /> AI Draft Ready
          </span>
        );
      case 'auto_replied':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Bot size={11} className="text-emerald-600" /> AI Auto-Replied
          </span>
        );
      case 'manual_handled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
            <CheckCircle2 size={11} className="text-blue-600" /> Human Handled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock size={11} className="text-amber-600" /> Needs Review
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-7xl mx-auto p-4 sm:p-6 overflow-hidden">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link to="/" className="hover:text-slate-800 flex items-center gap-1">
              <ArrowLeft size={12} /> Workspaces
            </Link>
            <span>/</span>
            <span className="font-medium text-slate-700">{wsName}</span>
            <span>/</span>
            <span className="text-brand-600 font-medium">Mailbox</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Mail className="text-brand-600" size={24} /> Support Mailbox
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide bg-slate-100 text-slate-700 border border-slate-200">
              Mode: {settings.mailbox_mode}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSimulatorModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Play size={14} className="text-brand-600" /> Test Email Inbound
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Settings size={14} /> Mailbox Settings
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              fetchThreads();
              if (selectedThreadId) fetchThreadDetails(selectedThreadId);
            }}
          >
            <RefreshCw size={14} className={loadingThreads ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {actionAlert && (
        <div className="mt-2 flex-shrink-0">
          <Alert type={actionAlert.type}>{actionAlert.text}</Alert>
        </div>
      )}

      {/* ── 2-Column Mailbox Layout ── */}
      <div className="flex-1 flex overflow-hidden mt-4 bg-white border border-slate-200 rounded-xl shadow-sm">
        {/* ── Left Pane: Thread List ── */}
        <div className="w-full md:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-200 bg-white space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search subject, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchThreads()}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <div className="flex gap-1 overflow-x-auto py-0.5">
                {(['all', 'open', 'resolved'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setStatusFilter(s);
                      fetchThreads();
                    }}
                    className={`px-2 py-0.5 rounded capitalize font-medium transition-colors ${
                      statusFilter === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <select
                value={aiFilter}
                onChange={(e: any) => {
                  setAiFilter(e.target.value);
                  fetchThreads();
                }}
                className="text-[11px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700"
              >
                <option value="all">All AI states</option>
                <option value="draft_ready">Draft Ready</option>
                <option value="auto_replied">Auto-Replied</option>
                <option value="needs_review">Needs Review</option>
              </select>
            </div>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loadingThreads ? (
              <div className="flex items-center justify-center p-8 text-slate-400 gap-2">
                <Loader className="animate-spin" size={16} /> Loading email threads...
              </div>
            ) : threads.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                <Mail size={32} className="mx-auto text-slate-300 mb-2" />
                <p className="font-semibold text-slate-600">No email threads found</p>
                <p className="mt-1">Send a test inbound email or forward support emails to this workspace.</p>
              </div>
            ) : (
              threads.map((t) => {
                const isSelected = selectedThreadId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={`p-3 cursor-pointer transition-colors text-left ${
                      isSelected
                        ? 'bg-brand-50/70 border-l-4 border-brand-600'
                        : 'hover:bg-white border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-slate-800 truncate max-w-[180px]">
                        {t.customer_name || t.customer_email}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(t.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-slate-900 truncate mb-1">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                      {t.last_message_preview || 'No messages'}
                    </p>
                    <div className="flex items-center justify-between">
                      {renderAiBadge(t.ai_status)}
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          t.status === 'open'
                            ? 'bg-amber-100 text-amber-700'
                            : t.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {t.status}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Right Pane: Active Thread View ── */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {loadingActiveThread ? (
            <div className="flex-1 flex items-center justify-center text-slate-400 gap-2">
              <Loader className="animate-spin" size={18} /> Loading conversation...
            </div>
          ) : !activeThreadData ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 text-center">
              <Mail size={48} className="text-slate-200 mb-3" />
              <p className="text-sm font-semibold text-slate-700">Select an email thread</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Choose an inquiry from the left to view customer communication history, review AI suggested answers, or reply directly.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
                <div>
                  <h2 className="text-base font-bold text-slate-900">{activeThreadData.thread.subject}</h2>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                    <span>
                      Customer:{' '}
                      <strong className="text-slate-700">{activeThreadData.thread.customer_email}</strong>
                    </span>
                    <span>•</span>
                    <span>Agent: {activeThreadData.thread.agent_name || 'Autonomous Agent'}</span>
                  </div>
                </div>

                {/* Status Switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Status:</span>
                  <select
                    value={activeThreadData.thread.status}
                    onChange={(e: any) => handleUpdateStatus(e.target.value)}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-slate-700 font-medium focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Thread Messages Scroll View */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/40">
                {/* AI Copilot Draft Card (If Pending) */}
                {activeThreadData.pendingDraft && (
                  <div className="p-4 rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/90 to-indigo-50/60 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-purple-600 text-white">
                          <Sparkles size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-purple-900">AI Copilot Suggested Reply</h4>
                          <p className="text-[11px] text-purple-700">
                            Confidence match:{' '}
                            <strong className="font-semibold">
                              {(parseFloat(activeThreadData.pendingDraft.confidence_score) * 100).toFixed(0)}%
                            </strong>{' '}
                            grounded against verified workspace vectors
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReplyText(activeThreadData.pendingDraft!.draft_reply)}
                          className="text-xs flex items-center gap-1 bg-white hover:bg-purple-50 text-purple-700 border-purple-200"
                        >
                          <Copy size={12} /> Edit in Composer
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setReplyText(activeThreadData.pendingDraft!.draft_reply);
                            handleSendReply(activeThreadData.pendingDraft!.id);
                          }}
                          disabled={sendingReply}
                          className="text-xs flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white shadow"
                        >
                          {sendingReply ? <Loader size={12} className="animate-spin" /> : <Send size={12} />}
                          Approve &amp; Send Email
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-800 bg-white/90 p-3 rounded-lg border border-purple-100 whitespace-pre-wrap leading-relaxed font-sans">
                      {activeThreadData.pendingDraft.draft_reply}
                    </div>
                  </div>
                )}

                {/* Message List */}
                {activeThreadData.messages.map((m) => {
                  const isInbound = m.direction === 'inbound';
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'} space-y-1`}
                    >
                      <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                        {isInbound ? (
                          <>
                            <User size={12} className="text-slate-500" />
                            <span className="font-medium text-slate-700">{m.sender_name || m.sender_email}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-slate-700">
                              {m.sender_name || 'Support Agent'} {m.ai_generated && '(Forma AI)'}
                            </span>
                            <Bot size={12} className="text-brand-600" />
                          </>
                        )}
                        <span>•</span>
                        <span>{new Date(m.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </div>

                      <div
                        className={`p-3.5 rounded-2xl max-w-2xl text-xs leading-relaxed shadow-xs whitespace-pre-wrap ${
                          isInbound
                            ? 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                            : 'bg-brand-600 text-white rounded-tr-sm'
                        }`}
                      >
                        {m.body_text}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reply Composer */}
              <div className="p-4 border-t border-slate-200 bg-white flex-shrink-0 space-y-3">
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a response or edit the AI draft above..."
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={closeOnSend}
                      onChange={(e) => setCloseOnSend(e.target.checked)}
                      className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    Mark thread as resolved on send
                  </label>

                  <Button
                    size="sm"
                    onClick={() => handleSendReply(activeThreadData.pendingDraft?.id)}
                    disabled={sendingReply || !replyText.trim()}
                    className="flex items-center gap-1.5 px-4"
                  >
                    {sendingReply ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
                    Send Email Reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Settings Modal ── */}
      <Modal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        title="Mailbox &amp; Email Connector Settings"
      >
        <form onSubmit={handleSaveSettings} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Customer Support Email Address
            </label>
            <input
              type="email"
              value={settings.mailbox_support_email}
              onChange={(e) => setSettings({ ...settings, mailbox_support_email: e.target.value })}
              placeholder="e.g. support@acme.com"
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Outbound replies will be sent with this email in the From/Reply-To header.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Inbound Forwarding Target Address
            </label>
            <input
              type="text"
              readOnly
              value={settings.mailbox_forwarding_address}
              className="w-full px-3 py-2 text-xs bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-mono"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Auto-forward incoming emails from your domain (Gmail, Outlook, Postmark, SendGrid) to this webhook address.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              AI Mailbox Handling Mode
            </label>
            <select
              value={settings.mailbox_mode}
              onChange={(e: any) => setSettings({ ...settings, mailbox_mode: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-500"
            >
              <option value="copilot">Copilot Mode (AI drafts responses for team review before sending)</option>
              <option value="autonomous">Autonomous Mode (AI auto-replies instantly when confident)</option>
              <option value="manual">Manual Mode (Shared team inbox only, no AI drafts)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Auto-Reply Confidence Threshold ({(settings.mailbox_auto_threshold * 100).toFixed(0)}%)
            </label>
            <input
              type="range"
              min="0.50"
              max="0.95"
              step="0.05"
              value={settings.mailbox_auto_threshold}
              onChange={(e) => setSettings({ ...settings, mailbox_auto_threshold: parseFloat(e.target.value) })}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>50% (Lenient)</span>
              <span>75% (Recommended)</span>
              <span>95% (Strict)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assigned AI Agent
            </label>
            <select
              value={settings.mailbox_assigned_agent_id || ''}
              onChange={(e) => setSettings({ ...settings, mailbox_assigned_agent_id: e.target.value })}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Default Workspace Support Agent</option>
              {agentsList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="secondary" size="sm" type="button" onClick={() => setSettingsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={savingSettings}>
              {savingSettings ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Test Simulator Modal ── */}
      <Modal
        isOpen={simulatorModalOpen}
        onClose={() => {
          setSimulatorModalOpen(false);
          setSimResult(null);
        }}
        title="Test Inbound Email Simulator"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Simulate a real customer sending an email inquiry to test your knowledge base grounding and watch the AI generate a copilot draft or auto-reply.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Customer Name</label>
              <input
                type="text"
                value={simName}
                onChange={(e) => setSimName(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Customer Email</label>
              <input
                type="email"
                value={simEmail}
                onChange={(e) => setSimEmail(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Subject</label>
            <input
              type="text"
              value={simSubject}
              onChange={(e) => setSimSubject(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Email Body Content</label>
            <textarea
              rows={4}
              value={simMessage}
              onChange={(e) => setSimMessage(e.target.value)}
              className="w-full p-2.5 text-xs border border-slate-200 rounded-md resize-none"
            />
          </div>

          {simResult && (
            <div className={`p-3 rounded-lg text-xs ${simResult.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
              {simResult.error ? (
                <p>Simulation Error: {simResult.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold flex items-center gap-1">
                    <CheckCircle2 size={13} /> Simulation Succeeded!
                  </p>
                  <p>Action Taken: <strong className="capitalize">{simResult.status}</strong></p>
                  {simResult.confidence !== undefined && (
                    <p>RAG Grounding Score: {(simResult.confidence * 100).toFixed(1)}%</p>
                  )}
                  {simResult.draftReply && (
                    <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">
                      Draft: "{simResult.draftReply}"
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSimulatorModalOpen(false);
                setSimResult(null);
              }}
            >
              Close
            </Button>
            <Button size="sm" onClick={handleRunSimulator} disabled={simLoading}>
              {simLoading ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              Send Inbound Test
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
