/**
 * Equal-height segmented buttons. Use for Quality, Genie scope, and similar enums.
 */
export default function SegmentedControl({ options, value, onChange, ariaLabel }) {
  return (
    <div className="seg-track" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const key = opt.value ?? opt;
        const label = opt.label ?? opt;
        const active = String(value) === String(key);
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            onClick={() => onChange(key)}
            className={`seg-btn${active ? ' is-active' : ''}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
