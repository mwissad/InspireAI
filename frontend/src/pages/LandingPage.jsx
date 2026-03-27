import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
  Sparkles,
  Layers,
  Database,
  Globe2,
  FileText,
  Target,
  BrainCircuit,
  ChevronRight,
  ChevronLeft,
  TrendingUp,
  ShoppingCart,
  HeartPulse,
  Factory,
  Wifi,
  Landmark,
  GraduationCap,
  Plane,
  Terminal,
  Play,
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

/* ─── Industry showcase with example use cases ─── */
const INDUSTRIES = [
  {
    name: 'Retail & E-Commerce',
    icon: ShoppingCart,
    color: '#FF3621',
    useCases: [
      { title: 'Predict Customer Churn with Preemptive Retention Offers', priority: 'Ultra High', domain: 'Customer Intelligence' },
      { title: 'Forecast Category Demand with Dynamic Inventory Rebalancing', priority: 'Very High', domain: 'Supply Chain' },
      { title: 'Detect Pricing Anomalies with Competitive Response Strategy', priority: 'High', domain: 'Revenue Optimization' },
      { title: 'Classify Product Affinity with Cross-Sell Bundle Recommendations', priority: 'Very High', domain: 'Marketing' },
    ],
  },
  {
    name: 'Financial Services',
    icon: Landmark,
    color: '#3B82F6',
    useCases: [
      { title: 'Detect Transaction Fraud Patterns with Real-Time Alert Escalation', priority: 'Ultra High', domain: 'Risk Management' },
      { title: 'Predict Loan Default Probability with Portfolio Hedging Strategy', priority: 'Very High', domain: 'Credit Risk' },
      { title: 'Classify Customer Segments with Personalized Product Offerings', priority: 'High', domain: 'Wealth Management' },
      { title: 'Forecast Market Volatility with Dynamic Position Rebalancing', priority: 'Very High', domain: 'Trading Analytics' },
    ],
  },
  {
    name: 'Healthcare',
    icon: HeartPulse,
    color: '#22C55E',
    useCases: [
      { title: 'Predict Patient Readmission Risk with Care Plan Optimization', priority: 'Ultra High', domain: 'Clinical Operations' },
      { title: 'Detect Drug Interaction Patterns with Safety Alert Prioritization', priority: 'Very High', domain: 'Pharmacovigilance' },
      { title: 'Forecast Bed Capacity with Dynamic Staffing Recommendations', priority: 'High', domain: 'Hospital Operations' },
      { title: 'Classify Treatment Outcomes with Protocol Effectiveness Scoring', priority: 'Very High', domain: 'Research & Trials' },
    ],
  },
  {
    name: 'Manufacturing',
    icon: Factory,
    color: '#EAB308',
    useCases: [
      { title: 'Predict Equipment Failure with Preventive Maintenance Scheduling', priority: 'Ultra High', domain: 'Asset Management' },
      { title: 'Detect Quality Deviation with Root Cause Investigation Plan', priority: 'Very High', domain: 'Quality Control' },
      { title: 'Optimize Production Line Throughput with Bottleneck Analysis', priority: 'High', domain: 'Operations' },
      { title: 'Forecast Raw Material Demand with Supplier Risk Assessment', priority: 'Very High', domain: 'Supply Chain' },
    ],
  },
  {
    name: 'Telecom & IoT',
    icon: Wifi,
    color: '#A855F7',
    useCases: [
      { title: 'Predict Network Congestion with Proactive Capacity Allocation', priority: 'Ultra High', domain: 'Network Operations' },
      { title: 'Detect Subscriber Churn Signals with Retention Intervention Queue', priority: 'Very High', domain: 'Customer Retention' },
      { title: 'Classify Usage Behavior Tiers with Dynamic Pricing Optimization', priority: 'High', domain: 'Revenue Management' },
      { title: 'Forecast Device Failure with Preemptive Replacement Strategy', priority: 'Very High', domain: 'IoT Management' },
    ],
  },
  {
    name: 'Education',
    icon: GraduationCap,
    color: '#F97316',
    useCases: [
      { title: 'Predict Student Dropout Risk with Early Intervention Programs', priority: 'Ultra High', domain: 'Student Success' },
      { title: 'Classify Learning Patterns with Personalized Curriculum Design', priority: 'Very High', domain: 'Academic Analytics' },
      { title: 'Forecast Enrollment Trends with Resource Allocation Strategy', priority: 'High', domain: 'Institutional Planning' },
      { title: 'Detect Academic Integrity Issues with Fair Assessment Framework', priority: 'Very High', domain: 'Compliance' },
    ],
  },
];

