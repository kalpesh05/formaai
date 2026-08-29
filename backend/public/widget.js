(function() {
  // 1. Wait for page load and read configuration attributes from script tag
  window.addEventListener('DOMContentLoaded', () => {
    const script = document.querySelector('script[data-agent-key]');
    if (!script) {
      console.error('Forma AI Widget: Script tag with data-agent-key not found.');
      return;
    }

    const agentId = script.getAttribute('data-agent-id');
    const apiKey = script.getAttribute('data-agent-key');

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
        max-width: 80%;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
      }
      .fa-message.user {
        background-color: #0284c7;
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 0;
      }
      .fa-message.bot {
        background-color: #e2e8f0;
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
        const response = await fetch(`http://localhost:5000/api/v1/agents/${agentId}/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Key': apiKey
          },
          body: JSON.stringify({
            message: text,
            conversation_id: convId || undefined
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

    function appendMessage(sender, text) {
      const bubble = document.createElement('div');
      bubble.className = `fa-message ${sender}`;
      bubble.innerText = text;
      messagesContainer.appendChild(bubble);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return bubble;
    }
  });
})();
