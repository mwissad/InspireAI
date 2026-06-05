# Databricks notebook source
# MAGIC %md
# MAGIC # Inspire AI — Sync `__inspire_usecases` to searchable embeddings
# MAGIC
# MAGIC Builds/refreshes **`{catalog}._inspire.__inspire_usecase_search`** for the Discover chatbot.
# MAGIC
# MAGIC **Schedule** this notebook (e.g. daily or after Inspire discovery jobs) or run manually.
# MAGIC
# MAGIC **Widgets**
# MAGIC - `inspire_database` — `catalog._inspire`
# MAGIC - `warehouse_id` — SQL warehouse for reads/writes
# MAGIC - `embedding_model` — serving endpoint for embeddings (default `databricks-gte-large-en`)
# MAGIC
# MAGIC **Version:** `schema-safe-v3` (introspects UC + session columns; uses `business_name` not `widget_values`)

# COMMAND ----------

EMBED_NOTEBOOK_VERSION = "schema-safe-v3"
print(f"Embed notebook version: {EMBED_NOTEBOOK_VERSION}")

# COMMAND ----------

dbutils.widgets.text("inspire_database", "", "1. Inspire DB (catalog._inspire)")
dbutils.widgets.text("warehouse_id", "", "2. SQL warehouse id")
dbutils.widgets.text("embedding_model", "databricks-gte-large-en", "3. Embedding model endpoint")

# COMMAND ----------

import json
import math
import re
import time
from typing import List, Optional

from pyspark.sql import functions as F
from pyspark.sql.types import ArrayType, DoubleType, StringType, StructField, StructType

inspire_db = (dbutils.widgets.get("inspire_database") or "").strip()
warehouse_id = (dbutils.widgets.get("warehouse_id") or "").strip()
embedding_model = (dbutils.widgets.get("embedding_model") or "databricks-gte-large-en").strip()

if not inspire_db or "." not in inspire_db:
    raise ValueError("Set inspire_database to catalog._inspire (e.g. mehdi_wissad._inspire)")
if not warehouse_id:
    raise ValueError("Set warehouse_id to a SQL warehouse id")

catalog, schema = inspire_db.split(".", 1)
uc_table = f"`{catalog}`.`{schema}`.`__inspire_usecases`"
session_table = f"`{catalog}`.`{schema}`.`__inspire_session`"
search_table = f"`{catalog}`.`{schema}`.`__inspire_usecase_search`"

print(f"Source:  {uc_table}")
print(f"Sink:    {search_table}")
print(f"Model:   {embedding_model}")

# COMMAND ----------


def _notebook_api_context():
    try:
        ctx = dbutils.notebook.entry_point.getDbutils().notebook().getContext()
        host = (ctx.apiUrl().get() or "").rstrip("/")
        token = ctx.apiToken().get()
        return host, token
    except Exception:
        return "", ""


def _build_chunk_text(row) -> str:
    parts = []
    for label, key in (
        ("Use case", "use_case"),
        ("Title", "description"),
        ("Domain", "business_domain"),
        ("Subdomain", "subdomain"),
        ("Idea theme", "idea_theme"),
        ("Statement", "statement"),
        ("Solution", "solution"),
        ("Business value", "business_value"),
        ("Tables", "tables_involved"),
        ("Technique", "analytics_technique"),
        ("Priority score", "priority_score"),
        ("BoB score", "bob_score"),
        ("Inspire score", "inspire_score"),
        ("ROI", "roi"),
    ):
        val = row.get(key)
        if val is not None and str(val).strip():
            parts.append(f"{label}: {str(val).strip()}")
    biz = row.get("business_name")
    if biz and str(biz).strip():
        parts.insert(0, f"Business: {str(biz).strip()}")
    sid = row.get("session_id")
    if sid is not None:
        parts.append(f"Session: {sid}")
    return "\n".join(parts).strip()


