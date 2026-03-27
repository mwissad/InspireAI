# Databricks notebook source
# MAGIC %md
# # Step 4: Use Case Generation
# 2-pass serial ensemble: generates initial use cases then finds additional ones from transactional tables.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load state from previous phases ───
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
    
    feedback_lines = ["**PASS 2: Find NEW use cases not in PASS 1**\n"]
    feedback_lines.append("| No | Name | Tables |\n|---|---|---|")
    for idx, name, tables in inspirer.storage_manager.iter_pass1_use_cases_for_feedback(limit=200):
        feedback_lines.append(f"| {idx} | {name} | {tables} |")
    feedback = "\n".join(feedback_lines)
    
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

