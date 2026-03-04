# Databricks notebook source
# MAGIC %md
# # Step 1: Initialize & Validate
# Reads widget values, validates all inputs, persists config, and launches the pipeline.

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
    4- Table Election
    5- Use Cases Quality
    6- Business Domains
    7- Business Priorities
    8- Strategic Goals
    9- Generation Options
    10- SQL Generation Per Domain
    11- Generation Path
    12- Documents Languages
    13- AI Model
    14- Inspire Session ID
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
        dbutils.widgets.dropdown("05_use_cases_quality", "High Quality", use_cases_quality_options, "06. Use Cases Quality")
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
            "SQL Code",
            "Sample Results",
            "PDF Catalog",
            "Presentation",
            "dashboards",
            "Unstructured Data Usecases"
        ]
        dbutils.widgets.multiselect(
            "09_generation_options", 
            "SQL Code",
            generation_options, 
            "10. Generation Options"
        )
    except Exception as e:
        widget_errors.append(f"Generation Options: {e}")
    
    # --- 10. Generation Path ---
    try:
        sql_per_domain_options = ["0", "1", "2", "3", "4", "5", "All"]
        dbutils.widgets.dropdown(
            "10_sql_generation_per_domain",
            "0",
            sql_per_domain_options,
            "11. SQL Generation Per Domain"
        )
    except Exception as e:
        widget_errors.append(f"SQL Generation Per Domain: {e}")

    # --- 11. Generation Path ---
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
    
    # --- 13. AI Model (model endpoint for ai_query in generated SQL) ---
    try:
        dbutils.widgets.text("13_ai_model", "databricks-gpt-oss-120b", "14. AI Model")
    except Exception as e:
        widget_errors.append(f"AI Model: {e}")
    
    # --- 14. Inspire Session ID (optional - auto-generated if empty) ---
    try:
        dbutils.widgets.text("14_session_id", "", "15. Inspire Session ID")
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

# ─── Run main ───
create_widgets()

def main():
    """
    Main function to read widget values, validate inputs,
    and run the DatabricksInspire class.
    
    *** IMPORTANT ***
    Run the `create_widgets()` cell first and fill in the UI values
    BEFORE running this main() function.
    """
    
    print_ascii_banner()

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
    use_unstructured_data = "Unstructured Data Usecases" in generate_options_list
    technical_exclusion_strategy = "Aggressive"
    
    # Set use_unstructured_data_str based on Unstructured Data Usecases selection
    use_unstructured_data_str = "yes" if use_unstructured_data else "no"

    # --- SQL Generation Per Domain ---
    try:
        sql_generation_per_domain = dbutils.widgets.get("10_sql_generation_per_domain").strip()
    except Exception:
        sql_generation_per_domain = "0"
    if not sql_generation_per_domain:
        sql_generation_per_domain = "0"
    
    # --- Generation Path ---
    generation_path = dbutils.widgets.get("11_generation_path")
    
    # --- Documents Languages (multiselect) ---
    output_language_str = dbutils.widgets.get("12_documents_languages") 
    
    # --- AI Model (model endpoint for ai_query in generated SQL) ---
    sql_model_serving = dbutils.widgets.get("13_ai_model")
    if not sql_model_serving or not sql_model_serving.strip():
        sql_model_serving = "databricks-gpt-oss-120b"

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
    
    # Validate Operation mode
    valid_operations = ["Discover Usecases", "Re-generate SQL"]
    if operation_mode not in valid_operations:
        validation_errors.append(f"❌ 'Operation' (03_operation) must be one of: {', '.join(valid_operations)}")
    else:
        log_print(f"✅ Operation: '{operation_mode}'")
    
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
    valid_sql_per_domain = {"0", "1", "2", "3", "4", "5", "All"}
    if sql_generation_per_domain not in valid_sql_per_domain:
        validation_errors.append("❌ 'SQL Generation Per Domain' (10_sql_generation_per_domain) must be one of: 0, 1, 2, 3, 4, 5, All")
    else:
        log_print(f"✅ SQL Generation Per Domain: {sql_generation_per_domain}")
    log_print(f"ℹ️ SQL Code Generation: {'Enabled' if generate_sql_code else 'DISABLED (notebooks will have placeholder SQL)'}")
    log_print(f"ℹ️ Sample Results: {'Enabled (SQL will be executed and samples generated)' if generate_sample_result else 'Disabled'}")
    log_print(f"ℹ️ Unstructured Data Usecases: {'Enabled' if use_unstructured_data else 'Disabled'}")
    log_print("ℹ️ Technical table filtering: Aggressive (mandatory)")
    if generate_sql_code:
        log_print(f"✅ AI Model: '{sql_model_serving}' (for ai_query in generated SQL)")
    
    if user_session_id:
        log_print(f"✅ Inspire Session ID: '{user_session_id}' (user-provided)")
    else:
        log_print(f"ℹ️ Inspire Session ID: Not provided (will be auto-generated)")
    
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

    # --- 3. Pack values and Run ---
    
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
        "use_unstructured_data": use_unstructured_data_str,
        "sql_generation_per_domain": sql_generation_per_domain,
        "technical_exclusion_strategy": technical_exclusion_strategy,
        "sql_model_serving": sql_model_serving,
        "json_file_path": json_file_path,
        "session_id": user_session_id
    }

    inspirer = None
    try:
        inspirer = DatabricksInspire(**widget_values)
        inspirer.run()
        inspirer.finalize_atomic_writer(success=True)
    except NameError as ne:
        if inspirer:
            inspirer.finalize_atomic_writer(success=False, error_message=str(ne))
        if ('DataLoader' in str(ne) or 'AIAgent' in str(ne) or 
            'PROMPT_TEMPLATES' in str(ne) or 'DatabricksInspire' in str(ne) or 
            'setup_logging' in str(ne) or 'TranslationService' in str(ne)):
            
            print(f"ERROR: A required class, function, or variable is missing: {ne}", file=sys.stderr)
            print("Please ensure `setup_logging`, `DataLoader`, `AIAgent`, `PROMPT_TEMPLATES`, `TranslationService`, and `DatabricksInspire` are defined in preceding cells.", file=sys.stderr)
        else:
            raise
    except Exception as e:
        if inspirer:
            inspirer.finalize_atomic_writer(success=False, error_message=str(e))
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        logging.getLogger("main").critical("Main execution failed")

main()

