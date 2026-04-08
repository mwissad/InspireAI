# Databricks notebook source
# MAGIC %md
# # Step 1: Initialize & Validate
# Reads widget values, validates all inputs, and persists configuration for downstream tasks.

# COMMAND ----------

# MAGIC %run ./00_inspire_commons

# COMMAND ----------

def create_widgets():
    """
    Creates widgets if they don't exist. Retains existing widget values.
    
    Widget Order:
    0- Business Name
    1- UC Metadata
    2- Inspire Database
    3- Table Election
    4- Use Cases Quality
    5- Business Domains
    6- Business Priorities
    7- Strategic Goals
    8- Generation Options
    9- Generation Path
    10- Documents Languages
    11- Inspire Session ID
    """
    
    log_print("Creating widgets (retaining existing values)...")
    
    widget_errors = []
    
    # --- 0. Business Name (REQUIRED) ---
    try:
        dbutils.widgets.text("00_business_name", "", "01. Business Name")
    except Exception as e:
        widget_errors.append(f"Business Name: {e}")
    
    # --- 1. UC Metadata (catalogs/schemas/tables OR JSON file path) ---
    try:
        dbutils.widgets.text("01_uc_metadata", "", "02. UC Metadata")
    except Exception as e:
        widget_errors.append(f"UC Metadata: {e}")
    
    # --- 2. Inspire Database (catalog.database format - where all results are stored) ---
    try:
        dbutils.widgets.text("02_inspire_database", "", "03. Inspire Database")
    except Exception as e:
        widget_errors.append(f"Inspire Database: {e}")
    

    # --- 4. Table Election (controls which tables are used for use case generation) ---
    try:
        table_election_options = [
            "Let Inspire Decides",
            "All Tables",
            "Transactional Only"
        ]
        dbutils.widgets.dropdown("04_table_election", "Let Inspire Decides", table_election_options, "05. Table Election")
    except Exception as e:
        widget_errors.append(f"Table Election: {e}")
    
    # --- 5. Use Cases Quality (controls post-generation quality filtering threshold) ---
    try:
        use_cases_quality_options = [
            "Good Quality",
            "High Quality",
            "Very High Quality"
        ]
        dbutils.widgets.dropdown("05_use_cases_quality", "Good Quality", use_cases_quality_options, "06. Use Cases Quality")
    except Exception as e:
        widget_errors.append(f"Use Cases Quality: {e}")
    
    # --- 6. Business Domains (comma-separated list of domains) ---
    try:
        dbutils.widgets.text("06_business_domains", "", "07. Business Domains")
    except Exception as e:
        widget_errors.append(f"Business Domains: {e}")
    
    # --- 7. Business Priorities (multi-select) ---
    try:
        business_priorities_options = [
            "Increase Revenue",
            "Reduce Cost",
            "Optimize Operations",
            "Mitigate Risk",
            "Empower Talent",
            "Enhance Experience",
            "Drive Innovation",
            "Achieve ESG",
            "Protect Revenue",
            "Execute Strategy"
        ]
        dbutils.widgets.multiselect("07_business_priorities", "Increase Revenue", business_priorities_options, "08. Business Priorities")
    except Exception as e:
        widget_errors.append(f"Business Priorities: {e}")
    
    # --- 8. Strategic Goals ---
    try:
        dbutils.widgets.text("08_strategic_goals", "", "09. Strategic Goals")
    except Exception as e:
        widget_errors.append(f"Strategic Goals: {e}")
    
    # --- 9. Generation Options (multiselect with generation choices) ---
    try:
        generation_options = [
            "Genie Code Instructions",
            "PDF Catalog",
            "Presentation",
        ]
        dbutils.widgets.multiselect(
            "09_generation_options", 
            "Genie Code Instructions",
            generation_options, 
            "10. Generation Options"
        )
    except Exception as e:
        widget_errors.append(f"Generation Options: {e}")
    
    # --- 10. Generation Path ---
    try:
        dbutils.widgets.text("11_generation_path", "./inspire_gen/", "12. Generation Path")
    except Exception as e:
        widget_errors.append(f"Generation Path: {e}")
    
    # --- 12. Documents Languages (multiselect) ---
    try:
        lang_choices = [
            "English", "French", "German", "Spanish", "Hindi",
            "Chinese (Mandarin)", "Japanese", "Arabic", "Portuguese", "Russian",
            "Swedish", "Danish", "Norwegian", "Finnish",
            "Italian", "Polish", "Romanian", "Ukrainian", "Dutch", "Korean",
            "Indonesian", "Malay", "Tamil"
        ]
        dbutils.widgets.multiselect("12_documents_languages", "English", lang_choices, "13. Documents Languages")
    except Exception as e:
        widget_errors.append(f"Documents Languages: {e}")
    
    # --- 13. Inspire Session ID (optional - auto-generated if empty) ---
    try:
        dbutils.widgets.text("14_session_id", "", "14. Inspire Session ID")
    except Exception as e:
        widget_errors.append(f"Inspire Session ID: {e}")
    
    if widget_errors:
        log_print(f"⚠️ Some widgets had errors during creation:", level="WARNING")
        for err in widget_errors:
            log_print(f"   - {err}", level="WARNING")
        log_print("   Try running: dbutils.widgets.removeAll() and then run this cell again")
    else:
        log_print("✅ Widgets created successfully.")
    
    log_print("")
    log_print(">>> Fill in the widget values at the TOP of this notebook, then run main().")

