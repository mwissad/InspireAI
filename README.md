# Inspire AI — Workspace Installer

This repository is structured for **customer deployment**: only the installer notebook lives at the root; the full Databricks App lives in **`app/`**.

## Agent v1.3.0 (current)

| | |
|--|--|
| **Ship** | Agent notebook + App aligned to **v1.3.0** |
| **Discovery** | `03_discovery_type`: **Deep** (default; aggregates only, never a data row to the AI, no personal-column values) or **Standard** (never reads data). |
| **Strategy** | `10_strategic_context`: optional strategy tree (inline JSON or a `/` path), applied only after selection. |
| **Feedback** | Accept, reject, plan or mark implemented from Results; the agent reads `__inspire_feedback` on the next run. |
| **Path** | `/Shared/inspire-ai/dbx_inspire_ai_agent` |
| **Artifacts** | `09_generation_options` → **PDF Catalog** / **Presentation** only |
| **Genie** | `13_generate_genie_code_for` (integer or `all`, default `5`). Persistent jobs `dbx_inspire_ai_<slug>_<hash8>`. |
| **Quality** | Canonical: **Good** / **High** / **Ultra High**. Legacy Coverage/Balanced/Good Quality/High Quality → Good; Strict/Very High Quality → High. |
| **Empty bar** | Closest candidates ship flagged below the mode bar. Never an empty result. |
| **PDF** | WeasyPrint **>= 70.0** (older versions can crash the Python process). |
| **Jobs** | Non-empty `14_session_id`. Child Genie runs: `dbx_inspire_ai_child_run=1`. |
| **Validate** | `cd app && npm test` |

## Customer deployment (no npm)

1. Import into your Databricks workspace:
   - **`installer_workspace.py`** (this file — Python notebook)
   - The **`app/`** folder **next to it** (same parent folder), **or** upload **`app/dist/InspireAI-workspace.zip`** to  
     `/Workspace/Users/<your-email>/InspireAI-workspace.zip`
2. Open **`installer_workspace.py`**, attach **Serverless** (or a cluster with UC + Apps access).
3. Pick **SQL warehouse** and **Unity Catalog** in the notebook parameters.
4. **Run All** (last cell runs `main()`).

The installer will:

- Deploy the **inspire-ai** Databricks App from the `app/` bundle
- Publish agent notebooks under `/Shared/inspire-ai/`
- Grant the App **service principal** UC and warehouse permissions

Then open **Compute → Apps → inspire-ai**.

## Layout

| Path | Purpose |
|------|---------|
| **`installer_workspace.py`** | One-time workspace installer (customer entry point) |
| **`app/`** | Full-stack app — backend, frontend, notebooks, internal deploy scripts |

Developers: see [app/README.md](app/README.md) and [app/deployment.md](app/deployment.md).

## Legal Information

This software is provided as-is and is not officially supported by Databricks through customer technical support channels. Support, questions, and feature requests can be communicated through the Issues page of this repo.
