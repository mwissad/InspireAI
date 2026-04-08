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
  // Scattered tables (will cluster into domains on scroll)
  { id: 0, label: 'orders', x: 12, y: 20, domain: 0 },
  { id: 1, label: 'customers', x: 25, y: 35, domain: 0 },
  { id: 2, label: 'segments', x: 18, y: 50, domain: 0 },
  { id: 3, label: 'clicks', x: 8, y: 65, domain: 0 },
  { id: 4, label: 'transactions', x: 42, y: 15, domain: 1 },
  { id: 5, label: 'ledger', x: 55, y: 28, domain: 1 },
  { id: 6, label: 'invoices', x: 48, y: 45, domain: 1 },
  { id: 7, label: 'payroll', x: 60, y: 60, domain: 1 },
  { id: 8, label: 'shipments', x: 75, y: 20, domain: 2 },
  { id: 9, label: 'inventory', x: 88, y: 35, domain: 2 },
  { id: 10, label: 'sensors', x: 80, y: 55, domain: 2 },
  { id: 11, label: 'equipment', x: 92, y: 68, domain: 2 },
  { id: 12, label: 'alerts', x: 35, y: 72, domain: 3 },
  { id: 13, label: 'compliance', x: 50, y: 80, domain: 3 },
  { id: 14, label: 'access_logs', x: 65, y: 75, domain: 3 },
];

const CONSTELLATION_EDGES = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5],
  [4, 5], [5, 6], [6, 7], [4, 8], [5, 9],
  [8, 9], [9, 10], [10, 11], [8, 11],
  [6, 12], [7, 13], [12, 13], [13, 14], [12, 14],
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
              color: '#FFF8ED',
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

