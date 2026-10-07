import React, { useState } from 'react';
import {
  Sparkles, Code2, Bot,
  Copy, Check, Send, ShieldCheck,
  Globe, Laptop, Smartphone, Terminal, HelpCircle, Mail
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';

export default function Documentation() {
  const { selectedWs } = useWorkspace();
  const [activeTab, setActiveTab] = useState<'wizard' | 'mailbox' | 'architecture' | 'personas' | 'api' | 'faq'>('wizard');

  // Wizard state
  const [platform, setPlatform] = useState<'web' | 'electron' | 'flutter'>('web');
  const [objective, setObjective] = useState<'monitoring' | 'beta_test' | 'chatbot' | 'closed_loop'>('closed_loop');
  const [copied, setCopied] = useState(false);
  const [testSent, setTestSent] = useState(false);

  // Mini Guider Assistant Chat state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'agent' | 'user'; text: string }>>([
    {
      sender: 'agent',
      text: "👋 Hi! I'm your Setup Guider Agent. What kind of app are you working on, or what would you like to configure today?"
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');

  const currentHost = window.location.origin;
  const sampleAgentId = selectedWs?.id || '00000000-0000-0000-0000-000000000001';
  const sampleApiKey = 'fa_live_' + (selectedWs?.id ? selectedWs.id.slice(0, 16) : 'demo_secret_key');

  // Generate dynamic code snippet
  const getSnippet = () => {
    if (platform === 'web') {
      if (objective === 'monitoring') {
        return `<!-- 1. Add to index.html -->
<script 
  src="${currentHost}/forma-monitor.js" 
  data-agent-id="${sampleAgentId}" 
  data-agent-key="${sampleApiKey}">
</script>`;
      }
      if (objective === 'chatbot') {
        return `<!-- 1. Add Floating Chat Widget to HTML -->
<script 
  src="${currentHost}/widget.js" 
  data-agent-id="${sampleAgentId}" 
  data-agent-key="${sampleApiKey}">
</script>`;
      }
      return `<!-- Full Closed-Loop: Monitoring + AI Support Widget -->
<script 
  src="${currentHost}/forma-monitor.js" 
  data-agent-id="${sampleAgentId}" 
  data-agent-key="${sampleApiKey}">
</script>
<script 
  src="${currentHost}/widget.js" 
  data-agent-id="${sampleAgentId}" 
  data-agent-key="${sampleApiKey}">
</script>`;
    }

    if (platform === 'electron') {
      return `// Inside Electron main.js or preload.js
const FormaMonitor = require('${currentHost}/forma-monitor.js');

FormaMonitor.init({
  endpoint: '${currentHost}',
  agentId: '${sampleAgentId}',
  apiKey: '${sampleApiKey}',
  appName: 'My Electron Desktop App',
  environment: 'production'
});

// Any main or renderer crash will now auto-synthesize a GitHub PR!`;
    }

    // Flutter
    return `// Inside Flutter main.dart
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

void main() {
  FlutterError.onError = (details) async {
    FlutterError.presentError(details);
    await http.post(
      Uri.parse('${currentHost}/api/v1/agents/${sampleAgentId}/telemetry/crash'),
      headers: {'Content-Type': 'application/json', 'X-Agent-Key': '${sampleApiKey}'},
      body: jsonEncode({
        'message': details.exception.toString(),
        'source_file': 'flutter_main.dart',
        'error_trace': details.stack.toString(),
      }),
    );
  };
  runApp(const MyApp());
}`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getSnippet());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTestPing = async () => {
    setTestSent(true);
    try {
      await fetch(`${currentHost}/api/v1/agents/${sampleAgentId}/telemetry/crash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': sampleApiKey
        },
        body: JSON.stringify({
          message: 'Diagnostic Test Verification from Setup Wizard',
          source_file: 'src/wizard/VerificationTest.ts',
          line_number: 12,
          error_trace: 'TestError: Setup verified successfully from Setup Guider',
          user_context: { verification: true }
        })
      });
    } catch (_) {}
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleAgentChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim()) return;

    const userText = inputQuery.trim();
    setInputQuery('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);

    // Smart mini guider responses
    setTimeout(() => {
      let reply = "I understand! You can connect your repository in Settings. Once done, any unhandled crash will generate an automated Pull Request.";
      const lower = userText.toLowerCase();

      if (lower.includes('electron') || lower.includes('desktop')) {
        reply = "For Electron apps, include forma-monitor.js in both your renderer (index.html) and your Node main process. Our AI Beta Tester can also launch your unpackaged Electron build using Playwright!";
      } else if (lower.includes('pr') || lower.includes('github') || lower.includes('fix')) {
        reply = "The Software Factory never pushes directly to your main branch. It creates an isolated branch (e.g. fix/fa-issue), writes an automated reproduction test in Jest/Vitest, and opens a clean GitHub Pull Request for your team to review.";
      } else if (lower.includes('beta') || lower.includes('test') || lower.includes('qa')) {
        reply = "You can trigger an AI Beta Test either from our API or CLI. Gemini will inspect your DOM, click buttons, enter boundary inputs, and report any crashes directly to the Auto-Fix engine.";
      } else if (lower.includes('flutter') || lower.includes('mobile')) {
        reply = "For Flutter, intercept FlutterError.onError in main.dart and dispatch an HTTP POST to our crash receiver endpoint with your X-Agent-Key header.";
      } else if (lower.includes('email') || lower.includes('mailbox') || lower.includes('mail') || lower.includes('forward')) {
        reply = "To connect email support, go to Support Mailbox > Mailbox Settings. Copy your unique forwarding address and forward support@yourdomain.com to it (or configure a SendGrid/Postmark webhook to /api/v1/integrations/email/webhook). Incoming emails will be parsed, grounded with RAG, and generate Copilot Drafts or instant AI replies!";
      }

      setChatMessages(prev => [...prev, { sender: 'agent', text: reply }]);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header Banner */}
      <div className="bg-slate-900 border-b border-slate-800 text-white px-8 py-6 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-400 mb-1">
              <Sparkles size={14} /> Closed-Loop Software Factory Portal
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Documentation & Setup Guider</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Learn how to connect Error Monitoring, AI Beta Testing, and the Auto-Fix Software Factory into one self-healing closed loop.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('wizard')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'wizard'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Interactive Wizard
            </button>
            <button
              onClick={() => setActiveTab('mailbox')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                activeTab === 'mailbox'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Mail size={13} />
              Support Mailbox Guide
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'architecture'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              The Closed Loop
            </button>
            <button
              onClick={() => setActiveTab('personas')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'personas'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Client Guides
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === 'faq'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              FAQ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl w-full mx-auto p-8 space-y-8 flex-1">
        
        {/* TAB 1: INTERACTIVE SETUP WIZARD & MINI GUIDER */}
        {activeTab === 'wizard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left 2 Cols: Setup Configurator */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Code2 className="text-brand-500" size={20} />
                    Step 1: Select Your App Platform
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Choose where your application runs.</p>
                  
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <button
                      onClick={() => setPlatform('web')}
                      className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border text-xs font-medium transition-all ${
                        platform === 'web'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-700 font-semibold shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Globe size={22} className={platform === 'web' ? 'text-brand-600' : 'text-slate-400'} />
                      Web Application
                    </button>
                    <button
                      onClick={() => setPlatform('electron')}
                      className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border text-xs font-medium transition-all ${
                        platform === 'electron'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-700 font-semibold shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Laptop size={22} className={platform === 'electron' ? 'text-brand-600' : 'text-slate-400'} />
                      Desktop (Electron)
                    </button>
                    <button
                      onClick={() => setPlatform('flutter')}
                      className={`flex flex-col items-center gap-2 p-3.5 rounded-lg border text-xs font-medium transition-all ${
                        platform === 'flutter'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-700 font-semibold shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Smartphone size={22} className={platform === 'flutter' ? 'text-brand-600' : 'text-slate-400'} />
                      Mobile (Flutter)
                    </button>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="text-amber-500" size={20} />
                    Step 2: Choose What You Want to Enable
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Select the features you want active.</p>

                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <button
                      onClick={() => setObjective('closed_loop')}
                      className={`p-3 text-left rounded-lg border text-xs transition-all ${
                        objective === 'closed_loop'
                          ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>The Complete Closed Loop</span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">Recommended</span>
                      </div>
                      <p className="text-[11px] font-normal text-slate-500 mt-1">Monitoring + Auto-Fix PRs + Chatbot</p>
                    </button>

                    <button
                      onClick={() => setObjective('monitoring')}
                      className={`p-3 text-left rounded-lg border text-xs transition-all ${
                        objective === 'monitoring'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold">Autonomous App Doctor Only</div>
                      <p className="text-[11px] font-normal text-slate-500 mt-1">Silent crash capture + GitHub PR generation</p>
                    </button>

                    <button
                      onClick={() => setObjective('beta_test')}
                      className={`p-3 text-left rounded-lg border text-xs transition-all ${
                        objective === 'beta_test'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold">AI Beta Testing &amp; QA</div>
                      <p className="text-[11px] font-normal text-slate-500 mt-1">Automated Playwright + Gemini user simulation</p>
                    </button>

                    <button
                      onClick={() => setObjective('chatbot')}
                      className={`p-3 text-left rounded-lg border text-xs transition-all ${
                        objective === 'chatbot'
                          ? 'border-brand-500 bg-brand-50/50 text-brand-900 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <div className="font-bold">Customer Chat Widget</div>
                      <p className="text-[11px] font-normal text-slate-500 mt-1">End-user AI assistant &amp; ticket escalation</p>
                    </button>
                  </div>
                </div>

                {/* Generated Snippet */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Terminal size={16} className="text-slate-600" />
                      Step 3: Copy Your Integration Code
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 bg-brand-50 px-2.5 py-1 rounded"
                      >
                        {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                        {copied ? 'Copied!' : 'Copy Code'}
                      </button>
                    </div>
                  </div>

                  <div className="relative bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-200 overflow-x-auto border border-slate-800">
                    <pre>{getSnippet()}</pre>
                  </div>

                  <div className="mt-4 flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="text-xs text-slate-500">
                      Need to verify your server connection?
                    </div>
                    <button
                      onClick={handleSendTestPing}
                      disabled={testSent}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center gap-1.5 shadow-sm"
                    >
                      {testSent ? <Check size={14} /> : <Send size={14} />}
                      {testSent ? 'Test Beacon Dispatched!' : 'Send Live Test Ping'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 1 Col: Mini Guider Agent Assistant */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[580px] overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center gap-2.5 border-b border-slate-800">
                <div className="h-8 w-8 rounded-full bg-brand-500 flex items-center justify-center text-white">
                  <Bot size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold leading-tight">Mini Guider Agent</h3>
                  <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Online &amp; Ready
                  </span>
                </div>
              </div>

              {/* Chat Message History */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto bg-slate-50 text-xs">
                {chatMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-3 ${
                        msg.sender === 'user'
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Questions */}
              <div className="p-2 bg-slate-100 border-t border-slate-200 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setInputQuery('How does the auto-fix PR work?')}
                  className="text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                >
                  How does Auto-Fix PR work?
                </button>
                <button
                  onClick={() => setInputQuery('How do I connect our company support email?')}
                  className="text-[10px] bg-white border border-slate-300 rounded px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                >
                  Connect Support Email?
                </button>
              </div>

              {/* Chat Input */}
              <form onSubmit={handleAgentChat} className="p-3 bg-white border-t border-slate-200 flex gap-2">
                <input
                  type="text"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  placeholder="Ask a setup question..."
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  className="bg-brand-600 hover:bg-brand-700 text-white p-2 rounded-lg transition"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: SUPPORT MAILBOX & EMAIL CONNECTOR GUIDE */}
        {activeTab === 'mailbox' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-600 mb-1">
                <Mail size={14} /> Omnichannel Support Mailbox Connector
              </div>
              <h2 className="text-xl font-bold text-slate-900">How to Connect and Use the Support Mailbox</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                Transform your Forma AI agent from a website widget into a complete customer support email desk. Customer inquiries sent to your official support email (<code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">support@yourcompany.com</code>) are automatically parsed, grounded against your RAG knowledge base, and handled according to your policy.
              </p>
            </div>

            {/* 3 Modes Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                  <Sparkles size={16} className="text-purple-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">1. Copilot Mode</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  The AI drafts grounded email answers with verified citation percentages. Your team reviews the draft in the dashboard and clicks <strong>"Approve &amp; Send"</strong> or edits it in 1 click.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Hands-Free
                  </span>
                  <Bot size={16} className="text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">2. Autonomous Mode</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Inquiries matching knowledge base vectors above your confidence threshold (e.g. 75%) are automatically answered and sent back via SMTP instantly. Low-confidence queries drop into tickets or Copilot review.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                    Team Inbox
                  </span>
                  <Check size={16} className="text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">3. Manual Mode</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Acts as a collaborative shared support desk for human agents to manage conversation history, assign threads, and reply directly from the dashboard.
                </p>
              </div>
            </div>

            {/* Step-by-Step Setup Guide */}
            <div className="space-y-6 pt-2">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Step-by-Step Setup &amp; Configuration
              </h3>

              <div className="space-y-4 text-xs">
                {/* Step 1 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">1</span>
                    Get Your Workspace Forwarding Address
                  </div>
                  <p className="text-slate-600 pl-7">
                    Open <strong>Support Mailbox</strong> in your workspace sidebar, click <strong>Mailbox Settings</strong>, and copy your inbound address:
                  </p>
                  <div className="pl-7">
                    <code className="block bg-slate-900 text-brand-300 p-2.5 rounded font-mono text-[11px]">
                      inbound+{selectedWs?.id || 'your-workspace-id'}@mail.formaai.com
                    </code>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">2</span>
                    Configure Email Forwarding or Webhook
                  </div>
                  <div className="pl-7 space-y-2 text-slate-600">
                    <p>You can connect in either of two ways:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>
                        <strong>Auto-Forwarding (Fastest):</strong> In Google Workspace, Gmail, or Microsoft 365, set an auto-forwarding rule from <code className="text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">support@yourcompany.com</code> to your Forma AI inbound forwarding address.
                      </li>
                      <li>
                        <strong>Cloudflare Email Routing (Free):</strong> Route emails from your domain directly to your inbound address with zero server setup.
                      </li>
                      <li>
                        <strong>Inbound Webhook (SendGrid, Postmark, Mailgun, AWS SES):</strong> Point your inbound parse webhook to:
                        <code className="block mt-1 bg-slate-900 text-emerald-300 p-2 rounded font-mono text-[11px]">
                          POST {currentHost}/api/v1/integrations/email/webhook
                        </code>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">3</span>
                    Configure Outbound SMTP in Server Environment
                  </div>
                  <p className="text-slate-600 pl-7">
                    To deliver email replies back to customers from your official support address, ensure SMTP credentials are set in <code className="text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">backend/.env</code>:
                  </p>
                  <div className="pl-7">
                    <pre className="bg-slate-900 text-slate-200 p-3 rounded font-mono text-[11px] overflow-x-auto">
{`SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=support@yourcompany.com
SMTP_PASS=your_app_password
AGENCY_ALERT_EMAIL=admin@youragency.com`}
                    </pre>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="h-5 w-5 rounded-full bg-brand-600 text-white flex items-center justify-center text-[10px]">4</span>
                    Test Inbound Flow with the Built-in Simulator
                  </div>
                  <p className="text-slate-600 pl-7">
                    You don't need to wait for live DNS propagation to test. Simply navigate to <strong>Support Mailbox</strong>, click <strong>"Test Email Inbound"</strong>, type a sample inquiry, and watch the AI retrieve your knowledge vectors and generate a draft in real time!
                  </p>
                </div>
              </div>
            </div>

            {/* Safeguards Note */}
            <div className="bg-slate-900 rounded-xl p-5 text-white space-y-2">
              <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="text-emerald-400" size={16} />
                Built-in Safeguards &amp; Thread Preservation
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Forma AI automatically strips quoted past email history (<code className="text-slate-200">&gt; ...</code>) before vector search so older threads never pollute RAG retrieval. Additionally, bounce notifications (<code className="text-slate-200">mailer-daemon</code>, <code className="text-slate-200">noreply</code>) and automated out-of-office loops are ignored to prevent infinite mail loops. Outbound replies always include proper <code className="text-slate-200">In-Reply-To</code> and <code className="text-slate-200">References</code> headers to keep customer email clients organized in one continuous thread.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: THE CLOSED-LOOP ARCHITECTURE */}
        {activeTab === 'architecture' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8">
            <div>
              <h2 className="text-xl font-bold text-slate-900">How the Closed-Loop System Works</h2>
              <p className="text-xs text-slate-500 mt-1">
                A seamless pipeline connecting monitoring, testing, code synthesis, and support.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h3 className="text-sm font-bold text-blue-900">Telemetry &amp; Testing</h3>
                <p className="text-xs text-blue-700 leading-relaxed">
                  forma-monitor.js silently captures live user crashes. The AI Beta Tester stress-tests apps pre-release.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h3 className="text-sm font-bold text-indigo-900">Diagnosis Engine</h3>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  Gemini isolates root cause from the stack trace and matches it with the exact source file and line.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs">
                  3
                </div>
                <h3 className="text-sm font-bold text-amber-900">Software Factory</h3>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Synthesizes a Jest/Vitest unit test and a surgical patch diff. Opens a ready-to-merge GitHub Pull Request.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                  4
                </div>
                <h3 className="text-sm font-bold text-emerald-900">One-Click Merge</h3>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  The developer reviews the PR diff and clicks Merge. The Support Bot informs users their glitch is resolved.
                </p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-6 text-white space-y-4">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="text-emerald-400" size={18} />
                Guaranteed Safety: Human in the Loop
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                The Software Factory <strong className="text-white">never</strong> pushes directly to your main or production branch. It always opens an atomic Pull Request on a branch like <code className="text-emerald-300">fix/fa-issue-123</code>. You maintain full deployment authority.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: CLIENT PERSONAS */}
        {activeTab === 'personas' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                  Persona A
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Solo Founder &amp; Creator</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Non-technical or solo builders who want hands-free maintenance.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> 2-minute 1-line script tag setup</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Wakes up to solved PRs instead of crashes</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> No expensive QA engineers needed</li>
                </ul>
              </div>
              <button onClick={() => setActiveTab('wizard')} className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition">
                Start Solo Setup
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                  Persona B
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Software Engineer &amp; Lead</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Developers looking for full control, CI/CD hooks, and reproduction tests.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Custom breadcrumbs &amp; stack traces</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Jest/Vitest automated test generation</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> CI/CD triggerable AI Beta Testing</li>
                </ul>
              </div>
              <button onClick={() => setActiveTab('wizard')} className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition">
                Explore Developer API
              </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                  Persona C
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-2">Digital Agency Owner</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Agencies managing 10+ client websites, desktop tools, and web apps.
                </p>
                <ul className="mt-4 space-y-2 text-xs text-slate-600">
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Multi-tenant client isolation</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Resell QA &amp; maintenance retainers</li>
                  <li className="flex items-center gap-1.5"><Check size={14} className="text-emerald-500" /> Automated monthly client value reports</li>
                </ul>
              </div>
              <button onClick={() => setActiveTab('wizard')} className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition">
                Setup Client Workspace
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: FAQ */}
        {activeTab === 'faq' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <HelpCircle className="text-brand-500" size={20} />
              Frequently Asked Questions
            </h2>

            <div className="space-y-4 pt-2">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-900">Does forma-monitor.js impact page load performance?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  No. It is under 4KB with zero dependencies and executes completely asynchronously outside the critical rendering path.
                </p>
              </div>

              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-900">What happens if 1,000 users hit the exact same bug?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Forma AI uses a 15-minute sliding deduplication window based on stack trace fingerprinting. Only one Pull Request is generated to prevent inbox flooding.
                </p>
              </div>

              <div className="border-b border-slate-100 pb-3">
                <h4 className="text-xs font-bold text-slate-900">How does the AI Beta Tester explore Electron apps?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Because Electron is built on Chromium, our Playwright driver hooks into the Chrome DevTools Protocol (CDP) to drive mouse clicks, form inputs, and window state.
                </p>
              </div>

              <div className="pb-1">
                <h4 className="text-xs font-bold text-slate-900">How do I connect our company support email to the AI Mailbox?</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Navigate to <strong>Support Mailbox &gt; Mailbox Settings</strong>. Copy your unique inbound forwarding address (or point your SendGrid / Postmark / Cloudflare inbound webhook to <code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">/api/v1/integrations/email/webhook</code>). Set auto-forwarding on your company email (<code className="text-slate-800 bg-slate-100 px-1 py-0.5 rounded">support@yourcompany.com</code>) to that address. Incoming emails will immediately show up in your inbox with AI drafts or instant replies!
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
