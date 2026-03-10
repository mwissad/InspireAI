# Databricks notebook source
# MAGIC %md
# # Step 8: Sample Results & Finalize
# Executes SQL for sample results, uploads logs, and generates final reports.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load state ───
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

