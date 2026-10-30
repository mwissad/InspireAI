const { GENIE_CODE_DEFAULT_COUNT, normalizeUseCasesQualityParams } = require('./inspireJobParams');

function buildUcMetadataFromSessionRow(session) {
  const jf = String(session.json_file_path || '').trim();
  if (jf.startsWith('/')) return jf;
  const parts = [];
  const pushSplit = (raw) => {
    for (const x of String(raw || '').split(',')) {
      const t = x.trim();
      if (t) parts.push(t);
    }
  };
  pushSplit(session.tables_str);
  pushSplit(session.schemas_str);
  pushSplit(session.catalogs);
  return parts.join(',');
}

function mapSessionQualityToWidget(v) {
  const params = { '05_use_cases_quality': v };
  normalizeUseCasesQualityParams(params);
  return params['05_use_cases_quality'];
}

/** Rebuild notebook base_parameters for Operation = Generate Use Cases (Route 1). */
function notebookParamsFromSessionForGenerateRun(session, targetSessionIdStr) {
  const ucMeta = buildUcMetadataFromSessionRow(session);
  const genPath = String(session.generation_path || './../demos/').trim() || './../demos/';
  const genChoices = String(session.generate_choices || '').trim();
  const genOptions = genChoices
    ? genChoices
        .split(',')
        .map((x) => x.trim())
        .filter((g) => g === 'PDF Catalog' || g === 'Presentation')
        .join(',')
    : 'PDF Catalog';
  const outLang = String(session.output_language || 'English').trim() || 'English';
  const priorities = String(session.business_priorities || 'Increase Revenue').trim() || 'Increase Revenue';
  const instruct = String(session.generation_instructions_section || '').trim();
  const discoveryType = String(session.discovery_type || '').trim() || 'Standard';

  return {
    '15_operation': 'Generate Use Cases',
    '00_business_name': String(session.business_name || '').trim(),
    '01_uc_metadata': ucMeta,
    '02_inspire_database': String(session.inspire_database_name || '').trim(),
    '03_discovery_type': discoveryType,
    '04_table_election': String(session.table_election_mode || 'Let Inspire Decides').trim() || 'Let Inspire Decides',
    '05_use_cases_quality': mapSessionQualityToWidget(session.use_cases_quality),
    '06_business_domains': String(session.business_domains || '').trim(),
    '07_business_priorities': priorities,
    '08_generation_instructions': instruct,
    '09_generation_options': genOptions || 'PDF Catalog',
    '10_strategic_context': String(session.strategic_context || '').trim(),
    '11_generation_path': genPath,
    '12_documents_languages': outLang,
    '13_generate_genie_code_for': GENIE_CODE_DEFAULT_COUNT,
    '14_session_id': String(targetSessionIdStr).trim(),
  };
}

module.exports = {
  buildUcMetadataFromSessionRow,
  mapSessionQualityToWidget,
  notebookParamsFromSessionForGenerateRun,
};
