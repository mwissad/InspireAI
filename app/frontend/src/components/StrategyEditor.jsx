import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Plus, Trash2 } from 'lucide-react';
import {
  KPI_DIRECTIONS,
  STRATEGY_LAYERS,
  STRATEGY_MAX_DEPTH,
  STRATEGY_MAX_ENTRIES,
  countEntries,
  emptyEntry,
  emptyStrategy,
  isEmptyStrategy,
  parseStrategicContext,
  serializeStrategy,
  validateStrategy,
} from '../lib/strategyContext';

const inputClass =
  'w-full px-2.5 py-1.5 text-xs border border-border rounded-md bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth';
const smallButton =
  'inline-flex shrink-0 items-center gap-1 whitespace-nowrap px-2 py-1 rounded-md text-[11px] font-medium border border-border text-text-secondary hover:border-border-strong transition-smooth';

const layerName = (depth) => STRATEGY_LAYERS[depth - 1] || `Level ${depth}`;
const samePath = (a, b) => Boolean(a && b) && a.length === b.length && a.every((v, i) => v === b[i]);

function replaceAt(list, index, item) {
  return list.map((current, i) => (i === index ? item : current));
}

function flatten(entries, path = []) {
  return (entries || []).flatMap((entry, index) => {
    const here = [...path, index];
    return [{ entry, path: here }, ...flatten(entry.children, here)];
  });
}

function entryAt(entries, path) {
  let node = null;
  let list = entries;
  for (const index of path || []) {
    node = (list || [])[index];
    if (!node) return null;
    list = node.children;
  }
  return node;
}

function updateAt(entries, path, change) {
  const [head, ...rest] = path;
  return entries.map((entry, i) => {
    if (i !== head) return entry;
    return rest.length ? { ...entry, children: updateAt(entry.children, rest, change) } : change(entry);
  });
}

function removeAt(entries, path) {
  const [head, ...rest] = path;
  if (!rest.length) return entries.filter((_, i) => i !== head);
  return entries.map((entry, i) => (i === head ? { ...entry, children: removeAt(entry.children, rest) } : entry));
}

function Column({ title, hint, footer, children }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 mb-2 min-w-0">
        <span className="text-[11px] font-semibold text-text-secondary shrink-0">{title}</span>
        {hint && <span className="text-[10px] text-text-tertiary truncate" title={hint}>{hint}</span>}
      </div>
      <div className="rounded-lg border border-border bg-bg overflow-hidden flex flex-col">
        <div className="max-h-[min(24rem,60vh)] min-h-[9rem] overflow-y-auto p-1.5 space-y-1.5">{children}</div>
        {footer && <div className="border-t border-border p-1.5 bg-bg-subtle/40 flex gap-1.5">{footer}</div>}
      </div>
    </div>
  );
}

function Placeholder({ children }) {
  return <p className="text-[10px] text-text-tertiary p-2 text-center">{children}</p>;
}

