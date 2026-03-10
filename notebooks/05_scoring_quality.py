# Databricks notebook source
# MAGIC %md
# # Step 5: Clustering, Scoring & Quality
# Clusters use cases into domains, scores them, deduplicates, and applies quality filtering.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

# ─── Load state ───
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

