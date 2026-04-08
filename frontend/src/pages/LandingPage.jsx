import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Sparkles,
  Database,
  FileText,
  Target,
  BrainCircuit,
  ChevronRight,
  Globe2,
  Terminal,
  ChevronDown,
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';
import { useTheme } from '../ThemeContext';
import { Sun, Moon } from 'lucide-react';

/* ═══════════════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════════════ */

const HERO_WORDS = ['Use Cases', 'Business Value', 'Data Strategy', 'AI Insights'];

const FLOATING_SCHEMAS = [
  'sales.transactions.orders', 'hr.employees.payroll', 'iot.sensors.telemetry',
  'finance.ledger.entries', 'marketing.campaigns.clicks', 'supply.inventory.stock',
  'retail.customers.segments', 'ops.logistics.shipments', 'risk.compliance.alerts',
  'analytics.events.sessions', 'health.patients.records', 'edu.students.grades',
  'telecom.usage.calls', 'mfg.equipment.metrics', 'crm.accounts.activities',
  'billing.invoices.payments', 'catalog.products.reviews', 'security.logs.access',
];

const CONSTELLATION_NODES = [
  // Domain 0 — Customer Intelligence (top-left cluster)
  { id: 0, label: 'orders', x: 10, y: 18, domain: 0 },
  { id: 1, label: 'customers', x: 22, y: 30, domain: 0 },
  { id: 2, label: 'segments', x: 14, y: 44, domain: 0 },
  { id: 3, label: 'clicks', x: 6, y: 58, domain: 0 },
  // Domain 1 — Financial Analytics (center cluster)
  { id: 4, label: 'transactions', x: 40, y: 14, domain: 1 },
  { id: 5, label: 'ledger', x: 52, y: 26, domain: 1 },
  { id: 6, label: 'invoices', x: 46, y: 42, domain: 1 },
  { id: 7, label: 'payroll', x: 58, y: 56, domain: 1 },
  // Domain 2 — Operations (top-right cluster)
  { id: 8, label: 'shipments', x: 74, y: 16, domain: 2 },
  { id: 9, label: 'inventory', x: 86, y: 30, domain: 2 },
  { id: 10, label: 'sensors', x: 78, y: 48, domain: 2 },
  { id: 11, label: 'equipment', x: 92, y: 62, domain: 2 },
  // Domain 3 — Risk & Compliance (bottom-center cluster)
  { id: 12, label: 'alerts', x: 32, y: 68, domain: 3 },
  { id: 13, label: 'compliance', x: 50, y: 76, domain: 3 },
  { id: 14, label: 'access_logs', x: 66, y: 70, domain: 3 },
];

const CONSTELLATION_EDGES = [
  // Intra-domain
  [0, 1], [1, 2], [2, 3],
  [4, 5], [5, 6], [6, 7],
  [8, 9], [9, 10], [10, 11], [8, 11],
  [12, 13], [13, 14], [12, 14],
  // Cross-domain bridges
  [0, 4], [1, 5],
  [4, 8], [5, 9],
  [6, 12], [7, 13],
  [2, 12], [3, 13], [10, 14],
];

const DOMAIN_COLORS = ['#FF3621', '#3B82F6', '#22C55E', '#EAB308'];
const DOMAIN_NAMES = ['Customer Intelligence', 'Financial Analytics', 'Operations', 'Risk & Compliance'];

const TERMINAL_LINES = [
  { text: '$ inspire run --catalog main --schema analytics', delay: 0, color: '#22C55E' },
  { text: '', delay: 600 },
  { text: 'Connecting to Databricks workspace...', delay: 800, color: '#ABABAB' },
  { text: 'Authenticated via OAuth  [PAT token]', delay: 1200, color: '#ABABAB' },
  { text: '', delay: 1400 },
  { text: 'Scanning Unity Catalog...', delay: 1600, color: '#FF3621' },
  { text: '  Found 47 tables across 6 schemas', delay: 2200, color: '#EDEDEF' },
  { text: '  Indexed 312 columns with metadata', delay: 2800, color: '#EDEDEF' },
  { text: '', delay: 3200 },
  { text: 'Generating use cases with Foundation Model...', delay: 3500, color: '#FF3621' },
  { text: '  [============================] 100%', delay: 4800, color: '#22C55E' },
  { text: '', delay: 5000 },
  { text: '23 use cases discovered across 5 domains', delay: 5200, color: '#EDEDEF' },
  { text: '  Customer Intelligence  (7 use cases)', delay: 5600, color: '#FF6B50' },
  { text: '  Revenue Optimization   (5 use cases)', delay: 5900, color: '#FF6B50' },
  { text: '  Risk Management        (4 use cases)', delay: 6200, color: '#FF6B50' },
  { text: '  Supply Chain           (4 use cases)', delay: 6500, color: '#FF6B50' },
  { text: '  Operations             (3 use cases)', delay: 6800, color: '#FF6B50' },
  { text: '', delay: 7000 },
  { text: 'Generating Genie instructions... Done', delay: 7200, color: '#22C55E' },
  { text: 'Exporting PDF catalog... Done', delay: 7600, color: '#22C55E' },
  { text: '', delay: 7800 },
  { text: '✓ Run complete in 4m 23s', delay: 8000, color: '#FF3621' },
];