/* ─── Bento Feature Cards ─── */
const BENTO_FEATURES = [
  {
    icon: BrainCircuit,
    title: 'AI-Powered Discovery',
    desc: 'Automatically scan Unity Catalog metadata and identify high-value analytics use cases using foundation models.',
    span: 'md:col-span-2',
    accent: '#FF3621',
  },
  {
    icon: Layers,
    title: 'Domain Clustering',
    desc: 'Intelligently group use cases into business domains with priority scoring.',
    span: '',
    accent: '#FF6B50',
  },
  {
    icon: Shield,
    title: 'Enterprise Grade',
    desc: 'Built on Unity Catalog governance. Your data never leaves your workspace.',
    span: '',
    accent: '#FF3621',
  },
  {
    icon: Sparkles,
    title: 'Genie Code Instructions',
    desc: 'Generate ready-to-use Genie code instructions for every use case — deploy directly to Databricks.',
    span: 'md:col-span-2',
    accent: '#FF6B50',
  },
];

const STATS = [
  { value: 100, suffix: '+', label: 'Use Cases Per Run' },
  { value: 8, suffix: '', label: 'Business Domains' },
  { value: 30, prefix: '<', suffix: 'min', label: 'End-to-End' },
  { value: 15, suffix: '+', label: 'Languages' },
];

const PIPELINE_STEPS = [
  { icon: Database, label: 'Scan Catalog' },
  { icon: BrainCircuit, label: 'Generate Use Cases' },
  { icon: Target, label: 'Score & Prioritize' },
  { icon: Sparkles, label: 'Genie Instructions' },
  { icon: FileText, label: 'Deliver Artifacts' },
];

/* ─── Animated typing effect for hero ─── */
const HERO_WORDS = ['Use Cases', 'Business Value', 'Data Strategy', 'AI Insights'];

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
        if (charIdx + 1 === word.length) {
          setTimeout(() => setDeleting(true), pauseMs);
        } else {
          setCharIdx(charIdx + 1);
        }
      } else {
        setDisplay(word.slice(0, charIdx));
        if (charIdx === 0) {
          setDeleting(false);
          setWordIdx((wordIdx + 1) % words.length);
        } else {
          setCharIdx(charIdx - 1);
        }
      }
    }, deleting ? typingSpeed / 2 : typingSpeed);
    return () => clearTimeout(timeout);
  }, [charIdx, deleting, wordIdx, words, typingSpeed, pauseMs]);

  return display;
}

/* ─── Terminal typing simulation ─── */
const TERMINAL_LINES = [
  { text: '$ inspire run --catalog main --schema analytics', delay: 0, color: '#22C55E' },
  { text: '', delay: 600, color: '' },
  { text: 'Connecting to Databricks workspace...', delay: 800, color: '#8A8F98' },
  { text: 'Authenticated via OAuth  [PAT token]', delay: 1200, color: '#8A8F98' },
  { text: '', delay: 1400, color: '' },
  { text: 'Scanning Unity Catalog...', delay: 1600, color: '#FF3621' },
  { text: '  Found 47 tables across 6 schemas', delay: 2200, color: '#EDEDEF' },
  { text: '  Indexed 312 columns with metadata', delay: 2800, color: '#EDEDEF' },
  { text: '', delay: 3200, color: '' },
  { text: 'Generating use cases with Foundation Model...', delay: 3500, color: '#FF3621' },
  { text: '  [============================] 100%', delay: 4800, color: '#22C55E' },
  { text: '', delay: 5000, color: '' },
  { text: '23 use cases discovered across 5 domains', delay: 5200, color: '#EDEDEF' },
  { text: '  Customer Intelligence  (7 use cases)', delay: 5600, color: '#FF6B50' },
  { text: '  Revenue Optimization   (5 use cases)', delay: 5900, color: '#FF6B50' },
  { text: '  Risk Management        (4 use cases)', delay: 6200, color: '#FF6B50' },
  { text: '  Supply Chain           (4 use cases)', delay: 6500, color: '#FF6B50' },
  { text: '  Operations             (3 use cases)', delay: 6800, color: '#FF6B50' },
  { text: '', delay: 7000, color: '' },
  { text: 'Generating Genie instructions... Done', delay: 7200, color: '#22C55E' },
  { text: 'Exporting PDF catalog... Done', delay: 7600, color: '#22C55E' },
  { text: '', delay: 7800, color: '' },
  { text: 'Run complete in 4m 23s', delay: 8000, color: '#FF3621' },
];

