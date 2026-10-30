export function paletteVars(palette, theme) {
  const p = palette ? palette[theme === 'dark' ? 'dark' : 'light'] : null;
  if (!p || !p.base || !p.hues) return null;
  const vars = {};
  for (const [key, value] of Object.entries(p.base)) vars[`--pv-${key}`] = value;
  Object.entries(p.hues).forEach(([name, hue], i) => {
    for (const [key, value] of Object.entries(hue)) {
      vars[`--pv-h${i}-${key}`] = value;
      vars[`--pv-${name}-${key}`] = value;
    }
  });
  return vars;
}

export const pv = (name) => `var(--pv-${name})`;

const SERIF = { fontFamily: 'Georgia, "Times New Roman", serif' };
const KPIS = [
  { label: 'To fix', value: '128', hue: 'coral' },
  { label: 'Could save', value: '$412K', hue: 'amber' },
  { label: 'Fixed so far', value: '37', hue: 'green' },
  { label: 'Saved so far', value: '$96K', hue: 'teal' },
];
const TIER_HUES = { 'Act now': 'coral', Review: 'amber', Monitor: 'slate' };
const RECORDS = [
  ['R-1042', 'Act now', 'Value fell 38% below its 8 week average', '$12,400'],
  ['R-0977', 'Act now', '3 missed updates in the last 10 days', '$9,850'],
  ['R-1310', 'Review', 'Drifting away from its usual range', '$4,120'],
];
const TREND = [18, 22, 19, 27, 31, 29, 36, 41];
const SEGMENTS = [['Segment A', 142], ['Segment B', 118], ['Segment C', 96], ['Segment D', 56]];
const TIERS = [['Act now', 24], ['Review', 61], ['Monitor', 43]];
const RUNS = [
  ['Oct 27, 06:00', 'All records', '48,210', '128'],
  ['Oct 20, 06:00', 'All records', '47,935', '119'],
  ['Oct 13, 06:00', 'All records', '47,402', '131'],
  ['Oct 12, 14:22', 'Preview, 500 records', '500', '9'],
];
const ALERTS = [
  ['Act now records at least 1', 'Daily at 06:00', 'Emails 2 people', 'OK', 'green'],
  ['Could save above $250K', 'Weekly on Monday', 'Emails 1 person', 'Triggered', 'coral'],
];
const IMPACT = [
  ['Estimated', '$412K', 'Money at stake on 128 open records', 'amber'],
  ['Reported', '$96K', 'Amounts people entered when they fixed records', 'teal'],
  ['Measured', '$71K', 'At stake when fixed, less what later runs still flag', 'green'],
];

const Chip = ({ hue, children }) => (
  <span className="inline-block rounded-full px-1.5 text-[8.5px] font-semibold leading-[14px]" style={{ background: pv(`${hue}-bg`), color: pv(`${hue}-ink`) }}>{children}</span>
);

