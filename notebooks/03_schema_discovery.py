# Databricks notebook source
# MAGIC %md
# # Step 3: Schema Discovery & Table Filtering
# Discovers UC metadata tables, filters business vs technical, prepares batches.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load config and business context ───
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