def _embed_texts(texts: List[str], batch_size: int = 32) -> List[List[float]]:
    import requests

    host, token = _notebook_api_context()
    if not host or not token:
        raise RuntimeError("Could not resolve workspace host/token from notebook context")

    url = f"{host}/serving-endpoints/{embedding_model}/invocations"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    out: List[List[float]] = []

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        payload = {"input": batch}
        resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=120)
        if resp.status_code >= 400:
            raise RuntimeError(f"Embedding API {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        if isinstance(data, dict) and "data" in data:
            for item in data["data"]:
                emb = item.get("embedding") if isinstance(item, dict) else item
                out.append(list(emb))
        elif isinstance(data, list):
            for item in data:
                emb = item.get("embedding") if isinstance(item, dict) else item
                out.append(list(emb))
        else:
            raise RuntimeError(f"Unexpected embedding response shape: {str(data)[:300]}")
        time.sleep(0.05)
    return out


# COMMAND ----------

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# __inspire_usecases schema varies by Inspire version — select only columns that exist.
_uc_table_plain = f"{catalog}.{schema}.__inspire_usecases"
_uc_field_names = {f.name for f in spark.table(_uc_table_plain).schema.fields}


def _uc_col(name: str, alias: Optional[str] = None) -> str:
    """Emit u.`col` or NULL if missing (older tracking tables lack newer columns)."""
    out = alias or name
    if name in _uc_field_names:
        return f"u.`{name}` AS `{out}`"
    return f"CAST(NULL AS STRING) AS `{out}`"


_uc_select = ",\n  ".join(
    [
        _uc_col("id", "usecase_id"),
        _uc_col("session_id"),
        _uc_col("use_case"),
        _uc_col("description"),
        _uc_col("business_domain"),
        _uc_col("subdomain"),
        _uc_col("statement"),
        _uc_col("solution"),
        _uc_col("business_value"),
        _uc_col("tables_involved"),
        _uc_col("analytics_technique"),
        _uc_col("priority_score"),
        _uc_col("bob_score"),
        _uc_col("inspire_score"),
        _uc_col("idea_theme"),
        _uc_col("roi"),
    ]
)

_session_table_plain = f"{catalog}.{schema}.__inspire_session"
_session_field_names = set()
try:
    _session_field_names = {f.name for f in spark.table(_session_table_plain).schema.fields}
except Exception as _sess_err:
    print(f"Session table not available ({_sess_err}); business_name will be empty.")

if "business_name" in _session_field_names:
    _business_name_expr = "s.`business_name` AS business_name"
elif "widget_values" in _session_field_names:
    _business_name_expr = (
        "get_json_object(s.widget_values, '$.00_business_name') AS business_name"
    )
else:
    _business_name_expr = "CAST(NULL AS STRING) AS business_name"

if _session_field_names:
    source_sql = f"""
SELECT
  {_uc_select},
  {_business_name_expr}
FROM {uc_table} u
LEFT JOIN {session_table} s ON u.session_id = s.session_id
WHERE u.use_case IS NOT NULL AND trim(u.use_case) != ''
"""
else:
    source_sql = f"""
SELECT
  {_uc_select},
  CAST(NULL AS STRING) AS business_name
FROM {uc_table} u
WHERE u.use_case IS NOT NULL AND trim(u.use_case) != ''
"""

print(f"UC columns used: {sorted(_uc_field_names)}")
if _session_field_names:
    print(f"Session columns used: {sorted(_session_field_names)}")

try:
    src_df = spark.sql(source_sql)
except Exception as e:
    raise RuntimeError(f"Could not read {uc_table}: {e}") from e

rows = [r.asDict() for r in src_df.collect()]
print(f"Loaded {len(rows)} use case row(s) from {uc_table}")
if not rows:
    dbutils.notebook.exit("No use cases to embed — run Inspire discovery first.")

# COMMAND ----------

records = []
texts = []
for row in rows:
    chunk = _build_chunk_text(row)
    if not chunk:
        continue
    uid = f"{row.get('session_id')}_{row.get('usecase_id')}"
    records.append(
        {
            "id": uid,
            "session_id": int(row["session_id"]) if row.get("session_id") is not None else None,
            "usecase_id": str(row.get("usecase_id") or ""),
            "business_name": str(row.get("business_name") or ""),
            "business_domain": str(row.get("business_domain") or ""),
            "priority_score": (
                row.get("priority_score")
                if row.get("priority_score") is not None
                else row.get("bob_score")
                if row.get("bob_score") is not None
                else row.get("inspire_score")
            ),
            "chunk_text": chunk,
        }
    )
    texts.append(chunk)

print(f"Embedding {len(texts)} chunk(s)...")
vectors = _embed_texts(texts)
for rec, vec in zip(records, vectors):
    rec["embedding"] = [float(x) for x in vec]

# COMMAND ----------

schema_struct = StructType(
    [
        StructField("id", StringType(), False),
        StructField("session_id", StringType(), True),
        StructField("usecase_id", StringType(), True),
        StructField("business_name", StringType(), True),
        StructField("business_domain", StringType(), True),
        StructField("priority_score", StringType(), True),
        StructField("chunk_text", StringType(), False),
        StructField("embedding", ArrayType(DoubleType()), False),
        StructField("synced_at", StringType(), False),
    ]
)

from datetime import datetime, timezone

synced_at = datetime.now(timezone.utc).isoformat()
for rec in records:
    rec["synced_at"] = synced_at

out_df = spark.createDataFrame(records, schema=schema_struct)
out_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").saveAsTable(
    search_table.replace("`", "")
)

print(f"✅ Wrote {out_df.count()} row(s) to {search_table}")
print("Next: point the Inspire app Discover chat at this table (or create a Vector Search index on it).")
