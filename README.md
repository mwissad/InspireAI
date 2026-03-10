# Inspire AI — Data Strategy Copilot

> **Turn your data catalog into an actionable analytics strategy — powered by AI and Databricks.**

Inspire AI scans your Unity Catalog tables, understands their structure and relationships, and generates a comprehensive data strategy with prioritized use cases, SQL implementations, and business impact assessments — all in minutes, not months.

---

## App Preview

### Landing Page — 3D animated hero with Databricks branding
![Landing Page](docs/screenshots/01_landing.png)

### Configure — Connect to any Databricks workspace
![Configure](docs/screenshots/02_configure.png)

### Launch — Set up pipeline parameters and run
![Launch](docs/screenshots/03_launch.png)

### Results — Explore generated use cases with domain filtering
![Results](docs/screenshots/04_results.png)

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

> For the full step-by-step deployment guide with troubleshooting, see **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**.

### Quick Start

```bash
# 1. Clone & checkout
git clone https://github.com/mwissad/InspireApp.git
cd InspireApp
git checkout v43_final

# 2. Build frontend
cd frontend && npm install && npx vite build && cd ..

# 3. Configure Databricks CLI
export DATABRICKS_HOST="https://<your-workspace>.azuredatabricks.net"
export DATABRICKS_TOKEN="dapi..."

# 4. Create app
databricks apps create inspire-ai --description "Inspire AI - Data Strategy Copilot"

# 5. Prepare deployment
mkdir -p /tmp/inspire-deploy/backend /tmp/inspire-deploy/frontend/dist
cp backend/server.js backend/package.json backend/package-lock.json backend/dbc_bundle.js /tmp/inspire-deploy/backend/
cp -r frontend/dist/* /tmp/inspire-deploy/frontend/dist/
cp app.yaml start.sh /tmp/inspire-deploy/

# 6. Upload & deploy
databricks workspace import-dir /tmp/inspire-deploy "/Workspace/Users/<your-email>/inspire-ai" --overwrite
databricks apps deploy inspire-ai --source-code-path "/Workspace/Users/<your-email>/inspire-ai"
```

Your app will be available at: `https://inspire-ai-<workspace-id>.<region>.databricksapps.com`

### Run Locally (Development)

```bash
# Install dependencies
cd frontend && npm install && cd ../backend && npm install && cd ..

# Start both servers
npm run dev
```

