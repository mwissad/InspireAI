#!/usr/bin/env python3
"""
Split databricks_inspire_v43.dbc into independent phase notebooks
for a Databricks Lakeflow (Workflows) multi-task job.

Architecture:
  00_inspire_commons   — Shared library (all classes, prompts, utils)
  01_init_validate     — Widget creation, input validation, config persistence
  02_business_context  — Business context extraction & strategic goals
  03_schema_discovery  — DataLoader, table filtering, batch preparation
  04_use_case_gen      — 2-pass ensemble use case generation
  05_scoring_quality   — Clustering, scoring, dedup, quality filtering
  06_sql_notebooks     — Domain-by-domain SQL generation & notebook assembly
  07_documentation     — PDF, PPTX, Excel, CSV, Markdown catalogs
  08_samples_finalize  — Sample result execution, cleanup, reporting

State between phases is persisted via:
  - Delta table: {inspire_database}._inspire_pipeline_state (JSON config)
  - IntermediateStorageManager: file-based use case storage
  - Delta tables: __inspire_session, __inspire_step (tracking)
  - Delta tables: use case catalog
"""

import json
import os
import zipfile
import shutil

# ─── Configuration ───
DBC_PATH = "databricks_inspire_v43.dbc"
OUTPUT_DIR = "notebooks"

# ─── Extract notebook from DBC ───
def extract_notebook_source(dbc_path):
    with zipfile.ZipFile(dbc_path, 'r') as z:
        for name in z.namelist():
            if name.endswith('.python'):
                with z.open(name) as f:
                    data = json.loads(f.read().decode('utf-8'))
                    return data
    raise FileNotFoundError("No .python file found in DBC archive")


def write_notebook(path, cells, language="python"):
    """Write a Databricks notebook in source format (.py)"""
    with open(path, 'w', encoding='utf-8') as f:
        f.write("# Databricks notebook source\n")
        for i, cell in enumerate(cells):
            if i > 0:
                f.write("\n# COMMAND ----------\n\n")
            f.write(cell)
            f.write("\n")


