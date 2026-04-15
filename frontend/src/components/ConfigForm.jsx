import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Building2, Database, FolderOpen, Target, Layers,
  Zap, Play, AlertCircle, ChevronDown, ChevronUp, ChevronRight, ChevronLeft,
  Sparkles, FileText, Presentation, Code2,
  FileSearch, Info, Search, Pencil, Check, RotateCcw, Loader2, RefreshCw
} from 'lucide-react';
import Stepper from './Stepper';

/* ─── Constants ─── */

const OPERATION_OPTIONS = [
  { value: 'Discover Usecases', label: 'Discover Use Cases', desc: 'Analyze metadata and discover AI/analytics use cases', icon: Search },
  { value: 'Re-generate SQL', label: 'Re-generate SQL', desc: 'Re-generate SQL queries for existing use cases', icon: RotateCcw },
];

const QUALITY_OPTIONS = [
  { value: 'Very High Quality', label: 'Very High', desc: 'Maximum quality — slower, most thorough', tag: 'Recommended' },
  { value: 'High Quality', label: 'High', desc: 'Fast with high quality results' },
  { value: 'Good Quality', label: 'Good', desc: 'Fastest — basic quality analysis' },
];

const BUSINESS_PRIORITIES = [
  { value: 'Increase Revenue', emoji: '📈' },
  { value: 'Reduce Cost', emoji: '💰' },
  { value: 'Optimize Operations', emoji: '⚙️' },
  { value: 'Mitigate Risk', emoji: '🛡️' },
  { value: 'Empower Talent', emoji: '👥' },
  { value: 'Enhance Experience', emoji: '✨' },
  { value: 'Drive Innovation', emoji: '🚀' },
  { value: 'Achieve ESG', emoji: '🌱' },
  { value: 'Protect Revenue', emoji: '🔒' },
  { value: 'Execute Strategy', emoji: '🎯' },
];

const GENERATION_OPTIONS = [
  { value: 'SQL Code', label: 'SQL Code', icon: Code2, desc: 'Generate SQL queries for each use case' },
  { value: 'Sample Results', label: 'Sample Results', icon: FileSearch, desc: 'Run sample queries with real data' },
  { value: 'PDF Catalog', label: 'PDF Catalog', icon: FileText, desc: 'Professional PDF documentation' },
  { value: 'Presentation', label: 'Presentation', icon: Presentation, desc: 'Executive-ready PowerPoint slides' },
];

const LANGUAGES = [
  { group: 'Popular', items: ['English', 'French', 'German', 'Spanish', 'Portuguese', 'Arabic', 'Chinese (Mandarin)', 'Japanese'] },
  { group: 'European', items: ['Italian', 'Dutch', 'Polish', 'Romanian', 'Ukrainian', 'Swedish', 'Danish', 'Norwegian', 'Finnish'] },
  { group: 'Asian & Other', items: ['Hindi', 'Korean', 'Indonesian', 'Malay', 'Tamil', 'Russian'] },
];
const ALL_LANGUAGES = LANGUAGES.flatMap(g => g.items);

const TABLE_ELECTION_OPTIONS = [
  { value: 'Let Inspire Decides', label: 'Let Inspire Decide', desc: 'AI selects the most relevant tables' },
  { value: 'All Tables', label: 'All Tables', desc: 'Analyze every table in scope' },
  { value: 'Transactional Only', label: 'Transactional Only', desc: 'Focus on transactional tables' },
];

const SQL_PER_DOMAIN_OPTIONS = ['0', '1', '2', '3', '4', '5', 'All'];

/* ─── Main Component ─── */

