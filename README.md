# 🚀 Inspire AI — Databricks Use Case Generation Platform

**Inspire AI** is a full-stack application that orchestrates an AI-powered pipeline on Databricks to automatically discover, generate, score, and document data & analytics use cases from your Unity Catalog metadata.

Point it at your Databricks workspace, provide business context, and Inspire AI will analyze your data assets, generate hundreds of actionable use cases with SQL, assemble runnable notebooks, and produce executive-ready documentation — all from a sleek local UI.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Local Machine                           │
│                                                             │
│  ┌──────────────────┐       ┌──────────────────────────┐    │
│  │  React Frontend  │──────▶│   Node.js Backend        │    │
│  │  (Vite + Tailwind│  API  │   (Express, port 3001)   │    │
│  │   port 5173)     │◀──────│                          │    │
│  └──────────────────┘       └────────────┬─────────────┘    │
│                                          │                  │
└──────────────────────────────────────────┼──────────────────┘
                                           │ Databricks REST APIs
                                           │ (Jobs, SQL Statements,
                                           │  Unity Catalog, Workspace)
                                           ▼
                  ┌──────────────────────────────────────────┐
                  │          Databricks Workspace            │
                  │                                          │
                  │  ┌────────────────────────────────────┐  │
                  │  │   Inspire v41 Single Notebook       │  │
                  │  │   (DBC archive → auto-published)    │  │
                  │  │                                      │  │
                  │  │   Phases:                            │  │
                  │  │   1. Init & Business Context         │  │
                  │  │   2. Use Case Generation (parallel)  │  │
                  │  │   3. Domain Clustering               │  │
                  │  │   4. Scoring & Deduplication         │  │
                  │  │   5. SQL Generation (parallel)       │  │
                  │  │   6. Summary & Artifacts             │  │
                  │  │   7. Translation (optional)          │  │
                  │  └────────────────────────────────────┘  │
                  │                                          │
                  │  ┌────────────────────────────────────┐  │
                  │  │  Unity Catalog (Delta Tables)       │  │
                  │  │  └─ <catalog>.<schema>              │  │
                  │  │     ├─ __inspire_session            │  │
                  │  │     │    ├─ session_id (PK)         │  │
                  │  │     │    ├─ processing_status       │  │
                  │  │     │    ├─ completed_percent       │  │
                  │  │     │    ├─ widget_values (JSON)    │  │
                  │  │     │    ├─ results_json (JSON)     │  │
                  │  │     │    └─ completed_on            │  │
                  │  │     │                               │  │
                  │  │     └─ __inspire_step               │  │
                  │  │          ├─ step_id (PK)            │  │
                  │  │          ├─ stage_name              │  │
                  │  │          ├─ step_name               │  │
                  │  │          ├─ status                  │  │
                  │  │          ├─ progress_increment      │  │
                  │  │          └─ result_json (JSON)      │  │
                  │  └────────────────────────────────────┘  │
                  └──────────────────────────────────────────┘
