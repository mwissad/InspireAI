# Databricks notebook source
# MAGIC %md
# # Step 6: SQL Generation & Notebook Assembly
# Generates SQL queries per domain and assembles use case notebooks.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load state ───
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

