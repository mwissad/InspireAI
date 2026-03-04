# Inspire AI — Data Strategy Copilot

> **Turn your data catalog into an actionable analytics strategy — powered by AI and Databricks.**

Inspire AI scans your Unity Catalog tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, SQL implementations, and business impact assessments — all in minutes, not months.

---

## Preview

| Landing | Configure | Launch | Monitor | Results |
|---------|-----------|--------|---------|---------|
| Glow-styled onboarding | PAT auth + warehouse picker | Multi-catalog/schema selector | Real-time pipeline tracker | Filterable use-case catalog |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Frontend  (React 19 · Vite · Tailwind CSS v4)  │
│  Glow UI — Databricks brand design system       │
├────────────────────┬────────────────────────────┤
│  /api proxy (5173) │  Backend (Express 5 · 3001) │
│                    │  • Databricks REST API proxy │
│                    │  • SQL Statement API bridge  │
│                    │  • Notebook publish (.dbc)    │
└────────────────────┴──────────┬─────────────────┘
                                │
                   ┌────────────▼────────────┐
                   │    Databricks Workspace   │
                   │  • Unity Catalog metadata │
                   │  • SQL Warehouse (compute) │
                   │  • Inspire v4.1 Notebook   │
                   │  • _inspire session tables  │
                   └────────────────────────────┘
```

---

## Features

### 01 — Configure
- **Personal Access Token** authentication with live validation
- **SQL Warehouse** auto-discovery and selection
- **One-click publish** of the Inspire v4.1 notebook to your workspace

### 02 — Launch
- **Catalog & Schema browser** with multi-select
- **Business context** — name, priorities, industry focus
- **Generation options** — use-case discovery, SQL generation, quality assessment
- **Advanced settings** — AI model, session ID, generation paths

### 03 — Monitor
- **Real-time polling** of Databricks run status and notebook steps
- **Progress bar** with glow animation tracking `completed_percent`
- **Step-by-step log** with stage grouping and status icons
- **Auto-transition** to Results when the pipeline completes

### 04 — Results
- **Session picker** — browse and select from historical runs
- **Executive summary** and domain-level insights
- **Filterable use-case catalog** — search, filter by domain/priority/type, sort
- **Expandable cards** — problem statement, solution, business value, SQL, tables
- **Export to JSON** — download filtered results for downstream use

---

## Quick Start

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Databricks workspace | with Unity Catalog enabled |
| Databricks PAT | with cluster/warehouse access |

### Install

```bash
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
npm run install:all
```

### Run (development)

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend** → [http://localhost:5173](http://localhost:5173)
- **Backend** → [http://localhost:3001](http://localhost:3001)

Or run them separately:

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend
cd frontend && npm run dev
```

### Build (production)

```bash
cd frontend && npm run build
```

Static assets are output to `frontend/dist/`.

---

## Project Structure

```
InspireApp/
├── backend/
│   └── server.js              # Express API — Databricks proxy & SQL bridge
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Root component, routing & settings
│   │   ├── index.css          # Tailwind v4 theme (Glow design system)
│   │   ├── main.jsx           # React entry point
│   │   ├── components/
│   │   │   ├── Header.jsx     # Navigation bar with step indicators
│   │   │   ├── SettingsPanel.jsx
│   │   │   ├── DatabricksLogo.jsx
│   │   │   ├── TableBrowser.jsx
│   │   │   └── LanguageBrowser.jsx
│   │   └── pages/
│   │       ├── LandingPage.jsx
│   │       ├── ConfigPage.jsx
│   │       ├── LaunchPage.jsx
│   │       ├── MonitorPage.jsx
│   │       └── ResultsPage.jsx
│   └── vite.config.js         # Vite + React + Tailwind v4 plugin
├── notebooks/
│   ├── 00_inspire_commons.py  # Core Inspire engine (v4.1)
│   └── 01_init_validate.py    # Initialization & validation
├── databricks_inspire_v41.dbc # Packaged notebook for workspace import
└── package.json               # Root scripts (dev, install:all)
```

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
| `--color-text-secondary` | `#5F6B7A` | Descriptions |
| `--color-success` | `#16A34A` | Completed states |
| `--color-warning` | `#D97706` | In-progress states |
| `--color-error` | `#DC2626` | Error states |

Custom effects: `.glow-focus`, `.glow-active`, `.glow-hover`, `.progress-glow`

---

## API Endpoints (Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/me` | Current user info |
| `GET` | `/api/dbc/info` | Workspace connection details |
| `GET` | `/api/warehouses` | List SQL warehouses |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas in a catalog |
| `GET` | `/api/tables/:c/:s` | List tables with metadata |
| `POST` | `/api/publish` | Publish Inspire notebook (.dbc) |
| `POST` | `/api/run` | Submit a notebook run |
| `GET` | `/api/run/:id` | Get run status |
| `GET` | `/api/inspire/session` | Poll session status |
| `GET` | `/api/inspire/sessions` | List all sessions |
| `GET` | `/api/inspire/steps` | Get step progress delta |
| `POST` | `/api/inspire/ack` | Acknowledge session completion |
| `GET` | `/api/inspire/results` | Get results JSON |

All endpoints require a `Authorization: Bearer <PAT>` header.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express 5, Node.js 18+ |
| Notebook | Databricks .dbc (Python) |
| API | Databricks REST API, SQL Statement API |
| State | React hooks + localStorage persistence |

---

## License

Internal use — Databricks Field Engineering.