```

### Key Design Principles (v41)

- **Single Notebook Design:** The entire pipeline runs as one Databricks notebook (published from a `.dbc` archive). No multi-task workflow orchestration needed.
- **READY/DONE Handshake:** Real-time progress tracking via `__inspire_session` and `__inspire_step` Delta tables. The app polls for new steps, renders them, then ACKs by setting `processing_status = 'done'`.
- **results_json:** When the pipeline completes, the full use case catalog is stored in `__inspire_session.results_json` — a structured JSON with domains, use cases, table/column registries, and executive summaries.

---

## 🧩 Components

### Frontend (`frontend/`)

| Tech | Purpose |
|------|---------|
| React 19 | UI framework |
| Vite 7 | Dev server & bundler |
| Tailwind CSS 4 | Styling |
| Lucide React | Icons |

**Pages:**

| Page | Description |
|------|-------------|
| **Landing** | Welcome screen with branding |
| **Config** | Connect to Databricks (token, cluster, notebook path), publish the notebook |
| **Launch** | Configure pipeline parameters (catalog, schema, business context, AI model) and submit |
| **Monitor** | Real-time pipeline tracking with session/step polling, progress bar, and stage timeline |
| **Results** | Browse generated use cases — session picker, domain breakdown, filterable cards with scores, SQL, and metadata |

### Backend (`backend/`)

| Tech | Purpose |
|------|---------|
| Express 5 | HTTP server |
| Multer | File upload handling (DBC import) |
| dotenv | Environment config |

**Key API Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `POST /api/run` | Submit the Inspire notebook as a Databricks job |
| `GET /api/run/:id` | Poll job status |
| `GET /api/run/:id/output` | Retrieve notebook output |
| `POST /api/publish` | Upload bundled DBC to workspace |
| `GET /api/catalogs` | List Unity Catalog catalogs |
| `GET /api/catalogs/:name/schemas` | List schemas in a catalog |
| `GET /api/warehouses` | List SQL warehouses |
| `GET /api/clusters` | List available clusters |
| **v41 Session/Step Tracking** | |
| `GET /api/inspire/sessions` | List all Inspire sessions in a database |
| `GET /api/inspire/session` | Poll a specific session (progress, status, results) |
| `GET /api/inspire/steps` | Get step events (delta: new since last poll) |
| `POST /api/inspire/ack` | ACK processed steps (READY → DONE handshake) |
| `GET /api/inspire/results` | Fetch final `results_json` from a completed session |
| `GET /api/results/tables` | List Inspire tables in a schema |

### Notebooks (`notebooks/`)

The v41 pipeline is a single monolithic notebook. When extracted, it contains:

| File | Description |
|------|-------------|
| `00_inspire_commons.py` | Shared library — `DatabricksInspire` class, `PipelineState`, `AtomicWriter`, LLM orchestration, logging |
| `01_init_validate.py` | Entry point — `create_widgets()`, `main()`, validates inputs, runs the full pipeline |

The notebook auto-creates `__inspire_session` and `__inspire_step` Delta tables for tracking.

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Databricks workspace** with:
  - A Personal Access Token (PAT)
  - Access to Unity Catalog
  - A SQL Warehouse (for Results page queries)
  - A cluster or serverless compute

### 1. Clone the repository

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp

# For v41 (latest):
git checkout v41_dev
```

### 2. Install dependencies

```bash
npm run install:all
```

This installs both frontend and backend dependencies in one command.

### 3. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DATABRICKS_HOST=https://your-workspace.azuredatabricks.net
```

> **Note:** The Databricks PAT token is entered in the UI (Config page), not stored in `.env`.

### 4. Start the application

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend:** [http://localhost:3001](http://localhost:3001)

Or start them separately:

```bash
# Terminal 1 — Backend
cd backend && npm start

# Terminal 2 — Frontend
cd frontend && npm run dev
```

### 5. Use the app

1. Open [http://localhost:5173](http://localhost:5173)
2. **Config page:** Enter your Databricks PAT token, select a cluster, and publish the Inspire notebook
3. **Launch page:** Configure parameters (catalog to analyze, business context, AI model) and submit
4. **Monitor page:** Watch real-time progress with the READY/DONE handshake protocol — see each pipeline stage, step, and substep as they execute
5. **Results page:** Select a completed session to browse, search, and filter the generated use cases with executive summaries and domain breakdowns

---

## 📁 Project Structure

```
InspireApp/
├── package.json                  # Root: dev scripts (concurrent start)
├── README.md
├── .gitignore
│
├── backend/
│   ├── package.json              # Express server dependencies
│   ├── server.js                 # All API routes & Databricks integration
│   └── .env.example              # Environment template
│
├── frontend/
│   ├── package.json              # React + Vite dependencies
│   ├── vite.config.js            # Vite config with API proxy to backend
│   ├── index.html                # Entry HTML
│   └── src/
│       ├── App.jsx               # Main app with routing & navigation
│       ├── main.jsx              # React entry point
│       ├── index.css             # Tailwind + custom styles
│       ├── components/           # Reusable UI components
│       │   ├── ConfigForm.jsx    # Pipeline parameter form
│       │   ├── Header.jsx        # Page headers
│       │   ├── SettingsPanel.jsx  # Connection settings
│       │   └── DatabricksLogo.jsx
│       └── pages/
│           ├── LandingPage.jsx   # Welcome screen
│           ├── ConfigPage.jsx    # Databricks connection setup
│           ├── LaunchPage.jsx    # Parameter config & job submission
│           ├── MonitorPage.jsx   # Real-time session/step monitoring
│           └── ResultsPage.jsx   # Use case browser (reads results_json)
│
├── notebooks/
│   ├── 00_inspire_commons.py     # Shared library
│   └── 01_init_validate.py       # Pipeline entry point
│
├── databricks_inspire_v41.dbc    # Bundled DBC archive (auto-published)
└── split_notebook.py             # Utility: extract notebooks from DBC
```

---

## 🔧 Configuration Reference

### Pipeline Parameters (set in Launch page)

| Parameter | Description |
|-----------|-------------|
| `inspire_database` | Target `catalog.schema` where pipeline stores results |
| `uc_metadata` | Comma-separated `catalog.schema` paths to scan |
| `business_name` | Company/business name for the analysis |
| `operation` | `Discover Usecases` or `SQL Regeneration` |
| `quality_level` | Use case quality threshold |
| `strategic_goals` | Comma-separated strategic goals for alignment scoring |
| `business_priorities` | Comma-separated business priorities |
| `generation_options` | Output types: `Use Cases`, `SQL`, `Summary`, `Excel` |
| `documents_languages` | Output languages (e.g. `English`, `Arabic`) |

### Environment Variables (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABRICKS_HOST` | Yes | — | Full Databricks workspace URL |
| `NOTEBOOK_PATH` | No | — | Default notebook path (overridable in UI) |
| `PORT` | No | `3001` | Backend server port |

