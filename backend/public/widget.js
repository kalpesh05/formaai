(function() {
  // Expose global FormaAI namespace for session context injection
  window.FormaAI = window.FormaAI || {
    identify: function(userCtx) {
      window.__forma_user_context = Object.assign({}, window.__forma_user_context || {}, userCtx);
    },
    setContext: function(ctx) {
      window.__forma_user_context = Object.assign({}, window.__forma_user_context || {}, ctx);
    }
  };

  // Capture currentScript reference immediately while synchronous
  const currentScriptRef = document.currentScript;

  // 1. Initialize widget when DOM is ready (or immediately if already loaded)
  function initWidget() {
    if (!document.body) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWidget, { once: true });
      } else {
        window.addEventListener('load', initWidget, { once: true });
      }
      return;
    }

    // Prevent duplicate injection
    if (document.getElementById('fa-widget-container')) {
      return;
    }

    const script = currentScriptRef ||
      document.querySelector('script[data-agent-key]') ||
      document.querySelector('script[src*="widget.js"]');

    if (!script) {
      console.error('Forma AI Widget: Script tag with data-agent-key not found.');
      return;
    }

    const agentId = script.getAttribute('data-agent-id');
    const apiKey = script.getAttribute('data-agent-key');
    const scriptSrc = script.getAttribute('src');
    const apiHost = (scriptSrc && scriptSrc.startsWith('http')) ? new URL(scriptSrc).origin : '';

    if (!agentId || !apiKey) {
      console.error('Forma AI Widget: Both data-agent-id and data-agent-key are required.');
      return;
    }

    // 2. Inject custom CSS styles directly into head
    const style = document.createElement('style');
    style.innerHTML = `
      #fa-widget-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
      #fa-launcher {
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background-color: #0284c7;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.2s ease, background-color 0.2s ease;
      }
      #fa-launcher:hover {
        transform: scale(1.05);
        background-color: #0369a1;
      }
      #fa-launcher svg {
        fill: white;
        width: 28px;
        height: 28px;
      }
      #fa-chat-window {
        display: none;
        width: 360px;
        height: 500px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        border: 1px solid #e2e8f0;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        position: absolute;
        bottom: 80px;
        right: 0;
      }
      #fa-chat-window.open {
        display: flex;
      }
      #fa-chat-header {
        background-color: #0284c7;
        color: white;
        padding: 15px;
        font-weight: bold;
        font-size: 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #fa-chat-header-close {
        cursor: pointer;
        font-size: 20px;
        opacity: 0.8;
      }
      #fa-chat-header-close:hover {
        opacity: 1;
      }
      #fa-messages {
        flex: 1;
        overflow-y: auto;
        padding: 15px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background-color: #f8fafc;
      }
      .fa-message {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
      }
      .fa-message p {
        margin: 0 0 8px 0;
      }
      .fa-message p:last-child {
        margin-bottom: 0;
      }
      .fa-message ul, .fa-message ol {
        margin: 6px 0 8px 0;
        padding-left: 20px;
      }
      .fa-message li {
        margin-bottom: 4px;
      }
      .fa-message li:last-child {
        margin-bottom: 0;
      }
      .fa-message strong {
        font-weight: 600;
      }
      .fa-message a {
        color: #0284c7;
        text-decoration: underline;
        font-weight: 500;
      }
      .fa-message a.fa-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #0284c7;
        color: white !important;
        text-decoration: none !important;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        margin: 4px 0;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08);
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .fa-message a.fa-btn:hover {
        background: #0369a1;
        transform: translateY(-1px);
      }
      .fa-message code {
        background: rgba(0, 0, 0, 0.06);
        padding: 2px 4px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
      }
      .fa-message.user {
        background-color: #0284c7;
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 0;
      }
      .fa-message.bot {
        background-color: #f1f5f9;
        color: #1e293b;
        align-self: flex-start;
        border-bottom-left-radius: 0;
      }
      #fa-input-form {
        border-top: 1px solid #e2e8f0;
        padding: 10px;
        display: flex;
        gap: 10px;
        background: white;
      }
      #fa-input-field {
        flex: 1;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        padding: 8px 12px;
        font-size: 13px;
        outline: none;
      }
      #fa-input-field:focus {
        border-color: #0284c7;
      }
      #fa-submit-btn {
        background: #0284c7;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 15px;
        font-size: 13px;
        font-weight: bold;
        cursor: pointer;
      }
      #fa-submit-btn:hover {
        background: #0369a1;
      }
      #fa-submit-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }
      #fa-glitch-toast {
        display: flex;
        flex-direction: column;
        gap: 4px;
        position: absolute;
        bottom: 75px;
        right: 0;
        width: 300px;
        background: #0f172a;
        color: white;
        padding: 12px 14px;
        border-radius: 10px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        border: 1px solid #334155;
        font-size: 12px;
        animation: faToastFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 999999;
      }
      @keyframes faToastFadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      #fa-glitch-toast-close {
        position: absolute;
        top: 6px;
        right: 8px;
        cursor: pointer;
        color: #94a3b8;
        font-size: 14px;
        line-height: 1;
      }
      #fa-glitch-toast-close:hover {
        color: white;
      }
    `;
    document.head.appendChild(style);

    // 3. Construct HTML DOM nodes
    const container = document.createElement('div');
    container.id = 'fa-widget-container';

    container.innerHTML = `
      <div id="fa-chat-window">
        <div id="fa-chat-header">
          <span>AI Assistant</span>
          <span id="fa-chat-header-close">&times;</span>
        </div>
        <div id="fa-messages">
          <div class="fa-message bot">Hello! How can I help you today?</div>
        </div>
        <form id="fa-input-form">
          <input type="text" id="fa-input-field" placeholder="Type your message..." autocomplete="off">
          <button type="submit" id="fa-submit-btn">Send</button>
        </form>
      </div>
      <div id="fa-launcher">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/>
        </svg>
      </div>
    `;

    document.body.appendChild(container);

    // 4. Wire up DOM events and messaging loops
    const launcher = document.getElementById('fa-launcher');
    const chatWindow = document.getElementById('fa-chat-window');
    const closeBtn = document.getElementById('fa-chat-header-close');
    const form = document.getElementById('fa-input-form');
    const input = document.getElementById('fa-input-field');
    const messagesContainer = document.getElementById('fa-messages');
    const submitBtn = document.getElementById('fa-submit-btn');

    let convId = sessionStorage.getItem(`fa_conv_${agentId}`);

    // Toggle Chat window visibility
    launcher.addEventListener('click', () => {
      chatWindow.classList.toggle('open');
    });

    closeBtn.addEventListener('click', () => {
      chatWindow.classList.remove('open');
    });

    // Handle form submissions
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;

      // Add user message to UI
      appendMessage('user', text);
      input.value = '';
      
      // Disable inputs
      input.disabled = true;
      submitBtn.disabled = true;

      // Add placeholder loading bubble
      const loadingBubble = appendMessage('bot', '...');

      try {
        const sessionCtx = Object.assign({}, window.__forma_user_context || {}, {
          currentPage: window.location.pathname,
          url: window.location.href,
          referrer: document.referrer || undefined
        });

        const queryUrl = apiHost 
          ? `${apiHost}/api/v1/agents/${agentId}/query` 
          : `/api/v1/agents/${agentId}/query`;

        const response = await fetch(queryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Key': apiKey
          },
          body: JSON.stringify({
            message: text,
            conversation_id: convId || undefined,
            user_context: sessionCtx
          })
        });

        if (!response.ok) {
          throw new Error('Query request failed');
        }

        const data = await response.json();
        
        // Remove placeholder and append bot response text
        loadingBubble.remove();
        appendMessage('bot', data.reply);

        // Store conversation ID for session retention
        if (data.conversation_id && !convId) {
          convId = data.conversation_id;
          sessionStorage.setItem(`fa_conv_${agentId}`, convId);
        }
      } catch (err) {
        console.error('Forma AI Widget Error:', err);
        loadingBubble.remove();
        appendMessage('bot', 'Sorry, I am having trouble connecting right now. Please try again.');
      } finally {
        input.disabled = false;
        submitBtn.disabled = false;
        input.focus();
      }
    });

    function formatMarkdown(text) {
      if (!text) return '';

      // 1. Escape HTML special characters to prevent injection
      let safe = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // 2. Bold (**text** or __text__)
      safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      safe = safe.replace(/__(.+?)__/g, '<strong>$1</strong>');

      // 3. Italic (*text* or _text_)
      safe = safe.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

      // 4. Links [text](url) - detect action words (Connect, Import, Open, Setup, etc.) to render as buttons
      safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, function(match, text, url) {
        const isAction = /^(connect|import|open|view|authorize|start|setup|login|access|get|explore)\b/i.test(text.trim());
        if (isAction) {
          return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="fa-btn">${text} &rarr;</a>`;
        }
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      });

      // 5. Inline code `code`
      safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

      // 6. Handle lists and paragraphs line-by-line
      const lines = safe.split('\n');
      let html = '';
      let inUl = false;
      let inOl = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (!line) {
          if (inUl) { html += '</ul>'; inUl = false; }
          if (inOl) { html += '</ol>'; inOl = false; }
          continue;
        }

        const bulletMatch = line.match(/^[\*\-]\s+(.*)$/);
        const numberMatch = line.match(/^(\d+)\.\s+(.*)$/);

        if (bulletMatch) {
          if (inOl) { html += '</ol>'; inOl = false; }
          if (!inUl) { html += '<ul>'; inUl = true; }
          html += `<li>${bulletMatch[1]}</li>`;
        } else if (numberMatch) {
          if (inUl) { html += '</ul>'; inUl = false; }
          if (!inOl) { html += '<ol>'; inOl = true; }
          html += `<li>${numberMatch[2]}</li>`;
        } else {
          if (inUl) { html += '</ul>'; inUl = false; }
          if (inOl) { html += '</ol>'; inOl = false; }
          html += `<p>${line}</p>`;
        }
      }

      if (inUl) html += '</ul>';
      if (inOl) html += '</ol>';

      return html;
    }

    function appendMessage(sender, text) {
      const bubble = document.createElement('div');
      bubble.className = `fa-message ${sender}`;
      if (sender === 'bot') {
        bubble.innerHTML = formatMarkdown(text);
      } else {
        bubble.innerText = text;
      }
      messagesContainer.appendChild(bubble);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return bubble;
    }

    // 5. Autonomous Error Sniffer & Diagnostic Reporter
    const reportedErrors = new Set();

    function showGlitchNotification(prUrl) {
      if (document.getElementById('fa-glitch-toast')) return;
      const toast = document.createElement('div');
      toast.id = 'fa-glitch-toast';
      toast.innerHTML = `
        <span id="fa-glitch-toast-close">&times;</span>
        <div style="font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
          <span>🛡️ Autonomous Auto-Fix</span>
        </div>
        <div style="color: #cbd5e1; font-size: 11px; line-height: 1.4;">
          A runtime glitch was automatically detected on this page. An engineering diagnostic reproduction test and code patch have been generated!
        </div>
        ${prUrl ? `<a href="${prUrl}" target="_blank" rel="noopener noreferrer" style="color: #38bdf8; font-size: 11px; text-decoration: underline; margin-top: 4px; display: inline-block;">View Pull Request &rarr;</a>` : ''}
      `;
      container.appendChild(toast);

      document.getElementById('fa-glitch-toast-close')?.addEventListener('click', () => {
        toast.remove();
      });

      setTimeout(() => {
        toast?.remove();
      }, 9000);
    }

    function reportBrowserError(errorData) {
      if (!errorData || !errorData.message) return;

      const src = errorData.sourceFile || '';
      // Ignore browser extensions and third-party widgets
      if (src.includes('chrome-extension://') || src.includes('moz-extension://') || src.includes('safari-extension://')) {
        return;
      }

      // Deduplicate identical errors in this session
      const errorHash = `${errorData.message}_${errorData.sourceFile}_${errorData.lineNumber}`;
      if (reportedErrors.has(errorHash)) {
        return;
      }
      reportedErrors.add(errorHash);

      const sessionCtx = Object.assign({}, window.__forma_user_context || {}, {
        currentPage: window.location.pathname,
        url: window.location.href,
        referrer: document.referrer || undefined,
        userAgent: navigator.userAgent
      });

      const payload = {
        message: errorData.message,
        source_file: errorData.sourceFile,
        line_number: errorData.lineNumber,
        column_number: errorData.columnNumber,
        error_trace: errorData.stack || `${errorData.message} at ${errorData.sourceFile}:${errorData.lineNumber}`,
        user_context: sessionCtx
      };

      const crashEndpoint = apiHost
        ? `${apiHost}/api/v1/agents/${agentId}/telemetry/crash`
        : `/api/v1/agents/${agentId}/telemetry/crash`;

      fetch(crashEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Key': apiKey
        },
        body: JSON.stringify(payload)
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.autofix_pr_url) {
          console.log('[Forma AI Auto-Fix] Autonomous PR synthesized:', data.autofix_pr_url);
          showGlitchNotification(data.autofix_pr_url);
        }
      })
      .catch(() => {});
    }

    // Global listeners
    window.addEventListener('error', (event) => {
      reportBrowserError({
        message: event.message || (event.error && event.error.message) || 'Uncaught runtime exception',
        sourceFile: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
        stack: event.error ? event.error.stack : `${event.message} at ${event.filename}:${event.lineno}`
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      reportBrowserError({
        message: reason?.message || String(reason) || 'Unhandled Promise Rejection',
        sourceFile: window.location.href,
        lineNumber: 0,
        columnNumber: 0,
        stack: reason?.stack || String(reason)
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWidget, { once: true });
  } else {
    initWidget();
  }
})();
