import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest, getToken, API_HOST } from '../services/api';
import { useWorkspace } from '../context/WorkspaceContext';
import { 
  Bot, Settings, Hammer, FileText, Code2, Save, Upload, 
  Globe, AlertTriangle, Play, RefreshCw, Send, 
  ArrowLeft, Loader, Copy, Check, Trash2,
  FileUp, X, ShieldCheck, UserCheck, GitPullRequest,
  Database, Activity, Calendar, Ticket, ChevronDown, ChevronUp, SlidersHorizontal
} from 'lucide-react';
import Toggle from '../components/ui/Toggle';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import EvaluationSuite from '../components/agent/EvaluationSuite';
import CopilotQueue from '../components/agent/CopilotQueue';
import AutoFixDashboard from '../components/agent/AutoFixDashboard';

interface Agent {
  id: string;
  name: string;
  template_type: 'support' | 'sales';
  llm_provider: string;
  llm_model: string;
  status: 'draft' | 'live';
  api_key: string | null;
  config: {
    systemPrompt?: string;
    temperature?: number;
    confidenceThreshold?: number;
    fallbackMode?: 'escalate_ticket' | 'safe_refusal';
    copilotMode?: boolean;
  };
}

interface Tool {
  id: string;
  tool_type: 'calendar_booking' | 'ticket_create' | 'database_query' | 'sentry_telemetry';
  enabled: boolean;
  tool_config: any;
}

interface DataSource {
  id: string;
  source_type: 'file' | 'url';
  source_ref: string;
  status: 'pending' | 'processed' | 'failed';
  created_at: string;
}

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  actions?: any[];
}