export default function StrategyEditor({ value, onChange, onProblems }) {
  const [initial] = useState(() => parseStrategicContext(value));
  const [model, setModel] = useState(() => (initial.mode === 'tree' ? { ...initial.model, priorities: [] } : emptyStrategy()));
  const [loadError, setLoadError] = useState(initial.error);
  const [selected, setSelected] = useState(() => (initial.mode === 'tree' && initial.model.strategy.length ? [0] : null));

  const problems = useMemo(() => validateStrategy(model), [model]);
  const loadedModel = useRef(model);

  useEffect(() => {
    if (model !== loadedModel.current) onChange(serializeStrategy(model));
    if (onProblems) onProblems(problems);
  }, [model, problems]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = flatten(model.strategy);
  const current = selected ? entryAt(model.strategy, selected) : null;
  const currentLabel = current ? `${layerName(selected.length)}: ${current.name.trim() || 'unnamed'}` : '';

  const editEntry = (path, change) => setModel((m) => ({ ...m, strategy: updateAt(m.strategy, path, change) }));
  const editCurrent = (patch) => editEntry(selected, (entry) => ({ ...entry, ...patch }));

  const addTopLevel = () => {
    setModel((m) => ({ ...m, strategy: [...m.strategy, emptyEntry()] }));
    setSelected([model.strategy.length]);
  };
  const addChild = (path, entry) => {
    editEntry(path, (e) => ({ ...e, children: [...e.children, emptyEntry()] }));
    setSelected([...path, entry.children.length]);
  };
  const removeEntry = (path) => {
    setModel((m) => ({ ...m, strategy: removeAt(m.strategy, path) }));
    setSelected(path.length > 1 ? path.slice(0, -1) : null);
  };

  const kpiNames = current ? current.kpis.map((k) => k.name.trim()).filter(Boolean) : [];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-text-secondary leading-relaxed">
        Applied after discovery: Inspire aligns each final use case to this strategy with evidence from its own data, adds
        KPIs, key results and benefits, and orders the results. The strategy is never used to find, keep or remove a use case.
      </p>
      {initial.mode === 'path' && (
        <p className="text-[11px] text-text-secondary leading-relaxed">
          This strategy comes from the file <span className="font-mono text-text-primary">{initial.path}</span>. Entries you add here replace it.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Column
          title="Strategy entries"
          hint={`${countEntries(model.strategy)} of ${STRATEGY_MAX_ENTRIES} · ${STRATEGY_LAYERS.join(' › ')}`}
          footer={
            <button type="button" onClick={addTopLevel} className={smallButton}>
              <Plus size={12} /> {STRATEGY_LAYERS[0]}
            </button>
          }
        >
          {rows.length === 0 ? (
            <Placeholder>Add a {STRATEGY_LAYERS[0].toLowerCase()} to start</Placeholder>
          ) : (
            rows.map(({ entry, path }) => {
              const active = samePath(path, selected);
              const depth = path.length;
              return (
                <div
                  key={path.join('.')}
                  onClick={() => setSelected(path)}
                  className={`rounded-md px-1.5 py-1.5 border cursor-pointer transition-smooth space-y-1 ${
                    active ? 'bg-db-red-50 border-db-red/20' : 'border-transparent hover:bg-bg-subtle'
                  }`}
                  style={{ marginLeft: `${(depth - 1) * 0.875}rem` }}
                >
                  <div className="flex items-center gap-1">
                    <span className={`text-[9px] uppercase tracking-wider ${active ? 'text-db-red' : 'text-text-tertiary'}`}>
                      {layerName(depth)}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      {depth < STRATEGY_MAX_DEPTH && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addChild(path, entry);
                          }}
                          className={smallButton}
                          title={`Add a ${layerName(depth + 1).toLowerCase()} under this ${layerName(depth).toLowerCase()}`}
                        >
                          <Plus size={11} /> {layerName(depth + 1)}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEntry(path);
                        }}
                        className={smallButton}
                        title="Remove this entry and everything under it"
                      >
                        <Trash2 size={11} />
                      </button>
                    </span>
                  </div>
                  <input
                    value={entry.name}
                    onFocus={() => setSelected(path)}
                    onChange={(e) => editEntry(path, (en) => ({ ...en, name: e.target.value }))}
                    placeholder="Name, in your own words"
                    className={inputClass}
                  />
                </div>
              );
            })
          )}
        </Column>

        <Column
          title="KPIs"
          hint={currentLabel}
          footer={
            current && (
              <button
                type="button"
                onClick={() => editCurrent({ kpis: [...current.kpis, { name: '', unit: '', direction: '', definition: '' }] })}
                className={smallButton}
              >
                <Plus size={12} /> KPI
              </button>
            )
          }
        >
          {!current ? (
            <Placeholder>Select an entry first</Placeholder>
          ) : current.kpis.length === 0 ? (
            <Placeholder>No KPIs yet</Placeholder>
          ) : (
            current.kpis.map((kpi, k) => (
              <div key={`kpi-${k}`} className="rounded-md border border-border bg-surface p-1.5 space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={kpi.name}
                    onChange={(e) => editCurrent({ kpis: replaceAt(current.kpis, k, { ...kpi, name: e.target.value }) })}
                    placeholder="KPI name, e.g. Repeat purchase rate"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => editCurrent({ kpis: current.kpis.filter((_, i) => i !== k) })}
                    className={smallButton}
                    title="Remove this KPI"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={kpi.unit}
                    onChange={(e) => editCurrent({ kpis: replaceAt(current.kpis, k, { ...kpi, unit: e.target.value }) })}
                    placeholder="Unit, e.g. %"
                    className={inputClass}
                  />
                  <select
                    value={kpi.direction}
                    onChange={(e) => editCurrent({ kpis: replaceAt(current.kpis, k, { ...kpi, direction: e.target.value }) })}
                    className={inputClass}
                  >
                    <option value="">Direction</option>
                    {KPI_DIRECTIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={kpi.definition}
                  onChange={(e) => editCurrent({ kpis: replaceAt(current.kpis, k, { ...kpi, definition: e.target.value }) })}
                  placeholder="Definition (optional)"
                  className={inputClass}
                />
              </div>
            ))
          )}
        </Column>

        <Column
          title="Key results"
          hint={currentLabel}
          footer={
            current && (
              <button
                type="button"
                onClick={() => editCurrent({ key_results: [...current.key_results, { statement: '', kpi: '' }] })}
                className={smallButton}
              >
                <Plus size={12} /> Key result
              </button>
            )
          }
        >
          {!current ? (
            <Placeholder>Select an entry first</Placeholder>
          ) : current.key_results.length === 0 ? (
            <Placeholder>No key results yet</Placeholder>
          ) : (
            current.key_results.map((result, r) => (
              <div key={`kr-${r}`} className="rounded-md border border-border bg-surface p-1.5 space-y-1.5">
                <div className="flex gap-1.5">
                  <input
                    value={result.statement}
                    onChange={(e) =>
                      editCurrent({ key_results: replaceAt(current.key_results, r, { ...result, statement: e.target.value }) })
                    }
                    placeholder="e.g. Raise repeat purchase rate from 18% to 24%"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => editCurrent({ key_results: current.key_results.filter((_, i) => i !== r) })}
                    className={smallButton}
                    title="Remove this key result"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <select
                  value={result.kpi}
                  onChange={(e) => editCurrent({ key_results: replaceAt(current.key_results, r, { ...result, kpi: e.target.value }) })}
                  className={inputClass}
                >
                  <option value="">Measured by KPI (optional)</option>
                  {kpiNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            ))
          )}
        </Column>
      </div>

      <div>
        <p className="text-xs font-semibold text-text-primary mb-1.5">Sponsor roster</p>
        <div className="space-y-1.5">
          {model.sponsors.map((sponsor, index) => (
            <div key={`sponsor-${index}`} className="grid grid-cols-12 gap-1.5">
              <input
                value={sponsor.role}
                onChange={(e) => setModel((m) => ({ ...m, sponsors: replaceAt(m.sponsors, index, { ...sponsor, role: e.target.value }) }))}
                placeholder="Role, e.g. Chief Customer Officer"
                className={`${inputClass} col-span-3`}
              />
              <input
                value={sponsor.name}
                onChange={(e) => setModel((m) => ({ ...m, sponsors: replaceAt(m.sponsors, index, { ...sponsor, name: e.target.value }) }))}
                placeholder="Name (optional)"
                className={`${inputClass} col-span-2`}
              />
              <input
                value={sponsor.reports_to}
                onChange={(e) =>
                  setModel((m) => ({ ...m, sponsors: replaceAt(m.sponsors, index, { ...sponsor, reports_to: e.target.value }) }))
                }
                placeholder="Reports to (role)"
                className={`${inputClass} col-span-3`}
              />
              <input
                value={sponsor.owns.join(', ')}
                onChange={(e) =>
                  setModel((m) => ({
                    ...m,
                    sponsors: replaceAt(m.sponsors, index, { ...sponsor, owns: e.target.value.split(',').map((s) => s.trimStart()) }),
                  }))
                }
                placeholder="Owns: entries or domains, comma-separated"
                className={`${inputClass} col-span-3`}
              />
              <button
                type="button"
                onClick={() => setModel((m) => ({ ...m, sponsors: m.sponsors.filter((_, i) => i !== index) }))}
                className={`${smallButton} col-span-1 justify-center`}
                title="Remove this sponsor"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setModel((m) => ({ ...m, sponsors: [...m.sponsors, { role: '', name: '', reports_to: '', owns: [] }] }))}
            className={smallButton}
          >
            <Plus size={12} /> Sponsor
          </button>
        </div>
      </div>

      {!isEmptyStrategy(model) && (
        <button
          type="button"
          onClick={() => {
            setModel(emptyStrategy());
            setSelected(null);
            setLoadError(null);
          }}
          className={smallButton}
        >
          <Trash2 size={12} /> Clear strategy
        </button>
      )}

      {(loadError || problems.length > 0) && (
        <div className="rounded-lg border border-db-red/30 bg-db-red-50 px-3 py-2 space-y-1">
          {[loadError, ...problems].filter(Boolean).slice(0, 8).map((problem) => (
            <p key={problem} className="text-[11px] text-db-red flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              {problem}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