const USE_CASES = [
  { title: 'Predict Customer Churn', priority: 'Ultra High', domain: 'Customer Intelligence', color: '#FF3621' },
  { title: 'Detect Fraud Patterns', priority: 'Ultra High', domain: 'Risk & Compliance', color: '#EAB308' },
  { title: 'Forecast Inventory Demand', priority: 'Very High', domain: 'Operations', color: '#22C55E' },
  { title: 'Optimize Revenue Leakage', priority: 'Very High', domain: 'Financial Analytics', color: '#3B82F6' },
  { title: 'Classify Customer Segments', priority: 'High', domain: 'Customer Intelligence', color: '#FF3621' },
  { title: 'Predict Equipment Failure', priority: 'High', domain: 'Operations', color: '#22C55E' },
];

const PIPELINE_STEPS = [
  { icon: Database, label: 'Scan Catalog' },
  { icon: BrainCircuit, label: 'Generate Use Cases' },
  { icon: Target, label: 'Score & Prioritize' },
  { icon: Sparkles, label: 'Genie Instructions' },
  { icon: FileText, label: 'Deliver Artifacts' },
];

/* ═══════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════ */

function useTypingEffect(words, typingSpeed = 80, pauseMs = 2000) {
  const [display, setDisplay] = useState('');
  const [wordIdx, setWordIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = words[wordIdx];
    const timeout = setTimeout(() => {
      if (!deleting) {
        setDisplay(word.slice(0, charIdx + 1));
        if (charIdx + 1 === word.length) setTimeout(() => setDeleting(true), pauseMs);
        else setCharIdx(charIdx + 1);
      } else {
        setDisplay(word.slice(0, charIdx));
        if (charIdx === 0) { setDeleting(false); setWordIdx((wordIdx + 1) % words.length); }
        else setCharIdx(charIdx - 1);
      }
    }, deleting ? typingSpeed / 2 : typingSpeed);
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx, words, typingSpeed, pauseMs]);
  return display;
}

function useTerminalTyping() {
  const [lines, setLines] = useState([]);
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    const timers = [];
    setLines([]);
    TERMINAL_LINES.forEach((line) => {
      timers.push(setTimeout(() => setLines((p) => [...p, line]), line.delay));
    });
    timers.push(setTimeout(() => setCycle((c) => c + 1), 10000));
    return () => timers.forEach(clearTimeout);
  }, [cycle]);
  return lines;
}

function useScrollProgress(containerRef) {
  const [progress, setProgress] = useState(0);
  const [section, setSection] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handle = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      setProgress(scrollHeight > 0 ? scrollTop / scrollHeight : 0);
      setSection(Math.round(scrollTop / el.clientHeight));
    };
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [containerRef]);

  return { progress, section };
}

/* ═══════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════ */

/* Floating schema names background */
function FloatingSchemas({ opacity = 0.04 }) {
  const { theme } = useTheme();
  const schemaColor = theme === 'dark' ? '#FFF8ED' : '#1A1A1F';
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {FLOATING_SCHEMAS.map((schema, i) => {
        const top = (i * 37 + 13) % 100;
        const dur = 30 + (i % 5) * 8;
        const delay = -(i * 3.7);
        return (
          <span
            key={schema}
            className="absolute whitespace-nowrap font-mono text-[11px] animate-schema-float"
            style={{
              top: `${top}%`,
              right: '-300px',
              opacity,
              color: schemaColor,
              animationDuration: `${dur}s`,
              animationDelay: `${delay}s`,
            }}
          >
            {schema}
          </span>
        );
      })}
    </div>
  );
}

