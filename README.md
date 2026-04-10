# Inspire AI v4.6 — Data Strategy Copilot

> **Turn your data catalog into an actionable analytics strategy — powered by AI and Databricks.**

Inspire AI scans your Unity Catalog tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, Genie code instructions, and business impact assessments — all in minutes, not months.

---

## Quick Deploy (Git-Backed Databricks App)

The fastest way to get started — no build steps, no CLI:

1. Go to your Databricks workspace > **Compute** > **Apps** > **Create App**
2. Select **"Create from Git repository"**
3. Paste: `https://github.com/mwissad/InspireAI`
4. Set app name to `inspire-ai`, click **Create**
5. Open the app URL, configure via the Settings panel — done.

> **Alternative:** Import `installer.py` into your workspace and click **Run All** — it handles everything automatically (clone, deploy, database creation). See [Option 2 in DEPLOYMENT.md](DEPLOYMENT.md#option-2-installer-notebook-zero-cli).
>
> For CLI deployment, local dev, and service principal setup, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## What's New in v4.6

| Change | Details |
|--------|---------|
| **Glow UI** | Aurora ambient effects, glass morphism navigation, particle field backgrounds |
| **Genie Code Instructions** | Generates per-use-case Genie code instructions deployable to Databricks Genie |
| **AI Agent Manager** | Model fallback chain (thinker > worker, large > small > tiny) with concurrency management |
| **Unified Use Case Gen** | Merged 3 separate passes (Base, AI, Statistical) into a single generation pass |
| **Inline Results on Monitor** | Full results browser embedded in Monitor page on pipeline completion |
| **Live Use Case Preview** | See discovered use cases in real-time as the pipeline runs (2s polling) |
| **MCP Server** | Built-in MCP server at `/mcp/sse` with 10 tools for AI agent integration |
| **Session Browser** | Choose page lets you browse and resume past Inspire sessions |
| **Setup Wizard** | First-run guided setup for workspace connection, warehouse, and database |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  Frontend  (React 19 · Vite 7 · Tailwind CSS v4) │
│  Glow Theme — Aurora effects, glass morphism      │
├────────────────────┬─────────────────────────────┤
│  Static assets     │  Backend (Express 5 · Node)  │
│  served by backend │  · Databricks REST API proxy  │
│  in production     │  · SQL Statement API bridge   │
│                    │  · Auto notebook publish       │
│                    │  · MCP Server (SSE transport)  │
└────────────────────┴──────────┬──────────────────┘
                                │
                   ┌────────────▼─────────────┐
                   │    Databricks Workspace    │
                   │  · Unity Catalog metadata  │
                   │  · SQL Warehouse (compute) │
                   │  · Foundation Models (AI)  │
                   │  · Genie (code instruct.)  │
                   │  · /Shared/inspire_ai      │
                   └────────────────────────────┘
```

---

## How to Use

### Step 1: Configure (first time only)
On first launch the Setup Wizard guides you through:
- **Databricks Host URL** and **Access Token** (auto-filled when deployed as an App)
- **SQL Warehouse** selection from a live dropdown (shows RUNNING/STOPPED status)
- **Inspire Database** (e.g. `workspace._inspire`) for session tracking

### Step 2: Launch
1. Click **Get Started** on the landing page
2. Enter the **Business Name** (e.g. "Acme Corp")
3. Browse **Unity Catalog** — select catalogs, schemas, and tables to analyze
4. Set **Business Domains**, **Strategic Goals**, and **Priorities**
5. Choose **Generation Options**:
   - Genie Code Instructions
   - PDF Catalog
   - Executive Presentation (PPTX)
6. Select **Output Language** (18 languages supported)
7. Click **Launch Inspire AI**

### Step 3: Monitor
- Watch real-time pipeline progress with 2-second polling
- See **live use case previews** as they're discovered
- Expand **Detailed Steps** for stage-by-stage execution with filtering and search

### Step 4: Results
- Results appear **inline in the Monitor page** when complete
- Browse use cases by **domain**, **priority**, **quality**, and **technique**
- View **domain sunburst charts** and **priority heatmaps**
- Expand cards for problem statements, solutions, business value, and implementation roadmaps
- Browse generated artifacts (PDFs, CSVs, notebooks) in the file tree
- **Export JSON** for downstream use

---

## Features

| Feature | Description |
|---------|-------------|
| **AI-Powered Discovery** | Scans Unity Catalog metadata and generates analytics use cases via Foundation Models |
| **Genie Code Instructions** | Generates per-use-case Genie code instructions ready for deployment |
| **PDF Catalog** | Professional PDF documents with use case details and business context |
| **Executive Presentations** | PPTX slide decks with scoring, domains, and implementation roadmaps |
| **18 Languages** | Generate artifacts in English, French, German, Spanish, Arabic, Chinese, Japanese, and 11 more — including full transliteration for non-Latin scripts |
| **Domain Clustering** | Groups use cases into business domains with subdomain detection, visualized as a sunburst chart |
| **Priority Scoring** | Value + Quality scoring with Ultra High to Ultra Low priority ranking |
| **Live Use Case Preview** | See use cases appear in real-time during pipeline execution (2s polling) |
| **Inline Results** | Full results browser embedded in Monitor page on completion |
| **Session Browser** | Resume or review past Inspire sessions from the Choose page |
| **MCP Integration** | 10-tool MCP server for AI agent workflows (launch, monitor, get results) |
| **Glow Theme** | Dark UI with particle fields, glass morphism, animated counters, and aurora effects |
| **Multi-Workspace** | Connect to any workspace via PAT — no redeployment needed |
| **Auto Notebook Publish** | Bundled DBC notebook is auto-published to `/Shared/inspire_ai/` on first run |

---

## Pages

| Page | Description |
|------|-------------|
| **Landing** | Animated hero with neural constellation, pipeline visualization, and typing effects |
| **Setup Wizard** | First-run guided configuration (host, token, warehouse, database) |
| **Choose** | Session browser — view and resume past Inspire runs |
| **Launch** | Catalog picker, business context inputs, generation options |
| **Monitor** | Real-time progress tracker with live use case preview and inline results |
| **Results** | Full use case catalog with filtering, charts, artifact browser, and export |
| **Config** | Warehouse and token configuration panel |

---

## Pipeline (8 Phases)

The Inspire notebook runs these phases on a Databricks job:

| Phase | Description |
|-------|-------------|
| 00 | Shared library — classes, prompts, translation service, utilities |
| 01 | Widget creation, input validation, database setup |
| 02 | Business context extraction |
| 03 | Unity Catalog metadata scanning |
| 04 | AI-powered use case generation (unified pass) |
| 05 | Scoring, deduplication, quality filtering |
| 06 | Genie code instruction & SQL notebook generation |
| 07 | PDF, PPTX, and Excel document generation (multi-language) |
| 08 | Cleanup, finalization, and session reporting |

Typical run: **15-30 minutes** depending on catalog size and generation options.

---

## Project Structure

```
InspireAI/
├── app.yaml                     # Databricks App manifest
├── start.sh                     # Self-contained startup script
├── databricks_inspire_v46.dbc   # Inspire AI notebook bundle (v4.6)
├── backend/
│   ├── server.js                # Express API — proxy, SQL bridge, MCP
│   ├── mcp-server.js            # MCP server (10 tools)
│   ├── dbc_bundle.js            # Embedded DBC notebook (base64 fallback)
│   ├── openapi.yaml             # OpenAPI spec
│   ├── api-docs.html            # Interactive API docs
│   └── package.json
├── frontend/
│   ├── dist/                    # Production build (committed for git-backed deploy)
│   ├── src/
│   │   ├── App.jsx              # Root component, routing, state management
│   │   ├── index.css            # Tailwind v4 glow theme tokens
│   │   ├── components/          # GlassCard, AnimatedCounter, Header, Settings
│   │   └── pages/               # Landing, Choose, Launch, Monitor, Results, Config
│   └── vite.config.js
├── notebooks/                   # Split notebook source (phases 00-08)
└── split_notebook.py            # Splits .dbc into phase notebooks
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Lucide React |
| Backend | Express 5, Node.js 18+ |
| AI Integration | MCP Server (SSE transport) |
| Deployment | Databricks App (git-backed or CLI) |
| Notebook | Databricks .dbc v4.6 (Python) |
| AI | Databricks Foundation Models |
| API | Databricks REST API, SQL Statement API |

---

## API Endpoints

All endpoints accept `X-DB-PAT-Token` for authentication and `X-Databricks-Host` for the target workspace.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + config status |
| `GET` | `/api/warehouses` | List SQL warehouses with status |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas in a catalog |
| `GET` | `/api/tables/:c/:s` | List tables with metadata |
| `GET` | `/api/clusters` | List compute clusters |
| `GET` | `/api/me` | Current user info |
| `GET` | `/api/notebook` | Auto-publish notebook to workspace |
| `GET` | `/api/dbc/info` | DBC bundle info |
| `POST` | `/api/run` | Submit a notebook run |
| `GET` | `/api/run/:id` | Get run status |
| `GET` | `/api/run/:id/output` | Get notebook output |
| `POST` | `/api/run/:id/cancel` | Cancel a run |
| `GET` | `/api/inspire/session` | Poll session progress |
| `GET` | `/api/inspire/sessions` | List recent sessions |
| `GET` | `/api/inspire/steps` | Get pipeline steps (delta polling) |
| `GET` | `/api/inspire/step-results` | Get progressive results while running |
| `GET` | `/api/inspire/results` | Get final results JSON |
| `GET` | `/api/inspire/usecases` | Get polished scored use cases |
| `DELETE` | `/api/inspire/session` | Delete a session |
| `POST` | `/api/inspire/ack` | Acknowledge session completion |
| `POST` | `/api/setup/verify` | Verify connection and permissions |
| `POST` | `/api/setup/create-database` | Create inspire tracking schema |
| `POST` | `/api/auth/sp-token` | Generate service principal token |
| `GET` | `/mcp/sse` | MCP server (SSE transport) |
| `POST` | `/mcp/messages` | MCP message handler |
| `GET` | `/api-docs` | Interactive API documentation |
| `GET` | `/api/openapi.json` | OpenAPI specification |

---

## License

Proprietary — provided under the terms of the customer engagement agreement.
