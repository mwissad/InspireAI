import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X, ChevronLeft, ChevronRight, ChevronDown, LayoutDashboard, Sparkles, AppWindow, Bell, Check } from 'lucide-react';
import BodyPortal from '../components/BodyPortal';
import {
  IMPLEMENT_STEPS,
  IMPLEMENT_OUTPUTS,
  ALERT_TIER_OPTIONS,
  ALERT_OPERATORS,
  FRESHNESS_OPTIONS,
  defaultSpecFromUseCase,
  caseNameOf,
  specFromLatest,
  tablesOf,
  primaryTableOf,
  removeTable,
  restoreTable,
  removalBlocker,
  filterValues,
  setFilterValues,
  readinessScope,
  readinessText,
  scopeNarrowing,
  emptyScopeError,
  planLines,
  editedNotebook,
  tableOfRef as refTable,
  columnOfRef as refColumn,
  VALUE_LIMIT,
  guessColumnRole,
  defaultAlertRecipients,
  withDecisionOwner,
  cronInWords,
  cronProblem,
  alertTriggerText,
  stepErrors,
  advancedErrors,
  freshnessOf,
  withFreshness,
  nextAppName,
  widgetValueProblem,
  profileFieldProblem,
  initialStepIndex,
  lostTablesText,
  profileEstimate,
  costHint,
  PREFLIGHT_LABELS,
  PROFILE_FIELDS,
  APP_NAME_RE,
} from '../lib/implementWizard';

const ICONS = { dashboard: LayoutDashboard, genie_space: Sparkles, app: AppWindow, alert: Bell };
const NO_WIDGET_GROUPS = { business: [], model: [], ai: [], extras: [], extras_kept_default: [] };
const COLUMN_ROLES = ['entity_id', 'event_date', 'measure', 'label', 'segment'];
const ALL_FEATURES = { apps: true, genie_spaces: true, alerts: true };
const TILE_CHECKS = { app: ['app_name', 'app_access', 'apps'], genie_space: ['genie_spaces'], alert: ['alerts'] };
const TILE_CHECK_KEYS = Object.values(TILE_CHECKS).flat();
const REMOVE = '__remove__';

const rowWithCard = (card, row) => ({ ...(card || {}), ...(row || {}) });