/* SVG Neural Constellation — animated network graph */
function NeuralConstellation({ progress, visible, palette }) {
  const p = Math.min(1, progress);
  const nodeOpacity = Math.min(1, p * 2.5);
  const edgeOpacity = Math.max(0, Math.min(1, (p - 0.1) * 2));
  const labelOpacity = Math.max(0, (p - 0.3) * 2);
  const alive = p > 0.25;

  return (
    <svg
      viewBox="0 0 100 90"
      className={`w-full h-full transition-opacity duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <defs>
        {DOMAIN_COLORS.map((color, i) => (
          <radialGradient key={`rg-${i}`} id={`rg-${i}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
        <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="cloudBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      {/* Domain clouds */}
      {alive && DOMAIN_NAMES.map((_, i) => {
        const nodes = CONSTELLATION_NODES.filter(n => n.domain === i);
        const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
        const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
        return (
          <circle key={`cloud-${i}`} cx={cx} cy={cy} r={16} fill={`url(#rg-${i})`} opacity={edgeOpacity * 0.5} filter="url(#cloudBlur)">
            <animate attributeName="r" values="14;18;14" dur={`${5 + i * 1.5}s`} repeatCount="indefinite" />
          </circle>
        );
      })}

      {/* Radial grid rings */}
      {alive && (
        <g opacity={0.03}>
          {[15, 30, 45].map(r => (
            <circle key={r} cx={50} cy={45} r={r} fill="none" stroke={palette.gridStroke} strokeWidth={0.15} strokeDasharray="1 2" />
          ))}
        </g>
      )}

      {/* Edges — straight lines with dash-draw animation */}
      {CONSTELLATION_EDGES.map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const isCross = na.domain !== nb.domain;
        const color = isCross ? '#FF3621' : DOMAIN_COLORS[na.domain];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return (
          <line
            key={`e-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={color}
            strokeWidth={isCross ? 0.25 : 0.4}
            strokeOpacity={edgeOpacity * (isCross ? 0.2 : 0.35)}
            strokeDasharray={len}
            strokeDashoffset={len * (1 - edgeOpacity)}
            style={{ transition: 'stroke-dashoffset 1.5s ease-out' }}
          />
        );
      })}

      {/* Animated flowing dashes along edges */}
      {alive && CONSTELLATION_EDGES.map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const color = DOMAIN_COLORS[na.domain];
        const dx = nb.x - na.x;
        const dy = nb.y - na.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return (
          <line
            key={`ef-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={color}
            strokeWidth={0.5}
            strokeLinecap="round"
            strokeOpacity={0.5}
            strokeDasharray={`2 ${len - 2}`}
          >
            <animate
              attributeName="stroke-dashoffset"
              values={`${len};0`}
              dur={`${2 + (i % 5) * 0.4}s`}
              repeatCount="indefinite"
            />
          </line>
        );
      })}

      {/* Traveling particles along straight edges */}
      {alive && CONSTELLATION_EDGES.map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const color = DOMAIN_COLORS[na.domain];
        const dur = 2 + (i % 4) * 0.6;
        return (
          <circle key={`p-${i}`} r={0.45} fill={color} opacity={0.85}>
            <animate attributeName="cx" values={`${na.x};${nb.x};${na.x}`} dur={`${dur}s`} repeatCount="indefinite" />
            <animate attributeName="cy" values={`${na.y};${nb.y};${na.y}`} dur={`${dur}s`} repeatCount="indefinite" />
          </circle>
        );
      })}

      {/* Nodes */}
      {CONSTELLATION_NODES.map((node) => {
        const color = DOMAIN_COLORS[node.domain];
        const delay = node.id * 0.2;
        const r = 1.4;
        return (
          <g key={node.id}>
            {/* Pulse ring */}
            {alive && (
              <circle cx={node.x} cy={node.y} r={r * 2} fill="none" stroke={color} strokeWidth={0.15}>
                <animate attributeName="r" values={`${r * 1.5};${r * 4};${r * 1.5}`} dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.25;0;0.25" dur="3s" begin={`${delay}s`} repeatCount="indefinite" />
              </circle>
            )}
            {/* Glow halo */}
            <circle cx={node.x} cy={node.y} r={r * 2.5} fill={color} opacity={nodeOpacity * 0.08} filter="url(#nodeGlow)" />
            {/* Core dot */}
            <circle cx={node.x} cy={node.y} r={r} fill={color} opacity={nodeOpacity}>
              {alive && (
                <animate attributeName="r" values={`${r};${r * 1.15};${r}`} dur="2.5s" begin={`${delay}s`} repeatCount="indefinite" />
              )}
            </circle>
            {/* Specular highlight */}
            <circle cx={node.x - r * 0.3} cy={node.y - r * 0.3} r={r * 0.3} fill="white" opacity={nodeOpacity * 0.45} />
            {/* Label */}
            <g opacity={labelOpacity * 0.9} style={{ transition: 'opacity 0.5s' }}>
              <rect
                x={node.x - node.label.length * 0.9 - 0.5} y={node.y - 5.2}
                width={node.label.length * 1.8 + 1} height={2.8}
                rx={1} fill={palette.pageBg} opacity={0.75}
              />
              <text x={node.x} y={node.y - 3.2} textAnchor="middle" fill={color} fontSize={1.7} fontWeight="600" fontFamily="system-ui, sans-serif">
                {node.label}
              </text>
            </g>
          </g>
        );
      })}

      {/* Domain labels */}
      {DOMAIN_NAMES.map((name, i) => {
        const nodes = CONSTELLATION_NODES.filter(n => n.domain === i);
        const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
        const cy = Math.max(...nodes.map(n => n.y)) + 7;
        const color = DOMAIN_COLORS[i];
        const w = name.length * 1.5 + 3;
        return (
          <g key={name} opacity={Math.max(0, labelOpacity)} style={{ transition: 'opacity 0.8s' }}>
            <rect x={cx - w / 2} y={cy - 1.8} width={w} height={4} rx={2} fill={color} opacity={0.1} />
            <text x={cx} y={cy + 1} textAnchor="middle" fill={color} fontSize={1.9} fontWeight="700" fontFamily="system-ui, sans-serif">
              {name}
            </text>
          </g>
        );
      })}

      {/* Central heartbeat */}
      {alive && (
        <>
          <circle cx={50} cy={45} r={1} fill="none" stroke="#FF3621" strokeWidth={0.25}>
            <animate attributeName="r" values="0;38;0" dur="4.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.12;0;0.12" dur="4.5s" repeatCount="indefinite" />
          </circle>
          <circle cx={50} cy={45} r={1} fill="none" stroke="#FF3621" strokeWidth={0.18}>
            <animate attributeName="r" values="0;25;0" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.08;0;0.08" dur="4.5s" begin="1.5s" repeatCount="indefinite" />
          </circle>
        </>
      )}
    </svg>
  );
}

