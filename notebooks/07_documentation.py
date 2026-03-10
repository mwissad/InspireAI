# Databricks notebook source
# MAGIC %md
# # Step 7: Document Generation
# Generates PDF catalogs, PowerPoint presentations, Excel files, and Markdown catalogs for all languages.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load state ───
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

