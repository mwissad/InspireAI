# Inspire AI — Data Strategy Copilot

> **Turn your data catalog into an actionable analytics strategy — powered by AI and Databricks.**

Inspire AI scans your Unity Catalog tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, SQL implementations, and business impact assessments — all in minutes, not months.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend  (React 19 · Vite · Tailwind CSS v4)  │
│  Glow UI — Databricks brand design system       │
├────────────────────┬────────────────────────────┤
│  Static assets     │  Backend (Express 5 · Node) │
│  served by backend │  • Databricks REST API proxy │
│  in production     │  • SQL Statement API bridge  │
│                    │  • Notebook publish (.dbc)    │
└────────────────────┴──────────┬─────────────────┘
                                │
                   ┌────────────▼────────────┐
                   │    Databricks Workspace   │
                   │  • Unity Catalog metadata │
                   │  • SQL Warehouse (compute) │
                   │  • Inspire AI Notebook     │
                   │  • _inspire session tables  │
                   └────────────────────────────┘
```

### How the pieces connect

- The **frontend** is a single-page React app that never talks to Databricks directly. Every Databricks API call goes through the Express backend, which attaches the user's PAT and routes to the correct workspace.
- The **backend** acts as an API proxy: it forwards requests to the Databricks REST API (Unity Catalog, Jobs, SQL Statement Execution, Workspace) and adds auth headers. It also handles DBC file uploads and serves the built frontend in production.
- The **Databricks notebook** (`databricks_inspire_v43.dbc`) is the AI engine. It reads Unity Catalog metadata, calls a Foundation Model endpoint to analyze table structures, and writes results to two tracking tables (`__inspire_session` and `__inspire_step`) in the user-specified "Inspire Database".
- The **SQL Warehouse** is used by both the notebook (to read metadata) and the backend (to poll the tracking tables for real-time progress).

---

## End-to-End Flow

### Step 1: Landing Page
The entry point introduces the platform and its three pillars: AI-Powered Discovery, Enterprise Grade security, and Actionable Insights. Click **Get Started** to begin.

### Step 2: Configure (`ConfigPage`)
A 4-step sequential wizard. Each step unlocks once the previous one is completed:

| Step | What happens | Databricks API used |
|------|-------------|---------------------|
| **1. Workspace URL** | Enter your Databricks workspace host (e.g. `https://adb-xxx.14.azuredatabricks.net`) | — |
| **2. Authentication** | Enter a Personal Access Token (PAT). Click **Test Connection** to validate against `/api/2.0/preview/scim/v2/Me`. Shows "Connected as {username}" on success. | SCIM API |
| **3. SQL Warehouse** | Auto-loads available warehouses via `/api/2.0/sql/warehouses`. Select one (shows name, state, cluster size). | SQL Warehouses API |
| **4. Publish Notebook** | Uploads the bundled `databricks_inspire_v43.dbc` to your workspace (default path: `/Users/{username}/inspire_ai`). Uses the Workspace Import API with `format: DBC`. Automatically finds the notebook inside the imported folder. | Workspace API |

All settings are persisted in `localStorage` so they survive page refreshes.

### Step 3: Launch Pipeline (`LaunchPage`)
Configure the 15 notebook widget parameters and start the AI analysis:

**Business Identity:**
- `00_business_name` — Your company name (required)
- `03_operation` — "Discover Usecases" or "Re-generate SQL"
- `08_strategic_goals` — Comma-separated strategic objectives
- `06_business_domains` — Business areas to focus on (Sales, Marketing, Finance, etc.)
- `07_business_priorities` — Multi-select from 10 priorities (Increase Revenue, Reduce Cost, Optimize Operations, etc.)

**Data Sources:**
- `01_uc_metadata` — Auto-built from the catalog/schema picker. The UI loads catalogs from Unity Catalog API, then schemas for selected catalogs. Users can also add manual `catalog.schema.table` entries.
- `02_inspire_database` — Where tracking tables and results are stored (e.g. `my_catalog._inspire`) (required)
- `04_table_election` — "Let Inspire Decides", "All Tables", or "Transactional Only"

**Quality & Outputs:**
- `05_use_cases_quality` — Good / High / Very High Quality
- `09_generation_options` — Multi-select: SQL Code, Sample Results, PDF Catalog, Presentation
- `12_documents_languages` — Output languages (default: English)

**Advanced:**
- `10_sql_generation_per_domain` — 0-5 or All
- `11_generation_path` — File path for generated artifacts
- `13_ai_model` — Foundation Model endpoint (default: `databricks-gpt-oss-120b`)
- `14_session_id` — Auto-generated timestamp+random if left empty

Clicking **Launch Inspire AI** submits a one-time run via `POST /api/2.1/jobs/runs/submit` with all parameters passed as `base_parameters` to the notebook task.

### Step 4: Monitor (`MonitorPage`)
Real-time progress tracking with 5-second polling interval:

