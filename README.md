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

---

## Deploy as a Databricks App

### 1. Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Databricks workspace | with Unity Catalog enabled |
| Databricks CLI (optional) | v0.200+ |

### 2. Clone & Install

```bash
git clone <this-repo-url>
cd InspireApp
npm run install:all
```

### 3. Build the frontend

```bash
npm run build
```

This outputs static assets to `frontend/dist/`, which the backend serves automatically.

### 4. Configure

Copy the example environment file and fill in your workspace URL:

```bash
cp .env.example backend/.env
```

Edit `backend/.env`:

```env
DATABRICKS_HOST=https://adb-xxxxxxxxxxxx.xx.azuredatabricks.net
```

> **Note:** When deployed as a Databricks App, `DATABRICKS_HOST` and `DATABRICKS_TOKEN` are injected automatically by the runtime — no `.env` file needed.

### 5. Deploy as Databricks App

Using Databricks CLI:

```bash
databricks apps deploy inspire-ai --source-code-path .
```

Or deploy via the Databricks workspace UI:
1. Navigate to **Compute → Apps**
2. Click **Create App**
3. Point to this repo (or upload the code)
4. The `app.yaml` configures everything automatically

The app will:
- Install dependencies (if needed)
- Build the frontend (if not already built)
- Start the Express server on port `8080`

### 6. Run locally (development)

```bash
# Copy and configure env
cp .env.example backend/.env
# Edit backend/.env with your DATABRICKS_HOST

# Start both servers
npm run dev
```

- **Frontend** → [http://localhost:5173](http://localhost:5173)
- **Backend** → [http://localhost:3001](http://localhost:3001)

---

## Configuration

All configuration is done through the UI (Settings panel) or environment variables:

| Setting | Where | Description |
|---------|-------|-------------|
| Databricks Host | UI + env `DATABRICKS_HOST` | Your workspace URL |
| Access Token | UI (or env `DATABRICKS_TOKEN`) | PAT or service-principal token |
| SQL Warehouse | UI (auto-discovered) | For query execution |
| Notebook Path | UI (publish step) | Where Inspire notebook lives |
| Inspire Database | UI (launch step) | `catalog.schema` for tracking tables |

**Priority:** The UI settings override environment defaults, allowing each user to configure their own workspace independently.

---

## Features

### 01 — Configure
- **Personal Access Token** authentication with live validation
- **SQL Warehouse** auto-discovery and selection
- **One-click publish** of the Inspire AI notebook (customizable destination path)

### 02 — Launch
- **Catalog & Schema browser** with multi-select and search
- **Business context** — name, priorities, strategic goals, industry focus
- **Generation options** — use-case discovery, SQL generation, quality assessment
- **Advanced settings** — AI model endpoint, session ID, generation paths

### 03 — Monitor
- **Real-time polling** of Databricks run status and notebook steps
- **Progress bar** with glow animation tracking `completed_percent`
- **Step-by-step timeline** with stage grouping and status icons
- **Auto-transition** to Results when the pipeline completes

### 04 — Results
- **Session picker** — browse and select from historical runs
- **Executive summary** and domain-level insights
- **Filterable use-case catalog** — search, filter by domain/priority/type, sort
- **Expandable cards** — problem statement, solution, business value, SQL, tables
- **Export to JSON** — download filtered results for downstream use

---

## Project Structure

```
InspireApp/
├── app.yaml                     # Databricks App manifest
├── start.sh                     # Production startup script
├── .env.example                 # Environment template
├── package.json                 # Root scripts (dev, build, start)
├── backend/
│   ├── server.js                # Express API — Databricks proxy & SQL bridge
│   └── package.json             # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root component, routing, ErrorBoundary
│   │   ├── index.css            # Tailwind v4 theme (Glow design system)
│   │   ├── main.jsx             # React entry point
│   │   ├── components/
│   │   │   ├── Header.jsx       # Navigation bar with step indicators
│   │   │   ├── SettingsPanel.jsx # Side panel for all settings
│   │   │   └── DatabricksLogo.jsx
│   │   └── pages/
│   │       ├── LandingPage.jsx  # Welcome & onboarding
│   │       ├── ConfigPage.jsx   # PAT auth + warehouse + publish
│   │       ├── LaunchPage.jsx   # Pipeline parameters & launch
│   │       ├── MonitorPage.jsx  # Real-time execution tracker
│   │       └── ResultsPage.jsx  # Use-case catalog browser
│   ├── vite.config.js           # Vite + React + Tailwind v4
│   └── package.json             # Frontend dependencies
└── databricks_inspire_v41.dbc   # Packaged notebook for workspace import
```

---

## API Endpoints

All endpoints require `Authorization: Bearer <PAT>` header.
The `X-Databricks-Host` header can override the server's configured host.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + configuration status |
| `GET` | `/api/me` | Current user info |
| `GET` | `/api/warehouses` | List SQL warehouses |
| `GET` | `/api/clusters` | List compute clusters |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas in a catalog |
| `GET` | `/api/tables/:c/:s` | List tables with metadata |
| `GET` | `/api/dbc/info` | Bundled notebook info |
| `POST` | `/api/publish` | Publish Inspire notebook (.dbc) |
| `POST` | `/api/publish/upload` | Upload custom notebook |
| `POST` | `/api/run` | Submit a notebook run |
| `GET` | `/api/run/:id` | Get run status |
| `GET` | `/api/run/:id/output` | Get run output |
| `POST` | `/api/run/:id/cancel` | Cancel a run |
| `GET` | `/api/inspire/session` | Poll session status |
| `GET` | `/api/inspire/sessions` | List all sessions |
| `GET` | `/api/inspire/steps` | Get step progress |
| `POST` | `/api/inspire/ack` | Acknowledge session |
| `GET` | `/api/inspire/results` | Get results JSON |

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Icons | Lucide React |
| Backend | Express 5, Node.js 18+ |
| Deployment | Databricks App (`app.yaml`) |
| Notebook | Databricks .dbc (Python) |
| API | Databricks REST API, SQL Statement API |
| State | React hooks + localStorage persistence |

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| White screen on Results page | Check browser console — the ErrorBoundary will display the crash details |
| "Databricks host not configured" | Set `DATABRICKS_HOST` in `.env` or enter it in Settings |
| Token authentication fails | Verify your PAT has `clusters`, `sql`, and `workspace` permissions |
| Notebook publish fails | Ensure the PAT user has workspace write permissions |
| SQL queries timeout | The SQL warehouse may need to be started first |

---

## License

Proprietary — provided under the terms of the customer engagement agreement.