# ---
# Run this cell to create widgets.
# Fill in the widget values at the TOP of the notebook.
# Then, proceed to run the 'main()' cell below.
# ---

create_widgets()

_NOTEBOOK_WIDGET_NAMES = [
    "00_business_name",
    "01_uc_metadata",
    "02_inspire_database",
    "04_table_election",
    "05_use_cases_quality",
    "06_business_domains",
    "07_business_priorities",
    "08_strategic_goals",
    "09_generation_options",
    "11_generation_path",
    "12_documents_languages",
    "14_session_id",
]

# COMMAND ----------

# DBTITLE 1,Imports & Commons
# ==============================================================================
# 0. IMPORTS & CONFIGURATION
# ==============================================================================
import os
import pandas as pd
import logging
import re
import subprocess
import sys
import json
import csv
import io
import uuid
import base64
import random
import tempfile
import shutil
import datetime
import html
import warnings
from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from pyspark.sql.utils import AnalysisException
from collections import defaultdict
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor
import threading
import gc

# --- Databricks SDK Imports for Notebook Creation ---
from databricks.sdk import WorkspaceClient
from databricks.sdk.service import workspace

# --- Global Configuration ---
AI_MODEL_NAME = "databricks-gpt-oss-20b"

# Token-to-Character Ratios (for context limit calculations)
# English: 1 token ≈ 4 characters
# Non-English: 1 token ≈ 2 characters
TOKEN_TO_CHAR_RATIO_ENGLISH = 4
TOKEN_TO_CHAR_RATIO_NON_ENGLISH = 2


# COMMAND ----------

# ─── Read & validate widget values, then save config ───
create_widgets()