```
Poll cycle (every 5s):
  1. GET /api/run/{runId}           → Run lifecycle state
  2. GET /api/inspire/session       → Session progress (%)
  3. GET /api/inspire/steps?since=  → New steps (delta)
  4. POST /api/inspire/ack          → ACK if status='ready'
```

**Run lifecycle tracking:**
- `PENDING/QUEUED/BLOCKED` → "Starting — Provisioning compute resources..."
- `RUNNING/TERMINATING` → "Running — X% complete"
- `TERMINATED + SUCCESS` → "Completed"
- `TERMINATED + FAILED` or `INTERNAL_ERROR` → "Failed" with error message

**Session & Step protocol:**
The notebook writes to `__inspire_session` (overall progress) and `__inspire_step` (individual steps) tables. Steps are displayed in a timeline grouped by stage name (e.g. "Metadata Analysis", "Use Case Generation", "SQL Generation"). Each step shows its status (started, ended_success, ended_warning, ended_error) and progress increment.

**READY/DONE handshake:**
When the notebook sets `processing_status = 'ready'` on the session, the frontend sends an ACK by updating it to `'done'`, signaling the notebook to continue to the next phase.

Polling stops when both conditions are met: the Databricks run has terminated AND the session shows completion.

### Step 5: Results (`ResultsPage`)
Browse and analyze the AI-generated use cases:

1. **Session Picker** — Lists up to 20 recent sessions with business name, timestamp, and completion status. Click a session to load its `results_json` from the `__inspire_session` table.

2. **Executive Summary** — Displays the AI-generated title, executive summary, and domain-level overview.

3. **Stats Dashboard** — Four cards: total domains, total use cases, high-priority count, use cases with SQL implementations.

4. **Use Case Cards** — Each card shows:
   - Name with priority badge (Ultra High → Low, color-coded) and quality score
   - Domain, subdomain, analytics technique, and type icon (Risk/Opportunity/Problem/Improvement)
   - Expandable detail view with:
     - Problem statement and proposed solution
     - Business value description
     - Beneficiary, sponsor, priority alignment
     - Tables involved (resolved from table registry)
     - Technical design
     - Full SQL implementation (syntax-highlighted, scrollable)

5. **Filtering & Search** — Real-time text search across name/statement/solution, dropdown filters for domain/priority/type, sort by priority/domain/name.

6. **Export** — Download filtered results as a JSON file.

---

## Setup

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Databricks workspace | with Unity Catalog enabled |
| Databricks CLI (optional) | v0.200+ |

### 1. Clone & Install

```bash
git clone <repo-url>
cd InspireApp

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Required: your Databricks workspace URL
DATABRICKS_HOST=https://adb-xxxxxxxxxxxx.xx.azuredatabricks.net

# Optional: service-principal or PAT token
# If not set, users provide their own PAT via the UI
# DATABRICKS_TOKEN=dapi...

# Server port (default: 3001 for dev, 8080 for Databricks App)
# PORT=3001

# Optional: pre-configured notebook path
# NOTEBOOK_PATH=/Users/shared/inspire_ai
```

> **Note:** When deployed as a Databricks App, `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are injected automatically by the runtime — no `.env` file needed.

### 3. Run in Development

Start both servers:

```bash
# Terminal 1 — Backend (port 3001)
cd backend
npm run dev

