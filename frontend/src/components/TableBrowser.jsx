import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Database,
  Table2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Filter,
  Layers,
} from 'lucide-react';

export default function TableBrowser({
  token,
  selectedTables = [],
  onSelectTable,
}) {
  const [catalogs, setCatalogs] = useState([]);
  const [expanded, setExpanded] = useState({});      // { catalogName: true/false }
  const [schemas, setSchemas] = useState({});          // { catalogName: [schema...] }
  const [expandedSchemas, setExpandedSchemas] = useState({}); // { "catalog.schema": true }
  const [tables, setTables] = useState({});            // { "catalog.schema": [table...] }
  const [loading, setLoading] = useState({});
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [error, setError] = useState(null);

  const apiFetch = useCallback(async (url) => {
    const headers = {};
    if (token) { headers['Authorization'] = `Bearer ${token}`; headers['X-DB-PAT-Token'] = token; }
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    return resp.json();
  }, [token]);

  // Load catalogs on mount (token not required in Databricks App mode — proxy handles auth)
  useEffect(() => {
    setError(null);
    apiFetch('/api/catalogs')
      .then((d) => setCatalogs(d.catalogs || []))
      .catch((e) => setError(e.message));
  }, [token, apiFetch]);

  const toggleCatalog = async (catalogName) => {
    const isOpen = expanded[catalogName];
    setExpanded((prev) => ({ ...prev, [catalogName]: !isOpen }));
    if (!isOpen && !schemas[catalogName]) {
      setLoading((p) => ({ ...p, [catalogName]: true }));
      try {
        const d = await apiFetch(`/api/catalogs/${encodeURIComponent(catalogName)}/schemas`);
        setSchemas((p) => ({ ...p, [catalogName]: d.schemas || [] }));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading((p) => ({ ...p, [catalogName]: false }));
      }
    }
  };

  const toggleSchema = async (catalogName, schemaName) => {
    const key = `${catalogName}.${schemaName}`;
    const isOpen = expandedSchemas[key];
    setExpandedSchemas((p) => ({ ...p, [key]: !isOpen }));
    if (!isOpen && !tables[key]) {
      setLoading((p) => ({ ...p, [key]: true }));
      try {
        const d = await apiFetch(
          `/api/tables/${encodeURIComponent(catalogName)}/${encodeURIComponent(schemaName)}`
        );
        setTables((p) => ({ ...p, [key]: d.tables || [] }));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading((p) => ({ ...p, [key]: false }));
      }
    }
  };

  const isSelected = (fullName) => selectedTables.includes(fullName);

  const filterTables = (tbls) => {
    let filtered = tbls;
    if (filterType !== 'ALL') {
      filtered = filtered.filter((t) => t.table_type === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.full_name || '').toLowerCase().includes(q) ||
          (t.comment || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  if (!token && catalogs.length === 0 && error) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-text-tertiary text-sm">
        Could not load catalogs. Check your connection settings.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Layers size={16} className="text-db-red" />
          <h3 className="text-sm font-semibold text-text-primary">Table Browser</h3>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tables..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-border rounded-md bg-bg text-text-primary placeholder:text-text-tertiary transition-smooth"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-1.5">
          <Filter size={12} className="text-text-tertiary" />
          {['ALL', 'MANAGED', 'EXTERNAL', 'VIEW'].map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded transition-smooth
                ${filterType === f
                  ? 'bg-db-red text-white'
                  : 'text-text-secondary hover:bg-bg-subtle'
                }`}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-2 p-2 bg-error-bg text-error text-xs rounded-md">
          {error}
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {catalogs.length === 0 && !error && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin text-text-tertiary" />
            <span className="ml-2 text-sm text-text-tertiary">Loading catalogs...</span>
          </div>
        )}

        {catalogs.map((cat) => (
          <div key={cat.name} className="mb-0.5">
            {/* Catalog node */}
            <button
              onClick={() => toggleCatalog(cat.name)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm text-text-primary hover:bg-bg-subtle transition-smooth group"
            >
              {expanded[cat.name]
                ? <ChevronDown size={14} className="text-text-tertiary" />
                : <ChevronRight size={14} className="text-text-tertiary" />
              }
              <Database size={14} className="text-text-secondary group-hover:text-db-red transition-smooth" />
              <span className="font-medium truncate">{cat.name}</span>
              {loading[cat.name] && (
                <Loader2 size={12} className="ml-auto animate-spin text-text-tertiary" />
              )}
            </button>

            {/* Schemas */}
            {expanded[cat.name] && schemas[cat.name] && (
              <div className="ml-4">
                {schemas[cat.name].map((sch) => {
                  const schKey = `${cat.name}.${sch.name}`;
                  return (
                    <div key={sch.name} className="mb-0.5">
                      <button
                        onClick={() => toggleSchema(cat.name, sch.name)}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-subtle transition-smooth"
                      >
                        {expandedSchemas[schKey]
                          ? <ChevronDown size={12} className="text-text-tertiary" />
                          : <ChevronRight size={12} className="text-text-tertiary" />
                        }
                        <span className="truncate">{sch.name}</span>
                        {loading[schKey] && (
                          <Loader2 size={10} className="ml-auto animate-spin text-text-tertiary" />
                        )}
                      </button>

                      {/* Tables */}
                      {expandedSchemas[schKey] && tables[schKey] && (
                        <div className="ml-5">
                          {filterTables(tables[schKey]).length === 0 ? (
                            <div className="px-2 py-1 text-xs text-text-tertiary">
                              No matching tables
                            </div>
                          ) : (
                            filterTables(tables[schKey]).map((tbl) => {
                              const selected = isSelected(tbl.full_name);
                              return (
                                <button
                                  key={tbl.name}
                                  onClick={() => onSelectTable?.(tbl)}
                                  className={`
                                    w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-smooth mb-px
                                    ${selected
                                      ? 'bg-db-red-50 border border-db-red/20 glow-active text-text-primary'
                                      : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary glow-hover border border-transparent'
                                    }
                                  `}
                                >
                                  <Table2
                                    size={12}
                                    className={selected ? 'text-db-red' : 'text-text-tertiary'}
                                  />
                                  <span className="truncate flex-1 text-left">{tbl.name}</span>
                                  <span className="text-[10px] text-text-tertiary font-mono">
                                    {tbl.table_type === 'VIEW' ? 'VIEW' : tbl.data_source_format || ''}
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Selection summary */}
      {selectedTables.length > 0 && (
        <div className="px-4 py-2.5 border-t border-border bg-bg">
          <div className="text-xs text-text-secondary">
            <span className="font-medium text-db-red">{selectedTables.length}</span> table{selectedTables.length !== 1 ? 's' : ''} selected
          </div>
        </div>
      )}
    </div>
  );
}