function Card({ look, title, hue = 'blue', explain = false, className = '', children }) {
  const body = look.style === 'c' ? { background: pv('well') } : { background: pv('card'), border: `1px solid ${pv('line')}` };
  const head = look.style === 'b'
    ? { background: pv(`${hue}-bg`), color: pv(`${hue}-ink`), borderBottom: `1px solid ${pv('line')}` }
    : { color: pv('ink') };
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${look.style === 'a' ? 'rounded-[4px]' : 'rounded-[8px]'} ${className}`} style={body}>
      <div className="flex items-center justify-between gap-1 px-2 py-1" style={head}>
        <span className="truncate text-[9px] font-semibold" style={look.style === 'c' ? SERIF : undefined}>{title}</span>
        {explain && <span className="shrink-0 rounded-full px-1.5 text-[8px] leading-[13px]" style={{ border: `1px solid ${pv('line-strong')}`, color: pv('ink'), background: pv('card') }}>Explain</span>}
      </div>
      <div className="min-h-0 flex-1 px-2 pb-1.5">{children}</div>
    </div>
  );
}

function Trend() {
  const max = Math.max(...TREND);
  const points = TREND.map((v, i) => `${(i / (TREND.length - 1)) * 100},${38 - (v / max) * 34}`).join(' ');
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
      <polygon points={`0,40 ${points} 100,40`} style={{ fill: pv('brand-wash') }} />
      <polyline points={points} fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" style={{ stroke: pv('brand') }} />
    </svg>
  );
}

function Bars({ pareto = false }) {
  const max = Math.max(...SEGMENTS.map(([, v]) => v));
  const total = SEGMENTS.reduce((s, [, v]) => s + v, 0);
  let run = 0;
  const line = SEGMENTS.map(([, v], i) => { run += v; return `${((i + 0.5) / SEGMENTS.length) * 100},${38 - (run / total) * 34}`; }).join(' ');
  if (pareto) {
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
        {SEGMENTS.map(([, v], i) => (
          <rect key={i} x={i * 25 + 4} width="17" y={38 - (v / max) * 30} height={(v / max) * 30} style={{ fill: pv('blue-line') }} />
        ))}
        <polyline points={line} fill="none" strokeWidth="1.4" vectorEffect="non-scaling-stroke" style={{ stroke: pv('amber-line') }} />
      </svg>
    );
  }
  return (
    <div className="space-y-[3px] pt-0.5">
      {SEGMENTS.map(([name, v]) => (
        <div key={name} className="flex items-center gap-1.5">
          <span className="w-[52px] shrink-0 truncate text-[8.5px] leading-tight" style={{ color: pv('muted') }}>{name}</span>
          <span className="block h-[7px] rounded-[2px]" style={{ width: `${(v / max) * 100}%`, maxWidth: 'calc(100% - 82px)', background: pv('green-line') }} />
          <span className="text-[8.5px] leading-tight" style={{ color: pv('ink') }}>${v}K</span>
        </div>
      ))}
    </div>
  );
}

function Donut() {
  const total = TIERS.reduce((s, [, v]) => s + v, 0);
  const colors = { 'Act now': pv('brand'), Review: pv('amber-line'), Monitor: pv('slate-line') };
  let offset = 0;
  return (
    <div className="flex h-full items-center gap-2">
      <svg viewBox="0 0 36 36" className="block h-[46px] w-[46px] shrink-0 -rotate-90" aria-hidden="true">
        {TIERS.map(([name, v]) => {
          const dash = (v / total) * 88;
          const arc = <circle key={name} cx="18" cy="18" r="14" fill="none" strokeWidth="6" strokeDasharray={`${dash} ${88 - dash}`} strokeDashoffset={-offset} style={{ stroke: colors[name] }} />;
          offset += dash;
          return arc;
        })}
      </svg>
      <div className="space-y-0.5">
        {TIERS.map(([name, v]) => <p key={name} className="text-[8.5px] leading-tight" style={{ color: pv('ink') }}><Chip hue={TIER_HUES[name]}>{name}</Chip> {v}</p>)}
      </div>
    </div>
  );
}

function Scatter() {
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-full w-full" aria-hidden="true">
      {SEGMENTS.map(([, v], i) => SEGMENTS.map(([, w], j) => (
        <circle key={`${i}-${j}`} cx={8 + ((i * 4 + j) / 15) * 84} cy={36 - ((v * (j + 1)) / (w * 4 + v)) * 30} r="1.6"
          style={{ fill: pv('coral-line') }} />
      )))}
    </svg>
  );
}

const CHART_CARDS = {
  trend: ['To fix by week', 'blue', () => <Trend />],
  bars: ['Could save by segment', 'green', () => <Bars />],
  split: ['Records by tier', 'amber', () => <Donut />],
  pareto: ['Where most of the money sits', 'violet', () => <Bars pareto />],
  scatter: ['Money against records', 'coral', () => <Scatter />],
};

function Kpis({ look }) {
  if (look.style === 'c') {
    return (
      <div className="grid grid-cols-4" style={{ borderTop: `1px solid ${pv('line')}`, borderBottom: `1px solid ${pv('line')}` }}>
        {KPIS.map((k, i) => (
          <div key={k.label} className="px-2 py-1" style={i ? { borderLeft: `1px solid ${pv('line')}` } : undefined}>
            <p className="text-[8.5px]" style={{ color: pv('muted') }}>{k.label}</p>
            <p className="text-[16px] font-semibold leading-tight" style={{ ...SERIF, color: pv(`${k.hue}-ink`) }}>{k.value}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {KPIS.map((k) => {
        const tinted = look.style === 'b';
        const box = tinted
          ? { background: pv(`${k.hue}-bg`), border: `1px solid ${pv('line')}`, boxShadow: `inset 3px 0 0 ${pv(`${k.hue}-line`)}` }
          : { background: pv('card'), border: `1px solid ${pv('line')}`, boxShadow: `inset 0 -2px 0 ${pv(`${k.hue}-line`)}` };
        return (
          <div key={k.label} className={`px-2 py-1 ${tinted ? 'rounded-[8px]' : 'rounded-[4px]'}`} style={box}>
            <p className="text-[8.5px] font-medium" style={{ color: tinted ? pv(`${k.hue}-ink`) : pv('muted') }}>{k.label}</p>
            <p className="text-[13px] font-bold leading-tight" style={{ color: tinted ? pv(`${k.hue}-ink`) : pv('ink') }}>{k.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function Table({ look, title, head, rows }) {
  return (
    <Card look={{ ...look, style: look.style === 'c' ? 'a' : look.style }} title={title} hue="slate">
      <table className="w-full table-fixed text-left">
        <thead><tr>{head.map(([label, width]) => <th key={label} className="pb-0.5 text-[8px] font-medium" style={{ color: pv('muted'), width }}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} style={{ borderTop: `1px solid ${pv('line')}` }}>
              {cells.map((cell, c) => <td key={c} className="truncate py-[2px] pr-1 text-[8.5px]" style={{ color: pv('ink') }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PageTitle({ look, title, sub }) {
  return (
    <div className="min-w-0">
      <p className={`truncate font-semibold leading-tight ${look.style === 'c' ? 'text-[14px]' : 'text-[11px]'}`} style={{ color: pv('ink'), ...(look.style === 'c' ? SERIF : {}) }}>{title}</p>
      <p className="truncate text-[8.5px]" style={{ color: pv('muted') }}>{sub}</p>
    </div>
  );
}

function FixPage({ look, title, compact }) {
  return (
    <>
      <PageTitle look={look} title={title} sub="Updated Oct 27, 06:00 · 128 records to fix" />
      <Kpis look={look} />
      {!compact && (
        <div className="grid h-[62px] grid-cols-2 gap-1.5">
          <Card look={look} title="To fix by week" hue="blue" explain><Trend /></Card>
          <Card look={look} title="Records by tier" hue="amber" explain><Donut /></Card>
        </div>
      )}
      <Table look={look} title="Things to fix" head={[['Record', '16%'], ['Tier', '17%'], ['Why Inspire flagged it', '49%'], ['At stake', '18%']]}
        rows={RECORDS.map(([id, tier, why, money]) => [id, <Chip key={id} hue={TIER_HUES[tier]}>{tier}</Chip>, why, money])} />
    </>
  );
}

function Body({ look, view, title, charts }) {
  if (view === 'charts') {
    const shown = charts.filter((id) => CHART_CARDS[id]);
    return (
      <>
        <PageTitle look={look} title={title} sub="Charts drawn from this use case's results" />
        <div className={`grid min-h-0 flex-1 auto-rows-fr gap-1.5 ${shown.length > 4 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {shown.map((id) => {
            const [name, hue, Draw] = CHART_CARDS[id];
            return <Card key={id} look={look} title={name} hue={hue} explain><Draw /></Card>;
          })}
        </div>
      </>
    );
  }
  if (view === 'runs') {
    return (
      <>
        <PageTitle look={look} title="Runs" sub="Every run of the notebook, newest first" />
        <Table look={look} title="Runs" head={[['When', '24%'], ['Status', '15%'], ['What it covered', '31%'], ['Records', '15%'], ['To fix', '15%']]}
          rows={RUNS.map(([when, covered, records, fix]) => [when, <Chip key={when} hue="green">Done</Chip>, covered, records, fix])} />
        <Card look={look} title="Tables read in the Oct 27 run" hue="slate">
          <p className="text-[8.5px]" style={{ color: pv('ink') }}>2 tables, 48,210 rows, updated Oct 27, 05:40</p>
        </Card>
      </>
    );
  }
  if (view === 'alerts') {
    return (
      <>
        <PageTitle look={look} title="Alerts" sub="Email alerts on this use case, each on its own schedule" />
        {ALERTS.map(([what, when, who, state, hue]) => (
          <Card key={what} look={look} title={what} hue={hue}>
            <p className="flex items-center gap-1.5 text-[8.5px]" style={{ color: pv('ink') }}><span>{when}</span><span style={{ color: pv('muted') }}>·</span><span>{who}</span><Chip hue={hue}>{state}</Chip></p>
          </Card>
        ))}
        <span className="self-start rounded-full px-2 text-[8.5px] leading-[16px]" style={{ border: `1px solid ${pv('line-strong')}`, color: pv('ink'), background: pv('card') }}>New alert</span>
      </>
    );
  }
  if (view === 'impact') {
    return (
      <>
        <PageTitle look={look} title="Impact" sub="What the use case delivered" />
        <div className="grid grid-cols-3 gap-1.5">
          {IMPACT.map(([label, value, sub, hue]) => (
            <Card key={label} look={look} title={label} hue={hue}>
              <p className="text-[14px] font-bold leading-tight" style={{ color: pv(`${hue}-ink`), ...(look.style === 'c' ? SERIF : {}) }}>{value}</p>
              <p className="text-[8px] leading-snug" style={{ color: pv('muted') }}>{sub}</p>
            </Card>
          ))}
        </div>
        <p className="text-[8.5px]" style={{ color: pv('muted') }}>The three are never added together.</p>
        <Card look={look} title="Saved by month" hue="green" className="h-[64px]" explain><Trend /></Card>
      </>
    );
  }
  return <FixPage look={look} title={title} compact={view === 'genie' || look.layout === 'home'} />;
}

