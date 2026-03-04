import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  Cpu,
  Database,
  Brain,
  Zap,
  BarChart3,
  FileText,
  Presentation,
  Globe2,
} from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

/* ─── Animated particle field drawn on a canvas ─── */
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    let animId;
    let particles = [];

    const resize = () => {
      cvs.width = cvs.offsetWidth * devicePixelRatio;
      cvs.height = cvs.offsetHeight * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    // Create particles
    const W = () => cvs.offsetWidth;
    const H = () => cvs.offsetHeight;
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * W(),
        y: Math.random() * H(),
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        o: Math.random() * 0.4 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, W(), H());
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W();
        if (p.x > W()) p.x = 0;
        if (p.y < 0) p.y = H();
        if (p.y > H()) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 54, 33, ${p.o})`;
        ctx.fill();
      }
      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255, 54, 33, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}

/* ─── Typewriter effect for the terminal block ─── */
function useTypewriter(lines, speed = 35) {
  const [displayed, setDisplayed] = useState([]);
  const idx = useRef({ line: 0, char: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const { line, char } = idx.current;
      if (line >= lines.length) {
        clearInterval(id);
        return;
      }
      setDisplayed((prev) => {
        const copy = [...prev];
        copy[line] = (copy[line] || '') + lines[line][char];
        return copy;
      });
      idx.current.char++;
      if (idx.current.char >= lines[line].length) {
        idx.current.line++;
        idx.current.char = 0;
      }
    }, speed);
    return () => clearInterval(id);
  }, [lines, speed]);

  return displayed;
}

/* ─── ASCII Art rendered as a glowing terminal ─── */
const ASCII_LINES = [
  '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓',
  '┃    ____        _        _          _      _                             ┃',
  '┃   |  _ \\  __ _| |_ __ _| |__  _ __(_) ___| | _____                      ┃',
  '┃   | | | |/ _` | __/ _` | \'_ \\| \'__| |/ __| |/ / __|                     ┃',
  '┃   | |_| | (_| | || (_| | |_) | |  | | (__|   <\\__ \\                     ┃',
  '┃   |____/ \\__,_|\\__\\__,_|_.__/|_|  |_|\\___|_|\\_\\___/                     ┃',
  '┃       ___                      _                  _    ___              ┃',
  '┃      |_ _| _ __   ___  _ __   (_) _ __  ___      / \\  |_ _|             ┃',
  '┃       | | | \'_ \\ / __|| \'_ \\  | || \'__|/ _ \\    / _ \\  | |              ┃',
  '┃       | | | | | |\\__ \\| |_) | | || |  |  __/   / ___ \\ | |              ┃',
  '┃      |___||_| |_||___/| .__/  |_||_|   \\___|  /_/   \\_\\___|             ┃',
  '┃                       |_|                                               ┃',
  '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛',
];

function ASCIIHero() {
  const typedLines = useTypewriter(ASCII_LINES, 8);

  return (
    <div className="relative group">
      {/* Outer glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-db-red/20 via-db-orange/10 to-db-red/20 rounded-3xl blur-2xl opacity-60 group-hover:opacity-80 transition-opacity duration-700" />

      {/* Terminal window */}
      <div className="relative rounded-2xl border border-white/10 bg-db-darkest/90 backdrop-blur-xl overflow-hidden shadow-2xl shadow-db-red/10">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5 bg-db-navy/40">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
          <span className="flex-1 text-center text-[10px] text-slate-500 font-mono">
            inspire_ai — databricks
          </span>
        </div>

        {/* ASCII content */}
        <div className="p-4 sm:p-6 overflow-x-auto">
          <pre className="ascii-art text-[8px] sm:text-[10px] md:text-xs lg:text-sm font-mono leading-tight whitespace-pre text-db-red-light select-none">
            {typedLines.map((line, i) => (
              <span key={i} className="block ascii-line" style={{ animationDelay: `${i * 0.05}s` }}>
                {line}
              </span>
            ))}
            <span className="inline-block w-2 h-4 bg-db-red-light animate-pulse ml-0.5 align-middle" />
          </pre>
        </div>

        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none scanlines" />

        {/* Gradient overlay bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-db-darkest/60 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

/* ─── Feature cards ─── */
const FEATURES = [
  {
    icon: Brain,
    title: 'AI-Powered Generation',
    desc: 'Automatically generate use cases, data products, and business insights using LLMs.',
    color: 'from-purple-500 to-blue-500',
  },
  {
    icon: Database,
    title: 'Unity Catalog Native',
    desc: 'Leverages your Unity Catalog metadata to understand your data landscape.',
    color: 'from-db-teal to-emerald-500',
  },
  {
    icon: Cpu,
    title: 'Databricks Runtime',
    desc: 'Runs natively on Databricks with optimized Spark jobs and serverless compute.',
    color: 'from-db-red to-db-orange',
  },
  {
    icon: BarChart3,
    title: 'Sample Results & Dashboards',
    desc: 'Preview generated data products with sample queries and interactive dashboards.',
    color: 'from-db-gold to-amber-500',
  },
  {
    icon: FileText,
    title: 'PDF Catalog Export',
    desc: 'Generate a professional data product catalog in PDF format.',
    color: 'from-cyan-500 to-blue-500',
  },
  {
    icon: Presentation,
    title: 'Presentation Ready',
    desc: 'Auto-generate executive presentations from your data strategy.',
    color: 'from-pink-500 to-rose-500',
  },
];

/* ─── Stat counter ─── */
function AnimatedStat({ value, label, suffix = '' }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          let start = 0;
          const step = Math.max(1, Math.floor(value / 40));
          const id = setInterval(() => {
            start += step;
            if (start >= value) {
              setCount(value);
              clearInterval(id);
            } else {
              setCount(start);
            }
          }, 30);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="text-center">
      <p className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-db-red via-db-orange to-db-gold bg-clip-text text-transparent">
        {count}
        {suffix}
      </p>
      <p className="text-xs text-slate-500 mt-1 font-medium">{label}</p>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAIN LANDING PAGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function LandingPage({ onStart }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  return (
    <div className="min-h-screen bg-db-darkest relative overflow-hidden">
      {/* ─── Background effects ─── */}
      <ParticleCanvas />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-db-red/6 rounded-full blur-[200px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-db-orange/5 rounded-full blur-[180px]" />
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 w-[800px] h-[400px] bg-db-navy/15 rounded-full blur-[150px]" />
      </div>

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,54,33,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,54,33,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* ─── Content ─── */}
      <div className="relative z-10">
        {/* ─── Minimal top bar ─── */}
        <header className="flex items-center justify-between px-6 sm:px-10 py-5">
          <div className="flex items-center gap-3">
            <DatabricksLogo className="w-8 h-8" />
            <span className="text-base font-bold text-white tracking-tight">
              Databricks
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Globe2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-[11px] text-slate-500 font-mono">v4.1</span>
          </div>
        </header>

        {/* ─── Hero ─── */}
        <section className="max-w-5xl mx-auto px-4 sm:px-8 pt-8 sm:pt-16 pb-12">
          <div
            className={`transition-all duration-1000 ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            {/* Overline */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-db-red/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-db-red-light flex items-center gap-1.5">
                <Zap className="w-3 h-3" />
                AI-Powered Data Strategy
              </span>
              <span className="h-px w-8 bg-gradient-to-l from-transparent to-db-red/60" />
            </div>

            {/* ASCII Art Hero */}
            <div className="max-w-3xl mx-auto mb-10">
              <ASCIIHero />
            </div>

            {/* Tagline */}
            <div className="text-center max-w-2xl mx-auto">
              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-3">
                Transform your{' '}
                <span className="text-white font-semibold">Unity Catalog metadata</span>{' '}
                into actionable{' '}
                <span className="bg-gradient-to-r from-db-red to-db-orange bg-clip-text text-transparent font-semibold">
                  AI-driven data products
                </span>
              </p>
              <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
                Inspire AI analyzes your data landscape, generates use cases, data products,
                sample results, executive presentations, and full data catalogs — all in one
                automated Databricks notebook run.
              </p>
            </div>

            {/* CTA */}
            <div
              className={`flex flex-col sm:flex-row items-center justify-center gap-4 mt-10 transition-all duration-1000 delay-500 ${loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            >
              <button
                onClick={onStart}
                className="group relative px-8 py-3.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange transition-all shadow-lg shadow-db-red/25 hover:shadow-db-red/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Get Started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
              <a
                href="https://adb-3642885996758754.14.azuredatabricks.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
              >
                Open Databricks Workspace
              </a>
            </div>
          </div>
        </section>

        {/* ─── Stats bar ─── */}
        <section
          className={`max-w-3xl mx-auto px-6 py-10 transition-all duration-1000 delay-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className="grid grid-cols-4 gap-6 p-6 rounded-2xl border border-white/5 bg-db-navy/20 backdrop-blur-sm">
            <AnimatedStat value={41} label="Notebook Version" suffix="" />
            <AnimatedStat value={9} label="Pipeline Steps" suffix="" />
            <AnimatedStat value={6} label="Output Formats" suffix="" />
            <AnimatedStat value={12} label="Languages" suffix="+" />
          </div>
        </section>

        {/* ─── How it works ─── */}
        <section className="max-w-4xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-2">How It Works</h2>
            <p className="text-sm text-slate-500">Three steps to transform your data strategy</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '01',
                title: 'Connect & Configure',
                desc: 'Link your Databricks workspace, publish the Inspire notebook, and set your Unity Catalog metadata.',
                gradient: 'from-db-red to-db-orange',
              },
              {
                step: '02',
                title: 'Customize & Launch',
                desc: 'Choose generation options, languages, quality level, and business priorities — then launch with one click.',
                gradient: 'from-db-orange to-db-gold',
              },
              {
                step: '03',
                title: 'Monitor & Explore',
                desc: 'Watch your notebook execute in real-time with step-by-step progress, then explore the generated artifacts.',
                gradient: 'from-db-gold to-db-teal',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative p-6 rounded-2xl border border-white/5 bg-db-navy/20 hover:bg-db-navy/40 hover:border-white/10 transition-all duration-300"
              >
                <span
                  className={`text-4xl font-black bg-gradient-to-br ${item.gradient} bg-clip-text text-transparent opacity-30 group-hover:opacity-60 transition-opacity`}
                >
                  {item.step}
                </span>
                <h3 className="text-base font-bold text-white mt-2 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Feature grid ─── */}
        <section className="max-w-5xl mx-auto px-6 py-16">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-white mb-2">Capabilities</h2>
            <p className="text-sm text-slate-500">
              Everything you need to accelerate your data strategy
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group p-5 rounded-2xl border border-white/5 bg-db-navy/15 hover:bg-db-navy/30 hover:border-white/10 transition-all duration-300"
                >
                  <div
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{f.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Bottom CTA ─── */}
        <section className="max-w-3xl mx-auto px-6 py-20">
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-db-navy/40 to-db-darkest p-10 text-center overflow-hidden">
            {/* Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-db-red/8 rounded-full blur-[100px]" />

            <div className="relative z-10">
              <DatabricksLogo className="w-12 h-12 mx-auto mb-4 opacity-80" />
              <h2 className="text-xl font-bold text-white mb-2">Ready to Inspire?</h2>
              <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                Connect your Databricks workspace and let AI transform your metadata into a
                comprehensive data strategy.
              </p>
              <button
                onClick={onStart}
                className="group px-8 py-3.5 rounded-xl font-semibold text-white text-sm bg-gradient-to-r from-db-red to-db-orange hover:from-db-red-light hover:to-db-orange transition-all shadow-lg shadow-db-red/25 hover:shadow-db-red/40 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Launch Inspire AI
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ─── Footer ─── */}
        <footer className="border-t border-white/5 py-8">
          <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <DatabricksLogo className="w-4 h-4 opacity-40" />
              <span className="text-[11px] text-slate-600">
                Powered by Databricks Inspire AI · v4.1
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://adb-3642885996758754.14.azuredatabricks.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors"
              >
                Workspace
              </a>
              <span className="text-slate-700">·</span>
              <span className="text-[11px] text-slate-600">
                Built with Databricks & AI
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
