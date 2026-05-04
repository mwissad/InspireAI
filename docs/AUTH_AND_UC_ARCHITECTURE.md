# Inspire AI — Authentication & Unity Catalog Architecture

This document describes how **Databricks authentication** and **Unity Catalog (UC) metadata browsing** work across the workspace installer, Node backend, and React frontend.

**Diagrams:** This file uses **ASCII diagrams** so they show in any editor, plain `cat`, and basic Markdown previews. (Mermaid blocks often appear as empty or raw code fences unless the viewer supports Mermaid.)

---

## 1. High-level system context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WORKSPACE INSTALLER (Databricks notebook)                                  │
│  installer_workspace.py                                                     │
│    │                                                                        │
│    ├──► WorkspaceClient + SQL warehouse  (runs as NOTEBOOK USER)            │
│    ├──► Write app.yaml + create/deploy Databricks App                       │
│    └──► UC GRANTs + warehouse CAN_USE for APP SERVICE PRINCIPAL             │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ provisions
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  DATABRICKS APP RUNTIME                                                     │
│                                                                             │
│   Browser (React) ──same-origin /api/*──► Node (backend/server.js)          │
│                              │              ▲                               │
│                              │              │ optional                      │
│   Apps proxy ────────────────┴──────────────┘  x-forwarded-access-token     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             POST …/oidc/v1/token   UC REST 2.1      SQL Statement API
             (SP client credentials)  catalogs/…     (warehouse)
```

- **Installer**: runs as the **notebook user** (SDK credentials). It does not implement App runtime auth; it **provisions** the App, service principal, `app.yaml` env, and **grants**.
- **App**: the browser talks to **Express** only. Express calls Databricks APIs using a resolved **Bearer token** and **workspace host**.

---

## 2. Installer (`installer_workspace.py`)

| Step | What happens |
|------|----------------|
| Identity | `WorkspaceClient()` uses the cluster / serverless identity running the notebook. |
| Pick warehouse | Widget `00_sql_warehouse` or `WAREHOUSE_OVERRIDE` → `WAREHOUSE_ID`. |
| Pick Inspire catalog | Widget `01_inspire_catalog` or `CATALOG_OVERRIDE` → `{CATALOG}._inspire` (`INSPIRE_DB`). |
| Catalog list for widget | `w.catalogs.list()` (SDK), excluding `system`, `information_schema`, `__databricks_internal`. |
| Bundle | Unpacks zip or finds folder with `app.yaml`, publishes notebook under **`/Shared/inspire-ai/`** (SP-readable). |
| `app.yaml` | `write_app_yaml_deploy`: `NODE_ENV=production`, `INSPIRE_DATABASE`, `INSPIRE_AUTO_SETUP`, optional `INSPIRE_WAREHOUSE_ID`, `NOTEBOOK_PATH`, and a **`service-principal`** resource so the runtime injects **OAuth client id/secret** for the App process. |
| Grants | On chosen catalog/schema: `USE_CATALOG`, `BROWSE`, `USE_SCHEMA`, `CREATE_TABLE`, `SELECT`, `MODIFY`. On **other** catalogs: **`BROWSE` only** so the App SP can **list metadata** in the UI without broad data privileges. |
| Warehouse | `PATCH .../permissions/sql/warehouses/{id}` → SP **`CAN_USE`**. |

**Installer sequence (conceptual):**

```
  Notebook user                installer_workspace.py          Databricks API / warehouse
       │                                │                                    │
       │  Run All                       │                                    │
       │───────────────────────────────►│                                    │
       │                                │──── WorkspaceClient, deploy app ───►│
       │                                │──── CREATE SCHEMA, GRANTs ─────────►│ SQL warehouse
       │                                │──── PATCH warehouse permissions ───►│
       │                                │                                    │
```

---

## 3. Backend authentication (`backend/server.js`)

### 3.1 Token sources (conceptual order)

Resolution is implemented in **`getToken(req)`** with nuances for `NODE_ENV` and SP-backed production apps. In practice the backend may use:

1. **`DATABRICKS_TOKEN`** (`SERVICE_TOKEN`) — static PAT on the server.
2. **SP OAuth** — `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` (or `SP_*`) → `POST {host}/oidc/v1/token` (grant `client_credentials`, scope `all-apis`). Token cached with proactive refresh (`refreshSpToken` + singleflight / deduped timer in current tree).
3. **Browser headers** — `X-DB-PAT-Token` or `Authorization: Bearer` (user PAT pasted in UI / local dev).
4. **`x-forwarded-access-token`** — Apps proxy may attach a **delegated user** token; in SP-backed production the server **prefers** PAT/SP over relying solely on this for long-lived server calls.

### 3.2 `requireToken` middleware

- If SP credentials exist and cache is stale → **`await refreshSpToken()`**.
- **`getToken(req)`** → if missing → **401**.
- Sets **`req.dbToken`** and **`req.dbHost`** (`resolveHost(req)`).
- In **production** with platform auth + `DATABRICKS_HOST`, host is taken from env so it cannot drift from a stale **`X-Databricks-Host`** in the browser.

### 3.3 “Server has auth” flag for the UI

- **`hasDatabricksPlatformAuth()`** = `SERVICE_TOKEN` **or** `(SP_CLIENT_ID && SP_CLIENT_SECRET)`.
- **`GET /api/defaults`** returns `hasServerPlatformAuth`, `databricksHost`, `warehouseId`, `inspireDatabase`, `notebookPath`, `isDatabricksApp`, etc.
- Frontend sets **`serverEnvHasPat`** when the browser can omit a PAT but the server can still call Databricks (name is historical).

**Request pipeline:**

```
   Incoming GET/POST /api/…
              │
              ▼
      ┌───────────────┐
      │ requireToken  │──► refresh SP OAuth cache if needed
      └───────┬───────┘
              │
      ┌───────▼───────┐
      │  getToken(req)│──► PAT / SP cache / Bearer / forwarded
      └───────┬───────┘
              │
      ┌───────▼────────┐
      │ resolveHost(req)│──► DATABRICKS_HOST (+ prod rules)
      └───────┬────────┘
              │
              ▼
      ┌───────────────────┐
      │ dbFetch / executeSql │──► Databricks with Bearer + host
      └───────────────────┘
```

---

## 4. Unity Catalog listing in the App

### 4.1 API routes (all behind `requireToken`)

| Route | Purpose |
|-------|---------|
| `GET /api/catalogs?warehouse_id=` | List catalogs |
| `GET /api/catalogs/:catalog/schemas?warehouse_id=` | List schemas in a catalog |
| `GET /api/tables/:catalog/:schema?warehouse_id=` | List tables in a schema |

### 4.2 Dual path: REST + SQL merge

Why two paths: **Unity Catalog REST** (`/api/2.1/unity-catalog/...`) is the primary source. For some identities (notably **service principals**), REST can be empty or incomplete while **`SHOW CATALOGS` / `SHOW SCHEMAS` / `SHOW TABLES`** on a SQL warehouse returns names the user expects.

| Resource | REST | SQL fallback (needs `warehouse_id`) |
|----------|------|-------------------------------------|
| Catalogs | `GET /api/2.1/unity-catalog/catalogs` (paginated) | `SHOW CATALOGS` |
| Schemas | `GET /api/2.1/unity-catalog/schemas?catalog_name=` | `SHOW SCHEMAS IN catalog` |
| Tables | `GET /api/2.1/unity-catalog/tables?catalog_name=&schema_name=` | `SHOW TABLES IN catalog.schema` |

Results are **merged by name** (REST first, SQL adds missing entries). Response may include `source`: `rest`, `sql`, `rest+sql`, or `none`.

**GET /api/catalogs (same idea for schemas and tables):**

```
  listCatalogsRest (UC REST 2.1, always) ────────┐
                                                ├──► merge by name ──► JSON
  if warehouse_id: listCatalogNamesSql ────────┘      (REST rows first,
       (SHOW CATALOGS on warehouse)                    SQL fills gaps)
```

### 4.3 HTTP to Databricks

- **`dbFetch`**: `Authorization: Bearer {req.dbToken}` to `{req.dbHost}{path}`.
- **`executeSql`**: SQL Statement Execution API with the chosen warehouse id.

---

## 5. Frontend (`frontend/src/`)

### 5.1 Bootstrap (`App.jsx`)

1. **`GET /api/defaults`** — host, warehouse, inspire DB, flags (no auth required).
2. Optionally **`GET /api/warehouses`**, **`GET /api/notebook`** — require a valid token path (in App: proxy token and/or SP after `requireToken`).

### 5.2 Launch page UC picker (`LaunchPage.jsx`)

- **`canUseUcApi`** = `databricksHost` and (`token` or **`serverEnvHasPat`**).
- **`apiFetch`**: sends PAT headers only if user configured `token`; may send **`X-Databricks-Host`** when set.
- Appends **`?warehouse_id=`** via **`ucBrowseQuery(warehouseId)`** so the backend can run SQL fallbacks for SP browsing.

### 5.3 Other UI

- **`TableBrowser.jsx`** calls the same catalog/schema/table endpoints; wiring may omit `warehouse_id` (REST-first only unless extended).

---

## 6. Key environment variables (App runtime)

| Variable | Role |
|----------|------|
| `DATABRICKS_HOST` | Workspace URL / hostname (injected in Apps). |
| `DATABRICKS_TOKEN` | Optional static PAT for server-side calls. |
| `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` | SP OAuth (often from `app.yaml` service principal resource). |
| `INSPIRE_WAREHOUSE_ID` | Default SQL warehouse (installer + UC SQL merge). |
| `INSPIRE_DATABASE` | Default `{catalog}._inspire` for session tables. |
| `INSPIRE_AUTO_SETUP` | Installer-driven auto setup flag. |
| `NODE_ENV=production` | Host lock + SP preference behavior in server. |
| `DEBUG_SP_AUTH=1` | Optional verbose SP OAuth logs (if supported in your branch). |

---

## 7. File map

| Concern | Primary files |
|---------|----------------|
| Installer, grants, `app.yaml` | `installer_workspace.py` |
| Token resolution, UC routes, SQL | `backend/server.js` |
| Defaults / health introspection | `GET /api/defaults`, `GET /api/health` in `backend/server.js` |
| Bootstrap & settings | `frontend/src/App.jsx` |
| UC picker + `warehouse_id` | `frontend/src/pages/LaunchPage.jsx` |
| Simple tree browser | `frontend/src/components/TableBrowser.jsx` |

---

## 8. Security summary

- **End users** do not receive the App SP’s client secret in normal flow; it stays in **App env / Databricks-managed resource**.
- **BROWSE** on non-Inspire catalogs is intentional: metadata listing for the picker, not blanket data access.
- **Production** host pinning avoids calling the wrong workspace with a valid token.

---

*Generated for Inspire AI maintainers. Update this file if `requireToken`, `getToken`, or UC merge logic changes.*
