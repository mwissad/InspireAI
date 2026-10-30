import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  DOCUMENT_LANGUAGES_GROUPED,
  parseDocumentLanguages,
  formatDocumentLanguages,
} from '../constants/documentLanguages';

/**
 * Multiselect for notebook widget `12_documents_languages`.
 * @param {string} value - Comma-separated language names
 * @param {(next: string) => void} onChange
 */
export default function DocumentLanguagesMultiselect({
  value,
  onChange,
  disabled = false,
}) {
  const [search, setSearch] = useState('');
  const selected = useMemo(() => parseDocumentLanguages(value), [value]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return DOCUMENT_LANGUAGES_GROUPED;
    return DOCUMENT_LANGUAGES_GROUPED.map((g) => ({
      ...g,
      items: g.items.filter((lang) => lang.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [search]);

  const toggle = (lang) => {
    if (disabled) return;
    const next = selected.includes(lang)
      ? selected.filter((l) => l !== lang)
      : [...selected, lang];
    onChange(formatDocumentLanguages(next));
  };

  return (
    <div className="rounded-lg border border-border bg-bg-subtle/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-tertiary">
          {selected.length} selected · 23 languages supported
        </p>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search languages..."
          disabled={disabled}
          className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth disabled:opacity-50"
        />
      </div>

      <div className="max-h-44 overflow-y-auto pr-0.5">
        {filteredGroups.map((group) => (
          <div key={group.group} className="mb-3 last:mb-0">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 text-text-tertiary">
              {group.group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {group.items.map((lang) => {
                const sel = selected.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(lang)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-smooth disabled:opacity-50 ${
                      sel
                        ? 'border-db-red/30 bg-db-red-50 text-db-red-fg'
                        : 'border-border text-text-secondary hover:border-border-strong bg-surface'
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
        {filteredGroups.length === 0 && (
          <p className="text-xs text-text-tertiary">
            No languages match your search.
          </p>
        )}
      </div>
    </div>
  );
}