function useTerminalTyping() {
  const [lines, setLines] = useState([]);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const timers = [];
    setLines([]);

    TERMINAL_LINES.forEach((line, i) => {
      const timer = setTimeout(() => {
        setLines((prev) => [...prev, line]);
      }, line.delay);
      timers.push(timer);
    });

    // Restart cycle after all lines shown
    const restartTimer = setTimeout(() => {
      setCycle((c) => c + 1);
    }, 10000);
    timers.push(restartTimer);

    return () => timers.forEach(clearTimeout);
  }, [cycle]);

  return lines;
}

/* ─── Scroll-triggered visibility hook ─── */
function useInView(options = {}) {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, isInView];
}

/* ─── Animated counter hook ─── */
function useAnimatedCounter(target, isVisible, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isVisible) return;
    let start = 0;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }, [isVisible, target, duration]);

  return count;
}

/* ─── Priority badge color helper ─── */
function priBadge(priority) {
  const p = priority.toLowerCase();
  if (p.includes('ultra')) return 'bg-[#FF3621]/20 text-[#FF6B50] border-[#FF3621]/30';
  if (p.includes('very')) return 'bg-[#FF3621]/15 text-[#FF8A6B] border-[#FF3621]/20';
  return 'bg-white/5 text-white/50 border-white/10';
}

/* ─── Scroll progress bar ─── */
function ScrollProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    function handleScroll() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docHeight > 0 ? (scrollTop / docHeight) * 100 : 0);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2px] bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
      <div
        className="absolute top-0 h-full bg-[#FF3621]/40 blur-sm"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

/* ─── Animated stat card ─── */
function StatCard({ stat, isVisible }) {
  const count = useAnimatedCounter(stat.value, isVisible);
  return (
    <div className="text-center group">
      <div className="text-3xl sm:text-5xl font-bold tracking-[-0.03em] bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent mb-2 tabular-nums">
        {stat.prefix || ''}{count}{stat.suffix || ''}
      </div>
      <div className="text-[11px] font-medium text-[#8A8F98] uppercase tracking-[0.12em]">{stat.label}</div>
    </div>
  );
}

