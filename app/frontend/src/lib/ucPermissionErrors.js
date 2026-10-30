/**
 * Detect Unity Catalog / workspace permission failures and build admin-ready guidance.
 */

const PERMISSION_SIGNAL =
  /permission[_\s-]?denied|insufficient[_\s-]?privilege|insufficient[_\s-]?permission|does not have (?:\w+ )?privilege|not authorized|unauthorized|access denied|forbidden|cannot access catalog|cannot access schema|lack(?:s|ing)? (?:the )?(?:required )?privilege|privilege(?:s)? required|\b403\b/i;

const WAREHOUSE_SIGNAL = /warehouse|sql warehouse|can_use/i;
const JOB_SIGNAL = /job creation|jobs\/create|run-now|notebook.*publish|workspace.*permission/i;
const CATALOG_SIGNAL = /catalog|unity catalog|use_catalog|browse/i;
const SCHEMA_SIGNAL = /schema|use_schema|create schema/i;

export function apiErrorDetail(parsed) {
  const detail = parsed && typeof parsed === 'object' ? parsed.error || parsed.message || parsed.error_message : '';
  if (!detail) return '';
  return typeof detail === 'string' ? detail : JSON.stringify(detail);
}

/** @param {string} errText */
export function parseApiErrorMessage(errText) {
  const raw = String(errText || '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') return parsed;
    return apiErrorDetail(parsed) || raw;
  } catch {
    return raw;
  }
}

/**
 * @param {string} message
 * @param {{ context?: string, inspireDatabase?: string, catalogs?: string[], warehouseId?: string }} [opts]
 */
export function interpretUcPermissionError(message, opts = {}) {
  const technicalDetail = parseApiErrorMessage(message);
  const text = technicalDetail.toLowerCase();
  const isPermissionIssue = PERMISSION_SIGNAL.test(technicalDetail) || (
    opts.context === 'catalog_browse' && /catalog|schema|table|unity|metastore|privilege|denied|403/i.test(technicalDetail)
  );

  if (!isPermissionIssue) {
    return {
      isPermissionIssue: false,
      title: 'Something went wrong',
      userMessage: technicalDetail || 'An unexpected error occurred.',
      adminBullets: [],
      adminEmailText: '',
      technicalDetail,
    };
  }

  const inspireDb = String(opts.inspireDatabase || '').trim();
  const [inspireCatalog, inspireSchema] = inspireDb.includes('.')
    ? inspireDb.split('.', 2)
    : ['<catalog>', '_inspire'];

  const metadataCatalogs = [...new Set(
    (opts.catalogs || [])
      .map((c) => String(c || '').trim())
      .filter(Boolean),
  )];
  const browseCatalogs = metadataCatalogs.length > 0 ? metadataCatalogs : ['<metadata_catalog>'];

  const principal = '`<your_user_or_group>`';
  const warehouseNote = opts.warehouseId
    ? `SQL warehouse \`${opts.warehouseId}\` — grant **Can use** in SQL Warehouses → Permissions.`
    : 'SQL warehouse selected in Settings — grant **Can use** on that warehouse.';

  const adminBullets = [];

  if (opts.context === 'catalog_browse' || CATALOG_SIGNAL.test(text) || SCHEMA_SIGNAL.test(text)) {
    adminBullets.push(
      'Unity Catalog — browse metadata for catalogs/schemas/tables you selected in Get Started:',
      ...browseCatalogs.flatMap((cat) => [
        `  GRANT USE CATALOG ON CATALOG \`${cat}\` TO ${principal};`,
        `  GRANT BROWSE ON CATALOG \`${cat}\` TO ${principal};`,
      ]),
      'If schemas/tables are listed via SQL warehouse, also ensure SELECT (or appropriate read) on those schemas.',
    );
  }

  adminBullets.push(
    `Inspire tracking schema (\`${inspireCatalog}.${inspireSchema || '_inspire'}\`) — session and results tables, and the run log volume:`,
    `  GRANT USE CATALOG ON CATALOG \`${inspireCatalog}\` TO ${principal};`,
    `  GRANT CREATE SCHEMA ON CATALOG \`${inspireCatalog}\` TO ${principal};  -- only if \`${inspireSchema || '_inspire'}\` does not exist yet`,
    `  GRANT USE SCHEMA ON SCHEMA \`${inspireCatalog}\`.\`${inspireSchema || '_inspire'}\` TO ${principal};`,
    `  GRANT CREATE TABLE, MODIFY, SELECT, CREATE VOLUME, READ VOLUME, WRITE VOLUME ON SCHEMA \`${inspireCatalog}\`.\`${inspireSchema || '_inspire'}\` TO ${principal};`,
  );

  if (WAREHOUSE_SIGNAL.test(text) || opts.context === 'launch') {
    adminBullets.push(warehouseNote);
  }

  if (JOB_SIGNAL.test(text) || opts.context === 'launch') {
    adminBullets.push(
      'Databricks Jobs — create and run one-off jobs (Get Started submits a notebook job):',
      '  Grant **Can Manage** (or workspace-equivalent) on Jobs, or add the user to a group with job create/run rights.',
      '  Workspace read on `/Shared/inspire-ai/` (or run `installer_workspace.py` once to publish notebooks and grant the App service principal).',
    );
  }

  const userMessage =
    opts.context === 'catalog_browse'
      ? 'Inspire could not list Unity Catalog metadata with your current credentials. An admin needs to grant UC browse and Inspire schema permissions before you can select data and run Get Started.'
      : 'Get Started failed because your account is missing Unity Catalog or workspace permissions. Share the checklist below with your Databricks admin.';

  const adminEmailText = [
    'Hi — I need Unity Catalog permissions to run Inspire AI (Get Started).',
    '',
    'Workspace error:',
    technicalDetail,
    '',
    'Please grant:',
    ...adminBullets.map((b) => (b.startsWith('  ') ? b : `• ${b}`)),
    '',
    'After grants are applied, I will hard-refresh Inspire and try Get Started again.',
  ].join('\n');

  return {
    isPermissionIssue: true,
    title: 'Unity Catalog permissions required',
    userMessage,
    adminBullets,
    adminEmailText,
    technicalDetail,
  };
}
