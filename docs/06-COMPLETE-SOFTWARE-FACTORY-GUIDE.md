# Forma AI — The Complete Autonomous Software Factory Guide
### The Unified System for Monitoring, AI Beta Testing, Auto-Remediation, and Customer Support

---

## 📖 Table of Contents
1. [The Big Picture: How All 4 Pillars Connect (The Closed-Loop System)](#1-the-big-picture-the-closed-loop-system)
2. [Client Persona Guides](#2-client-persona-guides)
   - [Persona A: Non-Technical Founder & Solo Creator](#persona-a-non-technical-founder--solo-creator)
   - [Persona B: Professional Software Engineer & Tech Lead](#persona-b-professional-software-engineer--tech-lead)
   - [Persona C: Digital Agency & Multi-Client Service Provider](#persona-c-digital-agency--multi-client-service-provider)
3. [The 4 Core Pillars Explained](#3-the-4-core-pillars-explained)
   - [Pillar 1: Telemetry & Crash SDK (`forma-monitor.js`)](#pillar-1-telemetry--crash-sdk)
   - [Pillar 2: Autonomous AI Beta Tester (Playwright + Gemini)](#pillar-2-autonomous-ai-beta-tester)
   - [Pillar 3: Software Factory Auto-Fix Engine (GitHub PR Generator)](#pillar-3-software-factory-auto-fix-engine)
   - [Pillar 4: Customer Support & Lead Chatbot Widget](#pillar-4-customer-support--lead-chatbot-widget)
4. [Step-by-Step Real World Examples](#4-step-by-step-real-world-examples)
   - [Example 1: Web App (React/Next.js) Live Crash $\rightarrow$ Auto PR](#example-1-web-app-live-crash--auto-pr)
   - [Example 2: Desktop App (Electron) Pre-Release AI Beta Test](#example-2-desktop-app-pre-release-ai-beta-test)
   - [Example 3: End-User Reports Bug in Chatbot $\rightarrow$ Code Patch](#example-3-user-reports-bug-in-chat--code-patch)
5. [Architecture & Security Blueprint](#5-architecture--security-blueprint)
6. [Troubleshooting & Frequently Asked Questions (FAQ)](#6-troubleshooting--faq)

---

## 1. The Big Picture: The Closed-Loop System

Most software tools are fragmented:
* You use **Sentry** to find out you have 50 errors.
* You pay **QA testers** to click buttons and write bug tickets.
* You hire **developers** to spend hours reproducing and writing fixes.
* You use **Intercom** to apologize to customers when the app breaks.

**Forma AI combines all four into one unified, self-healing closed loop:**

```
               ┌────────────────────────────────────────────────────────┐
               │              THE CLOSED-LOOP SYSTEM                     │
               └────────────────────────────────────────────────────────┘

    [1. Telemetry SDK]                                 [2. AI Beta Tester]
    (Live user crashes)                                (Pre-launch stress testing)
            │                                                      │
            └─────────────────────────┬────────────────────────────┘
                                      │
                                      ▼
                        [3. AI Triage & Root Cause]
                        (Gemini 1.5 Flash / Pro)
                                      │
                                      ▼
                     [4. Autonomous Software Factory]
                     • Writes Reproduction Unit Test
                     • Generates Minimal Code Patch
                     • Submits Tested GitHub Pull Request
                                      │
                                      ▼
                        [5. Verification & Merging]
                        (Developer clicks "Merge")
                                      │
                                      ▼
                        [6. Customer Support Bot]
                        (Informs user: "Your bug is fixed!")
```

---

## 2. Client Persona Guides

### Persona A: Non-Technical Founder & Solo Creator
> *"I don't know deep coding. I just want my web or desktop app to not crash, and if it does, I want it fixed without hiring a dev agency."*

#### Your 3-Minute Setup:
1. **Get your Agency Key & Agent ID** from the Forma Dashboard.
2. **Copy & Paste 1 script tag** into your app's `index.html`:
   ```html
   <script 
     src="https://your-forma-domain.com/forma-monitor.js" 
     data-agent-id="YOUR_AGENT_UUID" 
     data-agent-key="fa_live_SECRET_KEY">
   </script>
   ```
3. **Connect your GitHub repository** in the dashboard settings.
4. **Done!** Whenever any user experiences a white-screen or button failure, Forma AI creates a Pull Request on your GitHub repo with the fix. You or your developer just click **"Merge"**.

---

### Persona B: Professional Software Engineer & Tech Lead
> *"I want full control. I want stack traces, breadcrumbs, reproduction tests in Jest/Vitest, clean unified diffs, and the ability to run AI QA in my CI/CD pipeline."*

#### Developer Capabilities:
* **Custom Breadcrumbs & Handled Exceptions:**
  ```javascript
  import FormaMonitor from './forma-monitor.js';

  FormaMonitor.addBreadcrumb('navigation', 'User entered billing portal');
  try {
    processPayment();
  } catch (err) {
    FormaMonitor.captureException(err);
  }
  ```
* **Triggering AI Beta Tests via API / CI:**
  ```bash
  curl -X POST https://your-forma-domain.com/api/v1/agents/YOUR_ID/beta-test/run \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "targetType": "web",
      "targetUrlOrPath": "https://staging.myapp.com",
      "personaPrompt": "Aggressive user testing edge cases and rapid clicks",
      "maxSteps": 20,
      "autoFix": true
    }'
  ```
* **Git Isolation:** Forma AI creates atomic branches (`fix/fa-<timestamp>-<file>`), writes an isolated test file, and posts complete PR markdown descriptions with reproduction proof.

---

### Persona C: Digital Agency & Multi-Client Service Provider
> *"I manage 25 client websites and apps. I want to offer an 'Autonomous AI Maintenance & QA' retainer package to my clients for $500–$1,500/month per client."*

#### The Agency Business Model:
1. **Multi-Tenant Separation:** Each of your clients gets their own dedicated Workspace and Agent inside your agency dashboard. Client data and code never leak between tenants.
2. **White-Label Branding:** The monitor SDK and customer widget run under your agency's domain.
3. **Automated Monthly Value Reports:** Show clients how many crashes were caught, how many hours of QA testing the AI performed, and how many automated PRs were generated.

---

## 3. The 4 Core Pillars Explained

### Pillar 1: Telemetry & Crash SDK
* **File:** `backend/public/forma-monitor.js`
* **Size:** < 4KB (Zero dependencies).
* **Environments Supported:**
  * **Browsers:** Catches `window.onerror`, `unhandledrejection`, and console warnings.
  * **Electron (Renderer & Main Process):** Catches UI crashes and Node.js process crashes (`uncaughtException`).
  * **Node.js Backends:** Ingests API exceptions.
  * **Flutter:** Dispatches errors via HTTP post.

### Pillar 2: Autonomous AI Beta Tester
* **File:** `backend/src/services/ai-beta-tester.ts`
* **How it works:**
  1. Starts an automated browser or Electron instance using Playwright.
  2. Extracts all visible buttons, inputs, links, and forms into a clean DOM accessibility map.
  3. Feeds the visual and DOM state to **Gemini 1.5** with testing instructions.
  4. Simulates realistic user clicks, keyboard typing, scrolling, and navigations.
  5. If an unhandled exception or console error is triggered, it instantly passes the trace to the Software Factory.
  6. Generates a **QA Report** with a UX health score (0–100) and friction analysis.

### Pillar 3: Software Factory Auto-Fix Engine
* **Files:** `backend/src/services/autofix.ts`, `backend/src/services/github.ts`
* **How it works:**
  1. Deduplicates errors (ignores identical crashes within 15 minutes to avoid PR flooding).
  2. Extracts the exact target file and line number from the stack trace.
  3. Uses Gemini with strict software engineering prompts to generate:
     * **A reproduction unit test** (in Jest / Vitest syntax).
     * **A surgical patch diff** that fixes the bug without touching unrelated code.
  4. Creates a Git branch and opens a GitHub Pull Request with the full explanation.

### Pillar 4: Customer Support & Lead Chatbot Widget
* **File:** `backend/public/widget.js`
* **How it works:**
  * Provides an embeddable customer assistant on your app/website.
  * Answers customer questions using RAG (Knowledge Base embeddings).
  * Books sales calls via Cal.com.
  * **Integrates with Maintenance:** If a user complains about a broken feature in the chat, the bot logs an escalated support ticket and initiates the auto-fix diagnostic loop.

---

## 4. Step-by-Step Real World Examples

### Example 1: Web App Live Crash $\rightarrow$ Auto PR

1. **The Scenario:** A user on a SaaS app clicks "Export Report" before selecting any date range.
2. **The Crash:** The browser throws `TypeError: Cannot read properties of undefined (reading 'startDate') at ReportGenerator.js:48`.
3. **What Forma AI does:**
   * `forma-monitor.js` intercepts the error and dispatches the stack trace to the backend.
   * Gemini analyzes the code:
     ```javascript
     // Problem: startDate is accessed before options are validated
     const formatted = options.dateRange.startDate.toISOString();
     ```
   * Gemini synthesizes the fix:
     ```javascript
     // Fix: Add safe optional chaining and fallback
     const formatted = options?.dateRange?.startDate ? options.dateRange.startDate.toISOString() : new Date().toISOString();
     ```
   * The platform writes a unit test: `test('should not crash when dateRange is undefined')`.
   * A GitHub Pull Request is submitted: `Fix: Handle undefined dateRange in ReportGenerator.js`.
4. **The Developer Experience:** The developer gets a GitHub notification, reads the diff, verifies the test passed, and clicks **Merge**.

---

### Example 2: Desktop App (Electron) Pre-Release AI Beta Test

1. **The Scenario:** An engineering team just finished an Electron desktop update and wants to test it before shipping to 50,000 desktop users.
2. **The Command:**
   ```bash
   npx ts-node src/test-beta-tester.ts
   ```
3. **What the AI Beta Tester does:**
   * Launches the desktop app.
   * Clicks around the navigation bar.
   * Fills out search inputs with boundary strings: `<script>alert(1)</script>`, `SELECT * FROM users`, huge strings of text.
   * Attempts to export data.
   * Discovers that clicking "Export" when offline freezes the window.
4. **The Output:**
   * A detailed QA Report:
     * **Status:** Completed (4 steps).
     * **UX Score:** `82/100`.
     * **Recommendation:** *"Guard export handler against undefined network state."*
     * **Auto-Fix Branch:** `fix/fa-export-handler` generated on GitHub.

---

### Example 3: User Reports Bug in Chat $\rightarrow$ Code Patch

1. **The Scenario:** An end-user is confused and types into the floating chat widget: *"I clicked checkout but nothing happens and the screen is grey."*
2. **What happens:**
   * The chatbot inspects the user's live session state.
   * It sees the recent JavaScript error caught in the session context.
   * It responds politely: *"I apologize! Our system just caught that glitch and dispatched an automated diagnostic patch to our engineering team."*
   * It creates a high-priority ticket in the database and triggers the Auto-Fix PR engine.

---

## 5. Architecture & Security Blueprint

* **Strict Tenant Isolation:** Every request is authenticated with tenant-scoped API keys (`X-Agent-Key` or Bearer JWT). A tenant cannot access another tenant's errors, PRs, or test runs.
* **Non-Destructive Code Generation:** The Software Factory **never** pushes directly to `main` or `production`. It **always** creates an isolated branch and submits a Pull Request, preserving human code review and CI gates.
* **Deduplication Safeguard:** A 15-minute sliding window prevents spamming repositories with multiple PRs for the same viral crash.

---

## 6. Troubleshooting & FAQ

#### Q: Will the telemetry SDK slow down my app?
**A:** No. `forma-monitor.js` is under 4KB and executes asynchronously. It uses non-blocking event listeners and lightweight HTTP beacons that do not impact UI thread rendering.

#### Q: What if my Electron desktop app is offline?
**A:** The SDK caches recent error breadcrumbs in memory. When the app regains connectivity, telemetry is dispatched cleanly.

#### Q: Do I need a paid Gemini API key to run this?
**A:** Forma AI includes built-in mock fallbacks for local offline development. When you are ready for production, plug in your `GEMINI_API_KEY` in `.env` to unlock real-time code synthesis and vision testing.

#### Q: How do I test the entire flow right now?
**A:** Run the pre-packaged verification suite:
```bash
cd backend
npx ts-node src/test-beta-tester.ts
```