/* SVG Neural Constellation — dynamic, alive */
function NeuralConstellation({ progress, visible }) {
  const nodeOpacity = Math.min(1, progress * 3);
  const edgeProgress = Math.max(0, Math.min(1, (progress - 0.2) * 2));
  const glowIntensity = Math.max(0, (progress - 0.5) * 2);
  const labelOpacity = Math.max(0, (progress - 0.6) * 2.5);
  const alive = glowIntensity > 0.3; // constellation is "alive" after this point

  return (
    <svg
      viewBox="0 0 100 90"
      className={`w-full h-full transition-opacity duration-1000 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ filter: `drop-shadow(0 0 ${glowIntensity * 25}px rgba(255,54,33,${glowIntensity * 0.2}))` }}
    >
      <defs>
        {/* Animated gradient for data flow along edges */}
        {DOMAIN_COLORS.map((color, i) => (
          <linearGradient key={`flow-${i}`} id={`flow-${i}`} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={color} stopOpacity="0">
              <animate attributeName="offset" values="-0.3;1" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
            </stop>
            <stop offset="15%" stopColor={color} stopOpacity="0.8">
              <animate attributeName="offset" values="-0.15;1.15" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
            </stop>
            <stop offset="30%" stopColor={color} stopOpacity="0">
              <animate attributeName="offset" values="0;1.3" dur={`${2 + i * 0.5}s`} repeatCount="indefinite" />
            </stop>
          </linearGradient>
        ))}
        {/* Glow filter for nodes */}
        <filter id="nodeGlow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background grid — subtle */}
      {alive && (
        <g opacity={0.03}>
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`gx${i}`} x1={i * 10 + 5} y1={0} x2={i * 10 + 5} y2={90} stroke="#FFF8ED" strokeWidth={0.2} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`gy${i}`} x1={0} y1={i * 10 + 5} x2={100} y2={i * 10 + 5} stroke="#FFF8ED" strokeWidth={0.2} />
          ))}
        </g>
      )}

      {/* Static edges — base lines */}
      {CONSTELLATION_EDGES.map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const edgeColor = DOMAIN_COLORS[na.domain] || '#FF3621';
        return (
          <line
            key={`e-base-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={edgeColor}
            strokeWidth={0.3}
            strokeOpacity={edgeProgress * 0.25}
            strokeDasharray="1.5 1.5"
            strokeDashoffset={100 - edgeProgress * 100}
            style={{ transition: 'all 0.8s ease-out' }}
          />
        );
      })}

      {/* Animated data flow along edges — "thinking" pulses */}
      {alive && CONSTELLATION_EDGES.map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const domainIdx = na.domain;
        return (
          <line
            key={`e-flow-${i}`}
            x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke={`url(#flow-${domainIdx})`}
            strokeWidth={0.6}
            strokeLinecap="round"
            opacity={glowIntensity * 0.7}
          />
        );
      })}

      {/* Traveling particles along edges */}
      {alive && CONSTELLATION_EDGES.filter((_, i) => i % 3 === 0).map(([a, b], i) => {
        const na = CONSTELLATION_NODES[a];
        const nb = CONSTELLATION_NODES[b];
        const color = DOMAIN_COLORS[na.domain];
        return (
          <circle key={`particle-${i}`} r={0.5} fill={color} opacity={0.8}>
            <animateMotion
              dur={`${2 + (i % 3)}s`}
              repeatCount="indefinite"
              path={`M${na.x},${na.y} L${nb.x},${nb.y}`}
            />
          </circle>
        );
      })}

      {/* Nodes */}
      {CONSTELLATION_NODES.map((node) => {
        const color = DOMAIN_COLORS[node.domain];
        const pulseDelay = node.id * 0.3;
        return (
          <g key={node.id}>
            {/* Outer glow ring — pulses when alive */}
            <circle cx={node.x} cy={node.y} r={glowIntensity * 4} fill="none" stroke={color} strokeWidth={0.2} opacity={glowIntensity * 0.2}>
              {alive && (
                <animate attributeName="r" values={`${glowIntensity * 3};${glowIntensity * 5};${glowIntensity * 3}`} dur="3s" begin={`${pulseDelay}s`} repeatCount="indefinite" />
              )}
            </circle>
            {/* Soft glow */}
            <circle cx={node.x} cy={node.y} r={glowIntensity * 2.5} fill={color} opacity={glowIntensity * 0.12} filter={alive ? 'url(#nodeGlow)' : undefined}>
              {alive && (
                <animate attributeName="opacity" values={`${glowIntensity * 0.08};${glowIntensity * 0.18};${glowIntensity * 0.08}`} dur="2.5s" begin={`${pulseDelay}s`} repeatCount="indefinite" />
              )}
            </circle>
            {/* Node dot — breathes */}
            <circle
              cx={node.x} cy={node.y}
              r={0.8 + glowIntensity * 0.8}
              fill={color}
              opacity={nodeOpacity}
              style={{ transition: 'all 0.6s ease-out' }}
            >
              {alive && (
                <animate attributeName="r" values={`${0.8 + glowIntensity * 0.6};${0.8 + glowIntensity * 1.2};${0.8 + glowIntensity * 0.6}`} dur="2s" begin={`${pulseDelay}s`} repeatCount="indefinite" />
              )}
            </circle>
            {/* Label */}
            <text
              x={node.x} y={node.y - 3}
              textAnchor="middle"
              fill="#FFF8ED"
              fontSize={2}
              fontFamily="monospace"
              opacity={labelOpacity * 0.6}
              style={{ transition: 'opacity 0.5s' }}
            >
              {node.label}
            </text>
          </g>
        );
      })}

      {/* Domain cluster labels */}
      {DOMAIN_NAMES.map((name, i) => {
        const domainNodes = CONSTELLATION_NODES.filter((n) => n.domain === i);
        const cx = domainNodes.reduce((s, n) => s + n.x, 0) / domainNodes.length;
        const cy = domainNodes.reduce((s, n) => s + n.y, 0) / domainNodes.length;
        return (
          <g key={name} opacity={Math.max(0, (glowIntensity - 0.3) * 2)} style={{ transition: 'opacity 0.8s' }}>
            {/* Domain background pill */}
            <rect
              x={cx - 15} y={cy + 5} width={30} height={5} rx={2.5}
              fill={DOMAIN_COLORS[i]} opacity={0.1}
            />
            <text
              x={cx} y={cy + 8.5}
              textAnchor="middle"
              fill={DOMAIN_COLORS[i]}
              fontSize={2.2}
              fontWeight="600"
            >
              {name}
            </text>
          </g>
        );
      })}

      {/* Central pulse — "heartbeat" of the AI */}
      {alive && (
        <circle cx={50} cy={45} r={1} fill="#FF3621" opacity={0.3}>
          <animate attributeName="r" values="0;35;0" dur="4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.15;0;0.15" dur="4s" repeatCount="indefinite" />
        </circle>
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
function UseCaseCard({ uc, index, visible }) {
  return (
    <div
      className={`flex items-center gap-4 px-5 py-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] rounded-2xl transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: `${index * 120}ms` }}
    >
      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: uc.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#FFF8ED] truncate">{uc.title}</p>
        <p className="text-[11px] text-[#ABABAB]">{uc.domain}</p>
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

export default function LandingPage({ onStart }) {
  const typedText = useTypingEffect(HERO_WORDS);
  const scrollContainerRef = useRef(null);
  const { progress, section } = useScrollProgress(scrollContainerRef);

  return (
    <div className="h-screen bg-[#0A0808] text-[#FFF8ED] overflow-hidden relative">
      {/* ═══ Progress bar ═══ */}
      <div className="fixed top-0 left-0 right-0 z-[100] h-[2px]">
        <div className="h-full bg-gradient-to-r from-[#FF3621] to-[#FF8A6B]" style={{ width: `${progress * 100}%`, transition: 'width 0.15s' }} />
      </div>

      {/* ═══ The Inspire Orb — persistent scroll-linked object ═══ */}
      <InspireOrb progress={progress} section={section} />

      {/* ═══ Nav — always visible ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(255,248,237,0.05)] bg-[#0A0808]/70 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DatabricksLogo className="w-8 h-8" />
            <span className="font-bold text-xl tracking-[-0.03em] text-[#FFF8ED]">Inspire AI</span>
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
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-300 ${
                  section === i ? 'bg-[#FF3621]/15 text-[#FF3621]' : 'text-[#ABABAB] hover:text-[#FFF8ED]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[#FFF8ED] bg-[rgba(255,248,237,0.06)] border border-[rgba(255,248,237,0.08)] rounded-xl hover:bg-[rgba(255,248,237,0.1)] transition-all duration-300"
          >
            Launch App
            <ArrowRight size={14} />
          </button>
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
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[rgba(255,248,237,0.04)] border border-[rgba(255,248,237,0.08)] rounded-full mb-8">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3621] opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3621]" />
                  </span>
                  <span className="text-[11px] font-medium text-[#ABABAB]">Powered by Databricks Foundation Models</span>
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-0.04em] mb-6">
                  Discover{' '}
                  <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">{typedText}</span>
                  <span className="text-[#FF3621] animate-cursor-blink">|</span>
                  <br />
                  <span className="text-[#7A716E]">from your data.</span>
                </h1>

                <p className="text-base sm:text-lg text-[#ABABAB] mb-10 max-w-lg leading-relaxed">
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

                <div className="flex items-center gap-2 text-sm text-[#7A716E] mt-5">
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
            <span className="text-[10px] font-medium text-[#7A716E] uppercase tracking-[0.15em]">Scroll to explore</span>
            <ChevronDown size={16} className="text-[#7A716E]" />
          </div>
        </section>

        {/* ═══ SECTION 2: Neural Constellation — "Analyze" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <FloatingSchemas opacity={0.02} />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0808] via-[#0D0A0A] to-[#100C0C]" />

          <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
            <div className="text-center mb-8">
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-3">How Inspire Thinks</span>
              <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] transition-all duration-1000 ${section >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                Your tables.{' '}
                <span className="text-[#7A716E]">Connected.</span>
              </h2>
              <p className={`text-sm text-[#ABABAB] mt-3 max-w-md mx-auto transition-all duration-1000 delay-200 ${section >= 1 ? 'opacity-100' : 'opacity-0'}`}>
                Inspire AI maps relationships across your Unity Catalog, discovers hidden connections, and clusters tables into business domains.
              </p>
            </div>

            <div className="h-[50vh] max-h-[500px]">
              <NeuralConstellation
                progress={section >= 1 ? Math.min(1, (progress - 0.15) * 4) : 0}
                visible={section >= 1}
              />
            </div>

            {/* Domain legend */}
            <div className={`flex justify-center gap-6 mt-6 transition-all duration-700 ${section >= 1 && progress > 0.3 ? 'opacity-100' : 'opacity-0'}`}>
              {DOMAIN_NAMES.map((name, i) => (
                <div key={name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: DOMAIN_COLORS[i] }} />
                  <span className="text-[11px] text-[#ABABAB]">{name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION 3: Pipeline — "Insights" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#100C0C] via-[#0D0A0A] to-[#0A0808]" />
          <div className="absolute top-[30%] right-[-5%] w-[30%] h-[30%] rounded-full bg-[#FF3621]/[0.03] blur-[100px]" aria-hidden="true" />

          <div className="relative z-10 max-w-5xl mx-auto px-6 w-full">
            <div className="text-center mb-16">
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.15em] block mb-3">The Pipeline</span>
              <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.03em] transition-all duration-1000 ${section >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                From catalog to strategy{' '}
                <span className="text-[#7A716E]">in minutes.</span>
              </h2>
            </div>

            {/* Pipeline steps — large */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-2">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2 sm:gap-2">
                  <div
                    className={`flex items-center gap-3 px-6 py-4 bg-[rgba(255,248,237,0.03)] border border-[rgba(255,248,237,0.06)] rounded-2xl transition-all duration-700 hover:bg-[rgba(255,248,237,0.06)] hover:border-[#FF3621]/20 group ${
                      section >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                    }`}
                    style={{ transitionDelay: `${i * 150}ms` }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#FF3621]/10 flex items-center justify-center">
                      <step.icon size={20} className="text-[#FF3621] group-hover:scale-110 transition-transform" />
                    </div>
                    <div>
                      <span className="text-[10px] text-[#7A716E] font-mono">0{i + 1}</span>
                      <p className="text-sm font-semibold text-[#FFF8ED]">{step.label}</p>
                    </div>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <ChevronRight size={16} className="text-[rgba(255,248,237,0.1)] hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ SECTION 4: The Inspire Agent ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0808] via-[#080A10] to-[#0A0808]" />
          {/* Subtle blue-ish glow to match the robot's lighting */}
          <div className="absolute top-[20%] left-[30%] w-[40%] h-[50%] rounded-full bg-[#1a2a4a]/[0.15] blur-[120px]" aria-hidden="true" />
          <div className="absolute bottom-[10%] right-[20%] w-[25%] h-[30%] rounded-full bg-[#FF3621]/[0.04] blur-[100px]" aria-hidden="true" />

          <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              {/* Left: Agent image */}
              <div className={`relative transition-all duration-1000 ${section >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-12'}`}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0808] via-transparent to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#0A0808] z-10 pointer-events-none" />
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
                <p className="text-base text-[#ABABAB] leading-relaxed mb-8 max-w-md">
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
                      <span className="text-sm text-[#FFF8ED]/70">{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ SECTION 5: Results — "Results" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[#0A0808]" />
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
                <UseCaseCard key={uc.title} uc={uc} index={i} visible={section >= 4} />
              ))}
            </div>

            <p className={`text-center text-sm text-[#7A716E] mt-8 transition-all duration-700 delay-700 ${section >= 4 ? 'opacity-100' : 'opacity-0'}`}>
              + Genie code instructions, PDF catalogs, executive presentations, and more.
            </p>
          </div>
        </section>

        {/* ═══ SECTION 6: CTA — "Start" ═══ */}
        <section className="h-screen snap-start relative flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0808] to-[#0D0808]" />
          <div className="absolute top-[40%] left-[40%] w-[30%] h-[30%] rounded-full bg-[#FF3621]/[0.06] blur-[120px]" aria-hidden="true" />

          <div className="relative z-10 text-center max-w-2xl mx-auto px-6">
            <h2 className={`text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.1] mb-6 transition-all duration-1000 ${section >= 5 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <span className="text-[rgba(255,248,237,0.15)]">Your data already has the answers.</span>
              <br />
              <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">Inspire finds the questions.</span>
            </h2>

            <p className={`text-[#ABABAB] mb-10 transition-all duration-700 delay-200 ${section >= 5 ? 'opacity-100' : 'opacity-0'}`}>
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
                <span key={tag} className="text-[10px] text-[#7A716E] font-medium px-3 py-1.5 bg-[rgba(255,248,237,0.03)] border border-[rgba(255,248,237,0.05)] rounded-lg">{tag}</span>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
