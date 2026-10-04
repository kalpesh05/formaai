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
        bottom: 24px;
        right: 24px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      #fa-launcher {
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: linear-gradient(135deg, #0284c7, #0369a1);
        box-shadow: 0 8px 24px rgba(2, 132, 199, 0.35), 0 2px 6px rgba(0, 0, 0, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
      }
      #fa-launcher:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 28px rgba(2, 132, 199, 0.45);
      }
      #fa-launcher svg {
        fill: white;
        width: 26px;
        height: 26px;
        transition: transform 0.2s ease;
      }
      #fa-chat-window {
        display: none;
        width: 380px;
        height: 560px;
        max-height: calc(100vh - 120px);
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 16px 48px rgba(15, 23, 42, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08);
        border: 1px solid #e2e8f0;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden;
        position: absolute;
        bottom: 76px;
        right: 0;
        animation: faWindowOpen 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #fa-chat-window.open {
        display: flex;
      }
      @keyframes faWindowOpen {
        from { opacity: 0; transform: translateY(12px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      #fa-chat-header {
        background: linear-gradient(135deg, #0284c7, #0369a1);
        color: white;
        padding: 14px 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }
      .fa-header-agent-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .fa-header-avatar {
        position: relative;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      }
      .fa-header-online-dot {
        position: absolute;
        bottom: 0;
        right: 0;
        width: 10px;
        height: 10px;
        background: #22c55e;
        border: 2px solid #0284c7;
        border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.4);
      }
      .fa-header-text h3 {
        margin: 0;
        font-weight: 700;
        font-size: 14px;
        line-height: 1.2;
        letter-spacing: -0.01em;
      }
      .fa-header-text p {
        margin: 2px 0 0 0;
        font-size: 11px;
        opacity: 0.9;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      #fa-chat-header-close {
        background: rgba(255, 255, 255, 0.15);
        border: none;
        color: white;
        width: 28px;
        height: 28px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
        transition: background 0.15s ease;
      }
      #fa-chat-header-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      #fa-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        background-color: #f8fafc;
        scroll-behavior: smooth;
      }
      .fa-message-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        animation: faMsgIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes faMsgIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .fa-message-row.user {
        justify-content: flex-end;
      }
      .fa-message-row.bot {
        justify-content: flex-start;
      }
      .fa-bot-avatar {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, #e0f2fe, #bae6fd);
        color: #0284c7;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .fa-message-wrapper {
        max-width: 82%;
        display: flex;
        flex-direction: column;
      }
      .fa-message-row.user .fa-message-wrapper {
        align-items: flex-end;
      }
      .fa-message-row.bot .fa-message-wrapper {
        align-items: flex-start;
      }
      .fa-message {
        padding: 10px 14px;
        font-size: 13.5px;
        line-height: 1.55;
        word-break: break-word;
      }
      .fa-message-row.user .fa-message {
        background: linear-gradient(135deg, #0284c7, #0369a1);
        color: white;
        border-radius: 16px 16px 4px 16px;
        box-shadow: 0 2px 8px rgba(2, 132, 199, 0.2);
      }
      .fa-message-row.bot .fa-message {
        background: #ffffff;
        color: #1e293b;
        border-radius: 16px 16px 16px 4px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
      }
      .fa-msg-time {
        font-size: 10px;
        color: #94a3b8;
        margin-top: 3px;
        padding: 0 4px;
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
        color: #0f172a;
      }
      .fa-message-row.user .fa-message strong {
        color: white;
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
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        margin: 6px 0;
        box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25);
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .fa-message a.fa-btn:hover {
        background: #0369a1;
        transform: translateY(-1px);
      }
      .fa-message code {
        background: rgba(0, 0, 0, 0.06);
        padding: 2px 5px;
        border-radius: 4px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
      }
      /* Thinking & Progressive Status Animation */
      .fa-thinking-bubble {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 16px 16px 16px 4px;
        padding: 10px 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.04);
      }
      .fa-typing-dots {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .fa-typing-dots span {
        width: 6px;
        height: 6px;
        background-color: #0284c7;
        border-radius: 50%;
        animation: faBounce 1.4s infinite ease-in-out both;
      }
      .fa-typing-dots span:nth-child(1) { animation-delay: -0.32s; }
      .fa-typing-dots span:nth-child(2) { animation-delay: -0.16s; }
      .fa-typing-dots span:nth-child(3) { animation-delay: 0s; }
      @keyframes faBounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
        40% { transform: scale(1.1); opacity: 1; }
      }
      .fa-thinking-status {
        font-size: 11.5px;
        color: #64748b;
        font-weight: 500;
        animation: faStatusFade 0.3s ease;
      }
      @keyframes faStatusFade {
        from { opacity: 0; transform: translateY(2px); }
        to { opacity: 1; transform: translateY(0); }
      }
      /* Blinking Typing Cursor like ChatGPT / Claude */
      .fa-cursor {
        display: inline-block;
        width: 3px;
        height: 14px;
        background-color: #0284c7;
        margin-left: 2px;
        vertical-align: middle;
        animation: faBlink 0.8s infinite;
        border-radius: 1px;
      }
      @keyframes faBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
      /* Input Area Styling */
      #fa-input-container {
        border-top: 1px solid #e2e8f0;
        background: #ffffff;
        padding: 10px 14px 8px 14px;
      }
      #fa-input-form {
        display: flex;
        align-items: center;
        gap: 8px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 4px 6px 4px 14px;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      #fa-input-form:focus-within {
        border-color: #0284c7;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.1);
      }
      #fa-input-field {
        flex: 1;
        border: none;
        background: transparent;
        padding: 8px 0;
        font-size: 13.5px;
        outline: none;
        color: #1e293b;
      }
      #fa-input-field::placeholder {
        color: #94a3b8;
      }
      #fa-submit-btn {
        width: 32px;
        height: 32px;
        border-radius: 16px;
        background: #0284c7;
        color: white;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.1s ease;
        flex-shrink: 0;
      }
      #fa-submit-btn:hover {
        background: #0369a1;
        transform: scale(1.05);
      }
      #fa-submit-btn:disabled {
        background: #cbd5e1;
        cursor: not-allowed;
        transform: none;
      }
      #fa-submit-btn svg {
        width: 14px;
        height: 14px;
        fill: white;
      }
      #fa-footer-badge {
        text-align: center;
        font-size: 10px;
        color: #94a3b8;
        padding-top: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
      }
      #fa-footer-badge strong {
        color: #64748b;
        font-weight: 600;
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
          <div class="fa-header-agent-info">
            <div class="fa-header-avatar">
              🤖
              <span class="fa-header-online-dot"></span>
            </div>
            <div class="fa-header-text">
              <h3>Support Assistant</h3>
              <p>
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#4ade80;"></span>
                Online · Instant verified replies
              </p>
            </div>
          </div>
          <button type="button" id="fa-chat-header-close" aria-label="Close chat">&times;</button>
        </div>
        <div id="fa-messages">
          <div class="fa-message-row bot">
            <div class="fa-bot-avatar">🤖</div>
            <div class="fa-message-wrapper">
              <div class="fa-message">Hello! 👋 Welcome to Support. How can I help you today?</div>
              <span class="fa-msg-time">Just now</span>
            </div>
          </div>
        </div>
        <div id="fa-input-container">
          <form id="fa-input-form">
            <input type="text" id="fa-input-field" placeholder="Ask a question..." autocomplete="off">
            <button type="submit" id="fa-submit-btn" aria-label="Send message">
              <svg viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </form>
          <div id="fa-footer-badge">
            <span>Powered by <strong>Forma AI</strong> · 100% Grounded</span>
          </div>
        </div>
      </div>
      <div id="fa-launcher" title="Chat with support">
        <svg viewBox="0 0 24 24" id="fa-launcher-svg">
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

    function formatTime(d) {
      const hours = d.getHours();
      const minutes = d.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
      return `${formattedHours}:${formattedMinutes} ${ampm}`;
    }

    // Toggle Chat window visibility
    launcher.addEventListener('click', () => {
      const isOpen = chatWindow.classList.toggle('open');
      if (isOpen) {
        setTimeout(() => input?.focus(), 150);
      }
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
      
      // Disable inputs while thinking
      input.disabled = true;
      submitBtn.disabled = true;

      // Show progressive thinking status indicator
      const thinkingIndicator = showThinkingIndicator();

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
        
        // Remove thinking indicator and stream bot response naturally
        thinkingIndicator.remove();
        await streamBotMessage(data.reply || '');

        // Store conversation ID for session retention
        if (data.conversation_id && !convId) {
          convId = data.conversation_id;
          sessionStorage.setItem(`fa_conv_${agentId}`, convId);
        }
      } catch (err) {
        console.error('Forma AI Widget Error:', err);
        thinkingIndicator.remove();
        appendMessage('bot', 'Sorry, I am having trouble connecting right now. Please try again in a moment.');
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
      const row = document.createElement('div');
      row.className = `fa-message-row ${sender}`;
      const timeStr = formatTime(new Date());

      if (sender === 'bot') {
        row.innerHTML = `
          <div class="fa-bot-avatar">🤖</div>
          <div class="fa-message-wrapper">
            <div class="fa-message">${formatMarkdown(text)}</div>
            <span class="fa-msg-time">${timeStr}</span>
          </div>
        `;
      } else {
        const safeUser = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        row.innerHTML = `
          <div class="fa-message-wrapper">
            <div class="fa-message">${safeUser}</div>
            <span class="fa-msg-time">${timeStr}</span>
          </div>
        `;
      }

      messagesContainer.appendChild(row);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return row;
    }

    // Thinking indicator controller with progressive status steps
    function showThinkingIndicator() {
      const row = document.createElement('div');
      row.className = 'fa-message-row bot';
      row.id = 'fa-thinking-indicator';
      row.innerHTML = `
        <div class="fa-bot-avatar">🤖</div>
        <div class="fa-message-wrapper">
          <div class="fa-thinking-bubble">
            <div class="fa-typing-dots">
              <span></span><span></span><span></span>
            </div>
            <span class="fa-thinking-status" id="fa-thinking-text">Thinking...</span>
          </div>
        </div>
      `;
      messagesContainer.appendChild(row);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      const textEl = row.querySelector('#fa-thinking-text');
      const phases = [
        { time: 900, text: 'Consulting Stackby knowledge base...' },
        { time: 2200, text: 'Finding verified answer...' },
        { time: 3600, text: 'Synthesizing response...' },
        { time: 5000, text: 'Typing response...' }
      ];

      const timers = [];
      phases.forEach(p => {
        const t = setTimeout(() => {
          if (textEl && row.parentNode) {
            textEl.textContent = p.text;
          }
        }, p.time);
        timers.push(t);
      });

      return {
        remove: () => {
          timers.forEach(clearTimeout);
          row.remove();
        }
      };
    }

    // Typewriter streaming animation for bot responses
    async function streamBotMessage(fullText) {
      if (!fullText) return;

      const row = document.createElement('div');
      row.className = 'fa-message-row bot';
      const timeStr = formatTime(new Date());

      row.innerHTML = `
        <div class="fa-bot-avatar">🤖</div>
        <div class="fa-message-wrapper">
          <div class="fa-message"><span class="fa-stream-content"></span><span class="fa-cursor"></span></div>
          <span class="fa-msg-time">${timeStr}</span>
        </div>
      `;
      messagesContainer.appendChild(row);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      const contentEl = row.querySelector('.fa-stream-content');
      const cursorEl = row.querySelector('.fa-cursor');
      const bubbleEl = row.querySelector('.fa-message');

      // Break text into tokens (words and spaces)
      const tokens = fullText.split(/(\s+)/);
      let currentText = '';

      // Adaptive speed: comfortable reading pace (~14-22ms per word)
      const delay = Math.max(10, Math.min(22, Math.floor(1600 / Math.max(tokens.length, 1))));

      for (let i = 0; i < tokens.length; i++) {
        currentText += tokens[i];

        if (i % 2 === 0 || i === tokens.length - 1) {
          contentEl.innerHTML = formatMarkdown(currentText);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }

        if (tokens[i].trim().length > 0) {
          await new Promise(r => setTimeout(r, delay));
        }
      }

      // Finish streaming: remove cursor and render finalized markdown with active buttons
      if (cursorEl) cursorEl.remove();
      bubbleEl.innerHTML = formatMarkdown(fullText);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return row;
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
