import { useState, useEffect, useCallback } from 'react';
import {
  Play,
  Loader2,
  AlertCircle,
  Building2,
  FileText,
  Sliders,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import TableBrowser from '../components/TableBrowser';
import LanguageBrowser from '../components/LanguageBrowser';

const QUALITY_OPTIONS = ['low', 'medium', 'high'];

const OUTPUT_OPTIONS = [
  'use_cases',
  'use_cases_scored',
  'use_cases_sql',
  'use_cases_scored_sql',
];

export default function LaunchPage({ settings, update, onLaunched }) {
  const { token, notebookPath, warehouseId, inspireDatabase } = settings;

  // Form state
  const [businessName, setBusinessName] = useState('');
  const [catalogs, setCatalogs] = useState([]);
  const [selectedCatalog, setSelectedCatalog] = useState('');
  const [schemas, setSchemas] = useState([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [selectedTables, setSelectedTables] = useState([]);
  const [language, setLanguage] = useState('en');
  const [quality, setQuality] = useState('medium');
  const [output, setOutput] = useState('use_cases_scored_sql');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedParams, setAdvancedParams] = useState({
    '04_use_case_count': '100',
    '05_enable_scoring': 'true',
    '06_gen_sql': 'true',
    '07_gen_sql_fix': 'true',
  });

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const resp = await fetch(url, {
        ...opts,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...opts.headers,
        },
      });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return resp.json();
    },
    [token]
  );

  // Load catalogs
  useEffect(() => {
    if (!token) return;
    apiFetch('/api/catalogs')
      .then((d) => setCatalogs(d.catalogs || []))
      .catch(() => {});
  }, [token, apiFetch]);

  // Load schemas when catalog selected
  useEffect(() => {
    if (!selectedCatalog) return;
    apiFetch(`/api/catalogs/${encodeURIComponent(selectedCatalog)}/schemas`)
      .then((d) => setSchemas(d.schemas || []))
      .catch(() => {});
  }, [selectedCatalog, apiFetch]);

  // Build UC metadata
  const buildUcMetadata = () => {
    const parts = [];
    if (selectedTables.length > 0) {
      parts.push(...selectedTables);
    } else if (selectedSchema) {
      parts.push(`${selectedCatalog}.${selectedSchema}`);
    } else if (selectedCatalog) {
      parts.push(selectedCatalog);
    }
    return parts.join(',');
  };

  // Handle table selection from sidebar
  const handleTableSelect = (table) => {
    setSelectedTables((prev) => {
      const fullName = table.full_name;
      if (prev.includes(fullName)) {
        return prev.filter((t) => t !== fullName);
      }
      return [...prev, fullName];
    });
    // Auto-set catalog/schema from table
    if (table.catalog_name && !selectedCatalog) setSelectedCatalog(table.catalog_name);
    if (table.schema_name && !selectedSchema) setSelectedSchema(table.schema_name);
  };

  // Submit
  const handleSubmit = async () => {
    if (!businessName.trim()) {
      setError('Business name is required.');
      return;
    }

    const ucMetadata = buildUcMetadata();
    if (!ucMetadata) {
      setError('Select at least one catalog, schema, or table.');
      return;
    }

    setSubmitting(true);
    setError(null);

    // Build inspire_database from selectedCatalog + schema or use existing
    const inspDb = inspireDatabase || `${selectedCatalog}.${selectedSchema || 'default'}`;
    if (!inspireDatabase) update('inspireDatabase', inspDb);

    const params = {
      '00_business_name': businessName.trim(),
      '01_uc_metadata': ucMetadata,
      '02_inspire_database': inspDb,
      '03_output': output,
      '08_quality': quality,
      '09_language': language,
      ...advancedParams,
    };

    try {
      const data = await apiFetch('/api/run', {
        method: 'POST',
        body: JSON.stringify({
          notebook_path: notebookPath,
          params,
        }),
      });
      onLaunched?.(null, data.run_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Left sidebar: Table Browser + Language */}
      <aside className="w-72 border-r border-border flex flex-col shrink-0 bg-surface">
        <div className="flex-1 overflow-hidden flex flex-col">
          <TableBrowser
            token={token}
            selectedTables={selectedTables}
            onSelectTable={handleTableSelect}
          />
        </div>
        <LanguageBrowser selected={language} onSelect={setLanguage} />
      </aside>

      {/* Main content: Launch form */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Launch Pipeline</h1>
            <p className="text-sm text-text-secondary mt-1">
              Configure parameters and start the Inspire AI pipeline.
        </p>
      </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-error-bg border border-error/20 rounded-lg mb-6">
              <AlertCircle size={16} className="text-error shrink-0" />
              <span className="text-sm text-error">{error}</span>
            </div>
          )}

          {/* Form */}
          <div className="space-y-6">
            {/* Business Name */}
            <FieldSection
              icon={Building2}
              label="Business Name"
              required
              description="Name of the business or project for this analysis"
            >
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Acme Corporation"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
              />
            </FieldSection>

            {/* Catalog & Schema */}
            <FieldSection
              icon={FileText}
              label="Data Scope"
              description="Select the catalog and schema to analyze"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1 font-medium">
                    Catalog
                  </label>
                  <select
                    value={selectedCatalog}
                    onChange={(e) => {
                      setSelectedCatalog(e.target.value);
                      setSelectedSchema('');
                    }}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth"
                  >
                    <option value="">Select catalog</option>
                    {catalogs.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1 font-medium">
                    Schema
                  </label>
                  <select
                    value={selectedSchema}
                    onChange={(e) => setSelectedSchema(e.target.value)}
                    disabled={!selectedCatalog}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary disabled:opacity-50 glow-focus transition-smooth"
                  >
                    <option value="">Select schema</option>
                    {schemas.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* UC Metadata preview */}
              {buildUcMetadata() && (
                <div className="mt-3 p-2.5 bg-bg rounded-md">
                  <span className="text-xs font-medium text-text-secondary">UC Metadata: </span>
                  <span className="text-xs font-mono text-text-primary">
                    {buildUcMetadata()}
                  </span>
                </div>
              )}
            </FieldSection>

            {/* Inspire Database */}
            <FieldSection
              icon={FileText}
              label="Inspire Database"
              description="Where Inspire AI stores generated tables (catalog.schema)"
            >
              <input
                type="text"
                value={inspireDatabase}
                onChange={(e) => update('inspireDatabase', e.target.value)}
                placeholder="catalog.schema"
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth"
              />
            </FieldSection>

            {/* Quality */}
            <FieldSection
              icon={Sliders}
              label="Quality Level"
              description="Higher quality takes longer but produces better results"
            >
              <div className="flex gap-2">
                {QUALITY_OPTIONS.map((q) => {
                  const active = quality === q;
                  return (
                    <button
                      key={q}
                      onClick={() => setQuality(q)}
                      className={`
                        flex-1 py-2 text-sm font-medium rounded-md border transition-smooth capitalize
                        ${active
                          ? 'border-db-red/30 bg-db-red-50 text-db-red glow-active'
                          : 'border-border text-text-secondary hover:border-border-strong glow-hover'
                        }
                      `}
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </FieldSection>

            {/* Output */}
            <FieldSection
              icon={FileText}
              label="Output Format"
              description="What to include in the final results"
            >
              <select
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth"
              >
                {OUTPUT_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </FieldSection>

            {/* Advanced */}
            <div className="border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-text-secondary hover:bg-bg-subtle transition-smooth"
              >
                <span>Advanced Parameters</span>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAdvanced && (
                <div className="border-t border-border px-4 py-4 space-y-3 bg-panel">
                  {Object.entries(advancedParams).map(([key, val]) => (
                    <div key={key} className="flex items-center gap-3">
                      <label className="text-xs text-text-secondary font-mono w-40 shrink-0 truncate">
                        {key}
                      </label>
                      <input
                        type="text"
                        value={val}
                        onChange={(e) =>
                          setAdvancedParams((p) => ({
                            ...p,
                            [key]: e.target.value,
                          }))
                        }
                        className="flex-1 px-2.5 py-1.5 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus transition-smooth font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="mt-8 pt-6 border-t border-border">
            <button
              onClick={handleSubmit}
              disabled={submitting || !businessName.trim()}
              className="w-full py-3 bg-db-red text-white text-sm font-semibold rounded-lg hover:bg-db-red-hover disabled:opacity-50 disabled:cursor-not-allowed transition-smooth flex items-center justify-center gap-2 shadow-sm"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Play size={16} />
                  Run Pipeline
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Field section wrapper
function FieldSection({ icon: Icon, label, required, description, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} className="text-text-secondary" />}
        <label className="text-sm font-semibold text-text-primary">
          {label}
          {required && <span className="text-db-red ml-0.5">*</span>}
        </label>
      </div>
      {description && (
        <p className="text-xs text-text-tertiary mb-2">{description}</p>
      )}
      {children}
    </div>
  );
}
