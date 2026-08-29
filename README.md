# Forma AI — Multi-Tenant White-Label AI Chatbot SaaS Platform

Forma AI is a production-ready, white-label, multi-tenant AI Chatbot SaaS platform designed for **Digital Agencies** who want to build, host, and resell custom support and sales assistants to their portfolio of client websites.

---

## 🌟 Core Features

* **Multi-Tenant Scoping Layer:** Strict agency-to-client workspace tenant boundaries. Database rows are isolated dynamically at the middleware layer.
* **Smart Noise-Free Web Ingestion:** Website crawler parser built with JSDOM and `@mozilla/readability`. It automatically strips menus, sidebars, headers, and footers to ingest clean knowledge base content into 768-dimensional vector embeddings using Gemini (`text-embedding-004`).
* **Embeddable Vanilla JS Widget:** Floating chatbot widget script served directly by the backend server. Insulated from page styles, manages chat session history in `sessionStorage`, and authenticates via a lightweight `X-Agent-Key` header.
* **Agent Settings & Presets Configurator:** Wizard dashboard to adjust bot guidelines, prompt instructions, select model parameters, and toggle predefined functional tools.
* **Agentic Tool Execution Loop:** Real-time recursive function calling in Gemini:
  * **Sales Preset:** Schedules bookings via the **Cal.com API** (using 30-minute ISO slot boundaries and multi-tenant keys).
  * **Support Preset:** Inserts support tickets directly into the database `tickets` table and dispatches alert emails via **Nodemailer SMTP** when escalation is requested.
* **Activity Traces & Audits:** Exposes database logging tables showing execution traces (`action_logs`) and customer support tickets.
* **Interactive Sandbox Playground:** Test prompt guidelines, check RAG vector matches, and verify action loop executions in real-time inside the dashboard.

---

## 🛠️ Tech Stack

* **Backend:** Node.js, Express, TypeScript, PG Vector (`pgvector/pgvector:pg16` Docker Image), Nodemailer, Cal.com API, Google Generative AI SDK (`gemini-1.5-flash`).
* **Frontend:** React, Vite, TypeScript, Tailwind CSS, Lucide icons, React Router DOM.
* **Deployments:** Multi-stage Docker configurations, Nginx routing servers, and Docker Compose orchestration.

---

## 🚀 Quick Start (Docker Deployment)

Launch the entire stack (PostgreSQL database, Node API server, and Nginx frontend dashboard) with a single command:

### 1. Configure Environment Variables
Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_smtp_email@gmail.com
SMTP_PASS=your_smtp_app_password
AGENCY_ALERT_EMAIL=admin@youragency.com
CAL_API_KEY=your_cal_api_key
CAL_EVENT_TYPE_ID=your_cal_event_type_id
```

### 2. Start Containers
```bash
docker compose up -d --build
```

### 3. Access Surfaces
* **Agency Dashboard:** [http://localhost](http://localhost)
* **Backend API Base:** [http://localhost:5000/api/v1](http://localhost:5000/api/v1)
* **Embeddable Chatbot Script:** [http://localhost:5000/widget.js](http://localhost:5000/widget.js)

---

## 💻 Local Development (No Docker)

### Prerequisites
* **Node.js:** v18+ (tested on Node 18.20.8)
* **PostgreSQL:** v15+ with the `pgvector` extension enabled

### Backend Setup
1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
3. Set up the local environment variables in `backend/.env` (use `backend/.env.example` as a template).
4. Run migrations and start the dev server:
   ```bash
   npm run dev
   ```

### Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install package dependencies:
   ```bash
   npm install
   ```
3. Start the dev server:
   ```bash
   npm run dev
   ```
   *Dashboard will be available at [http://localhost:5173](http://localhost:5173).*

---

## 🔌 Chatbot Widget Embed Guide

Once you deploy an agent inside the Dashboard, copy the script element and paste it into the HTML body tag of any website:

```html
<script 
  src="http://localhost:5000/widget.js" 
  data-agent-id="AGENT_DATABASE_UUID"
  data-agent-key="fa_live_API_SECRET_KEY">
</script>
```

---

## 🧪 Integration Test Suites

The backend comes pre-packaged with 6 integration tests:

Navigate to the `backend/` directory and run:
* **Tenant Auth Isolation:** `npx ts-node src/test-isolation.ts`
* **Agent Lifecycles:** `npx ts-node src/test-agents.ts`
* **Ingestion Pipelines:** `npx ts-node src/test-ingestion.ts`
* **RAG Chat Queries:** `npx ts-node src/test-query.ts`
* **Agentic Tool Loops:** `npx ts-node src/test-tools.ts`
* **Nodemailer & Cal.com:** `npx ts-node src/test-integrations.ts`
