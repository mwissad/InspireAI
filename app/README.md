# Inspire AI — Application bundle

Full-stack Databricks App (Node backend, React frontend, Inspire agent notebooks).

Customers do **not** need this README — they run **`../installer_workspace.py`** at the repo root.

## v1.3.0 — exec notes

- **Agent:** `dbx_inspire_ai_agent` `__AGENT_VERSION__ = v1.3.0`
- **Discovery Type:** widget `03_discovery_type` = Deep (default) / Standard; an unknown value is refused with 400
- **Strategic Context:** widget `10_strategic_context` (inline JSON or `/` path, at most 900000 bytes), edited in Launch → Advanced Settings → Strategy and organization
- **Feedback:** `POST /api/inspire/feedback` and `GET /api/inspire/feedback` on `__inspire_feedback` (created by the agent); every value is a bound parameter
- **Tracking:** the 10 v1.3.0 `__inspire_usecases` columns are nullable; older sessions render as before
- **Results:** strategy filter at any depth (with a Not aligned bucket) and a business-priority filter; strategy coverage with gaps; data foundations and build order; data access summary (Deep lists the tables read, Standard reads no data); per use case strategy evidence, KPIs with baselines, key results, measures, benefits, data evidence and feedback controls. Monitor shows the run's discovery type and strategy
- **Quality:** widget `05_use_cases_quality` = Good / High / Ultra High (legacy labels mapped in `inspireJobParams.js`)
- **Genie:** `13_generate_genie_code_for` only; persistent per-notebook jobs; pass `dbx_inspire_ai_child_run=1` if you trigger those jobs yourself
- **Tracking:** `__inspire_usecases` quality/elite/selection_flags columns are nullable; below-bar flags are valid results
- **PDF:** WeasyPrint >= 70.0
- **Tests:** `npm test`

## Local development

```bash
cd app
cp .env.example .env   # fill in DATABRICKS_HOST, token, warehouse, etc.
npm run install:all
npm run dev            # backend :8080 + Vite (see terminal for URL)
```

## Build workspace zip (for customers without Repos)

```bash
cd app
npm run package:workspace
# → app/dist/InspireAI-workspace.zip
```

Upload that zip to the customer's workspace (see [deployment.md](deployment.md)) or ship it with `installer_workspace.py`.

## Full deploy from laptop (optional)

```bash
cd app
npm run deploy
```

Imports the zip + installer notebook and can submit a one-time installer job via Databricks CLI.

See [deployment.md](deployment.md) for details.