function Field({ label, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-2.5 py-2 text-sm border border-border rounded-md bg-surface text-text-primary glow-focus';

function ProfileInput({ spec, path, onChange }) {
  const [section, name] = path.split('.');
  const value = spec.config.profiles[section]?.[name] ?? '';
  const problem = profileFieldProblem(path, value);
  return (
    <Field label={`${PROFILE_FIELDS[path].label} (${PROFILE_FIELDS[path].allowed})`}>
      <input className={inputCls} value={value} onChange={(e) => onChange(section, { ...spec.config.profiles[section], [name]: e.target.value })} />
      {problem && <p className="text-[11px] text-error">{problem}</p>}
    </Field>
  );
}

function WidgetInput({ widget, value, endpoints, onChange }) {
  const problem = value === undefined ? '' : widgetValueProblem(widget.name, value, widget.allowed);
  const allowed = widget.allowed || (widget.type === 'dropdown' ? 'one of the listed choices' : 'any value');
  let input;
  if (widget.name === 'ai_endpoint') {
    input = (
      <select className={inputCls} value={value ?? widget.default ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value={widget.default || ''}>{widget.default || 'Pick an endpoint'}</option>
        {endpoints.filter((e) => e.name !== widget.default).map((e) => <option key={e.name} value={e.name}>{e.name}</option>)}
      </select>
    );
  } else if (widget.type === 'dropdown' && (widget.choices || []).length) {
    input = (
      <select className={inputCls} value={value ?? widget.default ?? ''} onChange={(e) => onChange(e.target.value === widget.default ? '' : e.target.value)}>
        {widget.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
      </select>
    );
  } else {
    input = <input className={inputCls} value={value ?? ''} placeholder={widget.default ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-mono text-[11px] text-text-primary">{widget.name}</span>
        <span className="text-[10px] text-text-tertiary">
          default {widget.default === '' || widget.default == null ? 'empty' : widget.default} · allowed {allowed}
        </span>
      </div>
      {input}
      {widget.label && <p className="text-[11px] text-text-secondary">Used for: {widget.label}</p>}
      {problem && <p className="text-[11px] text-error">{problem}</p>}
    </div>
  );
}

function Advanced({ open, onToggle, children }) {
  return (
    <div className="border-t border-border pt-3">
      <button type="button" aria-expanded={open} onClick={onToggle} className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary">
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} /> Advanced settings
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}

function CheckLine({ check, label }) {
  return (
    <p className={`text-[11px] ${check.ok ? 'text-success' : 'text-error'}`}>
      {label}: {check.detail}
      {check.warn && <span className="block text-warning">{check.warn}</span>}
    </p>
  );
}

export default function ImplementWizard({
  uc,
  sessionId,
  settings,
  discoveryType,
  apiFetch,
  apiPostJson,
  onClose,
  onImplemented,
  focus = null,
}) {
  const warehouseId = settings.warehouseId;
  const inspireDatabase = settings.inspireDatabase;
  const [step, setStep] = useState(() => initialStepIndex(focus));
  const [spec, setSpec] = useState(() => defaultSpecFromUseCase(uc, { warehouseId, inspireDatabase }));
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [attempted, setAttempted] = useState({ data: false, delivery: false });
  const [checking, setChecking] = useState('');
  const [advanced, setAdvanced] = useState({ data: false, delivery: false });
  const [columnsByTable, setColumnsByTable] = useState({});
  const [confirmedRoles, setConfirmedRoles] = useState({});
  const [preflight, setPreflight] = useState(null);
  const [preflightError, setPreflightError] = useState('');
  const [checksBusy, setChecksBusy] = useState(false);
  const [outputCheck, setOutputCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState('');
  const [notice, setNotice] = useState(() => lostTablesText(focus?.missingTables));
  const lostReason = (table) => (focus?.missingTables || []).find((m) => String(m.table).toLowerCase() === table.toLowerCase())?.reason;
  const [changing, setChanging] = useState({});
  const [excludeRef, setExcludeRef] = useState('');
  const [swaps, setSwaps] = useState({});
  const [values, setValues] = useState({});
  const [readiness, setReadiness] = useState(null);
  const [principalQ, setPrincipalQ] = useState('');
  const [principals, setPrincipals] = useState([]);
  const [endpoints, setEndpoints] = useState([]);
  const [destinations, setDestinations] = useState(null);
  const [destinationsError, setDestinationsError] = useState('');
  const bodyRef = useRef(null);
  const stepId = IMPLEMENT_STEPS[step].id;

  const q = useMemo(() => {
    const p = new URLSearchParams({
      inspire_database: inspireDatabase,
      warehouse_id: warehouseId,
      session_id: String(sessionId),
      use_case_id: spec.use_case_id,
    });
    return p.toString();
  }, [inspireDatabase, warehouseId, sessionId, spec.use_case_id]);

  const patch = (path, value) => {
    setSpec((prev) => {
      const next = { ...prev };
      const parts = path.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        cur[key] = Array.isArray(cur[key]) ? [...cur[key]] : { ...(cur[key] || {}) };
        cur = cur[key];
      }
      cur[parts[parts.length - 1]] = value;
      return next;
    });
  };

  const loadSwaps = useCallback(async (table) => {
    try {
      const data = await apiPostJson(`/api/inspire/implement/swaps?${q}`, { table, required_columns: [] });
      setSwaps((prev) => ({ ...prev, [table]: data.swaps || [] }));
    } catch (e) {
      setSwaps((prev) => ({ ...prev, [table]: [] }));
      setErrors([e.message]);
    }
  }, [apiPostJson, q]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch(`/api/inspire/implement/context?${q}`);
        if (cancelled) return;
        setContext(data);
        const row = rowWithCard(uc, data.use_case);
        const fallback = defaultSpecFromUseCase(row, {
          warehouseId,
          inspireDatabase,
          owner: data.me?.username,
        });
        const next = specFromLatest(data.latest, fallback);
        if (!next.config.warehouse_id) next.config.warehouse_id = warehouseId;
        setSpec(next);
        if (data.latest) setConfirmedRoles(Object.fromEntries(Object.keys(next.data.column_roles || {}).map((role) => [role, true])));
        const lost = (focus?.missingTables || []).map((m) => tablesOf(row)
          .find((t) => [t, next.data.tables[t]].some((n) => String(n || '').toLowerCase() === String(m.table).toLowerCase())))
          .filter(Boolean);
        if (lost.length) {
          setChanging(Object.fromEntries(lost.map((t) => [t, true])));
          lost.forEach((t) => { loadSwaps(t); });
        }
      } catch (e) {
        if (!cancelled) setErrors([e.message]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const ucRow = useMemo(() => rowWithCard(uc, context?.use_case), [uc, context?.use_case]);
  const notebookEdit = editedNotebook(context?.latest);
  const editing = Boolean(context?.latest);
  const trainsModel = context?.trains_model !== false;
  const removedTables = spec.data.removed_tables || [];
  const isRemoved = (table) => removedTables.some((r) => r.toLowerCase() === table.toLowerCase());
  const sourceTables = useMemo(() => {
    const removed = spec.data.removed_tables || [];
    return tablesOf(ucRow)
      .filter((t) => !removed.some((r) => r.toLowerCase() === t.toLowerCase()))
      .map((t) => spec.data.tables[t] || t);
  }, [ucRow, spec.data.tables, spec.data.removed_tables]);

  const loadColumns = useCallback(async (table) => {
    if (!table || columnsByTable[table]) return;
    try {
      const data = await apiFetch(`/api/inspire/implement/columns?${q}&table=${encodeURIComponent(table)}`);
      setColumnsByTable((prev) => ({ ...prev, [table]: data.columns || [] }));
      if (editing) return;
      setSpec((prev) => {
        const roles = { ...prev.data.column_roles };
        for (const col of data.columns || []) {
          const guess = guessColumnRole(col.column_name);
          if (guess === 'label' && !trainsModel) continue;
          if (guess && !Object.values(roles).some((v) => String(v).endsWith(`.${col.column_name}`))) {
            if (!roles[guess]) roles[guess] = `${table}.${col.column_name}`;
          }
        }
        return { ...prev, data: { ...prev.data, column_roles: roles } };
      });
    } catch (e) {
      setErrors([e.message]);
    }
  }, [apiFetch, q, columnsByTable, trainsModel, editing]);

  useEffect(() => {
    if (!context) return;
    sourceTables.forEach((t) => { loadColumns(t); });
  }, [context, sourceTables.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bodyRef.current?.scrollTo?.(0, 0);
  }, [step]);

  const groups = context?.widget_groups || NO_WIDGET_GROUPS;
  const segmentRef = spec.data.column_roles.segment || '';
  const exclusionRefs = (spec.data.filters || []).filter((f) => f.op === 'not in').map((f) => `${f.table}.${f.column}`);
  const unconfirmedRoles = Object.entries(spec.data.column_roles)
    .filter(([role, ref]) => ref && !confirmedRoles[role] && guessColumnRole(String(ref).split('.').pop()) !== role)
    .map(([role]) => role);
  const extras = { unconfirmedRoles, widgets: context?.widgets || [], trainsModel };
  const ownErrors = stepErrors(stepId, spec, extras);

  const primaryOriginal = primaryTableOf(ucRow);
  const primaryChosen = spec.data.tables[primaryOriginal] || primaryOriginal;
  const eventRef = spec.data.column_roles.event_date || '';
  const estimate = (windowDays, more = {}) => profileEstimate({
    evidence: context?.evidence,
    table: primaryChosen,
    dateColumn: eventRef && refTable(eventRef).toLowerCase() === primaryChosen.toLowerCase() ? refColumn(eventRef) : '',
    windowDays,
    dataWindow: spec.data.window,
    discoveryType,
    ...more,
  }).text;

  const setProfile = (section, value) => patch(`config.profiles.${section}`, value);

  const setWidget = (name, value) => setSpec((prev) => {
    const widgets = { ...prev.config.widgets };
    if (value === '') delete widgets[name];
    else widgets[name] = value;
    const config = { ...prev.config, widgets };
    if (name === 'ai_endpoint') config.ai_endpoint = value;
    return { ...prev, config };
  });

  const blockedBy = (id) => {
    setAttempted((prev) => ({ ...prev, [id]: true }));
    if (!stepErrors(id, spec, extras).length) return false;
    if (advancedErrors(id, spec, extras).length) setAdvanced((prev) => ({ ...prev, [id]: true }));
    return true;
  };

  const goNext = async () => {
    setErrors([]);
    if (blockedBy('data')) return;
    setChecking('Checking you can write the result table');
    try {
      const check = await apiFetch(`/api/inspire/implement/output-check?${q}&table=${encodeURIComponent(spec.config.result_table)}`);
      setOutputCheck(check);
      if (!check.ok) {
        setErrors([check.write?.ok ? check.safety?.detail : check.write?.detail].filter(Boolean));
        setAdvanced((prev) => ({ ...prev, data: true }));
        return;
      }
      if (discoveryType && discoveryType !== 'Standard') {
        const scope = readinessScope(spec, ucRow);
        if (scope.table) {
          setChecking('Checking the data');
          const counted = await apiPostJson(`/api/inspire/implement/readiness?${q}`, {
            table: scope.table,
            discovery_type: discoveryType,
            columns: scope.columns,
            filters: scope.filters,
            window: scope.window,
          });
          setReadiness({ ...counted, scope });
          if (!counted.skipped && counted.row_count === 0) {
            setErrors([emptyScopeError(scope)]);
            if (scopeNarrowing(scope).length) setAdvanced((prev) => ({ ...prev, data: true }));
            return;
          }
        }
      }
      setStep(1);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setChecking('');
    }
  };

  const specKey = JSON.stringify(spec);
  const ownErrorsKey = ownErrors.join('|');
  useEffect(() => {
    if (stepId !== 'delivery') return undefined;
    let cancelled = false;
    setChecksBusy(true);
    const timer = setTimeout(async () => {
      const planNow = !ownErrorsKey;
      const checks = new URLSearchParams({
        result_table: spec.config.result_table,
        app_name: spec.outputs.app ? spec.outputs.app_name : '',
        alert: spec.outputs.alert ? '1' : '0',
        genie: spec.outputs.genie_space ? '1' : '0',
        share: (spec.sharing.principals || []).length ? '1' : '0',
        principals: JSON.stringify((spec.sharing.principals || []).map((p) => p.name)),
      });
      const [pre, planned] = await Promise.allSettled([
        apiFetch(`/api/inspire/implement/preflight?${q}&${checks.toString()}`),
        planNow
          ? apiPostJson('/api/inspire/implement/plan', { inspire_database: inspireDatabase, warehouse_id: warehouseId, session_id: String(sessionId), spec })
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPreflight(pre.status === 'fulfilled' ? pre.value : null);
      setPreflightError(pre.status === 'fulfilled' ? '' : pre.reason.message);
      setPlan(planned.status === 'fulfilled' ? planned.value : null);
      setPlanError(planned.status === 'fulfilled' ? '' : planned.reason.message);
      setChecksBusy(false);
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stepId, specKey, ownErrorsKey, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setErrors([]);
    if (blockedBy('delivery')) return;
    setBusy(true);
    try {
      const data = await apiPostJson('/api/inspire/implement/submit', {
        inspire_database: inspireDatabase,
        warehouse_id: warehouseId,
        session_id: String(sessionId),
        notebook_path: settings.notebookPath,
        spec,
      });
      onImplemented(data);
    } catch (e) {
      setErrors([e.message]);
    } finally {
      setBusy(false);
    }
  };

  const loadValues = async (table, column) => {
    const key = `${table}.${column}`;
    if (values[key]) return;
    try {
      const data = await apiFetch(`/api/inspire/implement/values?${q}&table=${encodeURIComponent(table)}&column=${encodeURIComponent(column)}&limit=${VALUE_LIMIT}`);
      setValues((prev) => ({ ...prev, [key]: data.values || [] }));
    } catch (e) {
      setErrors([e.message]);
    }
  };

  useEffect(() => {
    if (stepId !== 'data' || !advanced.data) return undefined;
    let cancelled = false;
    apiFetch(`/api/inspire/implement/serving-endpoints?${q}`)
      .then((data) => { if (!cancelled) setEndpoints(data.endpoints || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stepId, advanced.data, apiFetch, q]);

  useEffect(() => {
    if (stepId !== 'delivery' || !spec.outputs.alert || destinations !== null) return undefined;
    let cancelled = false;
    apiFetch('/api/inspire/implement/destinations')
      .then((data) => { if (!cancelled) setDestinations(data.destinations || []); })
      .catch((e) => {
        if (cancelled) return;
        setDestinations([]);
        setDestinationsError(e.message);
      });
    return () => { cancelled = true; };
  }, [stepId, spec.outputs.alert, destinations, apiFetch]);

  useEffect(() => {
    if (principalQ.length < 2) {
      setPrincipals([]);
      return undefined;
    }
    const t = setTimeout(() => {
      apiFetch(`/api/inspire/implement/principals?${q}&q=${encodeURIComponent(principalQ)}`)
        .then((data) => setPrincipals(data.principals || []))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [principalQ, apiFetch, q]);

  const title = caseNameOf(uc) || spec.use_case_name || spec.use_case_id;

  if (loading) {
    return (
      <Overlay title={title} step={step} onClose={onClose}>
        <div className="flex items-center gap-2 p-8 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Loading the use case…
        </div>
      </Overlay>
    );
  }

  const features = preflight?.features || context?.features || ALL_FEATURES;
  const chosenDestinations = spec.outputs.alert_destinations || [];
  const checkEntries = Object.entries(preflight?.checks || {});
  const generalChecks = checkEntries.filter(([k]) => !TILE_CHECK_KEYS.includes(k));
  const freshness = freshnessOf(spec.schedule);
  const appTaken = spec.outputs.app && preflight?.checks?.app_name?.ok === false;
  const footerErrors = [...new Set([
    ...(attempted[stepId] ? ownErrors : []),
    ...errors,
    ...(stepId === 'delivery' ? [planError, preflightError] : []),
  ].filter(Boolean))];
  const implementBlocked = busy || checksBusy || (!ownErrors.length && (!preflight || !preflight.ok || !plan || Boolean(planError)));

  const pickTable = (original, value) => {
    if (value === REMOVE) {
      const { spec: next, cleared } = removeTable(spec, original);
      setSpec(next);
      const parts = [];
      if (cleared.roles.length) parts.push(`its column roles (${cleared.roles.map((r) => r.replace('_', ' ')).join(', ')})`);
      if (cleared.filters) parts.push(`${cleared.filters} filter(s) on it`);
      setNotice(parts.length ? `Removed ${original} and cleared ${parts.join(' and ')}.` : `Removed ${original}.`);
    } else {
      patch('data.tables', { ...spec.data.tables, [original]: value });
    }
    setChanging((prev) => ({ ...prev, [original]: false }));
  };

  const toggleOutput = (id, checked) => {
    const next = { ...spec.outputs, [id]: checked };
    if (id === 'alert' && checked && !(next.alert_recipients || []).length) next.alert_recipients = defaultAlertRecipients(spec);
    const removed = { ...spec.removed_outputs };
    if (!checked && context?.assets?.[id]) delete removed[id];
    setSpec((prev) => ({ ...prev, outputs: next, removed_outputs: removed }));
  };

  return (
    <Overlay title={title} step={step} onClose={onClose}>
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
        {stepId === 'data' && (
          <>
            <section className="bg-bg border border-border rounded-lg p-4 space-y-3" aria-label="Executive summary">
              <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
              {(ucRow.statement || ucRow.Statement) && <p className="text-[13px] text-text-secondary">{ucRow.statement || ucRow.Statement}</p>}
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
                {[
                  ['Who it helps', ucRow.beneficiary || ucRow.Beneficiary],
                  ['Sponsor', ucRow.sponsor || ucRow.Sponsor],
                  ['Business value', ucRow.business_value || ucRow['Business Value']],
                ].filter(([, val]) => val).map(([label, val]) => (
                  <div key={label}>
                    <dt className="text-[9px] uppercase tracking-[0.18em] font-bold text-text-tertiary">{label}</dt>
                    <dd className="mt-0.5 text-text-secondary line-clamp-3">{val}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Source tables</h3>
                <p className="text-[11px] text-text-tertiary">Inspire picked these for this use case. Genie builds on them unless you change one.</p>
              </div>
              {notice && <p className="text-[11px] text-text-secondary bg-bg border border-border rounded-md px-3 py-2">{notice}</p>}
              {tablesOf(ucRow).map((original) => {
                const chosen = spec.data.tables[original] || original;
                const removed = isRemoved(original);
                const blocker = removalBlocker(ucRow, spec, original);
                const primary = original.toLowerCase() === primaryOriginal.toLowerCase();
                const lost = removed ? '' : lostReason(chosen);
                const options = swaps[original];
                return (
                  <div key={original} data-table={original} className={`border rounded-lg px-3 py-2.5 space-y-2 ${lost ? 'border-error/50' : 'border-border'} ${removed ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {!removed && <Check size={14} className="shrink-0 text-success" aria-hidden="true" />}
                        <span className={`font-mono text-[12px] text-text-primary truncate ${removed ? 'line-through' : ''}`}>{chosen}</span>
                        {primary && <span className="text-[9px] uppercase tracking-[0.18em] text-text-tertiary">Primary</span>}
                        {chosen !== original && !removed && <span className="text-[10px] text-text-tertiary">instead of {original}</span>}
                        {lost && <span className="text-[9px] uppercase tracking-[0.18em] text-error">{lost}</span>}
                      </div>
                      {removed ? (
                        <button type="button" className="text-[11px] text-db-red shrink-0" onClick={() => { setSpec((prev) => restoreTable(prev, original)); setNotice(''); }}>
                          Use it again
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="text-[11px] text-db-red shrink-0"
                          onClick={() => {
                            const open = !changing[original];
                            setChanging((prev) => ({ ...prev, [original]: open }));
                            if (open && options === undefined) loadSwaps(original);
                          }}
                        >
                          Change
                        </button>
                      )}
                    </div>
                    {!removed && changing[original] && (
                      <select aria-label={`Table to use for ${original}`} className={inputCls} value={chosen} onChange={(e) => pickTable(original, e.target.value)}>
                        <option value={original}>{original} (Inspire's pick)</option>
                        {chosen !== original && !(options || []).some((s) => s.table === chosen) && <option value={chosen}>{chosen}</option>}
                        {options === undefined && <option disabled value="">Finding similar tables…</option>}
                        {options && options.length === 0 && <option disabled value="">No similar table found</option>}
                        {(options || []).filter((s) => s.table !== original).map((s) => (
                          <option key={s.table} value={s.table}>{s.table} ({s.matched} of {s.total} columns match)</option>
                        ))}
                        <option value={REMOVE} disabled={Boolean(blocker)}>{blocker ? `Don't use this table (${blocker})` : "Don't use this table"}</option>
                      </select>
                    )}
                  </div>
                );
              })}
            </section>

            <Advanced open={advanced.data} onToggle={() => setAdvanced((prev) => ({ ...prev, data: !prev.data }))}>
              <Field label="Goal sentence">
                <textarea className={inputCls} rows={3} value={spec.use_case.goal} onChange={(e) => patch('use_case.goal', e.target.value)} />
              </Field>
              <Field label="Decision owner">
                <input className={inputCls} value={spec.use_case.decision_owner} onChange={(e) => { const owner = e.target.value; setSpec((prev) => withDecisionOwner(prev, owner)); }} />
              </Field>
              {[0, 1, 2].map((i) => (
                <Field key={i} label={i === 0 ? 'Success measures' : `Measure ${i + 1} (optional)`}>
                  <input
                    className={inputCls}
                    value={spec.use_case.success_measures[i] || ''}
                    onChange={(e) => {
                      const next = [...spec.use_case.success_measures];
                      next[i] = e.target.value;
                      patch('use_case.success_measures', next.filter((m, idx) => m || idx < i));
                    }}
                  />
                </Field>
              ))}
              <div className="grid grid-cols-2 gap-2">
                {COLUMN_ROLES.filter((role) => trainsModel || role !== 'label').map((role) => (
                  <Field key={role} label={role.replace('_', ' ')}>
                    <select
                      className={inputCls}
                      value={spec.data.column_roles[role] || ''}
                      onChange={(e) => {
                        patch('data.column_roles', { ...spec.data.column_roles, [role]: e.target.value });
                        setConfirmedRoles((prev) => ({ ...prev, [role]: true }));
                      }}
                    >
                      <option value="">Not mapped</option>
                      {sourceTables.flatMap((table) => (columnsByTable[table] || []).map((c) => (
                        <option key={`${table}.${c.column_name}`} value={`${table}.${c.column_name}`}>
                          {table}.{c.column_name}
                        </option>
                      )))}
                    </select>
                  </Field>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Window start">
                  <input type="date" className={inputCls} value={spec.data.window.start} onChange={(e) => patch('data.window', { ...spec.data.window, start: e.target.value })} />
                </Field>
                <Field label="Window end">
                  <input type="date" className={inputCls} value={spec.data.window.end} onChange={(e) => patch('data.window', { ...spec.data.window, end: e.target.value })} />
                </Field>
              </div>
              {segmentRef && (
                <ValuePicker
                  label={`Segment filter (optional): keep only these ${segmentRef}`}
                  values={values[segmentRef]}
                  selected={filterValues(spec, refTable(segmentRef), refColumn(segmentRef), 'in')}
                  onLoad={() => loadValues(refTable(segmentRef), refColumn(segmentRef))}
                  onChange={(picked) => setSpec((prev) => setFilterValues(prev, refTable(segmentRef), refColumn(segmentRef), 'in', picked))}
                />
              )}
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Exclusions (optional)</span>
                <select className={inputCls} value={excludeRef} onChange={(e) => setExcludeRef(e.target.value)}>
                  <option value="">Pick a column to exclude values from</option>
                  {sourceTables.flatMap((table) => (columnsByTable[table] || []).map((c) => (
                    <option key={`${table}.${c.column_name}`} value={`${table}.${c.column_name}`}>{table}.{c.column_name}</option>
                  )))}
                </select>
                {[...new Set([excludeRef, ...exclusionRefs].filter(Boolean))].map((ref) => (
                  <ValuePicker
                    key={ref}
                    label={`Leave out these ${ref}`}
                    values={values[ref]}
                    selected={filterValues(spec, refTable(ref), refColumn(ref), 'not in')}
                    onLoad={() => loadValues(refTable(ref), refColumn(ref))}
                    onChange={(picked) => setSpec((prev) => setFilterValues(prev, refTable(ref), refColumn(ref), 'not in', picked))}
                  />
                ))}
              </div>
              <Field label="Output table">
                <input className={inputCls} value={spec.config.result_table} onChange={(e) => { patch('config.result_table', e.target.value); setOutputCheck(null); }} />
                {outputCheck ? (
                  <div className="text-[11px] space-y-0.5">
                    <p className={outputCheck.write?.ok ? 'text-success' : 'text-error'}>{outputCheck.write?.detail}</p>
                    {outputCheck.write?.ok && <p className={outputCheck.safety?.ok ? 'text-success' : 'text-error'}>{outputCheck.safety?.detail}</p>}
                    {outputCheck.write?.ok && outputCheck.safety?.ok && <p className="text-text-tertiary">Sharing: {outputCheck.grant?.detail}</p>}
                    {outputCheck.identity && <p className="text-text-tertiary">Checked live as {outputCheck.identity}.</p>}
                  </div>
                ) : (
                  <p className="text-[11px] text-text-tertiary">Next checks live that you can create or write this table. Inspire writes only here.</p>
                )}
              </Field>
              <p className="text-[11px] text-text-tertiary">
                {discoveryType === 'Deep' ? 'Deep discovery: Next counts the rows to work with.' : 'metadata only, readiness checked at preview run'}
              </p>
              {[['Business rules', groups.business], ['Model', groups.model], ['AI', groups.ai], ['Use-case extras', groups.extras]].map(([label, list]) => (
                <div key={label} className="space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">{label}</h4>
                  {(list || []).length === 0 && <p className="text-[11px] text-text-tertiary">None on this instruction yet. Genie will fill them on the first build.</p>}
                  {(list || []).map((w) => (
                    <WidgetInput
                      key={w.name}
                      widget={w}
                      value={spec.config.widgets[w.name] ?? (w.name === 'ai_endpoint' && spec.config.ai_endpoint ? spec.config.ai_endpoint : undefined)}
                      endpoints={endpoints}
                      onChange={(value) => setWidget(w.name, value)}
                    />
                  ))}
                  {label === 'Use-case extras' && (groups.extras_kept_default || []).length > 0 && (
                    <p className="text-[11px] text-text-tertiary">
                      {groups.extras_kept_default.length} more widget(s) keep their defaults here: {groups.extras_kept_default.join(', ')}. Change them in the notebook if needed.
                    </p>
                  )}
                </div>
              ))}
              <Field label="SQL warehouse id">
                <input className={inputCls} value={spec.config.warehouse_id} onChange={(e) => patch('config.warehouse_id', e.target.value)} />
              </Field>
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Run profiles</h4>
                <div className="space-y-1">
                  <ProfileInput spec={spec} path="preview.entity_cap" onChange={setProfile} />
                  <p className="text-[11px] text-text-tertiary">Preview reads {estimate(spec.config.profiles.full_load.window_days, { entityCap: spec.config.profiles.preview.entity_cap })}.</p>
                </div>
                {trainsModel && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-2 gap-2">
                      <ProfileInput spec={spec} path="training.window_days" onChange={setProfile} />
                      <ProfileInput spec={spec} path="training.sample_entities" onChange={setProfile} />
                    </div>
                    <p className="text-[11px] text-text-tertiary">Training reads {estimate(spec.config.profiles.training.window_days, { sampleEntities: spec.config.profiles.training.sample_entities })}.</p>
                  </div>
                )}
                <div className="space-y-1">
                  <ProfileInput spec={spec} path="full_load.window_days" onChange={setProfile} />
                  <p className="text-[11px] text-text-tertiary">Each full run reads {estimate(spec.config.profiles.full_load.window_days)}.</p>
                </div>
                {!trainsModel && <p className="text-[11px] text-text-tertiary">This use case does not train a model, so it has no training profile.</p>}
              </div>
            </Advanced>
          </>
        )}

        {stepId === 'delivery' && (
          <>
            {readinessText(readiness, readiness?.scope) && (
              <p className="text-[11px] text-text-secondary">{readinessText(readiness, readiness.scope)}</p>
            )}
            <section className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">How do you want to use it?</h3>
                <p className="text-[11px] text-text-tertiary">Pick one or more. Genie builds each one for you.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPLEMENT_OUTPUTS.map((item) => {
                  const Icon = ICONS[item.id];
                  const on = spec.outputs[item.id];
                  const noAppAccess = item.id === 'app' && !context?.assets?.app && outputCheck?.app?.ok === false;
                  const unavailable = (item.id === 'app' && !features.apps)
                    || noAppAccess
                    || (item.id === 'genie_space' && !features.genie_spaces)
                    || (item.id === 'alert' && !features.alerts);
                  const tileChecks = (TILE_CHECKS[item.id] || []).map((k) => [k, preflight?.checks?.[k]])
                    .filter(([k, v]) => v && !v.ok && on && !(k === 'app_name' && appTaken));
                  return (
                    <div key={item.id} className={`border rounded-lg p-3 space-y-2 ${on ? 'border-db-red/50 bg-db-red-50/40' : 'border-border'}`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={on} disabled={unavailable && !on} onChange={(e) => toggleOutput(item.id, e.target.checked)} />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Icon size={14} /> {item.label}</span>
                          <span className={`block text-[11px] mt-1 ${unavailable ? 'text-error' : 'text-text-secondary'}`}>
                            {!unavailable && item.blurb}
                            {unavailable && noAppAccess && `Inspire cannot create this App: ${outputCheck.app.detail}.${on ? ' Turn it off, or fix the access and check again.' : ''}`}
                            {unavailable && !noAppAccess && (on ? 'You cannot create this in this workspace any more. Turn it off, or ask a workspace admin.' : 'You cannot create this in this workspace.')}
                          </span>
                        </span>
                      </label>
                      {on && item.id === 'app' && (
                        <div className="pl-7 space-y-1">
                          <Field label="App name">
                            <input className={inputCls} value={spec.outputs.app_name} onChange={(e) => patch('outputs.app_name', e.target.value.toLowerCase())} />
                          </Field>
                          {spec.outputs.app_name && !APP_NAME_RE.test(spec.outputs.app_name) ? (
                            <p className="text-[11px] text-error">3-30 lowercase letters, digits and dashes, starting with a letter</p>
                          ) : appTaken ? (
                            <p className="text-[11px] text-error">
                              {preflight.checks.app_name.detail}.{' '}
                              <button type="button" className="text-db-red underline" onClick={() => patch('outputs.app_name', nextAppName(spec.outputs.app_name))}>
                                Use {nextAppName(spec.outputs.app_name)}
                              </button>
                            </p>
                          ) : (
                            <p className="text-[11px] text-text-tertiary">
                              {preflight?.checks?.app_name?.ok ? preflight.checks.app_name.detail : 'Up to 30 lowercase letters, digits and dashes.'}
                            </p>
                          )}
                        </div>
                      )}
                      {on && item.id === 'alert' && (
                        <p className="pl-7 text-[11px] text-text-secondary">
                          {(spec.outputs.alert_recipients || []).length
                            ? `Emails ${spec.outputs.alert_recipients.join(', ')} when ${alertTriggerText(spec.outputs)}.`
                            : 'Nobody gets it yet: add an email under Advanced settings.'}
                        </p>
                      )}
                      {tileChecks.map(([k, v]) => <div key={k} className="pl-7"><CheckLine check={v} label={PREFLIGHT_LABELS[k] || k} /></div>)}
                      {!on && context?.assets?.[item.id] && (
                        <div className="pl-7 space-y-1 text-[11px]">
                          <p className="text-text-secondary">This use case already has a {item.label.toLowerCase()}. What should happen to it?</p>
                          <div className="flex gap-3">
                            <label><input type="radio" checked={spec.removed_outputs[item.id] === 'delete'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'delete' })} /> Delete it</label>
                            <label><input type="radio" checked={spec.removed_outputs[item.id] === 'keep'} onChange={() => patch('removed_outputs', { ...spec.removed_outputs, [item.id]: 'keep' })} /> Keep it unmanaged</label>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-text-primary">Keep it fresh</h3>
              <div role="group" aria-label="Keep it fresh" className="inline-flex rounded-lg border border-border overflow-hidden">
                {[...FRESHNESS_OPTIONS, ...(freshness === 'custom' ? [{ id: 'custom', label: 'Custom' }] : [])].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={freshness === option.id}
                    disabled={option.id === 'custom'}
                    onClick={() => setSpec((prev) => withFreshness(prev, option.id))}
                    className={`px-4 py-1.5 text-xs font-medium border-r border-border last:border-r-0 ${freshness === option.id ? 'bg-db-red text-white' : 'bg-surface text-text-secondary hover:text-text-primary'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-tertiary">
                {freshness === 'off'
                  ? 'Genie runs it once now. Turn this on later to refresh it on a schedule.'
                  : `Refreshes ${cronInWords(spec.schedule.cron, spec.schedule.timezone)}, after the first successful run. Cost: ${costHint(spec)}`}
              </p>
            </section>

            {notebookEdit && (
              <label className="flex items-start gap-2 text-[12px] border border-warning/40 rounded-lg p-3">
                <input type="checkbox" className="mt-0.5" checked={Boolean(spec.confirm_notebook_overwrite)} onChange={(e) => patch('confirm_notebook_overwrite', e.target.checked)} />
                <span>
                  Overwrite the edits made to the notebook
                  {notebookEdit.edited_at ? ` on ${new Date(notebookEdit.edited_at).toLocaleString()}` : ''}
                  <span className="block text-text-tertiary">Leave it off to keep them: then change only the outputs or the schedule.</span>
                  {plan?.summary?.refill && !spec.confirm_notebook_overwrite && (
                    <span className="block text-warning">This version rebuilds the notebook, so it stops and asks again unless you tick this.</span>
                  )}
                </span>
              </label>
            )}

            {generalChecks.some(([, v]) => !v.ok || v.warn) && (
              <section className="space-y-1" aria-label="Access checks">
                {generalChecks.filter(([, v]) => !v.ok || v.warn).map(([k, v]) => <CheckLine key={k} check={v} label={PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')} />)}
              </section>
            )}

            <Advanced open={advanced.delivery} onToggle={() => setAdvanced((prev) => ({ ...prev, delivery: !prev.delivery }))}>
              {spec.outputs.dashboard && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Dashboard</h4>
                  <input className={inputCls} placeholder="Dashboard name" value={spec.outputs.dashboard_name} onChange={(e) => patch('outputs.dashboard_name', e.target.value)} />
                  <input className={inputCls} placeholder="Filter widgets, comma separated" value={(spec.outputs.dashboard_filters || []).join(', ')} onChange={(e) => patch('outputs.dashboard_filters', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
                </div>
              )}
              {spec.outputs.genie_space && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Genie space</h4>
                  <input className={inputCls} placeholder="Space name" value={spec.outputs.genie_space_name} onChange={(e) => patch('outputs.genie_space_name', e.target.value)} />
                  <textarea className={inputCls} rows={4} placeholder="Up to 5 questions, one per line" value={(spec.outputs.genie_questions || []).join('\n')} onChange={(e) => patch('outputs.genie_questions', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5))} />
                </div>
              )}
              {spec.outputs.app && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">App</h4>
                  <textarea className={inputCls} rows={3} placeholder="What the App should let people do" value={spec.outputs.app_purpose} onChange={(e) => patch('outputs.app_purpose', e.target.value)} />
                </div>
              )}
              {spec.outputs.alert && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Alert</h4>
                  <input className={inputCls} placeholder="Alert name" value={spec.outputs.alert_name} onChange={(e) => patch('outputs.alert_name', e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary">
                    <span>Fire when</span>
                    <select className={`${inputCls} w-auto`} value={spec.outputs.alert_tiers} onChange={(e) => patch('outputs.alert_tiers', e.target.value)}>
                      {ALERT_TIER_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                    </select>
                    <span>rows in the latest run are</span>
                    <select className={`${inputCls} w-auto`} value={spec.outputs.alert_operator} onChange={(e) => patch('outputs.alert_operator', e.target.value)}>
                      {ALERT_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input type="number" min="0" step="1" className={`${inputCls} w-24`} value={spec.outputs.alert_threshold} onChange={(e) => patch('outputs.alert_threshold', e.target.value)} />
                  </div>
                  <textarea
                    className={inputCls}
                    rows={2}
                    placeholder="Optional: also fire when ... (plain words, for example 'refunds above 10 today'). Genie turns it into SQL that reads only this use case's tables."
                    value={spec.outputs.alert_condition_text}
                    onChange={(e) => patch('outputs.alert_condition_text', e.target.value)}
                  />
                  <Field label="Email recipients (comma separated)">
                    <input
                      className={inputCls}
                      value={(spec.outputs.alert_recipients || []).join(', ')}
                      onChange={(e) => patch('outputs.alert_recipients', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                    />
                  </Field>
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Slack, Teams and other destinations</span>
                    {destinations === null && <p className="text-[11px] text-text-tertiary"><Loader2 size={11} className="inline animate-spin" /> Loading destinations…</p>}
                    {destinationsError && <p className="text-[11px] text-text-tertiary">Notification destinations are not available to you ({destinationsError}). Use email recipients.</p>}
                    {destinations && !destinationsError && destinations.length === 0 && (
                      <p className="text-[11px] text-text-tertiary">This workspace has no notification destinations. A workspace admin can add Slack or Teams ones.</p>
                    )}
                    {(destinations || []).map((d) => {
                      const picked = chosenDestinations.some((x) => x.id === d.id);
                      return (
                        <label key={d.id} className="flex items-center gap-2 text-[12px]">
                          <input
                            type="checkbox"
                            checked={picked}
                            onChange={() => patch('outputs.alert_destinations', picked
                              ? chosenDestinations.filter((x) => x.id !== d.id)
                              : [...chosenDestinations, { id: d.id, name: d.name }])}
                          />
                          {d.name} <span className="text-text-tertiary">{d.type.replace(/_/g, ' ')}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-text-tertiary">
                    It checks the result after each scheduled or full run and notifies only when the condition holds, once per run. Preview runs never send it. Groups cannot get alert emails: add their members or a destination.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">Schedule</h4>
                <Field label="Cron (Quartz)">
                  <input className={inputCls} value={spec.schedule.cron} onChange={(e) => patch('schedule.cron', e.target.value)} />
                  {String(spec.schedule.cron || '').trim() && cronProblem(spec.schedule.cron) ? (
                    <p className="text-[11px] text-error">Not a valid Quartz cron: {cronProblem(spec.schedule.cron)}</p>
                  ) : (
                    <p className="text-[11px] text-text-tertiary">Runs {cronInWords(spec.schedule.cron, spec.schedule.timezone)}{spec.schedule.enabled ? '' : ' once Keep it fresh is on'}</p>
                  )}
                </Field>
                <Field label="Timezone">
                  <input className={inputCls} value={spec.schedule.timezone} onChange={(e) => patch('schedule.timezone', e.target.value)} />
                </Field>
                <Field label="Failure emails (comma separated; default: the decision owner)">
                  <input
                    className={inputCls}
                    value={(spec.schedule.failure_emails || []).join(', ')}
                    onChange={(e) => patch('schedule.failure_emails', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  />
                </Field>
                {trainsModel && (
                  <div className="grid grid-cols-2 gap-2">
                    <ProfileInput spec={spec} path="retrain.every_runs" onChange={setProfile} />
                    <ProfileInput spec={spec} path="retrain.drift_threshold" onChange={setProfile} />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Field label="Share with">
                  <input className={inputCls} placeholder="Search users and groups" value={principalQ} onChange={(e) => setPrincipalQ(e.target.value)} />
                </Field>
                <div className="flex flex-wrap gap-1">
                  {(spec.sharing.principals || []).map((p) => (
                    <button
                      key={`${p.type}:${p.name}`}
                      type="button"
                      className="text-[11px] border border-border rounded-full px-2 py-0.5"
                      onClick={() => patch('sharing.principals', spec.sharing.principals.filter((x) => x.name !== p.name))}
                    >
                      {p.name} ×
                    </button>
                  ))}
                </div>
                {principals.map((p) => (
                  <button
                    key={`${p.type}:${p.name}`}
                    type="button"
                    className="block text-[11px] text-text-secondary hover:text-db-red"
                    onClick={() => {
                      if (spec.sharing.principals.some((x) => x.name === p.name && x.type === p.type)) return;
                      patch('sharing.principals', [...spec.sharing.principals, { type: p.type, name: p.name }]);
                    }}
                  >
                    {p.display} ({p.type})
                  </button>
                ))}
              </div>
              {plan && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                    {plan.based_on_version ? `Version ${plan.spec_version}, edited from version ${plan.based_on_version}` : `Version ${plan.spec_version}`}
                  </h4>
                  {planLines(plan.summary).map((line) => <p key={line} className="text-[12px] text-text-secondary">{line}</p>)}
                </div>
              )}
              {checkEntries.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                    Permission checks{preflight.identity ? `, run live as ${preflight.identity}` : ''}
                  </h4>
                  {checkEntries.map(([k, v]) => <CheckLine key={k} check={v} label={PREFLIGHT_LABELS[k] || k.replace(/_/g, ' ')} />)}
                </div>
              )}
              <p className="text-[11px] text-text-tertiary">Cost hint: {costHint(spec)}</p>
            </Advanced>
          </>
        )}
      </div>

      <footer className="border-t border-border px-6 py-3 space-y-2">
        {footerErrors.length > 0 && (
          <div role="alert" className="bg-error-bg border border-error/20 rounded-md px-3 py-2 space-y-0.5">
            {footerErrors.map((e) => <p key={e} className="text-xs text-error">{e}</p>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 min-h-10">
          <button
            type="button"
            className={`btn-secondary ${step === 0 ? 'invisible' : ''}`}
            disabled={step === 0 || busy}
            onClick={() => { setErrors([]); setStep(0); }}
          >
            <ChevronLeft size={14} /> Back
          </button>
          {stepId === 'data' ? (
            <button
              type="button"
              disabled={Boolean(checking)}
              className="btn-primary disabled:opacity-70"
              onClick={goNext}
            >
              {checking ? <><Loader2 size={14} className="animate-spin" /> {checking}…</> : <>Next <ChevronRight size={14} /></>}
            </button>
          ) : (
            <button
              type="button"
              disabled={implementBlocked}
              className="btn-primary"
              onClick={submit}
            >
              {(busy || checksBusy) && <Loader2 size={14} className="animate-spin" />}
              {busy ? 'Starting…' : checksBusy ? 'Checking access…' : 'Implement'}
            </button>
          )}
        </div>
      </footer>
    </Overlay>
  );
}

function ValuePicker({ label, values, selected, onLoad, onChange }) {
  const shown = values ? [...new Set([...selected, ...values])] : selected;
  const toggle = (value) => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-secondary">{label}</span>
        {!values && <button type="button" className="text-[11px] text-db-red" onClick={onLoad}>Load values</button>}
      </div>
      {values && values.length === 0 && <p className="text-[11px] text-text-tertiary">No values found in this column.</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 max-h-40 overflow-y-auto">
        {shown.map((value) => (
          <label key={value} className="flex items-center gap-1 text-[11px]">
            <input type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} />
            {value}
          </label>
        ))}
      </div>
      {values && values.length >= VALUE_LIMIT && <p className="text-[11px] text-text-tertiary">Showing the first {VALUE_LIMIT} values.</p>}
    </div>
  );
}

function Overlay({ title, step, onClose, children }) {
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-implement-overlay="">
        <div role="dialog" aria-modal="true" aria-label="Implement with Genie" className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-3xl max-h-full flex flex-col overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text-primary">Implement with Genie</h2>
              <p className="text-[11px] text-text-secondary truncate">{title}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ol className="flex items-center gap-2 text-[11px]">
                {IMPLEMENT_STEPS.map((item, i) => (
                  <li
                    key={item.id}
                    aria-current={i === step ? 'step' : undefined}
                    className={`px-2.5 py-1 rounded-full ${i === step ? 'bg-db-red-50 text-db-red font-semibold' : i < step ? 'text-text-primary' : 'text-text-tertiary'}`}
                  >
                    {i + 1}. {item.label}
                  </li>
                ))}
              </ol>
              <span className="sr-only">Step {step + 1} of {IMPLEMENT_STEPS.length}</span>
              <button type="button" onClick={onClose} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-subtle" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </header>
          {children}
        </div>
      </div>
    </BodyPortal>
  );
}
