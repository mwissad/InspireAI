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
    3- Operation
    4- Quality Level
    5- Business Domains
    6- Business Priorities
    7- Strategic Goals
    8- Generation Options
    9- Generation Path
    10- Documents Languages
    11- AI Model
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
    
    # --- 3. Operation (controls main operation mode) ---
    try:
        operation_options = [
            "Discover Usecases",
            "Re-generate SQL"
        ]
        dbutils.widgets.dropdown("03_operation", "Discover Usecases", operation_options, "04. Operation")
    except Exception as e:
        widget_errors.append(f"Operation: {e}")
    
    # --- 4. Quality Level (controls quality filtering) ---
    try:
        quality_level_options = ["Extreme Quality", "High Quality"]
        dbutils.widgets.dropdown("04_quality_level", "Extreme Quality", quality_level_options, "05. Quality Level")
    except Exception as e:
        widget_errors.append(f"Quality Level: {e}")
    
    # --- 5. Business Domains (comma-separated list of domains) ---
    try:
        dbutils.widgets.text("05_business_domains", "", "06. Business Domains")
    except Exception as e:
        widget_errors.append(f"Business Domains: {e}")
    
    # --- 6. Business Priorities (multi-select) ---
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
        dbutils.widgets.multiselect("06_business_priorities", "Increase Revenue", business_priorities_options, "07. Business Priorities")
    except Exception as e:
        widget_errors.append(f"Business Priorities: {e}")
    
    # --- 7. Strategic Goals ---
    try:
        dbutils.widgets.text("07_strategic_goals", "", "08. Strategic Goals")
    except Exception as e:
        widget_errors.append(f"Strategic Goals: {e}")
    
    # --- 8. Generation Options (multiselect with generation choices) ---
    try:
        generation_options = [
            "SQL Code",
            "Sample Results",
            "PDF Catalog",
            "Presentation",
            "dashboards",
            "Unstructured Data Usecases"
        ]
        dbutils.widgets.multiselect(
            "08_generation_options", 
            "SQL Code",
            generation_options, 
            "09. Generation Options"
        )
    except Exception as e:
        widget_errors.append(f"Generation Options: {e}")
    
    # --- 9. Generation Path ---
    try:
        dbutils.widgets.text("09_generation_path", "./inspire_gen/", "10. Generation Path")
    except Exception as e:
        widget_errors.append(f"Generation Path: {e}")
    
    # --- 10. Documents Languages (multiselect) ---
    try:
        lang_choices = [
            "English", "French", "German", "Spanish", "Hindi",
            "Chinese (Mandarin)", "Japanese", "Arabic", "Portuguese", "Russian",
            "Swedish", "Danish", "Norwegian", "Finnish",
            "Italian", "Polish", "Romanian", "Ukrainian", "Dutch", "Korean",
            "Indonesian", "Malay", "Tamil"
        ]
        dbutils.widgets.multiselect("10_documents_languages", "English", lang_choices, "11. Documents Languages")
    except Exception as e:
        widget_errors.append(f"Documents Languages: {e}")
    
    # --- 11. AI Model (model endpoint for ai_query in generated SQL) ---
    try:
        dbutils.widgets.text("11_ai_model", "databricks-gpt-oss-120b", "12. AI Model")
    except Exception as e:
        widget_errors.append(f"AI Model: {e}")
    
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
import pkg_resources
import warnings
from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from pyspark.sql.utils import AnalysisException
from collections import defaultdict
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import gc

# --- Databricks SDK Imports for Notebook Creation ---
from databricks.sdk import WorkspaceClient
from databricks.sdk.service import workspace

# COMMAND ----------

# ─── Read & validate widget values, then save config ───
create_widgets()

