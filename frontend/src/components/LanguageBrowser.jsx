import { Globe, Check } from 'lucide-react';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'fr', name: 'French', native: 'Francais' },
  { code: 'es', name: 'Spanish', native: 'Espanol' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', native: 'Portugues' },
  { code: 'ja', name: 'Japanese', native: 'Nihongo' },
  { code: 'zh', name: 'Chinese', native: 'Zhongwen' },
  { code: 'ko', name: 'Korean', native: 'Hangugeo' },
  { code: 'ar', name: 'Arabic', native: 'Arabi' },
  { code: 'hi', name: 'Hindi', native: 'Hindi' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
];

export default function LanguageBrowser({ selected = 'en', onSelect }) {
  return (
    <div className="bg-surface border-t border-border">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-db-red" />
          <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">
            Language
          </h4>
        </div>
      </div>

      {/* Language list */}
      <div className="p-2 max-h-48 overflow-y-auto">
        {LANGUAGES.map((lang) => {
          const active = selected === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => onSelect?.(lang.code)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm transition-smooth mb-0.5
                ${active
                  ? 'bg-db-red-50 text-text-primary glow-active'
                  : 'text-text-secondary hover:bg-bg-subtle hover:text-text-primary glow-hover'
                }
              `}
            >
              <span className="font-mono text-xs text-text-tertiary w-5">{lang.code}</span>
              <span className="flex-1 text-left font-medium">{lang.name}</span>
              <span className="text-xs text-text-tertiary">{lang.native}</span>
              {active && <Check size={14} className="text-db-red ml-1" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
