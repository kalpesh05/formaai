import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../services/api';
import { 
  MessageSquare, User, Bot, Search, RefreshCw, Send, Loader, 
  Clock, Sparkles, CornerDownLeft, Eye
} from 'lucide-react';
import Button from '../ui/Button';

interface ConversationSummary {
  id: string;
  end_user_ref: string | null;
  created_at: string;
  message_count: number;
  last_message: string | null;
  last_activity: string | null;
}

interface ConversationStats {
  total_conversations: number;
  total_messages: number;
  avg_messages_per_conversation: number;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface AgentConversationsProps {
  agentId: string;
}

export default function AgentConversations({ agentId }: AgentConversationsProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [stats, setStats] = useState<ConversationStats>({
    total_conversations: 0,
    total_messages: 0,
    avg_messages_per_conversation: 0
  });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  
  // Transcript state
  const [transcript, setTranscript] = useState<MessageItem[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [selectedConvMeta, setSelectedConvMeta] = useState<any>(null);

  // Operator reply state
  const [operatorReply, setOperatorReply] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [replyError, setReplyError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations();
    fetchStats();
  }, [agentId]);

  useEffect(() => {
    if (selectedConvId) {
      fetchTranscript(selectedConvId);
    } else {
      setTranscript([]);
      setSelectedConvMeta(null);
    }
  }, [selectedConvId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const fetchConversations = async (query = searchQuery) => {
    setLoading(true);
    try {
      const url = query 
        ? `/agents/${agentId}/conversations?search=${encodeURIComponent(query)}` 
        : `/agents/${agentId}/conversations`;
      const res = await apiRequest(url, 'GET');
      setConversations(res || []);
      if (res && res.length > 0 && !selectedConvId) {
        setSelectedConvId(res[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await apiRequest(`/agents/${agentId}/conversations-stats`, 'GET');
      if (res) {
        setStats({
          total_conversations: Number(res.total_conversations) || 0,
          total_messages: Number(res.total_messages) || 0,
          avg_messages_per_conversation: Number(res.avg_messages_per_conversation) || 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch conversation stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchTranscript = async (convId: string) => {
    setTranscriptLoading(true);
    setReplyError('');
    try {
      const res = await apiRequest(`/agents/${agentId}/conversations/${convId}`, 'GET');
      if (res) {
        setSelectedConvMeta(res.conversation);
        setTranscript(res.messages || []);
      }
    } catch (err) {
      console.error('Failed to fetch transcript:', err);
    } finally {
      setTranscriptLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchConversations(searchQuery);
  };

  const handleSendOperatorReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorReply.trim() || !selectedConvId) return;

    setReplyLoading(true);
    setReplyError('');
    try {
      const newMsg = await apiRequest(
        `/agents/${agentId}/conversations/${selectedConvId}/reply`,
        'POST',
        { message: operatorReply.trim() }
      );
      setTranscript(prev => [...prev, newMsg]);
      setOperatorReply('');
      // Refresh list to update counts
      fetchConversations(searchQuery);
      fetchStats();
    } catch (err: any) {
      setReplyError(err.message || 'Failed to send operator reply');
    } finally {
      setReplyLoading(false);
    }
  };

  const formatTimestamp = (isoDate?: string | null) => {
    if (!isoDate) return 'Unknown';
    try {
      const d = new Date(isoDate);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoDate;
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Conversations</span>
            <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
              <MessageSquare size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{stats.total_conversations}</p>
          <span className="text-xs text-slate-400 mt-1 block">Live user & visitor sessions</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Messages Exchanged</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Bot size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{stats.total_messages}</p>
          <span className="text-xs text-slate-400 mt-1 block">Queries answered & synthesized</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Avg Depth / Session</span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Sparkles size={18} />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-slate-900">{stats.avg_messages_per_conversation} msgs</p>
          <span className="text-xs text-slate-400 mt-1 block">RAG interactions per chat</span>
        </div>
      </div>

      {/* Main Conversation & Transcript Split View */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col md:flex-row h-[680px]">
        {/* Left Side: Conversation List & Search */}
        <div className="w-full md:w-80 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
          <div className="p-3.5 border-b border-slate-200 bg-white">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                placeholder="Search messages or visitors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-100/80 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 placeholder-slate-400"
              />
              <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            </form>
            <div className="flex items-center justify-between mt-2.5 px-0.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {conversations.length} Active {conversations.length === 1 ? 'Session' : 'Sessions'}
              </span>
              <button 
                type="button"
                onClick={() => { fetchConversations(); fetchStats(); }}
                disabled={loading || statsLoading}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded"
                title="Refresh sessions"
              >
                <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {loading && conversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                <Loader size={18} className="animate-spin text-brand-600" />
                <span className="text-xs">Loading conversations...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-xs font-semibold text-slate-600">No conversations found</p>
                <p className="text-[11px] text-slate-400 mt-1">Visitor chats from your widget will appear here automatically.</p>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;
                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`p-3.5 cursor-pointer transition-colors text-left ${
                      isSelected 
                        ? 'bg-brand-50/70 border-l-4 border-l-brand-600' 
                        : 'hover:bg-slate-100/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 font-medium text-xs text-slate-800 truncate">
                        <User size={13} className="text-slate-400 flex-shrink-0" />
                        <span className="truncate">{conv.end_user_ref || 'Anonymous Visitor'}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {conv.message_count} msgs
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {conv.last_message || 'Session started'}
                    </p>

                    <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-2 font-sans">
                      <Clock size={10} />
                      <span>{formatTimestamp(conv.last_activity || conv.created_at)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Transcript & Replay Details */}
        <div className="flex-1 flex flex-col h-full bg-white">
          {selectedConvId ? (
            <>
              {/* Header Bar */}
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/40">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      {selectedConvMeta?.end_user_ref || 'Anonymous Visitor'}
                    </span>
                    <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                      ID: {selectedConvId.slice(0, 8)}...
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Started: {formatTimestamp(selectedConvMeta?.created_at)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Live RAG Session
                  </span>
                </div>
              </div>

              {/* Message Transcript Stream */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-slate-50/30">
                {transcriptLoading ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader size={20} className="animate-spin text-brand-600" />
                    <span className="text-xs">Loading message replay...</span>
                  </div>
                ) : transcript.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                    <MessageSquare size={28} className="text-slate-300 mb-2" />
                    <p className="text-xs font-semibold text-slate-600">No messages in this session yet</p>
                  </div>
                ) : (
                  transcript.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold shadow-xs ${
                            isUser
                              ? 'bg-slate-700 text-white'
                              : 'bg-brand-600 text-white'
                          }`}
                        >
                          {isUser ? <User size={14} /> : <Bot size={14} />}
                        </div>

                        <div>
                          <div
                            className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                              isUser
                                ? 'bg-slate-800 text-white rounded-tr-xs'
                                : 'bg-white border border-slate-200 text-slate-800 shadow-xs rounded-tl-xs whitespace-pre-wrap'
                            }`}
                          >
                            {msg.content}
                          </div>
                          <span className={`text-[10px] text-slate-400 block mt-1 px-1 ${isUser ? 'text-right' : 'text-left'}`}>
                            {formatTimestamp(msg.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Operator Intervention Reply Bar */}
              <div className="p-3.5 border-t border-slate-200 bg-white">
                {replyError && (
                  <div className="mb-2 text-[11px] text-red-600 bg-red-50 p-2 rounded border border-red-200">
                    {replyError}
                  </div>
                )}
                <form onSubmit={handleSendOperatorReply} className="flex gap-2">
                  <input
                    type="text"
                    value={operatorReply}
                    onChange={(e) => setOperatorReply(e.target.value)}
                    placeholder="Intervene & reply directly to this visitor as operator..."
                    className="flex-1 px-3.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 text-slate-800 placeholder-slate-400"
                    disabled={replyLoading}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="sm"
                    loading={replyLoading}
                    disabled={!operatorReply.trim() || replyLoading}
                    icon={<Send size={13} />}
                  >
                    Reply
                  </Button>
                </form>
                <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400 px-1">
                  <span>Replies sent here will inject directly into this customer's active chat window.</span>
                  <span className="flex items-center gap-1 font-mono">
                    <CornerDownLeft size={10} /> Enter to send
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <Eye size={36} className="text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-700">Select a conversation</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Choose a session from the list on the left to inspect the customer's full transcript and step in with manual replies.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