def main():
    print("📂 Extracting notebook from DBC...")
    nb = extract_notebook_source(DBC_PATH)
    
    # v43: main code is in commands[0] (commands[1] is entry point, commands[2] is markdown)
    main_code = nb['commands'][0]['command']
    lines = main_code.split('\n')
    total_lines = len(lines)
    print(f"   Total lines: {total_lines}")
    
    # ─── Find key boundaries ───
    # We need to find where each major section starts/ends
    
    # Find create_widgets() function
    create_widgets_start = None
    create_widgets_end = None
    
    # Find main() function  
    main_start = None
    
    # Find DatabricksInspire class
    inspire_class_start = None
    
    for i, line in enumerate(lines):
        if line.startswith('def create_widgets():'):
            create_widgets_start = i
        elif line.startswith('def main():'):
            main_start = i
        elif line.startswith('class DatabricksInspire:'):
            inspire_class_start = i
        # Detect end of create_widgets (next top-level def/class after it)
        if create_widgets_start and not create_widgets_end:
            if i > create_widgets_start and (line.startswith('def ') or line.startswith('class ')) and not line.startswith('    '):
                create_widgets_end = i
    
    print(f"   create_widgets: lines {create_widgets_start}-{create_widgets_end}")
    print(f"   DatabricksInspire class: line {inspire_class_start}")
    print(f"   main(): line {main_start}")
    
    # ─── Create output directory ───
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 0: SHARED COMMONS (all code except main/create_widgets)
    # ═══════════════════════════════════════════════════════════════
    print("\n📝 Creating 00_inspire_commons...")
    
    # Everything from the start to main() (minus create_widgets which we'll inline)
    # Plus state persistence helpers
    
    state_helpers = '''
# ════════════════════════════════════════════════════════════════════
# PIPELINE STATE PERSISTENCE (for multi-notebook workflow)
# ════════════════════════════════════════════════════════════════════
import json as _json

class PipelineState:
    """Persist state between workflow tasks using Delta tables."""
    
    def __init__(self, spark, inspire_database):
        self.spark = spark
        self.inspire_database = inspire_database
        self._state_table = f"{inspire_database}._inspire_pipeline_state"
    
    def save(self, phase_name, data):
        """Save phase output state as JSON to Delta table."""
        json_str = _json.dumps(data, default=str)
        self.spark.sql(f"""
            MERGE INTO {self._state_table} AS target
            USING (SELECT '{phase_name}' AS phase_name, '{json_str.replace("'", "''")}' AS state_json, current_timestamp() AS updated_at) AS source
            ON target.phase_name = source.phase_name
            WHEN MATCHED THEN UPDATE SET state_json = source.state_json, updated_at = source.updated_at
            WHEN NOT MATCHED THEN INSERT (phase_name, state_json, updated_at) VALUES (source.phase_name, source.state_json, source.updated_at)
        """)
        log_print(f"💾 Saved pipeline state for phase: {phase_name}")
    
    def load(self, phase_name):
        """Load phase output state from Delta table."""
        try:
            rows = self.spark.sql(f"SELECT state_json FROM {self._state_table} WHERE phase_name = '{phase_name}'").collect()
            if rows:
                return _json.loads(rows[0]['state_json'])
        except Exception as e:
            log_print(f"⚠️ Could not load state for phase {phase_name}: {e}", level="WARNING")
        return None
    
    def ensure_table(self):
        """Create the state table if it doesn't exist."""
        parts = self.inspire_database.split('.')
        if len(parts) == 2:
            self.spark.sql(f"CREATE CATALOG IF NOT EXISTS {parts[0]}")
            self.spark.sql(f"CREATE SCHEMA IF NOT EXISTS {self.inspire_database}")
        self.spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {self._state_table} (
                phase_name STRING,
                state_json STRING,
                updated_at TIMESTAMP
            ) USING DELTA
        """)
    
    def save_use_cases_delta(self, use_cases, table_suffix="_pipeline_use_cases"):
        """Save use cases list to a Delta table for cross-notebook sharing."""
        import pyspark.sql.functions as F
        json_rows = [_json.dumps(uc, default=str) for uc in use_cases]
        df = self.spark.createDataFrame([(i, j) for i, j in enumerate(json_rows)], ["idx", "use_case_json"])
        df.write.mode("overwrite").saveAsTable(f"{self.inspire_database}.{table_suffix}")
        log_print(f"💾 Saved {len(use_cases)} use cases to {self.inspire_database}.{table_suffix}")
    
    def load_use_cases_delta(self, table_suffix="_pipeline_use_cases"):
        """Load use cases list from Delta table."""
        try:
            rows = self.spark.sql(f"SELECT use_case_json FROM {self.inspire_database}.{table_suffix} ORDER BY idx").collect()
            return [_json.loads(r['use_case_json']) for r in rows]
        except Exception as e:
            log_print(f"⚠️ Could not load use cases from Delta: {e}", level="WARNING")
            return []
    
    def save_schema_delta(self, schema_details, table_suffix="_pipeline_schema"):
        """Save schema details (column tuples) to Delta for cross-notebook sharing."""
        rows = []
        for detail in schema_details:
            (catalog, schema, table, col_name, col_type, col_comment) = detail
            rows.append((catalog, schema, table, col_name, col_type, str(col_comment) if col_comment else ""))
        df = self.spark.createDataFrame(rows, ["catalog", "schema", "table_name", "col_name", "col_type", "col_comment"])
        df.write.mode("overwrite").saveAsTable(f"{self.inspire_database}.{table_suffix}")
        log_print(f"💾 Saved {len(schema_details)} column details to {self.inspire_database}.{table_suffix}")
    
    def load_schema_delta(self, table_suffix="_pipeline_schema"):
        """Load schema details from Delta table."""
        try:
            rows = self.spark.sql(f"SELECT * FROM {self.inspire_database}.{table_suffix}").collect()
            return [(r['catalog'], r['schema'], r['table_name'], r['col_name'], r['col_type'], r['col_comment']) for r in rows]
        except Exception as e:
            log_print(f"⚠️ Could not load schema from Delta: {e}", level="WARNING")
            return []
'''

    # Build commons: everything from line 0 to main_start, excluding create_widgets
    commons_lines = []
    # Add lines before create_widgets
    commons_lines.extend(lines[0:create_widgets_start])
    # Add lines after create_widgets but before main
    commons_lines.extend(lines[create_widgets_end:main_start])
    
    commons_code = '\n'.join(commons_lines)
    
    write_notebook(
        os.path.join(OUTPUT_DIR, "00_inspire_commons.py"),
        [commons_code, state_helpers]
    )
    print(f"   ✅ {len(commons_lines)} lines of shared code")
    
    # ═══════════════════════════════════════════════════════════════
    # Helper: generate widget reading code from main()
    # ═══════════════════════════════════════════════════════════════
    
    # Extract widget reading + validation from main() (lines main_start to the "Pack values" section)
    widget_code_lines = lines[create_widgets_start:create_widgets_end]
    widget_func = '\n'.join(widget_code_lines)
    
    # Extract the main() validation code
    main_lines = lines[main_start:total_lines]
    main_code_str = '\n'.join(main_lines)
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 1: INIT & VALIDATE
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 01_init_validate...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "01_init_validate.py"),
        [
            "# MAGIC %md\n# # Step 1: Initialize & Validate\n# Reads widget values, validates all inputs, and persists configuration for downstream tasks.",
            "# MAGIC %run ./00_inspire_commons",
            widget_func,
            '''# ─── Read & validate widget values, then save config ───
create_widgets()

''' + '\n'.join(lines[main_start:main_start+1]) + '''

    print_ascii_banner()

    # --- Read all widget values ---
''' + '\n'.join(lines[main_start+12:main_start+250]) + '''

    # --- Build config dict from validated widget values ---
    widget_values = {
        "business": business_name,
        "inspire_database": inspire_database,
        "operation_mode": operation_mode,
        "table_election_mode": table_election_mode,
        "use_cases_quality": use_cases_quality,
        "strategic_goals": strategic_goals_str,
        "business_priorities": business_priorities_str,
        "business_domains": business_domains_str,
        "catalogs": catalogs_str,
        "schemas": schemas_str,
        "tables": tables_str,
        "generate": generate_str,
        "generation_path": generation_path,
        "output_language": output_language_str,
        "sql_generation_per_domain": sql_generation_per_domain,
        "technical_exclusion_strategy": technical_exclusion_strategy,
        "json_file_path": json_file_path,
        "session_id": user_session_id,
    }

    # --- Save validated config to pipeline state ---
    pipeline_state = PipelineState(spark, inspire_database)
    pipeline_state.ensure_table()
    pipeline_state.save("config", widget_values)
    
    log_print("✅ Configuration validated and saved. Ready for next phase.")
    dbutils.notebook.exit(json.dumps({"status": "success", "inspire_database": inspire_database}))

main()
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 2: BUSINESS CONTEXT
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 02_business_context...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "02_business_context.py"),
        [
            "# MAGIC %md\n# # Step 2: Business Context Extraction\n# Extracts business context, strategic goals, and priorities using LLM analysis.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load config from previous phase ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
if not config:
    dbutils.notebook.exit("ERROR: No config found. Run 01_init_validate first.")

log_print("=" * 80)
log_print("🚀 STEP 2: EXTRACTING BUSINESS CONTEXT")
log_print("=" * 80)

# Create DatabricksInspire instance
inspirer = DatabricksInspire(**config)
inspirer._ensure_inspire_database_exists()
inspirer._create_tracking_table()

# Extract business context
user_domains_str = ', '.join(inspirer.user_business_domains) if inspirer.user_business_domains else ''
llm_business_context = inspirer._get_business_context_from_llm()
merged_business_context = inspirer._merge_business_contexts(llm_business_context, user_domains_str)

# Handle user-provided strategic goals
if inspirer.user_strategic_goals:
    merged_business_context["strategic_goals"] = inspirer.user_strategic_goals
    log_print(f"✅ User provided {len(inspirer.user_strategic_goals)} strategic goals")
else:
    llm_goals = merged_business_context.get("strategic_goals", [])
    if isinstance(llm_goals, str):
        llm_goals = [g.strip() for g in llm_goals.split(",") if g.strip()]
    merged_business_context["strategic_goals"] = llm_goals

# Handle user-provided business priorities
if inspirer.user_business_priorities:
    merged_business_context["business_priorities"] = inspirer.user_business_priorities

# Handle user-provided business domains
if inspirer.user_business_domains:
    merged_business_context["user_business_domains"] = inspirer.user_business_domains

# Save business context
pipeline_state.save("business_context", merged_business_context)

log_print("✅ Business context extracted and saved.")
dbutils.notebook.exit(json.dumps({"status": "success"}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 3: SCHEMA DISCOVERY & TABLE FILTERING
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 03_schema_discovery...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "03_schema_discovery.py"),
        [
            "# MAGIC %md\n# # Step 3: Schema Discovery & Table Filtering\n# Discovers UC metadata tables, filters business vs technical, prepares batches.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load config and business context ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
business_context_data = pipeline_state.load("business_context")

if not config:
    dbutils.notebook.exit("ERROR: No config found. Run 01_init_validate first.")

log_print("=" * 80)
log_print("🔍 STEP 3: SCHEMA DISCOVERY & TABLE FILTERING")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer.merged_business_context = business_context_data or {}

# Business context values
business_context = business_context_data.get("business_context", "") if business_context_data else ""
strategic_goals = business_context_data.get("strategic_goals", []) if business_context_data else []

# Generate unstructured docs if enabled
unstructured_docs_markdown = ""
if inspirer.use_unstructured_data and inspirer.data_loader:
    sample_columns = inspirer.data_loader.getNextTables(inspirer.scan_parallelism)
    if sample_columns:
        sample_columns = inspirer._augment_columns_with_foreign_keys(sample_columns)
        sample_schema_markdown = inspirer._format_schema_for_prompt(sample_columns)
        unstructured_result = inspirer._generate_unstructured_docs(sample_schema_markdown)
        unstructured_docs_markdown = unstructured_result.get("unstructured_docs_markdown", "")
        inspirer.data_loader.current_table_idx = 0

# Collect all tables in batches
if inspirer.data_loader:
    safe_context_limit = get_safe_context_limit("English", buffer_percent=0.9, prompt_name="BASE_USE_CASE_GEN_PROMPT")
    base_prompt_template = PROMPT_TEMPLATES.get("BASE_USE_CASE_GEN_PROMPT", "")
    base_prompt_size = len(base_prompt_template) + len(unstructured_docs_markdown) + 2000
    
    # Pull all tables
    all_batch_columns = []
    while True:
        batch = inspirer.data_loader.getNextTables(inspirer.scan_parallelism)
        if batch is None:
            break
        batch = inspirer._augment_columns_with_foreign_keys(batch)
        all_batch_columns.extend(batch)
    
    if not all_batch_columns:
        dbutils.notebook.exit("ERROR: No tables found in UC metadata.")
    
    log_print(f"📊 Discovered {len(set((c,s,t) for c,s,t,_,_,_ in all_batch_columns))} tables")
    
    # Filter business vs technical tables
    (business_details, technical_details, business_tables, technical_tables,
     business_scores, data_category_map, master_tables_set,
     transactional_tables_set, reference_tables_set) = inspirer._filter_business_tables(
        all_batch_columns,
        business_context=business_context,
        industry="",
        exclusion_strategy=inspirer.technical_exclusion_strategy
    )
    
    log_print(f"✅ Business tables: {len(business_tables)}")
    log_print(f"❌ Technical tables (excluded): {len(technical_tables)}")
    log_print(f"🟡 Reference tables (excluded): {len(reference_tables_set)}")
    
    if not business_details:
        dbutils.notebook.exit("ERROR: No business tables found after filtering.")
    
    # Save schema to Delta for downstream phases
    pipeline_state.save_schema_delta(business_details, "_pipeline_business_schema")
    
    # Save metadata
    pipeline_state.save("schema_discovery", {
        "total_tables": len(business_tables) + len(technical_tables),
        "business_tables": len(business_tables),
        "technical_tables": len(technical_tables),
        "reference_tables": len(reference_tables_set),
        "master_tables": list(master_tables_set),
        "transactional_tables": list(transactional_tables_set),
        "unstructured_docs": unstructured_docs_markdown[:50000],  # Truncate for JSON storage
        "base_prompt_size": base_prompt_size,
        "safe_context_limit": safe_context_limit,
    })
    
    log_print("✅ Schema discovery complete. Data saved for downstream phases.")
    dbutils.notebook.exit(json.dumps({"status": "success", "business_tables": len(business_tables)}))
else:
    dbutils.notebook.exit("ERROR: No data loader available.")
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 4: USE CASE GENERATION
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 04_use_case_gen...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "04_use_case_gen.py"),
        [
            "# MAGIC %md\n# # Step 4: Use Case Generation\n# 2-pass serial ensemble: generates initial use cases then finds additional ones from transactional tables.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load state from previous phases ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
business_context_data = pipeline_state.load("business_context")
schema_meta = pipeline_state.load("schema_discovery")

if not config or not schema_meta:
    dbutils.notebook.exit("ERROR: Missing state. Run previous phases first.")

log_print("=" * 80)
log_print("🔄 STEP 4: USE CASE GENERATION (2-PASS ENSEMBLE)")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer.merged_business_context = business_context_data or {}
inspirer._ensure_inspire_database_exists()
inspirer._create_tracking_table()

# Load schema from Delta
business_details = pipeline_state.load_schema_delta("_pipeline_business_schema")
if not business_details:
    dbutils.notebook.exit("ERROR: No schema data found. Run 03_schema_discovery first.")

# Reconstruct context
business_context = (business_context_data or {}).get("business_context", "")
strategic_goals = (business_context_data or {}).get("strategic_goals", [])
business_priorities = (business_context_data or {}).get("business_priorities", [])
strategic_initiative = (business_context_data or {}).get("strategic_initiative", "")
value_chain = (business_context_data or {}).get("value_chain", "")
revenue_model = (business_context_data or {}).get("revenue_model", "")
unstructured_docs_markdown = schema_meta.get("unstructured_docs", "")
base_prompt_size = schema_meta.get("base_prompt_size", 5000)
safe_context_limit = schema_meta.get("safe_context_limit", 100000)
master_tables_set = set(schema_meta.get("master_tables", []))
transactional_tables_set = set(schema_meta.get("transactional_tables", []))

inspirer._business_column_details_global = business_details
inspirer.global_table_names = {f"{c}.{s}.{t}" for (c, s, t, _, _, _) in business_details}

# Build batches from business details
tables_per_call = inspirer._determine_tables_per_call(len(master_tables_set))
master_details = [d for d in business_details if f"{d[0]}.{d[1]}.{d[2]}" not in transactional_tables_set]
transactional_details = [d for d in business_details if f"{d[0]}.{d[1]}.{d[2]}" in transactional_tables_set]

batches_to_process = []
next_batch_num = 1
if master_details:
    grouped = inspirer._split_by_table_limit(master_details, tables_per_call)
    for group in grouped:
        batches_to_process.append((next_batch_num, group))
        next_batch_num += 1
if transactional_details:
    grouped = inspirer._split_by_table_limit(transactional_details, 1)
    for group in grouped:
        batches_to_process.append((next_batch_num, group))
        next_batch_num += 1

# Augment with related tables
augmented_batches = []
for bn, cols in batches_to_process:
    augmented = inspirer._augment_columns_with_related_tables(cols)
    augmented_batches.append((bn, augmented))
batches_to_process = augmented_batches

log_print(f"📋 Processing {len(batches_to_process)} batches")

# Dynamic parallelism
batch_parallelism, reason = calculate_adaptive_parallelism(
    "use_case_generation", inspirer.max_parallelism,
    num_items=len(batches_to_process),
    total_columns=sum(len(cols) for _, cols in batches_to_process),
    avg_prompt_chars=sum(len(cols) for _, cols in batches_to_process) * 100,
    is_llm_operation=True, logger=inspirer.logger
)

inspirer.storage_manager.initialize()

# === PASS 1 ===
log_print(f"🔄 PASS 1: Initial Use Case Generation ({len(batches_to_process)} batches)")
from concurrent.futures import ThreadPoolExecutor
import concurrent.futures

with ThreadPoolExecutor(max_workers=batch_parallelism, thread_name_prefix="Pass1") as executor:
    futures = {}
    for bn, cols in batches_to_process:
        uid = f"P1_{bn}"
        future = executor.submit(
            inspirer._process_batch_with_retry, cols, uid,
            unstructured_docs_markdown, strategic_goals,
            business_context, business_priorities,
            strategic_initiative, value_chain, revenue_model,
            3, ""
        )
        futures[future] = uid
    
    done_count = 0
    timeout = (len(batches_to_process) * 900) // inspirer.max_parallelism + 600
    try:
        for f in concurrent.futures.as_completed(futures, timeout=timeout):
            uid = futures[f]
            try:
                ucs = f.result(timeout=900)
                if ucs:
                    inspirer.storage_manager.save_batch(uid, ucs)
                    done_count += 1
                    log_print(f"✓ [PASS 1] Batch {done_count}/{len(batches_to_process)}")
                    try:
                        inspirer._tracking_merge_use_cases(ucs)
                    except Exception:
                        pass
            except Exception as e:
                log_print(f"❌ Batch {uid} failed: {e}", level="ERROR")
    except concurrent.futures.TimeoutError:
        log_print(f"⚠️ PASS 1 timeout. {done_count} completed.", level="WARNING")

pass1_count = inspirer.storage_manager.get_total_count()
log_print(f"✅ PASS 1: {pass1_count} use cases")

# Save PASS 1 IDs
pass1_ids = []
for batch in inspirer.storage_manager.iter_batches():
    for uc in batch:
        pass1_ids.append(uc.get('No', ''))
inspirer.storage_manager.save_pass1_ids(pass1_ids)
del pass1_ids

# === PASS 2 (transactional tables only) ===
tx_batches = [(bn, [c for c in cols if f"{c[0]}.{c[1]}.{c[2]}" in transactional_tables_set])
              for bn, cols in batches_to_process]
tx_batches = [(bn, cols) for bn, cols in tx_batches if cols]

if pass1_count > 0 and tx_batches:
    log_print(f"🔄 PASS 2: Ensemble on {len(tx_batches)} transactional batches")
    
    feedback_lines = ["**PASS 2: Find NEW use cases not in PASS 1**\\n"]
    feedback_lines.append("| No | Name | Tables |\\n|---|---|---|")
    for idx, name, tables in inspirer.storage_manager.iter_pass1_use_cases_for_feedback(limit=200):
        feedback_lines.append(f"| {idx} | {name} | {tables} |")
    feedback = "\\n".join(feedback_lines)
    
    with ThreadPoolExecutor(max_workers=batch_parallelism, thread_name_prefix="Pass2") as executor:
        futures = {}
        for bn, cols in tx_batches:
            uid = f"P2_{bn}"
            future = executor.submit(
                inspirer._process_batch_with_retry, cols, uid,
                unstructured_docs_markdown, strategic_goals,
                business_context, business_priorities,
                strategic_initiative, value_chain, revenue_model,
                3, feedback
            )
            futures[future] = uid
        
        done2 = 0
        try:
            for f in concurrent.futures.as_completed(futures, timeout=timeout):
                uid = futures[f]
                try:
                    ucs = f.result(timeout=900)
                    if ucs:
                        inspirer.storage_manager.save_batch(uid, ucs)
                        done2 += 1
                        try:
                            inspirer._tracking_merge_use_cases(ucs)
                        except Exception:
                            pass
                except Exception:
                    pass
        except concurrent.futures.TimeoutError:
            pass
    
    total_pass2 = inspirer.storage_manager.get_total_count() - pass1_count
    log_print(f"✅ PASS 2: {total_pass2} additional use cases")

# Load all use cases and save to Delta
all_use_cases = inspirer.storage_manager.load_all_use_cases()
all_use_cases = [uc for uc in all_use_cases 
                 if uc.get('Tables Involved', '').strip() and 
                 ('.' in uc.get('Tables Involved', '') or uc.get('Tables Involved', '').startswith('/Volumes'))]

# Table coverage catch-all
all_columns_for_sql = []
for _, cols in batches_to_process:
    all_columns_for_sql.extend(cols)

for round_idx in range(3):
    retry_ucs = inspirer._retry_missing_table_coverage(
        all_use_cases, all_columns_for_sql, unstructured_docs_markdown,
        strategic_goals, include_business_catchall=True
    )
    if not retry_ucs:
        break
    retry_ucs = [uc for uc in retry_ucs 
                 if uc.get('Tables Involved', '').strip() and not uc.get('Tables Involved', '').startswith('/Volumes')]
    if retry_ucs:
        all_use_cases.extend(retry_ucs)

# Save schema for SQL generation
inspirer.storage_manager.save_schema_details(all_columns_for_sql, "all_columns_for_sql")

# Save use cases to Delta
pipeline_state.save_use_cases_delta(all_use_cases, "_pipeline_use_cases_raw")
pipeline_state.save("use_case_gen", {
    "total_use_cases": len(all_use_cases),
    "pass1_count": pass1_count,
})

log_print(f"✅ Total use cases: {len(all_use_cases)}")
dbutils.notebook.exit(json.dumps({"status": "success", "use_cases": len(all_use_cases)}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 5: CLUSTERING, SCORING & QUALITY
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 05_scoring_quality...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "05_scoring_quality.py"),
        [
            "# MAGIC %md\n# # Step 5: Clustering, Scoring & Quality\n# Clusters use cases into domains, scores them, deduplicates, and applies quality filtering.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load state ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
business_context_data = pipeline_state.load("business_context")

if not config:
    dbutils.notebook.exit("ERROR: Missing config.")

log_print("=" * 80)
log_print("📊 STEP 5: CLUSTERING, SCORING & QUALITY")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer.merged_business_context = business_context_data or {}
inspirer._ensure_inspire_database_exists()
inspirer._create_tracking_table()

# Load use cases from Delta
all_use_cases = pipeline_state.load_use_cases_delta("_pipeline_use_cases_raw")
if not all_use_cases:
    dbutils.notebook.exit("ERROR: No use cases found. Run 04_use_case_gen first.")

log_print(f"📋 Loaded {len(all_use_cases)} use cases")

# Context values
ctx = business_context_data or {}
ctx_business_context = ctx.get("business_context", "")
ctx_strategic_goals = ctx.get("strategic_goals", [])
if isinstance(ctx_strategic_goals, str):
    ctx_strategic_goals = [s.strip() for s in ctx_strategic_goals.split(",") if s.strip()]
ctx_business_priorities = ctx.get("business_priorities", [])
ctx_strategic_initiative = ctx.get("strategic_initiative", "")
ctx_value_chain = ctx.get("value_chain", "")
ctx_revenue_model = ctx.get("revenue_model", "")

# Phase 1: Cluster domains/subdomains
log_print("🔄 Clustering use cases into domains...")
clustered = inspirer._cluster_domains_and_subdomains(all_use_cases, "English")
del all_use_cases

# Phase 2: Score per domain
log_print("🔄 Scoring use cases per domain...")
scored = inspirer._score_per_domain_parallel(
    clustered, business_context=ctx_business_context,
    strategic_goals=ctx_strategic_goals, business_priorities=ctx_business_priorities,
    strategic_initiative=ctx_strategic_initiative, value_chain=ctx_value_chain,
    revenue_model=ctx_revenue_model
)
del clustered

# Phase 3: Deduplication
log_print("🔄 Intelligent deduplication...")
deduped = inspirer._deduplicate_use_cases_by_domain_parallel(scored)
del scored

# Re-number by domain
from collections import defaultdict
grouped = inspirer._group_use_cases_by_domain_flat(deduped)
domain_scores = {d: inspirer._calculate_domain_impact_score(ucs) for d, ucs in grouped.items()}
sorted_domains = sorted(grouped.keys(), key=lambda d: domain_scores[d], reverse=True)

renumbered = []
counters = defaultdict(lambda: defaultdict(int))
for di, domain in enumerate(sorted_domains):
    prefix = f"N{di+1:02d}"
    for ui, uc in enumerate(grouped[domain], 1):
        old_id = uc.get('No', '')
        src = 'AI' if uc.get('_source') == 'AI' else 'ST'
        counters[domain][src] += 1
        new_id = f"{prefix}-{src}{counters[domain][src]:02d}"
        uc['No'] = new_id
        if 'SQL' in uc and uc['SQL'] and old_id:
            uc['SQL'] = uc['SQL'].replace(f"-- Use Case ID: {old_id}", f"-- Use Case ID: {new_id}")
        renumbered.append(uc)

inspirer._tracking_replace_session(renumbered)
inspirer._tracking_update_scores(renumbered)

# Phase 4: Quality scoring
schema_for_quality = pipeline_state.load_schema_delta("_pipeline_business_schema")
if renumbered and schema_for_quality:
    final_ucs = inspirer._score_use_case_data_quality(
        use_cases=renumbered, full_schema_details=schema_for_quality,
        business_context=ctx_business_context, industry=ctx.get("industry", "")
    )
    inspirer._tracking_update_quality(final_ucs)
    
    # Extreme quality filtering
    if inspirer.extreme_quality_mode:
        acceptable = {'Ultra High', 'Very High', 'High'}
        before = len(final_ucs)
        final_ucs = [uc for uc in final_ucs if uc.get('Quality', 'Medium') in acceptable]
        log_print(f"🔴 Extreme quality: {before} → {len(final_ucs)} use cases")
else:
    final_ucs = renumbered

# Save to Delta
pipeline_state.save_use_cases_delta(final_ucs, "_pipeline_use_cases_scored")
pipeline_state.save("scoring_quality", {"total_use_cases": len(final_ucs)})

log_print(f"✅ {len(final_ucs)} use cases scored and saved")
dbutils.notebook.exit(json.dumps({"status": "success", "use_cases": len(final_ucs)}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 6: SQL GENERATION & NOTEBOOKS
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 06_sql_notebooks...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "06_sql_notebooks.py"),
        [
            "# MAGIC %md\n# # Step 6: SQL Generation & Notebook Assembly\n# Generates SQL queries per domain and assembles use case notebooks.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load state ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
business_context_data = pipeline_state.load("business_context")
schema_meta = pipeline_state.load("schema_discovery")

if not config:
    dbutils.notebook.exit("ERROR: Missing config.")

log_print("=" * 80)
log_print("🔧 STEP 6: SQL GENERATION & NOTEBOOK ASSEMBLY")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer.merged_business_context = business_context_data or {}
inspirer._ensure_inspire_database_exists()
inspirer._create_tracking_table()

# Load scored use cases
final_ucs = pipeline_state.load_use_cases_delta("_pipeline_use_cases_scored")
if not final_ucs:
    dbutils.notebook.exit("ERROR: No scored use cases found.")

# Load schema
schema_details = pipeline_state.load_schema_delta("_pipeline_business_schema")
inspirer._business_column_details_global = schema_details
inspirer.global_table_names = {f"{c}.{s}.{t}" for (c, s, t, _, _, _) in schema_details}

# Translations
english_translations = inspirer.translation_service.get_translations("English")
unstructured_docs = (schema_meta or {}).get("unstructured_docs", "")

# Generate English Excel first
english_grouped = inspirer._group_use_cases_by_domain_flat(final_ucs)
lang_abbr_en = inspirer._get_lang_abbr("English")
try:
    inspirer._generate_use_case_excel("English", lang_abbr_en, english_grouped)
except Exception as e:
    log_print(f"⚠️ Excel generation failed: {e}", level="WARNING")

# Generate summary
summary_dict = None
try:
    (summary_dict, _) = inspirer._get_salesy_summary(english_grouped, inspirer.business_name, "English", english_translations)
except Exception as e:
    log_print(f"⚠️ Summary generation failed: {e}", level="WARNING")

# SQL generation & notebook assembly by domain
log_print(f"📋 {len(final_ucs)} use cases across {len(english_grouped)} domains")
final_ucs = inspirer._generate_sql_and_notebooks_by_domain(
    final_ucs, schema_details, unstructured_docs,
    english_translations, summary_dict
)

inspirer._tracking_update_sql(final_ucs)

# Save JSON catalog
summary_dict = inspirer._save_usecases_catalog_json(final_ucs, english_translations, summary_dict)

# Save updated use cases
pipeline_state.save_use_cases_delta(final_ucs, "_pipeline_use_cases_final")
pipeline_state.save("sql_notebooks", {
    "total_use_cases": len(final_ucs),
    "summary": summary_dict if isinstance(summary_dict, dict) else {},
})

log_print(f"✅ SQL & notebooks complete for {len(final_ucs)} use cases")
dbutils.notebook.exit(json.dumps({"status": "success", "use_cases": len(final_ucs)}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 7: DOCUMENTATION (PDF, PPTX, Excel)
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 07_documentation...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "07_documentation.py"),
        [
            "# MAGIC %md\n# # Step 7: Document Generation\n# Generates PDF catalogs, PowerPoint presentations, Excel files, and Markdown catalogs for all languages.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load state ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")
business_context_data = pipeline_state.load("business_context")
sql_meta = pipeline_state.load("sql_notebooks")

if not config:
    dbutils.notebook.exit("ERROR: Missing config.")

log_print("=" * 80)
log_print("📄 STEP 7: DOCUMENT GENERATION")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer.merged_business_context = business_context_data or {}

# Load final use cases
final_ucs = pipeline_state.load_use_cases_delta("_pipeline_use_cases_final")
if not final_ucs:
    dbutils.notebook.exit("ERROR: No final use cases found.")

english_translations = inspirer.translation_service.get_translations("English")
english_grouped = inspirer._group_use_cases_by_domain_flat(final_ucs)
summary_dict = (sql_meta or {}).get("summary", None)

if summary_dict is None:
    try:
        (summary_dict, _) = inspirer._get_salesy_summary(english_grouped, inspirer.business_name, "English", english_translations)
    except Exception:
        summary_dict = {}

# Generate documents for all languages
remaining_langs = [lang for lang in inspirer.output_languages if lang != "English"]
target_langs = ["English"] + remaining_langs if "English" in inspirer.output_languages else remaining_langs

if target_langs and ("PDF Catalog" in inspirer.generate_choices or "Presentation" in inspirer.generate_choices):
    log_print(f"📄 Generating documents for: {', '.join(target_langs)}")
    inspirer._generate_documents_for_all_languages(
        final_ucs,
        english_grouped_data=english_grouped,
        summary_dict=summary_dict,
        languages=target_langs,
        skip_excel_langs=["English"]
    )
    log_print("✅ All documents generated")
else:
    log_print("ℹ️ No PDF/Presentation selected, skipping document generation")

# Report table statistics
if inspirer.data_loader:
    inspirer._report_table_statistics(final_ucs)

pipeline_state.save("documentation", {"status": "complete", "languages": target_langs})

dbutils.notebook.exit(json.dumps({"status": "success"}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # NOTEBOOK 8: SAMPLES & FINALIZE
    # ═══════════════════════════════════════════════════════════════
    print("📝 Creating 08_samples_finalize...")
    write_notebook(
        os.path.join(OUTPUT_DIR, "08_samples_finalize.py"),
        [
            "# MAGIC %md\n# # Step 8: Sample Results & Finalize\n# Executes SQL for sample results, uploads logs, and generates final reports.",
            "# MAGIC %run ./00_inspire_commons",
            '''# ─── Load state ───
dbutils.widgets.text("inspire_database", "", "Inspire Database (catalog.schema)")
inspire_database = dbutils.widgets.get("inspire_database")

pipeline_state = PipelineState(spark, inspire_database)
config = pipeline_state.load("config")

if not config:
    dbutils.notebook.exit("ERROR: Missing config.")

log_print("=" * 80)
log_print("📊 STEP 8: SAMPLE RESULTS & FINALIZE")
log_print("=" * 80)

inspirer = DatabricksInspire(**config)
inspirer._ensure_inspire_database_exists()
inspirer._create_tracking_table()

# Load final use cases
final_ucs = pipeline_state.load_use_cases_delta("_pipeline_use_cases_final")

# Generate sample results if selected
if inspirer.generate_sample_result and final_ucs:
    log_print("📊 Executing SQL for sample results...")
    try:
        inspirer._run_generate_sample_result_mode()
        log_print("✅ Sample results generated")
    except Exception as e:
        log_print(f"⚠️ Sample generation issue: {str(e)[:100]}", level="WARNING")
else:
    log_print("ℹ️ Sample results not selected, skipping")

# Cleanup
try:
    inspirer.storage_manager.cleanup()
except Exception:
    pass

# Upload log file
try:
    inspirer._upload_log_file()
except Exception:
    pass

# Processing honesty report
try:
    inspirer._report_processing_honesty()
except Exception:
    pass

# AI usage summary
try:
    AIAgent.get_summary_report()
except Exception:
    pass

# Final success
log_print(f"✅ All artifacts for {inspirer.business_name} generated successfully!")
log_print("=" * 80)

pipeline_state.save("finalize", {"status": "complete"})
dbutils.notebook.exit(json.dumps({"status": "success", "message": "Pipeline complete!"}))
'''
        ]
    )
    
    # ═══════════════════════════════════════════════════════════════
    # WORKFLOW DEFINITION JSON
    # ═══════════════════════════════════════════════════════════════
    print("\n📝 Creating workflow_definition.json...")
    
    workflow_def = {
        "name": "Inspire AI Pipeline",
        "description": "Multi-step Databricks Inspire AI data strategy generation pipeline",
        "tasks": [
            {
                "task_key": "01_init_validate",
                "description": "Initialize & validate all widget inputs",
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/01_init_validate",
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 300,
            },
            {
                "task_key": "02_business_context",
                "description": "Extract business context & strategic goals",
                "depends_on": [{"task_key": "01_init_validate"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/02_business_context",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 600,
            },
            {
                "task_key": "03_schema_discovery",
                "description": "Discover UC metadata & filter tables",
                "depends_on": [{"task_key": "02_business_context"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/03_schema_discovery",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 1800,
            },
            {
                "task_key": "04_use_case_gen",
                "description": "Generate use cases (2-pass ensemble)",
                "depends_on": [{"task_key": "03_schema_discovery"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/04_use_case_gen",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 7200,
            },
            {
                "task_key": "05_scoring_quality",
                "description": "Cluster, score & quality-filter use cases",
                "depends_on": [{"task_key": "04_use_case_gen"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/05_scoring_quality",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 3600,
            },
            {
                "task_key": "06_sql_notebooks",
                "description": "Generate SQL & assemble notebooks",
                "depends_on": [{"task_key": "05_scoring_quality"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/06_sql_notebooks",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 7200,
            },
            {
                "task_key": "07_documentation",
                "description": "Generate PDF, PPTX, Excel catalogs",
                "depends_on": [{"task_key": "06_sql_notebooks"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/07_documentation",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 3600,
            },
            {
                "task_key": "08_samples_finalize",
                "description": "Execute samples & finalize pipeline",
                "depends_on": [{"task_key": "07_documentation"}],
                "notebook_task": {
                    "notebook_path": "{{BASE_PATH}}/08_samples_finalize",
                    "base_parameters": {"inspire_database": "{{INSPIRE_DATABASE}}"},
                    "source": "WORKSPACE"
                },
                "timeout_seconds": 7200,
            },
        ],
    }
    
    with open(os.path.join(OUTPUT_DIR, "workflow_definition.json"), 'w') as f:
        json.dump(workflow_def, f, indent=2)
    
    # Summary
    print(f"\n{'='*60}")
    print(f"✅ SPLIT COMPLETE")
    print(f"{'='*60}")
    print(f"Output directory: {OUTPUT_DIR}/")
    for fname in sorted(os.listdir(OUTPUT_DIR)):
        fpath = os.path.join(OUTPUT_DIR, fname)
        size = os.path.getsize(fpath)
        print(f"  📄 {fname:40s} ({size:>10,} bytes)")
    print(f"\nLakeflow workflow: {OUTPUT_DIR}/workflow_definition.json")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