def main():

    print_ascii_banner()

    # --- Read all widget values ---
    # ── Job Launch Gate ──────────────────────────────────────────────────
    _raw_session_id_from_widget = ""
    try:
        _raw_session_id_from_widget = dbutils.widgets.get("14_session_id").strip()
    except Exception:
        pass

    if not _raw_session_id_from_widget:
        try:
            import uuid as _jl_uuid
            _generated_sid = str((_jl_uuid.uuid4().int >> 64) & 9223372036854775807)
            _job_widgets = {}
            for _wn in _NOTEBOOK_WIDGET_NAMES:
                try:
                    _job_widgets[_wn] = dbutils.widgets.get(_wn)
                except Exception:
                    pass
            _job_widgets["14_session_id"] = _generated_sid

            _biz = _job_widgets.get("00_business_name", "").strip()
            _nb_path = JobLauncher.get_current_notebook_path()
            _nb_name = _nb_path.rsplit("/", 1)[-1] if _nb_path else "unknown"
            _job_tags = {
                "dbx_inspire_ai_business": _biz,
                "dbx_inspire_ai_type": "discovery",
                "dbx_inspire_ai_session": _generated_sid,
                "dbx_inspire_ai_usecases": "0",
                "dbx_inspire_ai_domains": "0",
                "dbx_inspire_ai_subdomains": "0",
                "dbx_inspire_ai_notebook": _nb_name,
            }

            if _nb_path:
                import re
                _sanitized_biz = re.sub(r'[^a-z0-9_]', '_', _biz.lower().strip())
                _sanitized_biz = re.sub(r'_+', '_', _sanitized_biz).strip('_') or "unknown"
                _job_name = f"dbx_inspire_ai_{_sanitized_biz}"
                _launcher = JobLauncher(_nb_path, _job_widgets, _job_tags)
                _launch_result = _launcher.launch(job_name=_job_name, run_name=_job_name)
                if _launch_result["success"]:
                    return
                else:
                    print(f"\n  Job launch failed: {_launch_result['error']}")
                    print("  Continuing with local notebook execution...\n")
            else:
                print("\n  Could not determine current notebook path for job launch.")
                print("  Continuing with local notebook execution...\n")
        except Exception as _jl_gate_err:
            print(f"\n  Job launch gate error: {_jl_gate_err}")
            print("  Continuing with local notebook execution...\n")

    _user_provided_session_id = bool(_raw_session_id_from_widget)
    # ── End Job Launch Gate ──────────────────────────────────────────────

    # --- 1. Get Widget Values ---
    
    # --- Business Name ---
    business_name = dbutils.widgets.get("00_business_name")
    
    # --- UC Metadata ---
    catalogs_and_schemas_str = dbutils.widgets.get("01_uc_metadata")
    
    # --- Inspire Database (catalog.database format) ---
    inspire_database = dbutils.widgets.get("02_inspire_database")
    if inspire_database:
        inspire_database = inspire_database.strip()
    

    # --- Table Election Mode ---
    table_election_mode = dbutils.widgets.get("04_table_election")
    log_print(f"🗳️ Table Election: {table_election_mode}")
    
    # --- Use Cases Quality Filter ---
    use_cases_quality = dbutils.widgets.get("05_use_cases_quality")
    log_print(f"🎚️ Use Cases Quality: {use_cases_quality}")
    
    # --- Business Domains ---
    business_domains_str = dbutils.widgets.get("06_business_domains")
    
    # --- Business Priorities (multi-select) ---
    business_priorities_str = dbutils.widgets.get("07_business_priorities")
    
    # --- Strategic Goals ---
    strategic_goals_str = dbutils.widgets.get("08_strategic_goals")
    
    # Check if this is a JSON file path (docs-only mode)
    json_file_path = None
    catalogs_list = []
    schemas_list = []
    tables_list = []
    
    if catalogs_and_schemas_str:
        catalogs_and_schemas_str = catalogs_and_schemas_str.strip()
        # Check if it's a JSON file path (starts with /)
        if catalogs_and_schemas_str.startswith('/'):
            json_file_path = catalogs_and_schemas_str
            log_print(f"Detected JSON file path: {json_file_path}")
            log_print("Running in DOCS-ONLY mode: Will skip use case generation and notebook generation.")
        else:
            # Parse catalogs, schemas, and tables from the merged widget
            for item in catalogs_and_schemas_str.split(','):
                item = item.strip()
                if not item:
                    continue
                dot_count = item.count('.')
                if dot_count == 2:
                    # Fully qualified table (catalog.schema.table)
                    tables_list.append(item)
                elif dot_count == 1:
                    # Fully qualified schema (catalog.schema)
                    schemas_list.append(item)
                elif dot_count == 0:
                    # Catalog only
                    catalogs_list.append(item)
                else:
                    # Invalid format - log warning
                    log_print(f"Invalid metadata format '{item}' - expected 0, 1, or 2 dots", level="WARNING")
    
    catalogs_str = ','.join(catalogs_list)
    schemas_str = ','.join(schemas_list)
    tables_str = ','.join(tables_list)
    
    # --- Generation Options ---
    generate_str = dbutils.widgets.get("09_generation_options")
    # Force "use cases" to be included always
    if generate_str:
        if "use cases" not in generate_str:
             generate_str += ", use cases"
    else:
        generate_str = "use cases"
    
    # Parse generation options for special flags
    generate_options_list = [opt.strip() for opt in generate_str.split(',') if opt.strip()]
    
    # Extract special options from generation options
    technical_exclusion_strategy = "Aggressive"


    # --- Generation Path ---
    generation_path = dbutils.widgets.get("11_generation_path")
    
    # --- Documents Languages (multiselect) ---
    output_language_str = dbutils.widgets.get("12_documents_languages") 
    
    # --- Inspire Session ID (optional - auto-generated if empty) ---
    user_session_id = dbutils.widgets.get("14_session_id").strip()

    # ============================================================================
    # --- 2. VALIDATE ALL WIDGET VALUES (FAIL FAST BEFORE ANY PROCESSING) ---
    log_print("=" * 80)
    log_print("🔍 VALIDATING WIDGET INPUTS...")
    log_print("=" * 80)
    
    validation_errors = []
    
    # Validate Business Name first
    if not business_name:
        validation_errors.append("❌ 'Business Name' (00_business_name) is REQUIRED")
    else:
        log_print(f"✅ Business Name: '{business_name}'")
    
    # Validate Inspire Database (OPTIONAL, format: catalog.database when provided)
    if not inspire_database:
        log_print("ℹ️ Inspire Database: Not provided (optional). SQL will use placeholder database 'main._inspire'")
    else:
        inspire_db_parts = inspire_database.split('.')
        if len(inspire_db_parts) != 2 or not inspire_db_parts[0].strip() or not inspire_db_parts[1].strip():
            validation_errors.append(f"❌ 'Inspire Database' (02_inspire_database) must be in 'catalog.database' format (got: '{inspire_database}')")
        else:
            log_print(f"✅ Inspire Database: '{inspire_database}'")
    
    # Validate Table Election mode
    valid_table_elections = ["Let Inspire Decides", "All Tables", "Transactional Only"]
    if table_election_mode not in valid_table_elections:
        validation_errors.append(f"❌ 'Table Election' (04_table_election) must be one of: {', '.join(valid_table_elections)}")
    else:
        log_print(f"✅ Table Election: '{table_election_mode}'")
    
    # Validate Use Cases Quality
    valid_quality_filters = ["Good Quality", "High Quality", "Very High Quality"]
    if use_cases_quality not in valid_quality_filters:
        validation_errors.append(f"❌ 'Use Cases Quality' (05_use_cases_quality) must be one of: {', '.join(valid_quality_filters)}")
    else:
        log_print(f"✅ Use Cases Quality: '{use_cases_quality}'")
    

    # Log Business Priorities (optional)
    if business_priorities_str:
        log_print(f"✅ Business Priorities: '{business_priorities_str}'")
    else:
        log_print(f"ℹ️ Business Priorities: Not provided")
    
    # Log Business Domains (optional)
    if business_domains_str:
        log_print(f"✅ Business Domains: '{business_domains_str}'")
    else:
        log_print(f"ℹ️ Business Domains: Not provided (domains will be inferred from data)")
    
    # Log Strategic Goals (optional but HIGHEST PRIORITY when provided)
    if strategic_goals_str:
        log_print(f"✅ Strategic Goals: '{strategic_goals_str[:100]}...' (HIGHEST PRIORITY)")
    else:
        log_print(f"ℹ️ Strategic Goals: Not provided")
    
    # UC Metadata validation
    if not json_file_path:
        if not catalogs_str and not schemas_str and not tables_str:
            validation_errors.append("❌ 'UC Metadata' (01_uc_metadata) is REQUIRED when discovering use cases")
        else:
            log_print(f"✅ UC Metadata provided: catalogs={len(catalogs_str.split(',')) if catalogs_str else 0}, schemas={len(schemas_str.split(',')) if schemas_str else 0}, tables={len(tables_str.split(',')) if tables_str else 0}")
    else:
        log_print(f"✅ Docs-only mode: Using JSON file '{json_file_path}'")
    
    if not generate_str:
        validation_errors.append("❌ 'Generation Options' (08_generation_options) is REQUIRED - select at least one option")
    else:
        log_print(f"✅ Generation Options: {generate_str}")
    
    if not generation_path:
        validation_errors.append("❌ 'Generation Path' (09_generation_path) is REQUIRED")
    else:
        log_print(f"✅ Generation Path: '{generation_path}'")
    
    
    # Language is only REQUIRED for PDF/Presentation artifacts, optional for notebooks-only
    requires_language = ("PDF Catalog" in generate_str or 
                        "Presentation" in generate_str or 
                        "Use Cases Catalog PDF" in generate_str)
    
    if requires_language:
        if not output_language_str:
            validation_errors.append("❌ 'Documents Languages' (10_documents_languages) is REQUIRED when generating PDF or Presentation")
        else:
            languages = [lang.strip() for lang in output_language_str.split(',') if lang.strip()]
            log_print(f"✅ Documents Languages: {', '.join(languages)}")
    else:
        # Default to English for notebooks-only mode (no PDF/Presentation)
        if not output_language_str:

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