- **Frontend** → [http://localhost:5173](http://localhost:5173)
- **Backend** → [http://localhost:3001](http://localhost:3001)

---

## How to Use

### Step 1: Configure
1. Enter the **customer workspace URL** and **PAT token**
2. Click **Test Connection** to verify
3. Select a **SQL Warehouse**
4. Click **Publish** to deploy the Inspire notebook to the workspace

### Step 2: Launch
1. Enter the **Business Name** (e.g. "Acme Corp")
2. Select **catalogs and schemas** to analyze from Unity Catalog
3. Set the **Inspire Database** (e.g. `main._inspire`) — where sessions and results are stored
4. Choose **Generation Options** (SQL Code, Sample Results, PDF, Presentation)
5. Click **Launch Inspire AI**

### Step 3: Monitor
- Track real-time pipeline progress with stage filtering
- View step details, search, and filter by status
- Auto-scrolls to the latest step

### Step 4: Results
- Browse generated use cases by **domain**, **priority**, and **type**
- Expand cards for problem statements, solutions, SQL, and business value
- **Export JSON** for downstream use

> **First run note**: If upgrading from v41, drop existing tables first:
> ```sql
> DROP TABLE IF EXISTS <catalog>.<schema>.__inspire_session;
> DROP TABLE IF EXISTS <catalog>.<schema>.__inspire_step;
> ```

---

## Features

| Feature | Description |
|---------|-------------|
| **3D Landing Page** | Three.js animated hero with Databricks red cubes and particles |
| **Multi-workspace** | Connect to any customer workspace via PAT — no redeployment needed |
| **Embedded Notebook** | DBC file bundled in the app — one-click publish to any workspace |
| **Real-time Monitoring** | Live step tracking with stage sidebar, status pills, and search |
| **Domain Filtering** | Left sidebar for domain-based filtering on Monitor and Results pages |
| **Priority Sorting** | Filter and sort use cases by Ultra High, Very High, High, Medium, Low |
| **SQL Implementation** | Generated SQL queries with syntax highlighting and table resolution |
| **JSON Export** | Download filtered results for reporting or integration |

---

## Configuration

All configuration is done through the UI (Settings panel) or environment variables:

| Setting | Where | Description |
|---------|-------|-------------|
| Databricks Host | UI + env `DATABRICKS_HOST` | Customer workspace URL |
| Access Token | UI (passed via `X-DB-PAT-Token` header) | Customer PAT token |
| SQL Warehouse | UI (auto-discovered) | For query execution |
| Notebook Path | UI (publish step) | Where Inspire notebook lives |
| Inspire Database | UI (launch step) | `catalog.schema` for session tracking |

---

## Project Structure

```
InspireApp/
├── app.yaml                     # Databricks App manifest
├── start.sh                     # Production startup script
├── DEPLOYMENT_GUIDE.md          # Full deployment & usage guide
├── package.json                 # Root scripts (dev, build, start)
├── backend/
│   ├── server.js                # Express API — Databricks proxy & SQL bridge
│   ├── dbc_bundle.js            # Embedded DBC notebook (base64)
│   └── package.json             # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root component, routing, ErrorBoundary
│   │   ├── index.css            # Tailwind v4 theme (Glow design system)
│   │   ├── components/
│   │   │   ├── Header.jsx       # Navigation bar with step indicators
│   │   │   ├── HeroScene3D.jsx  # Three.js 3D animated landing scene
│   │   │   ├── SettingsPanel.jsx # Side panel for settings
│   │   │   └── DatabricksLogo.jsx
│   │   └── pages/
│   │       ├── LandingPage.jsx  # 3D hero + onboarding
│   │       ├── ConfigPage.jsx   # PAT auth + warehouse + publish
│   │       ├── LaunchPage.jsx   # Pipeline parameters & launch
│   │       ├── MonitorPage.jsx  # Real-time execution tracker
│   │       └── ResultsPage.jsx  # Use-case catalog browser
│   └── vite.config.js           # Vite + React + Tailwind v4
├── docs/screenshots/            # App screenshots for documentation
├── notebooks/                   # Extracted notebook source files
└── databricks_inspire_v43.dbc   # Original DBC notebook file
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, Tailwind CSS v4, Three.js |
| Icons | Lucide React |
| Backend | Express 5, Node.js 18+ |
| Deployment | Databricks App (`app.yaml`) |
| Notebook | Databricks .dbc v4.3 (Python) |
| API | Databricks REST API, SQL Statement API |

---

## API Endpoints

All endpoints accept `X-DB-PAT-Token` header for authentication (proxy-safe).
The `X-Databricks-Host` header specifies the target workspace.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check + configuration status |
| `GET` | `/api/me` | Current user info |
| `GET` | `/api/warehouses` | List SQL warehouses |
| `GET` | `/api/catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/catalogs/:c/schemas` | List schemas in a catalog |
| `GET` | `/api/tables/:c/:s` | List tables with metadata |
| `POST` | `/api/publish` | Publish Inspire notebook (.dbc) |
| `POST` | `/api/run` | Submit a notebook run |
| `GET` | `/api/run/:id` | Get run status |
| `GET` | `/api/inspire/session` | Poll session status |
| `GET` | `/api/inspire/sessions` | List all sessions |
| `GET` | `/api/inspire/steps` | Get step progress |
| `GET` | `/api/inspire/results` | Get results JSON |

---

## License

Proprietary — provided under the terms of the customer engagement agreement.