function GeniePanel() {
  return (
    <div className="flex w-[38%] shrink-0 flex-col gap-1.5 p-2" style={{ background: pv('card'), borderLeft: `1px solid ${pv('line')}` }}>
      <p className="text-[10px] font-semibold" style={{ color: pv('ink') }}>Ask Genie</p>
      <p className="self-end rounded-[8px] px-2 py-1 text-[8.5px]" style={{ background: pv('well'), color: pv('ink') }}>Why is R-1042 flagged?</p>
      <p className="rounded-[8px] px-2 py-1 text-[8.5px] leading-snug" style={{ border: `1px solid ${pv('line')}`, color: pv('ink') }}>
        Its value fell 38% below its 8 week average, the biggest drop in Segment B, so it is first in Act now.
      </p>
      <span className="mt-auto rounded-[6px] px-2 text-[8.5px] leading-[18px]" style={{ border: `1px solid ${pv('line-strong')}`, color: pv('muted') }}>Ask about this page</span>
    </div>
  );
}

function TopBar({ look, appName, title, shared, impact }) {
  const bar = look.style === 'b'
    ? { background: pv('brand-wash'), borderBottom: `1px solid ${pv('brand-bd')}` }
    : look.style === 'c' ? { background: pv('card'), boxShadow: `0 1px 0 ${pv('line')}` } : { background: pv('card'), borderBottom: `1px solid ${pv('line')}` };
  return (
    <div className="flex h-[30px] shrink-0 items-center gap-2 px-2" style={bar}>
      <span aria-hidden="true" className="block h-[14px] w-[14px] shrink-0 rounded-[3px]" style={{ background: pv('brand') }} />
      <span className="min-w-0 shrink-0 leading-none">
        <span className="block max-w-[150px] truncate text-[9.5px] font-semibold" style={{ color: pv('ink') }}>{appName}</span>
        <span className="block text-[8px]" style={{ color: pv('muted') }}>1 use case · built by Inspire</span>
      </span>
      {look.layout === 'tabs' && (
        <span className="ml-2 flex min-w-0 items-end gap-2 self-stretch">
          <span className="flex max-w-[160px] items-center truncate text-[9px] font-semibold" style={{ color: pv('ink'), borderBottom: `2px solid ${pv('brand')}` }}>{title}</span>
          {impact && <span className="flex items-center text-[9px]" style={{ color: pv('muted'), borderBottom: '2px solid transparent' }}>Impact</span>}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[8px]" style={{ color: pv('muted') }}>{shared ? 'Shared view' : 'Your view'}</span>
      <span className="shrink-0 rounded-full px-1.5 text-[8.5px] leading-[15px]" style={{ border: `1px solid ${pv('line-strong')}`, color: pv('ink'), background: pv('card') }}>Ask Genie</span>
    </div>
  );
}

function SideNav({ look, title, impact }) {
  return (
    <div className="flex w-[116px] shrink-0 flex-col gap-1 p-1.5" style={{ background: look.style === 'b' ? pv('panel') : pv('card'), borderRight: `1px solid ${pv('line')}` }}>
      <p className="px-1 text-[8px] font-semibold uppercase tracking-wide" style={{ color: pv('muted') }}>Use case</p>
      <div className="rounded-[5px] px-1.5 py-1" style={{ background: pv('brand-wash'), borderLeft: `2px solid ${pv('brand')}` }}>
        <p className="truncate text-[9px] font-semibold" style={{ color: pv('ink') }}>{title}</p>
        <p className="text-[8px]" style={{ color: pv('muted') }}>128 to fix</p>
      </div>
      {impact && (
        <>
          <span className="my-0.5 block h-px" style={{ background: pv('line') }} />
          <div className="px-1.5 py-0.5">
            <p className="text-[9px] font-semibold" style={{ color: pv('ink') }}>Impact</p>
            <p className="text-[8px]" style={{ color: pv('muted') }}>What it delivered</p>
          </div>
        </>
      )}
    </div>
  );
}

function HomeCards({ look, title, impact }) {
  const cards = [[title, '128 to fix · $412K at stake', 'coral'], ...(impact ? [['Impact', '$96K saved so far', 'green']] : [])];
  return (
    <div className="grid shrink-0 grid-cols-2 gap-1.5">
      {cards.map(([name, sub, hue]) => (
        <div key={name} className="rounded-[6px] px-2 py-1" style={{ background: pv('card'), border: `1px solid ${pv('line')}`, boxShadow: `inset 0 2px 0 ${pv(`${hue}-line`)}` }}>
          <p className="truncate text-[9px] font-semibold" style={{ color: pv('ink') }}>{name}</p>
          <p className="truncate text-[8px]" style={{ color: pv('muted') }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}

export default function AppSample({ palette, look, appName, title, view = 'fix', shared = true, label, charts = ['trend', 'bars', 'pareto'], impact = true }) {
  const vars = paletteVars(palette, look.theme);
  if (!vars) return <div aria-hidden="true" data-app-sample="" className="h-[296px] rounded-lg bg-bg-subtle animate-pulse" />;
  return (
    <div role="img" aria-label={label} data-app-sample={view} data-sample-style={look.style} data-sample-layout={look.layout} data-sample-palette={look.palette} data-sample-theme={look.theme}
      data-sample-charts={charts.filter((id) => CHART_CARDS[id]).join(',')} data-sample-impact={impact ? 'on' : 'off'}
      className="flex h-[296px] flex-col overflow-hidden rounded-lg text-left" style={{ ...vars, background: pv('bg'), border: `1px solid ${pv('line-strong')}`, colorScheme: look.theme }}>
      <TopBar look={look} appName={appName} title={title} shared={shared} impact={impact} />
      <div className="flex min-h-0 flex-1">
        {look.layout === 'sidebar' && <SideNav look={look} title={title} impact={impact} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
          {look.layout === 'home' && <HomeCards look={look} title={title} impact={impact} />}
          <Body look={look} view={view} title={title} charts={charts} />
        </div>
        {view === 'genie' && <GeniePanel />}
      </div>
    </div>
  );
}