export default function AgentConfig() {
  const { wsId, agentId } = useParams();
  const { workspaces } = useWorkspace();
  const currentWs = workspaces.find(w => w.id === wsId);
  const wsName = currentWs?.client_name || 'Workspace';

  const [activeTab, setActiveTab] = useState<'settings' | 'tools' | 'ingestion' | 'evaluation' | 'copilot' | 'autofix' | 'widget'>('settings');
  const [agent, setAgent] = useState<Agent | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Settings inputs
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [model, setModel] = useState('gemini-1.5-flash');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.70);
  const [fallbackMode, setFallbackMode] = useState<'escalate_ticket' | 'safe_refusal'>('escalate_ticket');
  const [copilotMode, setCopilotMode] = useState(false);

  // Ingestion inputs
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [urlToScrape, setUrlToScrape] = useState('');
  const [crawlMode, setCrawlMode] = useState<'single' | 'recursive'>('single');
  const [maxCrawlPages, setMaxCrawlPages] = useState(15);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [deleteDsLoading, setDeleteDsLoading] = useState<string | null>(null);

  // Deploying state
  const [deployLoading, setDeployLoading] = useState(false);

  // Copy state
  const [copied, setCopied] = useState(false);

  // Chat sandbox & simulated session context
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [simulatedUserId, setSimulatedUserId] = useState('usr_9914');
  const [simulatedPlan, setSimulatedPlan] = useState('Team Pro (payment sync pending)');
  const [simulatedPage, setSimulatedPage] = useState('/analytics/export');
  const [showContextDrawer, setShowContextDrawer] = useState(false);

  // Tool config drawer
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [toolConfigDraft, setToolConfigDraft] = useState<Record<string, any>>({});
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgentDetails();
  }, [agentId]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const fetchAgentDetails = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await apiRequest(`/agents/${agentId}`, 'GET');
      setAgent(data);
      setName(data.name);
      setProvider(data.llm_provider);
      setModel(data.llm_model);
      setSystemPrompt(data.config?.systemPrompt || '');
      setTemperature(data.config?.temperature ?? 0.7);
      setConfidenceThreshold(data.config?.confidenceThreshold ?? 0.70);
      setFallbackMode(data.config?.fallbackMode || 'escalate_ticket');
      setCopilotMode(data.config?.copilotMode === true);
      setTools(data.tools || []);
      setDataSources(data.data_sources || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load agent settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setSuccessMsg('');
    setErrorMsg('');

    try {
      const updated = await apiRequest(`/agents/${agentId}`, 'PATCH', {
        name,
        llm_provider: provider,
        llm_model: model,
        config: { 
          systemPrompt, 
          temperature,
          confidenceThreshold,
          fallbackMode,
          copilotMode
        }
      });
      setAgent(updated);
      setIsDirty(false);
      setSuccessMsg('Settings and accuracy guardrails updated successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update settings');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteDataSource = async (dsId: string) => {
    if (!window.confirm('Are you sure you want to remove this data source? Its vector embeddings will also be permanently deleted.')) {
      return;
    }
    setDeleteDsLoading(dsId);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await apiRequest(`/agents/${agentId}/data-sources/${dsId}`, 'DELETE');
      setDataSources(prev => prev.filter(d => d.id !== dsId));
      setSuccessMsg('Data source removed successfully.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove data source');
    } finally {
      setDeleteDsLoading(null);
    }
  };

  const handleToggleTool = async (toolId: string, currentStatus: boolean) => {
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agent-tools/${toolId}`, 'PATCH', {
        enabled: !currentStatus
      });
      setTools(tools.map(t => t.id === toolId ? { ...t, enabled: res.enabled } : t));
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to toggle tool status');
    }
  };

  const handleUpdateToolConfig = async (toolId: string, updatedConfig: any) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await apiRequest(`/agent-tools/${toolId}`, 'PATCH', {
        tool_config: updatedConfig
      });
      setTools(tools.map(t => t.id === toolId ? { ...t, tool_config: res.tool_config } : t));
      setSuccessMsg('Tool configuration updated successfully.');
      setExpandedToolId(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save tool configuration');
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileToUpload) return;
    setIngestLoading(true);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', fileToUpload);

    try {
      const res = await fetch(`${API_HOST}/api/v1/agents/${agentId}/data-sources/file`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }

      const ds = await res.json();
      setDataSources([ds, ...dataSources]);
      setFileToUpload(null);
      
      // Auto-refresh queue in 5s
      setTimeout(fetchAgentDetails, 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to upload document');
    } finally {
      setIngestLoading(false);
    }
  };

  const handleUrlScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlToScrape.trim()) return;
    setIngestLoading(true);
    setErrorMsg('');

    try {
      const endpoint = crawlMode === 'recursive'
        ? `/agents/${agentId}/data-sources/crawl`
        : `/agents/${agentId}/data-sources/url`;

      const payload = crawlMode === 'recursive'
        ? { rootUrl: urlToScrape, maxPages: maxCrawlPages }
        : { url: urlToScrape };

      const ds = await apiRequest(endpoint, 'POST', payload);
      setDataSources([ds, ...dataSources]);
      setUrlToScrape('');
      
      // Auto-refresh queue in 5s
      setTimeout(fetchAgentDetails, 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to queue web source');
    } finally {
      setIngestLoading(false);
    }
  };

  const handleDeployAgent = async () => {
    setDeployLoading(true);
    setErrorMsg('');
    try {
      const res = await apiRequest(`/agents/${agentId}/deploy`, 'POST');
      if (agent) {
        setAgent({ ...agent, status: res.status, api_key: res.api_key });
      }
      setSuccessMsg('Agent deployed successfully. Widget API key is live.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Deployment failed');
    } finally {
      setDeployLoading(false);
    }
  };

  const handleCopyWidgetCode = () => {
    if (!agent?.api_key) return;
    const code = `<!-- 1. Load Widget -->\n<script\n  src="${API_HOST}/widget.js"\n  data-agent-id="${agent.id}"\n  data-agent-key="${agent.api_key}">\n</script>\n\n<!-- 2. Pass Authenticated Session Context (Optional) -->\n<script>\n  window.FormaAI && window.FormaAI.identify({\n    userId: "usr_9914",\n    email: "customer@example.com",\n    plan: "Team Pro",\n    currentPage: window.location.pathname\n  });\n</script>`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const userContextPayload = simulatedUserId.trim() ? {
        user_id: simulatedUserId.trim(),
        plan: simulatedPlan,
        currentPage: simulatedPage,
        email: `${simulatedUserId.trim()}@client.com`
      } : undefined;

      const res = await apiRequest(`/agents/${agentId}/query`, 'POST', {
        message: userMsg,
        conversation_id: convId || undefined,
        user_context: userContextPayload
      });

      if (res.conversation_id && !convId) {
        setConvId(res.conversation_id);
      }

      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: res.reply,
        actions: res.actions_taken
      }]);
    } catch (err: any) {
      setChatMessages(prev => [...prev, {
        sender: 'bot',
        text: `Error calling agent: ${err.message}`
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleResetSandboxChat = () => {
    setChatMessages([]);
    setConvId(null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 gap-2 text-slate-500 text-sm">
        <Loader className="animate-spin text-brand-600" size={24} /> Loading settings...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      {/* Top Header navbar */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link 
            to="/"
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
            title="Back to Overview"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold tracking-wider uppercase">
              <Link to="/" className="hover:text-slate-600 transition-colors">Workspaces</Link>
              <span>/</span>
              <span className="text-slate-600">{wsName}</span>
            </div>
            <h1 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Bot size={18} className="text-brand-600" />
              {agent?.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Badge status={agent?.status || 'draft'} />
          {agent?.status !== 'live' && (
            <Button
              onClick={handleDeployAgent}
              loading={deployLoading}
              variant="primary"
              size="sm"
              icon={<Play size={12} />}
              className="bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500"
            >
              Deploy Chatbot
            </Button>
          )}
        </div>
      </header>

      {/* Configuration Hub Inner Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left column Tabs selector */}
        <aside className="w-56 border-r border-slate-200 bg-white p-4 space-y-1">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'settings' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Settings size={18} />
            <span>Agent Settings</span>
          </button>
          <button
            onClick={() => setActiveTab('tools')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'tools' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Hammer size={18} />
            <span>Predefined Tools</span>
          </button>
          <button
            onClick={() => setActiveTab('ingestion')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'ingestion' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <FileText size={18} />
            <span>Knowledge Base</span>
          </button>
          <button
            onClick={() => setActiveTab('evaluation')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'evaluation' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <ShieldCheck size={18} />
            <span>Evaluation Suite</span>
          </button>
          <button
            onClick={() => setActiveTab('copilot')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'copilot' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <UserCheck size={18} />
            <span>Support Copilot</span>
          </button>
          <button
            onClick={() => setActiveTab('autofix')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'autofix' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <GitPullRequest size={18} />
            <span>Auto-Fix & PRs</span>
          </button>
          <button
            onClick={() => setActiveTab('widget')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              activeTab === 'widget' ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Code2 size={18} />
            <span>Widget & Sandbox</span>
          </button>
        </aside>

        {/* Right column main wizard panels */}
        <main className="flex-1 bg-slate-50 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            
            {isDirty && (
              <Alert 
                type="warning"
                action={
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={handleSaveSettings}
                    className="bg-amber-700 hover:bg-amber-800 text-white"
                  >
                    Save Changes
                  </Button>
                }
              >
                You have unsaved changes in Agent Settings.
              </Alert>
            )}

            {successMsg && <Alert type="success">{successMsg}</Alert>}
            {errorMsg && <Alert type="error">{errorMsg}</Alert>}

            {/* TAB 1: Agent Settings */}
            {activeTab === 'settings' && (
              <form onSubmit={handleSaveSettings} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold text-slate-800">Settings Configuration</h2>
                  {isDirty && (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      Unsaved changes
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Agent Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => { setName(e.target.value); setIsDirty(true); }}
                      className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">AI Provider</label>
                    <select
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value);
                        if (e.target.value === 'gemini') setModel('gemini-1.5-flash');
                        setIsDirty(true);
                      }}
                      className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Model Selection</label>
                    <select
                      value={model}
                      onChange={(e) => { setModel(e.target.value); setIsDirty(true); }}
                      className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm"
                    >
                      {provider === 'gemini' ? (
                        <>
                          <option value="gemini-1.5-flash">gemini-1.5-flash (Recommended)</option>
                          <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                        </>
                      ) : provider === 'openai' ? (
                        <>
                          <option value="gpt-4o-mini">gpt-4o-mini</option>
                          <option value="gpt-4o">gpt-4o</option>
                        </>
                      ) : (
                        <>
                          <option value="claude-3-5-sonnet">claude-3-5-sonnet</option>
                          <option value="claude-3-haiku">claude-3-haiku</option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm font-semibold text-slate-700">Creativity / Temperature</label>
                      <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {temperature}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={temperature}
                      onChange={(e) => { setTemperature(parseFloat(e.target.value)); setIsDirty(true); }}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600 mt-2.5"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
                      <span>Strict / Exact (0.0)</span>
                      <span>Balanced (0.7)</span>
                      <span>Creative (1.0)</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">System Instructions Prompt</label>
                  <p className="text-[11px] text-slate-400 mb-1.5">
                    Define the guidelines, behavior, tone, and scope rules the chatbot must adhere to during chats.
                  </p>
                  <textarea
                    rows={8}
                    value={systemPrompt}
                    onChange={(e) => { setSystemPrompt(e.target.value); setIsDirty(true); }}
                    className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-sm font-sans"
                    placeholder="You are an expert customer agent..."
                  />
                </div>

                {/* Zero-Blunder Guardrails Section */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-brand-600" />
                    <h3 className="text-sm font-bold text-slate-900">Zero-Blunder Guardrails &amp; Human Review</h3>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Configure strict accuracy limits to prevent hallucinations on complex code, formulas, and billing queries.
                  </p>

                  <div className="grid grid-cols-2 gap-6 pt-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700">Minimum Confidence Floor</label>
                        <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                          {(confidenceThreshold * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.50"
                        max="0.95"
                        step="0.05"
                        value={confidenceThreshold}
                        onChange={(e) => { setConfidenceThreshold(parseFloat(e.target.value)); setIsDirty(true); }}
                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-brand-600 mt-2.5"
                      />
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                        <span>Permissive (50%)</span>
                        <span>Strict (70% - Recommended)</span>
                        <span>Near-Exact (95%)</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Low-Confidence Fallback Policy</label>
                      <select
                        value={fallbackMode}
                        onChange={(e) => { setFallbackMode(e.target.value as any); setIsDirty(true); }}
                        className="w-full rounded-md border-slate-300 border px-3 py-2 text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500 text-xs bg-white mt-1"
                      >
                        <option value="escalate_ticket">Auto-Create Priority Support Ticket</option>
                        <option value="safe_refusal">Safe Refusal ("Insufficient verified knowledge")</option>
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        Triggered automatically when knowledge similarity drops below the minimum confidence floor.
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Shadow Mode / Support Copilot</div>
                      <div className="text-[11px] text-slate-500">Draft answers for human team review before publishing to live customers.</div>
                    </div>
                    <Toggle
                      checked={copilotMode}
                      onChange={(val) => { setCopilotMode(val); setIsDirty(true); }}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100">
                  <Button
                    type="submit"
                    loading={saveLoading}
                    variant="primary"
                    size="md"
                    icon={<Save size={16} />}
                  >
                    Save Config
                  </Button>
                </div>
              </form>
            )}

            {/* TAB 2: Agent Tools */}
            {activeTab === 'tools' && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Predefined Functional Tools &amp; Telemetry</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Toggle on/off functions the agent can trigger to check live user state, inspect crash telemetry, or schedule calls.
                  </p>
                </div>

                <div className="space-y-4">
                  {tools.map(tool => {
                    const isConfigExpanded = expandedToolId === tool.id;

                    return (
                      <div 
                        key={tool.id} 
                        className="border border-slate-200 rounded-lg p-4 transition-colors space-y-3 bg-white hover:border-slate-300"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 mt-0.5">
                              {tool.tool_type === 'database_query' && <Database className="text-emerald-600" size={20} />}
                              {tool.tool_type === 'sentry_telemetry' && <Activity className="text-rose-600" size={20} />}
                              {tool.tool_type === 'calendar_booking' && <Calendar className="text-blue-600" size={20} />}
                              {tool.tool_type === 'ticket_create' && <Ticket className="text-amber-600" size={20} />}
                            </div>

                            <div className="space-y-1">
                              <div className="font-bold text-sm text-slate-900">
                                {tool.tool_type === 'database_query' && 'Live Database & Billing State Verification'}
                                {tool.tool_type === 'sentry_telemetry' && 'Sentry & Error Telemetry Connector'}
                                {tool.tool_type === 'calendar_booking' && 'Cal.com Meeting Scheduler'}
                                {tool.tool_type === 'ticket_create' && 'Automated Support Ticket Escalation'}
                              </div>
                              <p className="text-xs text-slate-500 max-w-xl">
                                {tool.tool_type === 'database_query' && 'Queries live customer database or internal billing API to verify user state, subscription plan, payment deduction, or webhook synchronization.'}
                                {tool.tool_type === 'sentry_telemetry' && 'Queries Sentry or application telemetry logs for recent unhandled frontend crashes, white screens, or server exceptions to diagnose bugs.'}
                                {tool.tool_type === 'calendar_booking' && 'Allows scheduling calendar calls directly from chat when sales demos or high-touch onboarding are requested.'}
                                {tool.tool_type === 'ticket_create' && 'Submits formal escalated tickets into database system when support requests are not resolvable.'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {(tool.tool_type === 'database_query' || tool.tool_type === 'sentry_telemetry') && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (isConfigExpanded) {
                                    setExpandedToolId(null);
                                  } else {
                                    setExpandedToolId(tool.id);
                                    setToolConfigDraft(tool.tool_config || {});
                                  }
                                }}
                                className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-1"
                              >
                                <span>Settings</span>
                                {isConfigExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              </button>
                            )}

                            <Toggle
                              checked={tool.enabled}
                              onChange={() => handleToggleTool(tool.id, tool.enabled)}
                              aria-label={`Enable ${tool.tool_type.replace('_', ' ')}`}
                            />
                          </div>
                        </div>

                        {/* Inline Configuration Drawer */}
                        {isConfigExpanded && (
                          <div className="pt-3 border-t border-slate-100 bg-slate-50/70 -mx-4 -mb-4 p-4 rounded-b-lg space-y-3">
                            {tool.tool_type === 'database_query' && (
                              <div className="space-y-3">
                                <div className="text-xs font-bold text-slate-700">Internal Billing / DB Webhook API:</div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Webhook Endpoint URL</label>
                                    <input
                                      type="url"
                                      value={toolConfigDraft.webhook_url || ''}
                                      onChange={(e) => setToolConfigDraft({ ...toolConfigDraft, webhook_url: e.target.value })}
                                      placeholder="https://api.acme.com/internal/user-billing-status"
                                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Authorization Header</label>
                                    <input
                                      type="text"
                                      value={toolConfigDraft.auth_header || ''}
                                      onChange={(e) => setToolConfigDraft({ ...toolConfigDraft, auth_header: e.target.value })}
                                      placeholder="Bearer secret_api_token"
                                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                                    />
                                  </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  If endpoint is left blank, Forma AI automatically simulates realistic state verification in Sandbox mode.
                                </p>
                              </div>
                            )}

                            {tool.tool_type === 'sentry_telemetry' && (
                              <div className="space-y-3">
                                <div className="text-xs font-bold text-slate-700">Sentry Project Credentials:</div>
                                <div className="grid grid-cols-3 gap-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Sentry Organization</label>
                                    <input
                                      type="text"
                                      value={toolConfigDraft.sentry_org || ''}
                                      onChange={(e) => setToolConfigDraft({ ...toolConfigDraft, sentry_org: e.target.value })}
                                      placeholder="acme-saas"
                                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Project Slug</label>
                                    <input
                                      type="text"
                                      value={toolConfigDraft.sentry_project || ''}
                                      onChange={(e) => setToolConfigDraft({ ...toolConfigDraft, sentry_project: e.target.value })}
                                      placeholder="frontend-app"
                                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Sentry Auth Token</label>
                                    <input
                                      type="password"
                                      value={toolConfigDraft.sentry_auth_token || ''}
                                      onChange={(e) => setToolConfigDraft({ ...toolConfigDraft, sentry_auth_token: e.target.value })}
                                      placeholder="sntrys_..."
                                      className="w-full text-xs border border-slate-300 rounded px-2.5 py-1.5 bg-white text-slate-800"
                                    />
                                  </div>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                  When Sentry credentials are not configured, Forma AI synthesizes realistic crash traces for white-screen testing.
                                </p>
                              </div>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                              <button
                                type="button"
                                onClick={() => setExpandedToolId(null)}
                                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800"
                              >
                                Cancel
                              </button>
                              <Button
                                type="button"
                                size="sm"
                                variant="primary"
                                onClick={() => handleUpdateToolConfig(tool.id, toolConfigDraft)}
                              >
                                Save Tool Settings
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {tools.length === 0 && (
                    <div className="text-slate-400 text-sm py-6 text-center">
                      No tool presets initialized for this agent template.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Data Ingestion (Knowledge Base) */}
            {activeTab === 'ingestion' && (
              <div className="space-y-6">
                {/* 1. Scraper Uploaders */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Document & Codebase Ingester */}
                  <form onSubmit={handleFileUpload} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                      <Upload size={18} className="text-brand-600" />
                      <span>Upload Code, Schemas & Docs</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Supports PDFs, Docs, Ticket CSVs, SQL schemas, JSON/YAML configs, and TS/JS codebase files. AST and formulas are preserved.
                    </p>
                    
                    {/* Drag and drop zone */}
                    <div
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) {
                          setFileToUpload(e.dataTransfer.files[0]);
                        }
                      }}
                      className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
                        isDragging
                          ? 'border-brand-500 bg-brand-50/60 ring-2 ring-brand-400/20'
                          : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                      }`}
                    >
                      {fileToUpload ? (
                        <div className="flex items-center justify-between bg-white border border-brand-200 rounded-lg p-2.5 text-xs shadow-xs">
                          <div className="flex items-center gap-2 truncate text-left">
                            <FileUp size={16} className="text-brand-600 flex-shrink-0" />
                            <div className="truncate">
                              <div className="font-semibold text-slate-800 truncate">{fileToUpload.name}</div>
                              <div className="text-[10px] text-slate-400">{(fileToUpload.size / 1024).toFixed(1)} KB</div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFileToUpload(null)}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 ml-2"
                            title="Remove selected file"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <label className="cursor-pointer block py-2">
                          <FileUp size={24} className="mx-auto text-slate-400 mb-1.5" />
                          <span className="text-xs font-semibold text-brand-600 hover:text-brand-700">Choose file</span>
                          <span className="text-xs text-slate-500"> or drag &amp; drop</span>
                          <div className="text-[10px] text-slate-400 mt-0.5">PDF, DOCX, TXT, MD, CSV, SQL, JSON, YAML, TS, JS up to 10MB</div>
                          <input
                            type="file"
                            accept=".txt,.md,.pdf,.docx,.csv,.sql,.json,.yaml,.yml,.ts,.js"
                            onChange={(e) => setFileToUpload(e.target.files?.[0] || null)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!fileToUpload || ingestLoading}
                      className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs py-2 px-3 rounded shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {ingestLoading && <Loader className="animate-spin" size={13} />}
                      <span>{ingestLoading ? 'Uploading & Embedding...' : 'Upload & Process File'}</span>
                    </button>
                  </form>

                  {/* Scrape URL Ingester */}
                  <form onSubmit={handleUrlScrape} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-slate-800 font-bold text-sm">
                        <Globe size={18} className="text-brand-600" />
                        <span>Documentation & Web Ingester</span>
                      </div>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setCrawlMode('single')}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                            crawlMode === 'single'
                              ? 'bg-white text-brand-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Single Page
                        </button>
                        <button
                          type="button"
                          onClick={() => setCrawlMode('recursive')}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                            crawlMode === 'recursive'
                              ? 'bg-white text-brand-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Recursive Docs Crawl
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {crawlMode === 'recursive'
                        ? 'Recursively crawls internal docs and subpages within the domain path. Cleans markdown, tables, and API code.'
                        : 'Scrapes and embeds a single documentation page or help center article.'}
                    </p>
                    <div className="flex flex-col gap-3">
                      <input
                        type="url"
                        required
                        value={urlToScrape}
                        onChange={(e) => setUrlToScrape(e.target.value)}
                        className="rounded border-slate-300 border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                        placeholder={crawlMode === 'recursive' ? "https://docs.acme.com/v2/" : "https://docs.acme.com/help/formulas"}
                      />
                      {crawlMode === 'recursive' && (
                        <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                          <label className="text-slate-600 font-medium">Max pages to traverse:</label>
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={maxCrawlPages}
                            onChange={(e) => setMaxCrawlPages(Math.max(1, Math.min(50, parseInt(e.target.value) || 15)))}
                            className="w-16 text-center border border-slate-300 rounded px-2 py-1 text-xs text-slate-800 bg-white"
                          />
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={!urlToScrape.trim() || ingestLoading}
                        className="bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs px-3 py-2 rounded shadow transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {ingestLoading && <Loader className="animate-spin" size={13} />}
                        <span>{ingestLoading ? (crawlMode === 'recursive' ? 'Crawling Doc Hierarchy...' : 'Scraping...') : (crawlMode === 'recursive' ? 'Start Recursive Crawl' : 'Scrape Webpage')}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* 2. Ingestion Queue logs */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h2 className="text-base font-bold text-slate-800">Knowledge Base Sources</h2>
                    <button 
                      onClick={fetchAgentDetails}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                      title="Refresh Queue Status"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-medium text-xs">
                          <th className="py-2.5">Source Type</th>
                          <th className="py-2.5">Name / Reference</th>
                          <th className="py-2.5">Queue Status</th>
                          <th className="py-2.5">Created At</th>
                          <th className="py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {dataSources.map(ds => (
                          <tr key={ds.id} className="hover:bg-slate-50/20">
                            <td className="py-3 capitalize text-xs">{ds.source_type}</td>
                            <td className="py-3 max-w-xs truncate text-xs font-medium text-slate-900" title={ds.source_ref}>
                              {ds.source_ref}
                            </td>
                            <td className="py-3">
                              <Badge status={ds.status} size="sm" />
                            </td>
                            <td className="py-3 text-xs text-slate-400">
                              {new Date(ds.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteDataSource(ds.id)}
                                disabled={deleteDsLoading === ds.id}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete data source and vector embeddings"
                              >
                                {deleteDsLoading === ds.id ? (
                                  <Loader size={14} className="animate-spin text-red-600" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}

                        {dataSources.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                              No data sources cataloged yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: Zero-Blunder Evaluation Suite */}
            {activeTab === 'evaluation' && (
              <EvaluationSuite agentId={agentId!} />
            )}

            {/* TAB 5: Support Copilot & Shadow Mode Queue */}
            {activeTab === 'copilot' && (
              <CopilotQueue agentId={agentId!} />
            )}

            {/* TAB 6: Autonomous Auto-Fix & PR Engine */}
            {activeTab === 'autofix' && (
              <AutoFixDashboard agentId={agentId!} />
            )}

            {/* TAB 7: Embed Widget and Chat Sandbox */}
            {activeTab === 'widget' && (
              <div className="grid grid-cols-5 gap-8">
                {/* Embed code snippet info */}
                <div className="col-span-2 bg-white border border-slate-200 rounded-xl p-6 shadow-sm h-fit space-y-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Widget Installation</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Embed this code block at the bottom of your client website pages before the closing body tag.
                    </p>
                  </div>

                  {agent?.status === 'live' ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[10px] font-mono overflow-x-auto leading-relaxed border border-slate-950">
                          {`<!-- 1. Load Widget -->\n<script\n  src="${API_HOST}/widget.js"\n  data-agent-id="${agent?.id}"\n  data-agent-key="${agent?.api_key}">\n</script>\n\n<!-- 2. Pass Live Session Context (Optional) -->\n<script>\n  window.FormaAI && window.FormaAI.identify({\n    userId: "usr_9914",\n    email: "customer@example.com",\n    plan: "Team Pro",\n    currentPage: window.location.pathname\n  });\n</script>`}
                        </pre>
                        <button
                          onClick={handleCopyWidgetCode}
                          className="absolute top-2 right-2 p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
                          title="Copy Embed script"
                        >
                          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>

                      <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-lg p-3 text-xs">
                        <strong>Live Session Support:</strong> Supports <code>window.FormaAI.identify()</code> for seamless user telemetry and state verification.
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-slate-300 rounded-lg p-8 text-center text-slate-500 space-y-3">
                      <AlertTriangle className="mx-auto text-amber-500" size={32} />
                      <p className="text-xs font-semibold text-slate-800">Agent not deployed yet</p>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                        Click <span className="font-semibold text-emerald-600">"Deploy Chatbot"</span> in the top-right header above to publish this agent and generate its live embed script.
                      </p>
                    </div>
                  )}
                </div>

                {/* Live playground Sandbox Chat box */}
                <div className="col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm h-[520px] flex flex-col justify-between overflow-hidden">
                  {/* Chat header */}
                  <div className="h-14 bg-slate-50 border-b border-slate-100 flex items-center justify-between px-5">
                    <span className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <Bot size={16} className="text-brand-600" /> Sandbox Chat Simulator
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowContextDrawer(!showContextDrawer)}
                        className={`text-xs font-semibold px-2 py-1 rounded transition-colors flex items-center gap-1 ${
                          showContextDrawer 
                            ? 'bg-brand-100 text-brand-700' 
                            : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800'
                        }`}
                        title="Configure simulated session context"
                      >
                        <SlidersHorizontal size={12} />
                        <span>Session: {simulatedUserId}</span>
                      </button>
                      <button 
                        onClick={handleResetSandboxChat}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-600 ml-1"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Simulated Session Context Drawer */}
                  {showContextDrawer && (
                    <div className="bg-slate-100 border-b border-slate-200 p-3 text-xs grid grid-cols-3 gap-2 animate-fadeIn">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">User ID / Email</label>
                        <input
                          type="text"
                          value={simulatedUserId}
                          onChange={(e) => setSimulatedUserId(e.target.value)}
                          className="w-full text-xs px-2 py-1 bg-white border border-slate-300 rounded"
                          placeholder="usr_9914"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Current Plan</label>
                        <input
                          type="text"
                          value={simulatedPlan}
                          onChange={(e) => setSimulatedPlan(e.target.value)}
                          className="w-full text-xs px-2 py-1 bg-white border border-slate-300 rounded"
                          placeholder="Team Pro (sync pending)"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Current Screen</label>
                        <input
                          type="text"
                          value={simulatedPage}
                          onChange={(e) => setSimulatedPage(e.target.value)}
                          className="w-full text-xs px-2 py-1 bg-white border border-slate-300 rounded"
                          placeholder="/analytics/export"
                        />
                      </div>
                    </div>
                  )}

                  {/* Chat Area */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-thin">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-slate-400 text-xs py-16">
                        <Bot className="mx-auto text-slate-300 mb-3" size={36} />
                        <p className="font-semibold">Chat Playground Sandbox</p>
                        <p className="text-[10px]">Test prompts, RAG document search, and preconfigured tool triggers in real-time.</p>
                      </div>
                    )}

                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-4 py-2.5 text-xs leading-relaxed ${
                          msg.sender === 'user' 
                            ? 'bg-brand-600 text-white rounded-br-none' 
                            : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200'
                        }`}>
                          {msg.text}
                        </div>
                        
                        {/* Render diagnostic diagnostic tools call log */}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-1.5 flex flex-col gap-1 w-full max-w-[85%]">
                            {msg.actions.map((act, j) => (
                              <div key={j} className="text-[10px] bg-slate-50 border border-slate-200 text-slate-600 rounded px-2.5 py-1.5 font-mono flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${act.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="font-semibold">{act.tool_type}</span>: {act.status}
                                {act.result?.booking_id && ` (ID: ${act.result.booking_id})`}
                                {act.result?.ticket_id && ` (ID: ${act.result.ticket_id})`}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {chatLoading && (
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                        <Loader className="animate-spin" size={14} /> Agent is thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Chat Input form */}
                  <form onSubmit={handleSendChat} className="h-16 border-t border-slate-100 px-4 flex items-center gap-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatLoading}
                      className="flex-1 rounded border-slate-300 border px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
                      placeholder="Ask the bot something..."
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      className="p-2 rounded bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}
