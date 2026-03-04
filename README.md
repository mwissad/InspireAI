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
                                           │ (Jobs, Clusters, Unity Catalog,
                                           │  SQL Statement Execution, Workspace)
                                           ▼
                  ┌──────────────────────────────────────────┐
                  │          Databricks Workspace            │
                  │                                          │
                  │  ┌────────────────────────────────────┐  │
                  │  │   Multi-Task Pipeline (9 notebooks) │  │
                  │  │                                      │  │
                  │  │  01_init_validate                    │  │
                  │  │       ▼                              │  │
                  │  │  02_business_context                 │  │
                  │  │       ▼                              │  │
                  │  │  03_schema_discovery                 │  │
                  │  │       ▼                              │  │
                  │  │  04_use_case_gen                     │  │
                  │  │       ▼                              │  │
                  │  │  05_scoring_quality                  │  │
                  │  │       ▼                              │  │
                  │  │  06_sql_notebooks                    │  │
                  │  │       ▼                              │  │
                  │  │  07_documentation                    │  │
                  │  │       ▼                              │  │
                  │  │  08_samples_finalize                 │  │
                  │  └────────────────────────────────────┘  │
                  │                                          │
                  │  ┌────────────────────────────────────┐  │
                  │  │  Unity Catalog (Delta Tables)       │  │
                  │  │  └─ <catalog>.<schema>              │  │
                  │  │     ├─ _pipeline_state              │  │
                  │  │     ├─ _pipeline_use_cases_raw      │  │
                  │  │     ├─ _pipeline_use_cases_scored   │  │
                  │  │     ├─ _pipeline_use_cases_final    │  │
                  │  │     ├─ _pipeline_business_schema    │  │
                  │  │     └─ __inspire_usecases           │  │
                  │  └────────────────────────────────────┘  │
                  └──────────────────────────────────────────┘
```

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
| **Config** | Connect to Databricks (token, cluster, notebook paths), publish notebooks |
| **Launch** | Configure pipeline parameters (catalog, schema, business context, AI model) and submit |
| **Monitor** | Real-time job tracking with per-task status, logs, and progress |
| **Results** | Browse generated use cases — filterable cards with scores, SQL, and metadata |

### Backend (`backend/`)

| Tech | Purpose |
|------|---------|
| Express 5 | HTTP server |
| Multer | File upload handling (DBC import) |
| dotenv | Environment config |

**Key API Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `POST /api/run/pipeline` | Submit the 9-step multi-task pipeline as a Databricks job |
| `POST /api/run` | Submit a single notebook run |
| `GET /api/run/:id/status` | Poll job/task status |
| `GET /api/run/:id/output` | Retrieve notebook output |
| `GET /api/catalogs` | List Unity Catalog catalogs |
| `GET /api/catalogs/:name/schemas` | List schemas in a catalog |
| `GET /api/warehouses` | List SQL warehouses |
| `GET /api/clusters` | List available clusters |
| `POST /api/publish/pipeline` | Upload notebooks to Databricks workspace |
| `GET /api/results/tables` | List pipeline output tables in a schema |
| `GET /api/results/use-cases` | Fetch generated use cases from Delta tables |
| `GET /api/results/pipeline-state` | Fetch pipeline execution state |

### Notebooks (`notebooks/`)

The AI pipeline is composed of 9 Databricks notebooks plus a shared commons library:

| Notebook | Description |
|----------|-------------|
| `00_inspire_commons.py` | Shared library — `DatabricksInspire` class, `PipelineState`, utilities, LLM orchestration |
| `01_init_validate.py` | Validate inputs, check catalog/schema existence, initialize pipeline state |
| `02_business_context.py` | Extract business context from documents & user input using LLM |
| `03_schema_discovery.py` | Discover Unity Catalog metadata — tables, columns, comments, relationships |
| `04_use_case_gen.py` | Generate use cases via 2-pass LLM ensemble with table coverage retries |
| `05_scoring_quality.py` | Cluster, deduplicate, score, and quality-filter use cases |
| `06_sql_notebooks.py` | Generate SQL for each use case, validate it, assemble domain notebooks |
| `07_documentation.py` | Generate PDF, PPTX, and Excel catalogs |
| `08_samples_finalize.py` | Execute sample queries and finalize the pipeline |

State between notebooks is persisted via Delta tables using the `PipelineState` class.

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Databricks workspace** with:
  - A Personal Access Token (PAT)
  - Access to Unity Catalog
  - A SQL Warehouse or All-Purpose Cluster
  - (Optional) Serverless compute enabled

### 1. Clone the repository

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
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
2. **Config page:** Enter your Databricks PAT token, select a cluster, and publish the pipeline notebooks
3. **Launch page:** Configure parameters (catalog to analyze, business context, AI model) and submit
4. **Monitor page:** Watch real-time progress of all 8 pipeline tasks
5. **Results page:** Browse, search, and filter the generated use cases

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
│       │   ├── RunStatus.jsx     # Job status badges
│       │   ├── SettingsPanel.jsx  # Connection settings
│       │   ├── Stepper.jsx       # Pipeline progress stepper
│       │   └── DatabricksLogo.jsx
│       └── pages/
│           ├── LandingPage.jsx   # Welcome screen
│           ├── ConfigPage.jsx    # Databricks connection setup
│           ├── LaunchPage.jsx    # Parameter config & job submission
│           ├── MonitorPage.jsx   # Real-time job monitoring
│           └── ResultsPage.jsx   # Use case browser
│
├── notebooks/
│   ├── 00_inspire_commons.py     # Shared library (~34K lines)
│   ├── 01_init_validate.py       # Step 1: Init & validate
│   ├── 02_business_context.py    # Step 2: Business context extraction
│   ├── 03_schema_discovery.py    # Step 3: Schema discovery
│   ├── 04_use_case_gen.py        # Step 4: Use case generation
│   ├── 05_scoring_quality.py     # Step 5: Scoring & quality
│   ├── 06_sql_notebooks.py       # Step 6: SQL gen & notebooks
│   ├── 07_documentation.py       # Step 7: Documentation
│   ├── 08_samples_finalize.py    # Step 8: Samples & finalize
│   └── workflow_definition.json  # Multi-task pipeline DAG definition
│
├── databricks_inspire_v38.dbc    # Bundled DBC archive (auto-published)
└── split_notebook.py             # Utility: split monolith into notebooks
```

---

## 🔧 Configuration Reference

### Pipeline Parameters (set in Launch page)

| Parameter | Description |
|-----------|-------------|
| `inspire_database` | Target `catalog.schema` where pipeline stores results |
| `catalogs_to_analyze` | Comma-separated list of catalogs to scan |
| `schemas_to_analyze` | Comma-separated schemas to include (or `*` for all) |
| `business_context` | Free-text business description for the LLM |
| `ai_model_name` | Databricks Foundation Model endpoint (e.g., `databricks-claude-sonnet-4`) |
| `max_parallelism` | Max concurrent LLM calls (default: 10) |
| `generation_options` | Output types: `excel`, `notebooks`, `pdf`, `pptx` |

### Environment Variables (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABRICKS_HOST` | Yes | — | Full Databricks workspace URL |
| `NOTEBOOK_PATH` | No | — | Default notebook path (overridable in UI) |
| `PORT` | No | `3001` | Backend server port |

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

1. Edit notebooks in `notebooks/`
2. Update `workflow_definition.json` if adding/removing steps
3. Re-publish via the Config page in the UI

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