---

## 📊 Tracking Tables (`__inspire_session` & `__inspire_step`)

### `__inspire_session`

| Column | Type | Description |
|--------|------|-------------|
| `session_id` | BIGINT | Unique session identifier |
| `processing_status` | STRING | `'done'` or `'ready'` (READY/DONE handshake) |
| `completed_percent` | DOUBLE | 0.0 → 100.0 progress |
| `widget_values` | VARIANT | JSON: all input parameters |
| `results_json` | VARIANT | JSON: final use case catalog (populated on completion) |
| `completed_on` | TIMESTAMP | NULL while running; set when pipeline finishes |

### `__inspire_step`

| Column | Type | Description |
|--------|------|-------------|
| `step_id` | BIGINT | Unique step identifier |
| `session_id` | BIGINT | FK to `__inspire_session` |
| `stage_name` | STRING | Business-friendly stage title |
| `step_name` | STRING | Stable action title |
| `sub_step_name` | STRING | Live status text |
| `status` | STRING | `started`, `ended_success`, `ended_warning`, `ended_error` |
| `progress_increment` | DOUBLE | Per-event delta |
| `result_json` | VARIANT | Step-specific structured payload |

### `results_json` Structure

When the pipeline completes, `results_json` contains:

```json
{
  "business_name": "Contoso",
  "title": "Contoso Use Cases Catalog",
  "executive_summary": "...",
  "domains_summary": "...",
  "table_registry": { "t001": "catalog.schema.table" },
  "column_registry": { "c001": "catalog.schema.table.column, description" },
  "domains": [
    {
      "domain_name": "Customer Analytics",
      "summary": "...",
      "use_cases": [
        {
          "No": "1",
          "Name": "Forecast Revenue",
          "Business Domain": "Customer Analytics",
          "type": "Risk",
          "Quality": "Very High",
          "Priority": "Very High",
          "SQL": "CREATE OR REPLACE TABLE ...",
          "..."
        }
      ]
    }
  ]
}
```

---

## 🔒 Security Notes

- The Databricks PAT token is **never stored on disk** — it lives only in browser memory during the session.
- The backend acts as a proxy, forwarding your token to Databricks APIs. It does not persist or log tokens.
- Add `backend/.env` to `.gitignore` (already included) to avoid committing secrets.

---

## 🛠️ Development

### Adding a new page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add the page to the `PAGES` array in `App.jsx`
3. Add the rendering condition in the `<main>` section

### Adding a new API endpoint

1. Add the route in `backend/server.js`
2. Use `requireToken` middleware for authenticated endpoints
3. Use `dbFetch()` helper for Databricks API calls
4. Use `executeSqlStatement()` for SQL queries via warehouses

### Modifying the pipeline

1. Update the DBC archive (`databricks_inspire_v41.dbc`)
2. Use `split_notebook.py` to extract individual notebooks
3. Re-publish via the Config page in the UI

---

## 🌿 Branches

| Branch | Description |
|--------|-------------|
| `main` | Original version with multi-task pipeline (v38) |
| `v41_dev` | v41 single-notebook design with session/step tracking |

---

## 📄 License

MIT

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -am 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request