/* ═══ The Inspire Orb — scroll-linked transition object ═══ */
function InspireOrb({ progress, section }) {
  // Phase calculations based on scroll progress (0-1)
  // Section 0: small dim orb (raw data)
  // Section 1: expand + radiate (analyzing)
  // Section 2: pulse red (processing)
  // Section 3: split into fragments (results)
  // Section 4: converge bright (CTA)

  const p = progress;

  // Size: starts 80px, peaks at 200px in section 2, shrinks for split, grows for finale
  const size = section <= 1
    ? 80 + p * 300
    : section === 2
      ? 180 + Math.sin(p * Math.PI * 4) * 20
      : section === 3
        ? 160 - (p - 0.6) * 200
        : 120 + (p - 0.8) * 400;

  const clampedSize = Math.max(40, Math.min(300, size));

  // Opacity: fades in, stays visible, brightens at end
  const opacity = Math.min(1, p * 5) * (section === 3 ? 0.7 : section === 4 ? 1 : 0.8);

  // Rotation
  const rotate = p * 720;

  // Glow intensity
  const glow = section >= 2 ? 30 + (section >= 4 ? 60 : 0) : 10 + p * 40;

  // Vertical position: drifts from center-right down through sections
  const yOffset = section * -5;

  // Fragment positions for section 3 (4 colored orbs splitting apart)
  const fragmentSpread = section === 3 ? Math.min(1, (p - 0.6) * 5) : section >= 4 ? Math.max(0, 1 - (p - 0.8) * 5) : 0;

  const fragmentPositions = [
    { x: -60 * fragmentSpread, y: -50 * fragmentSpread, color: DOMAIN_COLORS[0] },
    { x: 60 * fragmentSpread, y: -40 * fragmentSpread, color: DOMAIN_COLORS[1] },
    { x: -50 * fragmentSpread, y: 50 * fragmentSpread, color: DOMAIN_COLORS[2] },
    { x: 55 * fragmentSpread, y: 55 * fragmentSpread, color: DOMAIN_COLORS[3] },
  ];

  // Ring pulses for section 1 (radiating connections)
  const ringCount = section >= 1 && section <= 2 ? 3 : 0;
  const ringProgress = section === 1 ? Math.min(1, (p - 0.15) * 4) : section === 2 ? 1 : 0;

  return (
    <div
      className="fixed z-[5] pointer-events-none"
      style={{
        right: '8%',
        top: `calc(50% + ${yOffset}vh)`,
        transform: 'translate(50%, -50%)',
        transition: 'top 1.5s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      aria-hidden="true"
    >
      {/* Radiating rings (section 1-2) */}
      {Array.from({ length: ringCount }).map((_, i) => (
        <div
          key={`ring-${i}`}
          className="absolute rounded-full border"
          style={{
            width: clampedSize + 60 + i * 50,
            height: clampedSize + 60 + i * 50,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            borderColor: `rgba(255, 54, 33, ${ringProgress * (0.15 - i * 0.04)})`,
            transition: 'all 1s ease-out',
            animation: ringProgress > 0 ? `orbRing ${3 + i}s ease-in-out infinite` : 'none',
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}

      {/* Domain fragments (section 3-4) */}
      {fragmentSpread > 0.01 && fragmentPositions.map((frag, i) => (
        <div
          key={`frag-${i}`}
          className="absolute rounded-full"
          style={{
            width: 20 + fragmentSpread * 15,
            height: 20 + fragmentSpread * 15,
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${frag.x}px), calc(-50% + ${frag.y}px))`,
            background: `radial-gradient(circle, ${frag.color}, ${frag.color}00)`,
            boxShadow: `0 0 ${20 + fragmentSpread * 30}px ${frag.color}60`,
            opacity: fragmentSpread * 0.8,
            transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      ))}

      {/* Core orb */}
      <div
        className="rounded-full relative"
        style={{
          width: clampedSize,
          height: clampedSize,
          background: `radial-gradient(circle at 35% 35%, rgba(255,134,107,${opacity * 0.5}), rgba(255,54,33,${opacity * 0.6}) 40%, rgba(255,54,33,0) 70%)`,
          boxShadow: `
            0 0 ${glow}px rgba(255,54,33,${opacity * 0.3}),
            0 0 ${glow * 2}px rgba(255,54,33,${opacity * 0.15}),
            0 0 ${glow * 4}px rgba(255,54,33,${opacity * 0.08}),
            inset 0 0 ${glow}px rgba(255,54,33,${opacity * 0.1})
          `,
          transform: `rotate(${rotate}deg)`,
          transition: 'width 1.2s cubic-bezier(0.16,1,0.3,1), height 1.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.8s ease-out',
        }}
      >
        {/* Inner diamond shape */}
        <div
          className="absolute inset-[20%] rounded-sm"
          style={{
            transform: `rotate(45deg) scale(${0.6 + opacity * 0.4})`,
            border: `1px solid rgba(255,54,33,${opacity * 0.4})`,
            background: `rgba(255,54,33,${opacity * 0.05})`,
            transition: 'all 0.8s ease-out',
          }}
        />
        {/* Center bright point */}
        <div
          className="absolute rounded-full"
          style={{
            width: '20%',
            height: '20%',
            left: '40%',
            top: '40%',
            background: `radial-gradient(circle, rgba(255,248,237,${opacity * 0.8}), transparent)`,
            filter: `blur(${2 + section}px)`,
          }}
        />
      </div>
    </div>
  );
}

/* Use case card */
function UseCaseCard({ uc, index, visible, palette }) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 120}ms`, background: palette.cardBg, border: `1px solid ${palette.cardBorder}` }}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: uc.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: palette.text }}>{uc.title}</p>
        <p className="text-[11px]" style={{ color: palette.textMuted }}>{uc.domain}</p>
      </div>
      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: `${uc.color}20`, color: uc.color }}>
        {uc.priority}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════ */

// Theme-aware color palette for the landing page
const LIGHT_PALETTE = {
  pageBg: '#F7F7F8',
  text: '#1A1A1F',
  textMuted: '#5C5C66',
  textFaint: '#B0B0B8',
  navBg: 'rgba(247,247,248,0.7)',
  navBorder: 'rgba(0,0,0,0.06)',
  btnBg: 'rgba(0,0,0,0.04)',
  btnBorder: 'rgba(0,0,0,0.08)',
  btnHoverBg: 'rgba(0,0,0,0.08)',
  gridStroke: '#1A1A1F',
  cardBg: 'rgba(0,0,0,0.03)',
  cardBorder: 'rgba(0,0,0,0.08)',
  termBg: '#FFFFFF',
  termHeaderBg: '#F0F0F3',
  termBorder: 'rgba(0,0,0,0.10)',
};
const DARK_PALETTE = {
  pageBg: '#0A0808',
  text: '#FFF8ED',
  textMuted: '#ABABAB',
  textFaint: '#666',
  navBg: 'rgba(10,8,8,0.7)',
  navBorder: 'rgba(255,248,237,0.05)',
  btnBg: 'rgba(255,248,237,0.06)',
  btnBorder: 'rgba(255,248,237,0.08)',
  btnHoverBg: 'rgba(255,248,237,0.1)',
  gridStroke: '#FFF8ED',
  cardBg: 'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.06)',
  termBg: 'rgba(0,0,0,0.4)',
  termHeaderBg: 'rgba(255,255,255,0.04)',
  termBorder: 'rgba(255,255,255,0.06)',
};

export default function LandingPage({ onStart }) {
  const typedText = useTypingEffect(HERO_WORDS);
  const scrollContainerRef = useRef(null);
  const { progress, section } = useScrollProgress(scrollContainerRef);
  const { theme, toggle } = useTheme();
  const C = theme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;

  return (
    <div className="h-screen overflow-hidden relative" style={{ backgroundColor: C.pageBg, color: C.text }}>
      {/* ═══ Progress bar ═══ */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-[2px]">
        <div className="h-full bg-gradient-to-r from-[#FF3621] to-[#FF8A6B]" style={{ width: `${progress * 100}%`, transition: 'width 0.15s' }} />
      </div>

      {/* ═══ The Inspire Orb — persistent scroll-linked object ═══ */}
      <InspireOrb progress={progress} section={section} />

      {/* ═══ Nav — always visible ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl" style={{ borderBottom: `1px solid ${C.navBorder}`, backgroundColor: C.navBg }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DatabricksLogo className="w-8 h-8" />
            <span className="font-bold text-xl tracking-[-0.03em]" style={{ color: C.text }}>Inspire AI</span>
            <span className="text-[10px] font-semibold text-[#FF3621] border border-[#FF3621]/30 bg-[#FF3621]/10 rounded-full px-2 py-0.5">v4.6</span>
          </div>
          {/* Section indicators */}
          <div className="hidden md:flex items-center gap-1.5">
            {['Discover', 'Analyze', 'Pipeline', 'Agent', 'Results', 'Start'].map((label, i) => (
              <button
                key={label}
                onClick={() => {
                  const el = scrollContainerRef.current;
                  if (el) el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' });
                }}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300"
                style={{
                  color: section === i ? '#FF3621' : C.textMuted,
                  backgroundColor: section === i ? 'rgba(255,54,33,0.15)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className="p-2.5 rounded-xl transition-all duration-300"
              style={{ color: C.textMuted, backgroundColor: C.btnBg, border: `1px solid ${C.btnBorder}` }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={onStart}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300"
              style={{ color: C.text, backgroundColor: C.btnBg, border: `1px solid ${C.btnBorder}` }}
            >
              Launch App
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ Scroll Container — snap sections ═══ */}
      <div
        ref={scrollContainerRef}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide"
        style={{ scrollBehavior: 'smooth' }}
      >

        {/* ═══ SECTION 1: Hero ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <FloatingSchemas opacity={0.03} />
          {/* Ambient glow */}
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#FF3621]/[0.05] blur-[150px] animate-ambient-float" aria-hidden="true" />
          <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] rounded-full bg-[#FF6B50]/[0.03] blur-[120px] animate-ambient-float-delayed" aria-hidden="true" />

          <div className="relative z-10 max-w-7xl mx-auto px-6 w-full pt-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Text */}
              <div>
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-8" style={{ background: C.btnBg, border: `1px solid ${C.btnBorder}` }}>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3621] opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3621]" />
                  </span>
                  <span className="text-[11px] font-medium" style={{ color: C.textMuted }}>Powered by Databricks Foundation Models</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-0.04em] mb-6">
                  Discover{' '}
                  <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">{typedText}</span>
                  <span className="text-[#FF3621] animate-cursor-blink">|</span>
                  <br />
                  <span style={{ color: C.textMuted }}>from your data.</span>
                </h1>

                <p className="text-base sm:text-lg mb-10 max-w-lg leading-relaxed" style={{ color: C.textMuted }}>
                  AI-powered analytics use case discovery from your Unity Catalog metadata. Scored, prioritized, and implementation-ready.
                </p>

                <button
                  onClick={onStart}
                  aria-label="Get Started"
                  className="group inline-flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#FF3621] to-[#E02E1B] text-white text-sm font-bold rounded-xl transition-all duration-300 hover:-translate-y-0.5"
                  style={{ boxShadow: '0 0 0 1px rgba(255,54,33,0.3), 0 4px 12px rgba(255,54,33,0.2), 0 8px 30px rgba(255,54,33,0.15), 0 20px 60px rgba(255,54,33,0.1)' }}
                >
                  Get Started
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-300" />
                </button>

                <div className="flex items-center gap-2 text-sm mt-5" style={{ color: C.textFaint }}>
                  <Globe2 size={14} />
                  <span>No setup required — runs on your Databricks workspace</span>
                </div>
              </div>

              {/* Right: AI Vision Hero Image */}
              <div className="hidden lg:block relative">
                {/* Glow behind image */}
                <div className="absolute inset-0 bg-[#FF3621]/[0.08] blur-[80px] rounded-full scale-75" aria-hidden="true" />
                <img
                  src="/hero-vision.jpg"
                  alt="AI discovering insights through data"
                  className="relative w-full rounded-2xl shadow-2xl shadow-black/60"
                  style={{
                    maskImage: 'linear-gradient(to bottom, black 70%, transparent 100%), linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)',
                    maskComposite: 'intersect',
                    WebkitMaskImage: 'linear-gradient(to bottom, black 70%, transparent 100%)',
                  }}
                  loading="eager"
                />
              </div>
            </div>
          </div>

          {/* Scroll hint */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-pulse">
            <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-[0.15em]">Scroll to explore</span>
            <ChevronDown size={16} className="text-text-tertiary" />
          </div>
        </section>

        {/* ═══ SECTION 2: Neural Constellation — "Analyze" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <FloatingSchemas opacity={0.02} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${C.pageBg}, ${C.pageBg})` }} />

          <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
            <div className="text-center mb-8">
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-3">How Inspire Thinks</span>
              <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] transition-all duration-1000 ${section >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                Your tables.{' '}
                <span className="text-text-tertiary">Connected.</span>
              </h2>
              <p className={`text-sm mt-3 max-w-md mx-auto transition-all duration-1000 delay-200 ${section >= 1 ? 'opacity-100' : 'opacity-0'}`} style={{ color: C.textMuted }}>
                Inspire AI maps relationships across your Unity Catalog, discovers hidden connections, and clusters tables into business domains.
              </p>
            </div>

            <div className="h-[50vh] max-h-[500px]">
              <NeuralConstellation
                progress={section >= 1 ? Math.min(1, (progress - 0.15) * 4) : 0}
                visible={section >= 1}
                palette={C}
              />
            </div>

            {/* Domain legend */}
            <div className={`flex justify-center gap-6 mt-6 transition-all duration-700 ${section >= 1 && progress > 0.3 ? 'opacity-100' : 'opacity-0'}`}>
              {DOMAIN_NAMES.map((name, i) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: DOMAIN_COLORS[i] }} />
                  <span className="text-[11px]" style={{ color: C.textMuted }}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION 3: Pipeline — "Insights" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0" style={{ background: C.pageBg }} />
          <div className="absolute top-[30%] right-[-5%] w-[30%] h-[30%] rounded-full bg-[#FF3621]/[0.03] blur-[100px]" aria-hidden="true" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 w-full">
            <div className="text-center mb-16">
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-3">The Pipeline</span>
              <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] transition-all duration-1000 ${section >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                From catalog to strategy{' '}
                <span className="text-text-tertiary">in minutes.</span>
              </h2>
            </div>

            {/* Pipeline steps — large */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-2">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2 sm:gap-2">
                  <div
                    className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-700 hover:border-[#FF3621]/20 group ${
                      section >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, transitionDelay: `${i * 150}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FF3621]/10 flex items-center justify-center">
                      <step.icon size={20} className="text-[#FF3621] group-hover:scale-110 transition-transform" />
                    </div>
                    <div>
                      <span className="text-[10px] text-text-tertiary font-mono">0{i + 1}</span>
                      <p className="text-sm font-semibold" style={{ color: C.text }}>{step.label}</p>
                    </div>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight size={16} className="hidden sm:block" style={{ color: C.cardBorder }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION 4: The Inspire Agent ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0" style={{ background: C.pageBg }} />
          {/* Subtle blue-ish glow to match the robot's lighting */}
          <div className="absolute top-[20%] left-[30%] w-[40%] h-[50%] rounded-full bg-[#1a2a4a]/[0.15] blur-[120px]" aria-hidden="true" />
          <div className="absolute bottom-[10%] right-[20%] w-[25%] h-[30%] rounded-full bg-[#FF3621]/[0.04] blur-[100px]" aria-hidden="true" />

          <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              {/* Left: Agent image */}
              <div className={`relative transition-all duration-1000 ${section >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}>
                <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: `linear-gradient(to top, ${C.pageBg}, transparent)` }} />
                <div className="absolute inset-0 z-10 pointer-events-none" style={{ background: `linear-gradient(to right, transparent, transparent 60%, ${C.pageBg})` }} />
                <img
                  src="/inspire-agent.jpg"
                  alt="Inspire AI Agent"
                  className="w-full max-h-[80vh] object-contain rounded-2xl"
                  loading="lazy"
                />
              </div>

              {/* Right: Text */}
              <div className={`transition-all duration-1000 delay-300 ${section >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-4">Meet the Agent</span>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] leading-[1.1] mb-6">
                  Your AI-powered{' '}
                  <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">data strategist.</span>
                </h2>
                <p className="text-base leading-relaxed mb-8 max-w-md" style={{ color: C.textMuted }}>
                  Inspire AI works like a senior data consultant — scanning your entire Unity Catalog, understanding table relationships, and delivering a prioritized analytics strategy tailored to your business.
                </p>
                <div className="space-y-3">
                  {[
                    { label: 'Scans 100+ tables in minutes', color: '#FF3621' },
                    { label: 'Discovers hidden data relationships', color: '#3B82F6' },
                    { label: 'Generates Genie-ready code instructions', color: '#22C55E' },
                    { label: 'Delivers executive-ready artifacts', color: '#EAB308' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <span className="text-sm" style={{ color: C.textMuted }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: Results — "Results" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0" style={{ background: C.pageBg }} />
          <FloatingSchemas opacity={0.015} />

          <div className="relative z-10 max-w-5xl mx-auto px-6 w-full">
            <div className="text-center mb-12">
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-3">What You Get</span>
              <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] transition-all duration-1000 ${section >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                Scored. Prioritized.{' '}
                <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">Ready.</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
              {USE_CASES.map((uc, i) => (
                <UseCaseCard key={uc.title} uc={uc} index={i} visible={section >= 4} palette={C} />
              ))}
            </div>

            <p className={`text-center text-sm text-text-tertiary mt-8 transition-all duration-700 delay-700 ${section >= 4 ? 'opacity-100' : 'opacity-0'}`}>
              + Genie code instructions, PDF catalogs, executive presentations, and more.
            </p>
          </div>
        </section>

        {/* ═══ SECTION 6: CTA — "Start" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0" style={{ background: C.pageBg }} />
          <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] rounded-full bg-[#FF3621]/[0.06] blur-[120px]" aria-hidden="true" />

          <div className="relative z-10 text-center max-w-2xl mx-auto px-6">
            <h2 className={`text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.1] mb-6 transition-all duration-1000 ${section >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <span style={{ color: C.textFaint }}>Your data already has the answers.</span>
              <br />
              <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">Inspire finds the questions.</span>
            </h2>

            <p className={`mb-10 transition-all duration-700 delay-200 ${section >= 5 ? 'opacity-100' : 'opacity-0'}`} style={{ color: C.textMuted }}>
              Launch Inspire AI and generate your first analytics strategy in under 30 minutes.
            </p>

            <button
              onClick={onStart}
              className={`group inline-flex items-center gap-2.5 px-10 py-5 bg-gradient-to-r from-[#FF3621] to-[#E02E1B] text-white text-base font-bold rounded-xl transition-all duration-700 hover:-translate-y-1 ${section >= 5 ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              style={{
                transitionDelay: '400ms',
                boxShadow: '0 0 0 1px rgba(255,54,33,0.4), 0 4px 15px rgba(255,54,33,0.25), 0 10px 40px rgba(255,54,33,0.2), 0 20px 70px rgba(255,54,33,0.15), 0 40px 100px rgba(255,54,33,0.1)',
              }}
            >
              Launch Inspire AI
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform duration-300" />
            </button>

            <div className="flex items-center justify-center gap-3 mt-12">
              {['Unity Catalog', 'Foundation Models', 'Genie'].map((tag) => (
                <span key={tag} className="text-[10px] font-medium px-3 py-1.5 rounded-lg" style={{ color: C.textFaint, background: C.btnBg, border: `1px solid ${C.btnBorder}` }}>{tag}</span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