# Terminal 2 — Frontend (port 5173)
cd frontend
npm run dev
```

The Vite dev server proxies `/api/*` requests to the backend automatically (configured in `vite.config.js`).

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build for Production

```bash
# Build the frontend
cd frontend
npm run build

# Start the production server (serves both API + static frontend)
cd ../backend
NODE_ENV=production npm start
```

The app is now available at `http://localhost:3001` (or the configured `PORT`).

### 5. Deploy as a Databricks App

Using Databricks CLI:

```bash
databricks apps deploy inspire-ai --source-code-path .
```

Or deploy via the Databricks workspace UI:
1. Navigate to **Compute > Apps**
2. Click **Create App**
3. Point to this repo (or upload the code)
4. The `app.yaml` configures everything automatically

The app will start the Express server on port `8080` with auto-injected credentials.

---

## Configuration

All configuration is done through the UI (Settings panel) or environment variables:

| Setting | Where | Description |
|---------|-------|-------------|
| Databricks Host | UI + env `DATABRICKS_HOST` | Your workspace URL |
| Access Token | UI (or env `DATABRICKS_TOKEN`) | PAT or service-principal token |
| SQL Warehouse | UI (auto-discovered) | For query execution and session polling |
| Notebook Path | UI (publish step) | Where Inspire notebook lives in workspace |
| Inspire Database | UI (launch step) | `catalog.schema` for tracking tables and results |

**Priority:** UI settings override environment defaults. Each user can configure their own workspace independently. Settings persist in the browser's `localStorage`.

---

## Project Structure

```
InspireApp/
├── .env.example                 # Environment template
├── databricks_inspire_v43.dbc   # Packaged notebook for workspace import
├── backend/
│   ├── server.js                # Express API — Databricks proxy & SQL bridge
│   └── package.json             # Backend dependencies
├── frontend/
│   ├── vite.config.js           # Vite + React + Tailwind v4 + API proxy
│   ├── package.json             # Frontend dependencies
│   └── src/
│       ├── App.jsx              # Root component, page routing, ErrorBoundary
│       ├── index.css            # Tailwind v4 theme (Glow design system)
│       ├── main.jsx             # React entry point
│       ├── components/
│       │   ├── Header.jsx       # Navigation bar with step indicators
│       │   ├── SettingsPanel.jsx # Slide-out panel for all settings
│       │   ├── DatabricksLogo.jsx
│       │   ├── Stepper.jsx
│       │   ├── RunStatus.jsx
│       │   ├── ConfigForm.jsx
│       │   ├── TableBrowser.jsx
│       │   └── LanguageBrowser.jsx
│       └── pages/
│           ├── LandingPage.jsx  # Welcome & feature overview
│           ├── ConfigPage.jsx   # 4-step connection wizard
│           ├── LaunchPage.jsx   # Pipeline parameters & catalog browser
│           ├── MonitorPage.jsx  # Real-time execution tracker
│           └── ResultsPage.jsx  # Use-case catalog with filters & export
└── _dbc_extract/                # Extracted notebook source (reference)
```

---

## API Endpoints

All endpoints require `Authorization: Bearer <PAT>` header (except `/api/health` and `/api/dbc/info`).
The `X-Databricks-Host` header can override the server's configured host.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + configuration status |
| `GET` | `/api/me` | Current user info (validates token) |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas in a catalog |
| `GET` | `/api/tables/:c/:s` | List tables with column counts and metadata |
| `GET` | `/api/warehouses` | List SQL warehouses |
| `GET` | `/api/clusters` | List compute clusters |
| `GET` | `/api/dbc/info` | Inspect bundled DBC contents |
| `POST` | `/api/publish` | Publish bundled DBC to workspace |
| `POST` | `/api/publish/upload` | Upload custom notebook (.dbc, .py, .ipynb) |
| `POST` | `/api/run` | Submit notebook run with parameters |
| `GET` | `/api/run/:id` | Get run lifecycle state and timing |
| `GET` | `/api/run/:id/output` | Get notebook output |
| `POST` | `/api/run/:id/cancel` | Cancel a running job |
| `GET` | `/api/inspire/session` | Poll session status from `__inspire_session` |
| `GET` | `/api/inspire/sessions` | List up to 20 recent sessions |
| `GET` | `/api/inspire/steps` | Get step progress (supports delta via `since`) |
| `POST` | `/api/inspire/ack` | Set session `processing_status` to 'done' |
| `GET` | `/api/inspire/results` | Fetch `results_json` for a completed session |
| `GET` | `/api/results/tables` | List tables in inspire database (legacy) |
| `GET` | `/api/workspace/status` | Check if a workspace path exists |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express 5, Node.js 18+ |
| File handling | Multer (uploads), AdmZip (DBC inspection) |
| Deployment | Databricks App (`app.yaml`) |
| Notebook | Databricks `.dbc` (Python) |
| AI Model | Databricks Foundation Model (default: `databricks-gpt-oss-120b`) |
| APIs | Databricks REST API, SQL Statement Execution API, Unity Catalog API |
| State | React hooks + `localStorage` persistence |

---

## Glow Design System

The UI is built on a custom **Glow** design system using Tailwind CSS v4's `@theme` directive:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-db-red` | `#FF3621` | Primary actions, brand accent |
| `--color-surface` | `#FFFFFF` | Card backgrounds |
| `--color-bg` | `#F7F8FA` | Page background |
| `--color-panel` | `#FAFBFC` | Section headers |
| `--color-border` | `#E5E7EB` | Default borders |
| `--color-text-primary` | `#1B2332` | Headings, body text |
| `--color-success` | `#16A34A` | Completed states |
| `--color-warning` | `#D97706` | In-progress states |
| `--color-error` | `#DC2626` | Error states |

Custom effects: `.glow-focus`, `.glow-active`, `.glow-hover`, `.progress-glow`

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| White screen on Results page | Check browser console — the ErrorBoundary will display crash details with a retry button |
| "Databricks host not configured" | Set `DATABRICKS_HOST` in `.env` or enter it in the Config page |
| Token authentication fails (401) | Verify your PAT has `clusters`, `sql`, and `workspace` permissions |
| Notebook publish fails | Ensure the PAT user has workspace write permissions to the target path |
| SQL queries timeout | The SQL warehouse may need to be started first — check its state in the Config page |
| Monitor shows 0% while running | The session table (`__inspire_session`) may not exist yet — the notebook creates it on first run |
| "No sessions found" on Results | Verify the Inspire Database value matches what was used during launch |

---

## License

Proprietary — provided under the terms of the customer engagement agreement.
