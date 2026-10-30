export function tabPanel(idBase, id, current) {
  return { role: 'tabpanel', id: `${idBase}-panel-${id}`, 'aria-labelledby': `${idBase}-tab-${id}`, hidden: current !== id };
}

export default function TabStrip({ label, idBase, tabs, current, onPick }) {
  const keys = (e) => {
    const i = tabs.findIndex((t) => t.id === current);
    const step = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const id = tabs[(step + tabs.length) % tabs.length].id;
    onPick(id);
    document.getElementById(`${idBase}-tab-${id}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={keys} className="flex flex-wrap gap-x-5 gap-y-1 border-b border-border">
      {tabs.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${idBase}-tab-${t.id}`}
            data-tab={t.id}
            aria-selected={current === t.id}
            aria-controls={`${idBase}-panel-${t.id}`}
            aria-label={t.ariaLabel}
            tabIndex={current === t.id ? 0 : -1}
            onClick={() => onPick(t.id)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-1.5 text-xs font-semibold glow-focus ${current === t.id ? 'border-db-red text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {t.label}
            {t.mark}
          </button>
        );
      })}
    </div>
  );
}
