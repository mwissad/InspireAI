# Databricks notebook source
# MAGIC %md
# # Step 2: Business Context Extraction
# Extracts business context, strategic goals, and priorities using LLM analysis.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load config from previous phase ───
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