/* ─── Bento card with tilt ─── */
function BentoCard({ feature, isVisible, index }) {
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;
    card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.08)] rounded-2xl p-7 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${feature.span} ${
        isVisible ? 'animate-fade-in-up' : 'opacity-0 translate-y-5'
      }`}
      style={{ animationDelay: `${index * 120}ms`, animationFillMode: 'both' }}
    >
      {/* Hover gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FF3621]/0 to-[#FF3621]/0 group-hover:from-[#FF3621]/[0.06] group-hover:to-transparent transition-all duration-500 pointer-events-none" />
      {/* Hover border glow */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,54,33,0.2), 0 0 20px rgba(255,54,33,0.05)' }} />
      <div className="relative">
        <div
          className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-5 transition-all duration-300"
          style={{ background: `${feature.accent}15` }}
        >
          <feature.icon size={20} style={{ color: feature.accent }} className="group-hover:scale-110 transition-transform duration-300" />
        </div>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-[#EDEDEF] mb-2">{feature.title}</h3>
        <p className="text-sm text-[#8A8F98] leading-relaxed">{feature.desc}</p>
      </div>
    </div>
  );
}

/* ─── Industry card with gradient border ─── */
function IndustryCard({ ind }) {
  return (
    <div className="shrink-0 w-[380px] sm:w-[420px] snap-start group relative">
      {/* Animated gradient border */}
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.08)] to-transparent opacity-100 group-hover:opacity-100 animate-shimmer-border" />
      <div className="absolute -inset-[1px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-border" style={{ background: `linear-gradient(135deg, ${ind.color}30, transparent 40%, transparent 60%, ${ind.color}20)` }} />
      <div className="relative bg-[#0A0A0C] rounded-2xl overflow-hidden">
        {/* Card header */}
        <div className="px-6 pt-6 pb-4 border-b border-[rgba(255,255,255,0.04)]">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${ind.color}15` }}
            >
              <ind.icon size={20} style={{ color: ind.color }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#EDEDEF]">{ind.name}</h3>
              <p className="text-[10px] text-[#8A8F98]">{ind.useCases.length} use cases generated</p>
            </div>
          </div>
          <div className="flex gap-1.5">
            {ind.useCases.map((_, j) => (
              <div key={j} className="h-1 flex-1 rounded-full" style={{ background: `${ind.color}20` }}>
                <div className="h-full rounded-full transition-all duration-700" style={{ background: ind.color, width: `${100 - j * 15}%` }} />
              </div>
            ))}
          </div>
        </div>

        {/* Use cases list */}
        <div className="px-4 py-3 space-y-1.5">
          {ind.useCases.map((uc, j) => (
            <div
              key={j}
              className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.05)] transition-all duration-200"
            >
              <div className="shrink-0 w-5 h-5 rounded-md bg-[rgba(255,255,255,0.05)] flex items-center justify-center mt-0.5">
                <span className="text-[9px] font-bold text-[#8A8F98]">{j + 1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[rgba(255,255,255,0.8)] leading-snug mb-1.5">
                  {uc.title}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${priBadge(uc.priority)}`}>
                    {uc.priority}
                  </span>
                  <span className="text-[9px] text-[#8A8F98]">{uc.domain}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Card footer */}
        <div className="px-6 py-3 border-t border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.01)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#8A8F98]/60">Generated by Inspire AI</span>
            <div className="flex items-center gap-1">
              <Sparkles size={10} className="text-[#FF3621]/50" />
              <span className="text-[10px] text-[#FF3621]/50 font-medium">AI scored</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Live Terminal Component ─── */
function LiveTerminal() {
  const terminalLines = useTerminalTyping();
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [terminalLines]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-[rgba(255,255,255,0.08)] bg-[#0A0A0C] shadow-2xl shadow-black/50">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 text-center">
          <span className="text-[11px] font-medium text-[#8A8F98]">
            <Terminal size={11} className="inline mr-1.5 -mt-0.5" />
            inspire-ai
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-50" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E]" />
          </span>
          <span className="text-[10px] text-[#22C55E] font-medium">live</span>
        </div>
      </div>
      {/* Terminal body */}
      <div
        ref={scrollContainerRef}
        className="p-4 h-[280px] sm:h-[320px] overflow-y-auto font-mono text-[12px] leading-[1.7] scrollbar-hide"
      >
        {terminalLines.map((line, i) => (
          <div key={`${i}-${line.text}`} className="animate-terminal-line" style={{ animationDelay: `${i * 30}ms` }}>
            {line.text === '' ? (
              <br />
            ) : (
              <span style={{ color: line.color }}>{line.text}</span>
            )}
          </div>
        ))}
        <span className="inline-block w-2 h-4 bg-[#FF3621] animate-cursor-blink ml-0.5 align-middle" />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   LANDING PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function LandingPage({ onStart }) {
  const typedText = useTypingEffect(HERO_WORDS);
  const scrollRef = useRef(null);
  const [activeIndustry, setActiveIndustry] = useState(0);

  // Intersection observer refs
  const [heroRef, heroVisible] = useInView();
  const [statsRef, statsVisible] = useInView();
  const [bentoRef, bentoVisible] = useInView();
  const [industryRef, industryVisible] = useInView();
  const [howRef, howVisible] = useInView();
  const [ctaRef, ctaVisible] = useInView();
  const [statementRef, statementVisible] = useInView();

  const scrollTo = (dir) => {
    if (!scrollRef.current) return;
    const w = scrollRef.current.offsetWidth;
    scrollRef.current.scrollBy({ left: dir * w * 0.8, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-[#EDEDEF] overflow-x-hidden">
      {/* ═══ Scroll Progress Bar ═══ */}
      <ScrollProgressBar />

      {/* ═══ Ambient Aurora Background ═══ */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-[#FF3621]/[0.06] blur-[150px] animate-ambient-float" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[#FF6B50]/[0.04] blur-[120px] animate-ambient-float-delayed" />
        <div className="absolute top-[40%] left-[50%] w-[30%] h-[30%] rounded-full bg-[#FF3621]/[0.03] blur-[100px] animate-ambient-pulse" />
        {/* Extra ambient blob for depth */}
        <div className="absolute top-[60%] left-[20%] w-[25%] h-[25%] rounded-full bg-[#FF3621]/[0.02] blur-[80px] animate-ambient-float" style={{ animationDelay: '-4s' }} />
      </div>

      {/* ═══ Nav ═══ */}
      <nav className="relative z-20 border-b border-[rgba(255,255,255,0.05)] bg-[#09090B]/80 backdrop-blur-2xl">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DatabricksLogo className="w-8 h-8" />
            <span className="font-bold text-xl tracking-[-0.03em]">Inspire AI</span>
            <span className="text-[10px] font-semibold text-[#FF3621] border border-[#FF3621]/30 bg-[#FF3621]/10 rounded-full px-2 py-0.5">
              v4.5
            </span>
          </div>
          <button
            onClick={onStart}
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#EDEDEF] bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.08)] rounded-xl hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.12)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
          >
            Launch App
            <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      {/* ═══ Hero ═══ */}
      <section ref={heroRef} className="relative z-10 max-w-6xl mx-auto px-6 pt-20 sm:pt-24 pb-16 sm:pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Text content */}
          <div className={`${heroVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] rounded-full mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3621] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3621]" />
              </span>
              <span className="text-[11px] font-medium text-[#8A8F98]">Powered by Databricks Foundation Models</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-[-0.04em] mb-6">
              Discover{' '}
              <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">
                {typedText}
              </span>
              <span className="text-[#FF3621] animate-cursor-blink">|</span>
              <br />
              <span className="text-[#8A8F98]/50">from your data.</span>
            </h1>

            <p className="text-base sm:text-lg text-[#8A8F98] mb-10 max-w-xl leading-relaxed">
              AI-powered analytics use case discovery from your Unity Catalog metadata.
              Scored, prioritized, and implementation-ready.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={onStart}
                className="group relative inline-flex items-center gap-2.5 px-8 py-4 bg-gradient-to-r from-[#FF3621] to-[#E02E1B] text-white text-sm font-bold rounded-xl hover:from-[#FF4A36] hover:to-[#FF3621] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-lg shadow-[#FF3621]/20 hover:shadow-2xl hover:shadow-[#FF3621]/30 hover:-translate-y-0.5"
              >
                <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#FF3621] to-[#FF3621] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
                <span className="relative flex items-center gap-2.5">
                  Get Started
                  <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-300" />
                </span>
              </button>
              <div className="flex items-center gap-2 text-sm text-[#8A8F98]/60">
                <Globe2 size={14} />
                <span>No setup required — runs on your Databricks workspace</span>
              </div>
            </div>
          </div>

          {/* Right: Live Terminal Preview */}
          <div className={`${heroVisible ? 'animate-fade-in-up' : 'opacity-0'}`} style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
            <LiveTerminal />
          </div>
        </div>

        {/* Pipeline steps */}
        <div className={`mt-16 sm:mt-20 flex flex-wrap items-center justify-center gap-2 ${heroVisible ? 'animate-fade-in-up' : 'opacity-0'}`} style={{ animationDelay: '400ms', animationFillMode: 'both' }}>
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-xl hover:bg-[rgba(255,255,255,0.07)] hover:border-[#FF3621]/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group">
                <step.icon size={15} className="text-[#FF3621] group-hover:scale-110 transition-transform duration-300" />
                <span className="text-xs font-semibold text-[#8A8F98] group-hover:text-[#EDEDEF] transition-colors duration-300 whitespace-nowrap">{step.label}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <ChevronRight size={14} className="text-[rgba(255,255,255,0.12)]" />}
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Scrolling Marquee ─ bold oversized text ═══ */}
      <section className="relative z-10 border-y border-[rgba(255,255,255,0.04)] overflow-hidden py-6 bg-[rgba(255,255,255,0.01)]">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(2)].map((_, dup) => (
            <div key={dup} className="flex items-center gap-8 px-4">
              {['USE CASES', 'DOMAINS', 'SCORING', 'GENIE', 'PDF', 'EXCEL', 'NOTEBOOKS', 'STRATEGY', 'PRIORITY', 'AI', 'INSPIRE'].map((word, i) => (
                <span key={`${dup}-${i}`} className="flex items-center gap-8">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight text-[rgba(255,255,255,0.03)] select-none">
                    {word}
                  </span>
                  <span className="text-[#FF3621]/15 text-2xl">&#x25C6;</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Industry Showcase ═══ */}
      <section ref={industryRef} className="relative z-10 py-20">
        <div className={`max-w-6xl mx-auto px-6 mb-10 ${industryVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.12em] mb-3 block">
                What Inspire Generates
              </span>
              <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
                Real use cases.{' '}
                <span className="text-[#8A8F98]/40">Every industry.</span>
              </h2>
              <p className="text-sm text-[#8A8F98] mt-3 max-w-lg">
                Point Inspire at any data catalog and get scored, prioritized analytics use cases
                tailored to your business domain.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button onClick={() => scrollTo(-1)} className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center hover:bg-[rgba(255,255,255,0.08)] transition-all duration-300">
                <ChevronLeft size={18} className="text-[#8A8F98]" />
              </button>
              <button onClick={() => scrollTo(1)} className="w-10 h-10 rounded-xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] flex items-center justify-center hover:bg-[rgba(255,255,255,0.08)] transition-all duration-300">
                <ChevronRight size={18} className="text-[#8A8F98]" />
              </button>
            </div>
          </div>
        </div>

        {/* Industry pills */}
        <div className={`max-w-6xl mx-auto px-6 mb-6 ${industryVisible ? 'animate-fade-in-up' : 'opacity-0'}`} style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {INDUSTRIES.map((ind, i) => (
              <button
                key={ind.name}
                onClick={() => {
                  setActiveIndustry(i);
                  if (scrollRef.current) {
                    const card = scrollRef.current.children[i + 1]; // +1 for spacer
                    if (card) card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
                  }
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium whitespace-nowrap border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  activeIndustry === i
                    ? 'bg-[#FF3621]/15 border-[#FF3621]/30 text-[#FF3621]'
                    : 'bg-[rgba(255,255,255,0.04)] border-[rgba(255,255,255,0.08)] text-[#8A8F98] hover:text-[#EDEDEF] hover:bg-[rgba(255,255,255,0.07)]'
                }`}
              >
                <ind.icon size={13} />
                {ind.name}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable use case cards */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto px-6 pb-4 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
          onScroll={() => {
            if (!scrollRef.current) return;
            const sl = scrollRef.current.scrollLeft;
            const cw = scrollRef.current.children[1]?.offsetWidth || 400;
            setActiveIndustry(Math.min(Math.round(sl / (cw + 20)), INDUSTRIES.length - 1));
          }}
        >
          {/* Left padding spacer */}
          <div className="shrink-0 w-[calc((100vw-72rem)/2)]" style={{ minWidth: '1rem' }} />

          {INDUSTRIES.map((ind) => (
            <IndustryCard key={ind.name} ind={ind} />
          ))}

          {/* Right padding spacer */}
          <div className="shrink-0 w-[calc((100vw-72rem)/2)]" style={{ minWidth: '1rem' }} />
        </div>
      </section>

      {/* ═══ Big Statement ═══ */}
      <section ref={statementRef} className="relative z-10 py-20 overflow-hidden">
        <div className={`max-w-6xl mx-auto px-6 text-center ${statementVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.03em] leading-[1.1]">
            <span className="text-[rgba(255,255,255,0.08)]">Your data already has the answers.</span>
            <br />
            <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">
              Inspire finds the questions.
            </span>
          </h2>
        </div>
      </section>

      {/* ═══ Stats Strip ═══ */}
      <section ref={statsRef} className="relative z-10 border-y border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)]">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`${statsVisible ? 'animate-fade-in-up' : 'opacity-0'}`}
              style={{ animationDelay: `${i * 100}ms`, animationFillMode: 'both' }}
            >
              <StatCard stat={s} isVisible={statsVisible} />
            </div>
          ))}
        </div>
      </section>

      {/* ═══ Bento Grid Features ═══ */}
      <section ref={bentoRef} className="relative z-10 max-w-6xl mx-auto px-6 py-20">
        <div className={`text-center mb-14 ${bentoVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.12em] mb-3 block">Capabilities</span>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-[-0.02em]">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-[#FF3621] to-[#FF8A6B] bg-clip-text text-transparent">unlock data value</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {BENTO_FEATURES.map((f, i) => (
            <BentoCard key={f.title} feature={f} isVisible={bentoVisible} index={i} />
          ))}
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section ref={howRef} className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <div className={`bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-2xl p-8 sm:p-12 ${howVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <div className="text-center mb-12">
            <span className="text-[11px] font-medium text-[#FF3621] uppercase tracking-[0.12em] mb-3 block">How It Works</span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-[-0.02em]">From catalog to strategy in minutes</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'Point to Your Data', desc: 'Select catalogs, schemas, or tables from Unity Catalog. Inspire scans metadata and column structure.' },
              { step: '02', title: 'AI Generates Use Cases', desc: 'Foundation models analyze your schema, discover domains, and generate scored analytics use cases.' },
              { step: '03', title: 'Get Deliverables', desc: 'Receive prioritized use cases, Genie instructions, PDF catalogs, and executive presentations.' },
            ].map((item, i) => (
              <div
                key={item.step}
                className={`relative ${howVisible ? 'animate-fade-in-up' : 'opacity-0'}`}
                style={{ animationDelay: `${(i + 1) * 150}ms`, animationFillMode: 'both' }}
              >
                <div className="text-5xl font-bold text-[rgba(255,255,255,0.03)] mb-3 leading-none tracking-[-0.04em]">{item.step}</div>
                <h3 className="text-sm font-semibold text-[#EDEDEF] mb-2">{item.title}</h3>
                <p className="text-xs text-[#8A8F98] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ Bottom CTA ═══ */}
      <section ref={ctaRef} className="relative z-10 max-w-6xl mx-auto px-6 pb-20">
        <div className={`text-center ${ctaVisible ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <h2 className="text-2xl sm:text-3xl font-semibold mb-4 tracking-[-0.02em]">
            Ready to discover what your data can do?
          </h2>
          <p className="text-sm text-[#8A8F98] mb-8 max-w-md mx-auto">
            Launch Inspire AI and generate your first analytics strategy in under 30 minutes.
          </p>
          <button
            onClick={onStart}
            className="group relative inline-flex items-center gap-2.5 px-10 py-4 bg-gradient-to-r from-[#FF3621] to-[#E02E1B] text-white text-sm font-bold rounded-xl hover:from-[#FF4A36] hover:to-[#FF3621] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-lg shadow-[#FF3621]/20 hover:shadow-2xl hover:shadow-[#FF3621]/30 hover:-translate-y-0.5"
          >
            <span className="absolute inset-0 rounded-xl bg-[#FF3621] opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-500" />
            <span className="relative flex items-center gap-2.5">
              Launch Inspire AI
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-300" />
            </span>
          </button>
        </div>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="relative z-10 border-t border-[rgba(255,255,255,0.04)] bg-[#09090B]">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DatabricksLogo className="w-5 h-5" />
            <span className="text-xs text-[#8A8F98]/50 font-medium">Powered by Databricks</span>
          </div>
          <div className="flex items-center gap-3">
            {['Unity Catalog', 'Foundation Models', 'Genie'].map((tag) => (
              <span key={tag} className="text-[10px] text-[#8A8F98]/40 font-medium px-2.5 py-1 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.05)] rounded-lg">{tag}</span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