export default function ConfigForm({ onSubmit, isSubmitting, submitError, disabled, apiFetch }) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState('right');

  const [form, setForm] = useState({
    business_name: '',
    uc_metadata: '',
    inspire_database: '',
    operation: 'Discover Usecases',
    table_election: 'Let Inspire Decides',
    use_cases_quality: 'High Quality',
    business_domains: '',
    business_priorities: 'Increase Revenue',
    strategic_goals: '',
    generation_options: ['SQL Code'],
    sql_generation_per_domain: '0',
    generation_path: './inspire_gen/',
    documents_languages: ['English'],
    session_id: '',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // Catalog & schema fetching
  const [catalogs, setCatalogs] = useState([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [schemas, setSchemas] = useState({}); // { catalogName: [schema, ...] }

  // Fetch catalogs on mount
  useEffect(() => {
    if (!apiFetch) return;
    setCatalogsLoading(true);
    apiFetch('/api/catalogs')
      .then(r => r.json())
      .then(data => {
        if (data.catalogs) setCatalogs(data.catalogs);
      })
      .catch(() => {})
      .finally(() => setCatalogsLoading(false));
  }, [apiFetch]);

  // Fetch schemas when uc_metadata mentions a catalog
  const fetchSchemasForCatalog = useCallback(async (catalogName) => {
    if (!apiFetch || schemas[catalogName]) return;
    try {
      const res = await apiFetch(`/api/catalogs/${encodeURIComponent(catalogName)}/schemas`);
      const data = await res.json();
      if (data.schemas) {
        setSchemas(prev => ({ ...prev, [catalogName]: data.schemas }));
      }
    } catch {}
  }, [apiFetch, schemas]);

  // Auto-derive inspire_database and business_domains when uc_metadata changes
  useEffect(() => {
    const meta = form.uc_metadata.trim();
    if (!meta) return;

    // Parse first catalog from uc_metadata (e.g. "main.finance" → catalog = "main")
    const firstEntry = meta.split(',')[0].trim();
    const parts = firstEntry.split('.');
    const catalogName = parts[0];

    if (catalogName) {
      // Auto-suggest inspire_database if empty
      if (!form.inspire_database) {
        setForm(f => ({ ...f, inspire_database: `${catalogName}._inspire` }));
      }

      // Fetch schemas for this catalog to derive business_domains
      fetchSchemasForCatalog(catalogName);
    }

    // Auto-derive business_domains from schema names in uc_metadata
    if (!form.business_domains) {
      const entries = meta.split(',').map(e => e.trim()).filter(Boolean);
      const domainSet = new Set();
      for (const entry of entries) {
        const p = entry.split('.');
        if (p.length >= 2) {
          // schema name → capitalize as domain
          const schema = p[1].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          domainSet.add(schema);
        }
      }
      if (domainSet.size > 0) {
        setForm(f => ({ ...f, business_domains: [...domainSet].join(', ') }));
      }
    }
  }, [form.uc_metadata]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleMulti = (key, value) => {
    setForm((f) => {
      const arr = f[key];
      return {
        ...f,
        [key]: arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value],
      };
    });
  };

  const isValidInspireDb = form.inspire_database.includes('.') && form.inspire_database.split('.').every(p => p.trim().length > 0);
  const canProceedStep0 = form.business_name.trim() && form.uc_metadata.trim() && isValidInspireDb;
  const canProceedStep1 = form.generation_options.length > 0 && form.documents_languages.length > 0;

  const goNext = () => {
    setDirection('right');
    setStep((s) => Math.min(s + 1, 2));
  };
  const goBack = () => {
    setDirection('left');
    setStep((s) => Math.max(s - 1, 0));
  };
  const goToStep = (s) => {
    setDirection(s > step ? 'right' : 'left');
    setStep(s);
  };

  const handleSubmit = () => {
    const finalSessionId = form.session_id ||
      String(Date.now()) + String(Math.floor(Math.random() * 1e6));
    const params = {
      '00_business_name': form.business_name,
      '01_uc_metadata': form.uc_metadata,
      '02_inspire_database': form.inspire_database,
      '04_table_election': form.table_election,
      '05_use_cases_quality': form.use_cases_quality,
      '06_business_domains': form.business_domains,
      '07_business_priorities': form.business_priorities,
      '08_generation_instructions': form.strategic_goals,
      '09_generation_options': form.generation_options.join(','),
      '11_generation_path': form.generation_path,
      '12_documents_languages': form.documents_languages.join(','),
      '14_session_id': finalSessionId,
    };
    onSubmit(params);
  };

  const animClass = direction === 'right' ? 'animate-slide-in-right' : 'animate-slide-in-left';

  return (
    <div>
      <Stepper currentStep={step} />

      {/* Step content */}
      <div key={step} className={animClass}>
        {step === 0 && (
          <StepEssentials
            form={form}
            update={update}
            catalogs={catalogs}
            catalogsLoading={catalogsLoading}
            isValidInspireDb={isValidInspireDb}
          />
        )}
        {step === 1 && (
          <StepCustomize
            form={form}
            update={update}
            toggleMulti={toggleMulti}
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
          />
        )}
        {step === 2 && (
          <StepReview
            form={form}
            onEdit={goToStep}
          />
        )}
      </div>

      {/* Submit Error */}
      {submitError && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to submit job</p>
            <p className="text-red-400/80 mt-1 text-xs">{submitError}</p>
          </div>
        </div>
      )}

      {/* Navigation bar */}
      <div className="mt-8 flex items-center justify-between gap-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        ) : (
          <div />
        )}

        {step < 2 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={step === 0 ? !canProceedStep0 : !canProceedStep1}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-db-red hover:bg-db-red-light disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-db-red/20"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={disabled || isSubmitting}
            className="flex items-center gap-2.5 px-8 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-db-red/25 hover:shadow-db-red/40 active:scale-[0.97]"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Launch Inspire AI
              </>
            )}
          </button>
        )}
      </div>

      {/* Step hint */}
      {step === 0 && !canProceedStep0 && (
        <p className="text-center text-xs text-slate-600 mt-3">
          Fill in Business Name, UC Metadata, and Inspire Database to continue
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STEP 0 — Essentials
   ═══════════════════════════════════════════════════ */

function StepEssentials({ form, update, catalogs, catalogsLoading, isValidInspireDb }) {
  // Quick-pick suggestions for inspire_database
  const catalogSuggestions = catalogs
    .filter(c => !['system', 'hive_metastore', '__databricks_internal'].includes(c.name))
    .map(c => `${c.name}._inspire`);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Let's get started"
        subtitle="Tell us about your business and data."
      />

      {/* Business Name */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">
          Business Name <span className="text-db-red">*</span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Your organization or project name — used for titles and context in generated artifacts.
        </p>
        <div className="relative">
          <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={form.business_name}
            onChange={(e) => update('business_name', e.target.value)}
            placeholder="e.g. Acme Corporation"
            autoFocus
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all"
          />
        </div>
      </div>

      {/* UC Metadata */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">
          Unity Catalog Metadata <span className="text-db-red">*</span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Comma-separated list of Catalogs, Schemas, or individual Tables to analyze.
          You can mix levels (e.g. <code className="text-slate-400 bg-white/5 px-1 rounded">main.finance, catalog.schema.orders</code>).
        </p>
        <div className="relative">
          <Database className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
          <textarea
            value={form.uc_metadata}
            onChange={(e) => update('uc_metadata', e.target.value)}
            placeholder="main.finance, main.sales, catalog.schema.orders_table"
            rows={3}
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all resize-none"
          />
        </div>
      </div>

      {/* Inspire Database — REQUIRED */}
      <div className={`rounded-xl border ${isValidInspireDb ? 'border-db-teal/30 bg-db-teal/5' : 'border-white/10 bg-db-navy/40'} p-5 transition-colors`}>
        <label className="block text-sm font-medium text-white mb-1">
          Inspire Database <span className="text-db-red">*</span>
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Where Inspire stores generated tables. Format: <code className="text-slate-400 bg-white/5 px-1 rounded">catalog.schema</code> (e.g. <code className="text-slate-400 bg-white/5 px-1 rounded">my_catalog._inspire</code>).
        </p>
        <div className="relative">
          <Database className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={form.inspire_database}
            onChange={(e) => update('inspire_database', e.target.value)}
            placeholder="catalog._inspire"
            className={`w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 transition-all ${
              isValidInspireDb
                ? 'border-db-teal/30 focus:ring-db-teal/40 focus:border-db-teal/40'
                : 'border-white/10 focus:ring-db-red/40 focus:border-db-red/40'
            }`}
          />
          {isValidInspireDb && (
            <Check className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-db-teal" />
          )}
        </div>

        {/* Quick-pick from catalogs */}
        {catalogSuggestions.length > 0 && (
          <div className="mt-3">
            <p className="text-[11px] text-slate-500 mb-1.5 flex items-center gap-1">
              {catalogsLoading ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Loading catalogs...</>
              ) : (
                <><Sparkles className="w-3 h-3 text-db-gold" /> Quick pick from your workspace:</>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {catalogSuggestions.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => update('inspire_database', sug)}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono border transition-all duration-150 ${
                    form.inspire_database === sug
                      ? 'bg-db-teal/15 text-db-teal border-db-teal/30'
                      : 'bg-db-darkest/50 text-slate-400 border-white/5 hover:border-white/15 hover:text-slate-300'
                  }`}
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>
        )}

        {form.inspire_database && !isValidInspireDb && (
          <p className="text-[11px] text-db-orange mt-2">
            ⚠ Must be in <code className="bg-white/5 px-1 rounded">catalog.schema</code> format
          </p>
        )}
      </div>

      {/* Operation — visual toggle */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">Operation</label>
        <p className="text-xs text-slate-500 mb-3">What should Inspire AI do?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {OPERATION_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const sel = form.operation === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update('operation', opt.value)}
                className={`relative p-4 rounded-lg border text-left transition-all duration-200 ${
                  sel
                    ? 'bg-db-red/10 border-db-red/50 ring-1 ring-db-red/20'
                    : 'bg-db-darkest/40 border-white/10 hover:border-white/20'
                }`}
              >
                {sel && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-db-red flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                <Icon className={`w-5 h-5 mb-2 ${sel ? 'text-db-red-light' : 'text-slate-500'}`} />
                <p className={`text-sm font-medium ${sel ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table Election */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">Table Election</label>
        <p className="text-xs text-slate-500 mb-3">How should Inspire select tables for analysis?</p>
        <div className="flex gap-3">
          {TABLE_ELECTION_OPTIONS.map((opt) => {
            const sel = form.table_election === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update('table_election', opt.value)}
                className={`flex-1 relative p-3.5 rounded-lg border text-center transition-all duration-200 ${
                  sel
                    ? 'bg-db-red/10 border-db-red/50 ring-1 ring-db-red/20'
                    : 'bg-db-darkest/40 border-white/10 hover:border-white/20'
                }`}
              >
                <p className={`text-sm font-medium ${sel ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Quality — segmented toggle */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">Use Cases Quality</label>
        <p className="text-xs text-slate-500 mb-3">Higher quality takes longer but produces more thorough results.</p>
        <div className="flex gap-3">
          {QUALITY_OPTIONS.map((opt) => {
            const sel = form.use_cases_quality === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update('use_cases_quality', opt.value)}
                className={`flex-1 relative p-3.5 rounded-lg border text-center transition-all duration-200 ${
                  sel
                    ? 'bg-db-red/10 border-db-red/50 ring-1 ring-db-red/20'
                    : 'bg-db-darkest/40 border-white/10 hover:border-white/20'
                }`}
              >
                <p className={`text-sm font-medium ${sel ? 'text-white' : 'text-slate-300'}`}>
                  {opt.label}
                  {opt.tag && sel && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-db-teal/20 text-db-teal font-bold uppercase">
                      {opt.tag}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STEP 1 — Customize
   ═══════════════════════════════════════════════════ */

function StepCustomize({ form, update, toggleMulti, showAdvanced, setShowAdvanced }) {
  const [langSearch, setLangSearch] = useState('');

  const filteredLangs = useMemo(() => {
    if (!langSearch.trim()) return LANGUAGES;
    const q = langSearch.toLowerCase();
    return LANGUAGES
      .map(g => ({
        group: g.group,
        items: g.items.filter(l => l.toLowerCase().includes(q)),
      }))
      .filter(g => g.items.length > 0);
  }, [langSearch]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Customize your run"
        subtitle="Choose priorities, outputs, and languages."
      />

      {/* Business Priority */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">Business Priority</label>
        <p className="text-xs text-slate-500 mb-3">
          Use cases aligning to this priority will be ranked higher.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {BUSINESS_PRIORITIES.map((p) => {
            const sel = form.business_priorities === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => update('business_priorities', p.value)}
                className={`px-2.5 py-2 rounded-lg text-xs font-medium border text-center transition-all duration-200 ${
                  sel
                    ? 'bg-db-red/15 text-white border-db-red/40 ring-1 ring-db-red/15'
                    : 'bg-db-darkest/40 text-slate-400 border-white/8 hover:border-white/20 hover:text-slate-300'
                }`}
              >
                <span className="text-base block mb-0.5">{p.emoji}</span>
                {p.value.replace('Increase ', '↑ ').replace('Reduce ', '↓ ').replace('Optimize ', '').replace('Mitigate ', '').replace('Empower ', '').replace('Enhance ', '').replace('Drive ', '').replace('Achieve ', '').replace('Protect ', '').replace('Execute ', '')}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-600 mt-2">
          Selected: <span className="text-slate-400">{form.business_priorities}</span>
        </p>
      </div>

      {/* Generation Options */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-white">Generation Options</label>
          <span className="text-xs text-db-red-light font-medium">{form.generation_options.length} selected</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">Choose which artifacts to generate. Select multiple.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {GENERATION_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const sel = form.generation_options.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleMulti('generation_options', opt.value)}
                className={`group relative p-3.5 rounded-lg border text-left transition-all duration-200 ${
                  sel
                    ? 'bg-db-red/10 border-db-red/40'
                    : 'bg-db-darkest/40 border-white/8 hover:border-white/20'
                }`}
              >
                {/* Checkbox */}
                <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded border transition-all ${
                  sel ? 'bg-db-red border-db-red' : 'border-white/20 group-hover:border-white/30'
                } flex items-center justify-center`}>
                  {sel && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <Icon className={`w-4 h-4 mb-1.5 ${sel ? 'text-db-red-light' : 'text-slate-500'}`} />
                <p className={`text-xs font-medium leading-tight ${sel ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Languages */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium text-white">Document Languages</label>
          <span className="text-xs text-db-red-light font-medium">{form.documents_languages.length} selected</span>
        </div>
        <p className="text-xs text-slate-500 mb-3">Choose language(s) for generated documents.</p>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
            placeholder="Search languages..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/60 border border-white/8 text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
          />
        </div>

        {filteredLangs.map((group) => (
          <div key={group.group} className="mb-3 last:mb-0">
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">{group.group}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((lang) => {
                const sel = form.documents_languages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleMulti('documents_languages', lang)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all duration-150 ${
                      sel
                        ? 'bg-db-red/15 text-db-red-light border-db-red/30'
                        : 'bg-db-darkest/50 text-slate-500 border-white/5 hover:border-white/15 hover:text-slate-300'
                    }`}
                  >
                    {sel && <Check className="w-2.5 h-2.5 inline mr-1 -mt-0.5" />}
                    {lang}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Business Domains */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">
          Business Domains
          {form.business_domains && (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-db-teal/20 text-db-teal font-bold uppercase">
              Auto-filled
            </span>
          )}
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Comma-separated business domains to focus on. Auto-derived from your UC Metadata schemas — edit to refine.
        </p>
        <div className="relative">
          <Layers className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={form.business_domains}
            onChange={(e) => update('business_domains', e.target.value)}
            placeholder="Finance, Sales, Operations (auto-detected from metadata)"
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all"
          />
        </div>
      </div>

      {/* Strategic Goals */}
      <div className="rounded-xl border border-white/10 bg-db-navy/40 p-5">
        <label className="block text-sm font-medium text-white mb-1">
          Strategic Goals
        </label>
        <p className="text-xs text-slate-500 mb-3">
          Comma-separated strategic goals to align use cases with. Leave empty to let the AI auto-generate them from your data context.
        </p>
        <div className="relative">
          <Target className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
          <textarea
            value={form.strategic_goals}
            onChange={(e) => update('strategic_goals', e.target.value)}
            placeholder="e.g. Improve customer retention, Reduce operational costs, Accelerate digital transformation"
            rows={2}
            className="w-full pl-11 pr-4 py-3 rounded-lg bg-db-darkest/80 border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-db-red/40 focus:border-db-red/40 transition-all resize-none"
          />
        </div>
        {!form.strategic_goals && (
          <p className="text-[11px] text-db-teal/70 mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Will be auto-generated by AI based on your business context
          </p>
        )}
      </div>

      {/* Advanced Options */}
      <div className="rounded-xl border border-white/5 bg-db-darkest/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs text-slate-400 hover:text-slate-300 transition-colors"
        >
          <span className="font-medium">Advanced Options</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showAdvanced && (
          <div className="px-5 pb-5 pt-1 space-y-3 animate-fade-in-up">
            <MiniInput
              icon={FolderOpen}
              label="Generation Path"
              placeholder="./inspire_gen/"
              value={form.generation_path}
              onChange={(v) => update('generation_path', v)}
            />
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">SQL Generation per Domain</label>
              <select
                value={form.sql_generation_per_domain}
                onChange={(e) => update('sql_generation_per_domain', e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-db-darkest/60 border border-white/8 text-white text-xs focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
              >
                {SQL_PER_DOMAIN_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <MiniInput
              icon={FolderOpen}
              label="Session ID"
              placeholder="Auto-generated if empty"
              value={form.session_id}
              onChange={(v) => update('session_id', v)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   STEP 2 — Review & Run
   ═══════════════════════════════════════════════════ */

function StepReview({ form, onEdit }) {
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Review your configuration"
        subtitle="Make sure everything looks good before launching."
      />

      <div className="rounded-xl border border-white/10 bg-db-navy/40 overflow-hidden divide-y divide-white/5">
        {/* Essentials */}
        <ReviewSection title="Essentials" onEdit={() => onEdit(0)}>
          <ReviewRow label="Business Name" value={form.business_name} />
          <ReviewRow label="UC Metadata" value={form.uc_metadata} mono />
          <ReviewRow label="Inspire Database" value={form.inspire_database} mono />
          <ReviewRow label="Operation" value={form.operation} />
          <ReviewRow label="Table Election" value={form.table_election} />
          <ReviewRow label="Use Cases Quality" value={form.use_cases_quality} />
        </ReviewSection>

        {/* Customization */}
        <ReviewSection title="Customization" onEdit={() => onEdit(1)}>
          <ReviewRow label="SQL per Domain" value={form.sql_generation_per_domain} />
          <ReviewRow label="Business Priority" value={form.business_priorities} />
          <ReviewRow label="Business Domains" value={form.business_domains || '(auto-detected)'} />
          <ReviewRow label="Strategic Goals" value={form.strategic_goals || '(AI auto-generated)'} />
          <ReviewRow
            label="Generation Options"
            value={form.generation_options.join(', ')}
            badge={`${form.generation_options.length}`}
          />
          <ReviewRow
            label="Languages"
            value={form.documents_languages.join(', ')}
            badge={`${form.documents_languages.length}`}
          />
        </ReviewSection>

        {/* Advanced (only if set) */}
        {(form.generation_path !== './inspire_gen/' || form.sql_generation_per_domain !== '0' || form.session_id) && (
          <ReviewSection title="Advanced" onEdit={() => onEdit(1)}>
            {form.generation_path !== './inspire_gen/' && <ReviewRow label="Generation Path" value={form.generation_path} mono />}
            {form.sql_generation_per_domain !== '0' && <ReviewRow label="SQL per Domain" value={form.sql_generation_per_domain} />}
            {form.session_id && <ReviewRow label="Session ID" value={form.session_id} mono />}
          </ReviewSection>
        )}
      </div>

      {/* Launch confirmation */}
      <div className="rounded-xl border border-db-red/20 bg-db-red/5 p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-db-red-light flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 leading-relaxed">
          <p>
            Clicking <strong className="text-white">Launch Inspire AI</strong> will create a one-time job run on your Databricks workspace.
            The notebook will only read <strong>metadata</strong> (table/column names) — it does <strong>not</strong> access your actual data.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared small components ─── */

function SectionHeader({ title, subtitle }) {
  return (
    <div className="text-center pb-2">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function MiniInput({ icon: Icon, label, placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-4 py-2 rounded-lg bg-db-darkest/60 border border-white/8 text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-db-red/30 transition-all"
        />
      </div>
    </div>
  );
}

function ReviewSection({ title, onEdit, children }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 text-[11px] text-db-red-light hover:text-db-red font-medium transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value, mono, badge }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <div className="text-right flex items-center gap-2">
        {badge && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-db-red/15 text-db-red-light">{badge}</span>
        )}
        <span className={`text-xs text-slate-200 ${mono ? 'font-mono' : ''} text-right max-w-xs truncate`}>
          {value || <span className="text-slate-600 italic">Not set</span>}
        </span>
      </div>
    </div>
  );
}