def main():

    print_ascii_banner()

    # --- Read all widget values ---
    # --- 1. Get Widget Values ---
    
    # --- Business Name ---
    business_name = dbutils.widgets.get("00_business_name")
    
    # --- UC Metadata ---
    catalogs_and_schemas_str = dbutils.widgets.get("01_uc_metadata")
    
    # --- Inspire Database (catalog.database format) ---
    inspire_database = dbutils.widgets.get("02_inspire_database")
    if inspire_database:
        inspire_database = inspire_database.strip()
    
    # --- Operation Mode ---
    operation_mode = dbutils.widgets.get("03_operation")
    log_print(f"🎯 Operation Mode: {operation_mode}")
    
    # --- Quality Level (controls quality filtering) ---
    quality_level = dbutils.widgets.get("04_quality_level")
    if not quality_level or not quality_level.strip():
        quality_level = "Extreme Quality"
    log_print(f"🎚️ Quality Level: {quality_level}")
    
    # --- Business Domains ---
    business_domains_str = dbutils.widgets.get("05_business_domains")
    
    # --- Business Priorities (multi-select) ---
    business_priorities_str = dbutils.widgets.get("06_business_priorities")
    
    # --- Strategic Goals ---
    strategic_goals_str = dbutils.widgets.get("07_strategic_goals")
    
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
    generate_str = dbutils.widgets.get("08_generation_options")
    # Force "use cases" to be included always
    if generate_str:
        if "use cases" not in generate_str:
             generate_str += ", use cases"
    else:
        generate_str = "use cases"
    
    # Parse generation options for special flags
    generate_options_list = [opt.strip() for opt in generate_str.split(',') if opt.strip()]
    
    # Extract special options from generation options
    use_unstructured_data = "Unstructured Data Usecases" in generate_options_list
    technical_exclusion_strategy = "Aggressive"
    
    # Set use_unstructured_data_str based on Unstructured Data Usecases selection
    use_unstructured_data_str = "yes" if use_unstructured_data else "no"
    
    # --- Generation Path ---
    generation_path = dbutils.widgets.get("09_generation_path")
    
    # --- Documents Languages (multiselect) ---
    output_language_str = dbutils.widgets.get("10_documents_languages") 
    
    # --- AI Model (model endpoint for ai_query in generated SQL) ---
    sql_model_serving = dbutils.widgets.get("11_ai_model")
    if not sql_model_serving or not sql_model_serving.strip():
        sql_model_serving = "databricks-gpt-oss-120b"

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
    
    # Validate Inspire Database (REQUIRED, format: catalog.database)
    if not inspire_database:
        validation_errors.append("❌ 'Inspire Database' (02_inspire_database) is REQUIRED. Format: catalog.database (e.g., my_catalog.my_schema)")
    else:
        inspire_db_parts = inspire_database.split('.')
        if len(inspire_db_parts) != 2 or not inspire_db_parts[0].strip() or not inspire_db_parts[1].strip():
            validation_errors.append(f"❌ 'Inspire Database' (02_inspire_database) must be in 'catalog.database' format (got: '{inspire_database}')")
        else:
            # Verify that the catalog actually exists in Unity Catalog
            inspire_catalog = inspire_db_parts[0].strip()
            try:
                spark.sql(f"USE CATALOG `{inspire_catalog}`")
                log_print(f"✅ Inspire Database: '{inspire_database}' (catalog '{inspire_catalog}' exists)")
            except Exception as cat_err:
                validation_errors.append(
                    f"❌ Catalog '{inspire_catalog}' does not exist in your workspace. "
                    f"Please create it first or choose an existing catalog. "
                    f"(Inspire Database was set to '{inspire_database}')"
                )
    
    # Validate Operation mode
    valid_operations = ["Discover Usecases", "Re-generate SQL"]
    if operation_mode not in valid_operations:
        validation_errors.append(f"❌ 'Operation' (03_operation) must be one of: {', '.join(valid_operations)}")
    else:
        log_print(f"✅ Operation: '{operation_mode}'")
    
    # AUTO-ENABLE SQL Code generation for "Re-generate SQL" mode (regardless of checkbox)
    if operation_mode == "Re-generate SQL" and "SQL Code" not in generate_options_list:
        generate_options_list.append("SQL Code")
        generate_str = ", ".join(generate_options_list)
        log_print(f"ℹ️ Auto-enabled 'SQL Code' for Re-generate SQL mode")
    
    # AUTO-ENABLE SQL Code generation when "Sample Results" is selected (samples require SQL)
    if "Sample Results" in generate_options_list and "SQL Code" not in generate_options_list:
        generate_options_list.append("SQL Code")
        generate_str = ", ".join(generate_options_list)
        log_print(f"ℹ️ Auto-enabled 'SQL Code' for Sample Results (samples require executable SQL)")
    
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
    
    # UC Metadata validation depends on operation mode
    if not json_file_path:
        if (operation_mode == "Discover Usecases" and 
            not catalogs_str and not schemas_str and not tables_str):
            validation_errors.append("❌ 'UC Metadata' (01_uc_metadata) is REQUIRED when discovering use cases")
        elif operation_mode in ["Re-generate SQL"]:
            # These modes work on existing notebooks, UC Metadata not required
            log_print(f"ℹ️ UC Metadata: Not required for '{operation_mode}' mode")
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
            output_language_str = "English"
            languages = ["English"]
            log_print(f"ℹ️ Documents Languages: Not required (no PDF/Presentation selected), defaulting to English")
        else:
            languages = [lang.strip() for lang in output_language_str.split(',') if lang.strip()]
            log_print(f"ℹ️ Documents Languages: {', '.join(languages)} (optional for notebooks-only)")
    
    # Log derived options
    generate_sql_code = "SQL Code" in generate_options_list
    generate_sample_result = "Sample Results" in generate_options_list
    log_print(f"ℹ️ SQL Code Generation: {'Enabled' if generate_sql_code else 'DISABLED (notebooks will have placeholder SQL)'}")
    log_print(f"ℹ️ Sample Results: {'Enabled (SQL will be executed and samples generated)' if generate_sample_result else 'Disabled'}")
    log_print(f"ℹ️ Unstructured Data Usecases: {'Enabled' if use_unstructured_data else 'Disabled'}")
    log_print("ℹ️ Technical table filtering: Aggressive (mandatory)")
    if generate_sql_code:
        log_print(f"✅ AI Model: '{sql_model_serving}' (for ai_query in generated SQL)")
    
    if validation_errors:
        import sys as _sys
        error_count = len(validation_errors)
        error_summary = "\n".join(validation_errors)
        
        log_print("=" * 80, level="ERROR")
        log_print(f"❌ VALIDATION FAILED - {error_count} ERROR(S) FOUND:", level="ERROR")
        log_print("=" * 80, level="ERROR")
        for error in validation_errors:
            log_print(error, level="ERROR")
        log_print("=" * 80, level="ERROR")
        
        print(f"\n{'='*80}\n❌ VALIDATION ERRORS ({error_count}):\n{error_summary}\n{'='*80}\n", file=_sys.stderr, flush=True)
        _sys.stdout.flush()
        _sys.stderr.flush()
        
        exit_msg = f"Validation failed with {error_count} error(s):\n{error_summary}"
        dbutils.notebook.exit(exit_msg)
    
    log_print("=" * 80)
    log_print("✅ ALL VALIDATIONS PASSED - Starting generation...")
    log_print("=" * 80)


    # --- Build config dict from validated widget values ---
    widget_values = {
        "business": business_name,
        "catalogs": catalogs_str,
        "schemas": schemas_str,
        "tables": tables_str,
        "generate": generate_str,
        "generation_path": generation_path,
        "output_language": output_language_str,
        "business_priorities": business_priorities_str,
        "strategic_goals": strategic_goals_str,
        "business_domains": business_domains_str,
        "use_unstructured_data": use_unstructured_data_str,
        "technical_exclusion_strategy": technical_exclusion_strategy,
        "operation_mode": operation_mode,
        "sql_model_serving": sql_model_serving,
        "quality_level": quality_level,
        "json_file_path": json_file_path,
        "inspire_database": inspire_database,
    }

    # --- Save validated config to pipeline state ---
    pipeline_state = PipelineState(spark, inspire_database)
    pipeline_state.ensure_table()
    pipeline_state.save("config", widget_values)
    
    log_print("✅ Configuration validated and saved. Ready for next phase.")
    dbutils.notebook.exit(json.dumps({"status": "success", "inspire_database": inspire_database}))

main()

