import { lazy, Suspense } from 'react';
import { ArrowRight, Zap, Shield, BarChart3, Sparkles, Layers, Database } from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

const HeroScene3D = lazy(() => import('../components/HeroScene3D'));

const FEATURES = [
  {
    icon: Zap,
    title: 'AI-Powered Discovery',
    desc: 'Automatically identify high-value analytics use cases from your data catalog.',
    gradient: 'from-[#FF3621]/10 to-[#FF6B50]/5',
  },
  {
    icon: Shield,
    title: 'Enterprise Grade',
    desc: 'Built on Databricks Unity Catalog with full governance and security.',
    gradient: 'from-[#FF3621]/10 to-[#FF6B50]/5',
  },
  {
    icon: BarChart3,
    title: 'Actionable Insights',
    desc: 'Generate SQL implementations, business impact scores, and priority rankings.',
    gradient: 'from-[#FF3621]/10 to-[#FF6B50]/5',
  },
];

const CAPABILITIES = [
  { icon: Sparkles, label: 'Use Case Generation' },
  { icon: Layers,   label: 'Domain Discovery' },
  { icon: Database, label: 'SQL Implementation' },
];

export default function LandingPage({ onStart }) {
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="relative z-20 border-b border-black/5 bg-white/80 backdrop-blur-md px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-2.5">
          <DatabricksLogo className="w-7 h-7" />
          <span className="font-bold text-[15px] text-gray-900 tracking-tight">
            Inspire AI
          </span>
          <span className="text-[10px] font-semibold text-[#FF3621] border border-[#FF3621]/20 bg-[#FF3621]/5 rounded px-1.5 py-0.5">
            v4.3
          </span>
        </div>
      </div>

      {/* ═══ Hero Section with 3D Scene ═══ */}
      <div className="relative flex-1 flex items-center justify-center min-h-[520px]">
        {/* 3D Scene Background */}
        <Suspense fallback={null}>
          <HeroScene3D className="absolute inset-0 z-0" />
        </Suspense>

        {/* Gradient overlays to ensure text readability */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-white/80 via-white/40 to-white/85 pointer-events-none" />
        <div className="absolute inset-0 z-[1] bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.75)_0%,_transparent_65%)] pointer-events-none" />

        {/* Hero Content */}
        <div className="relative z-10 max-w-2xl text-center px-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/90 backdrop-blur-sm border border-[#FF3621]/15 rounded-full mb-6 shadow-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3621] opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3621]" />
            </span>
            <span className="text-xs font-semibold text-[#FF3621] tracking-wide">
              Databricks Inspire AI Platform
            </span>
          </div>

          {/* Title */}
          <h1 className="text-5xl font-extrabold text-gray-900 leading-[1.1] mb-5 tracking-tight">
            Discover analytics
            <br />
            <span className="bg-gradient-to-r from-[#FF3621] to-[#FF6B50] bg-clip-text text-transparent">
              use cases
            </span>{' '}
            from your
            <br />
            data catalog
          </h1>

          {/* Subtitle */}
          <p className="text-lg text-gray-500 mb-8 max-w-lg mx-auto leading-relaxed font-medium drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">
            Leverage AI to analyze your Unity Catalog metadata and generate
            prioritized, implementation-ready analytics use cases.
          </p>

          {/* CTA + Capability pills */}
          <div className="flex flex-col items-center gap-5">
            <button
              onClick={onStart}
              className="group inline-flex items-center gap-2.5 px-8 py-3.5 bg-gradient-to-r from-[#FF3621] to-[#E02E1B] text-white text-sm font-bold rounded-xl hover:from-[#E02E1B] hover:to-[#CC2A1A] transition-all duration-300 shadow-lg shadow-[#FF3621]/25 hover:shadow-xl hover:shadow-[#FF3621]/30 hover:-translate-y-0.5"
            >
              Get Started
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </button>

            <div className="flex items-center gap-3">
              {CAPABILITIES.map((cap) => (
                <div
                  key={cap.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 backdrop-blur-sm border border-gray-200/60 rounded-full"
                >
                  <cap.icon size={12} className="text-[#FF3621]" />
                  <span className="text-[10px] font-semibold text-gray-600">{cap.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Features ═══ */}
      <div className="relative z-10 border-t border-gray-200/60 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <div className="text-center mb-10">
            <h2 className="text-sm font-bold text-[#FF3621] uppercase tracking-widest mb-2">
              Capabilities
            </h2>
            <p className="text-2xl font-bold text-gray-900">
              Everything you need to unlock data value
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group relative bg-gradient-to-br from-gray-50 to-white border border-gray-200/60 rounded-2xl p-6 hover:border-[#FF3621]/20 hover:shadow-lg hover:shadow-[#FF3621]/5 transition-all duration-300"
              >
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#FF3621]/10 to-[#FF3621]/5 mb-4 group-hover:from-[#FF3621]/15 group-hover:to-[#FF3621]/10 transition-all">
                  <f.icon size={20} className="text-[#FF3621]" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">
                  {f.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-gray-200/60 bg-gray-50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-[11px] text-gray-400 font-medium">
            Powered by Databricks
          </span>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-white border border-gray-200 rounded">
              Unity Catalog
            </span>
            <span className="text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-white border border-gray-200 rounded">
              AI / ML
            </span>
            <span className="text-[10px] text-gray-400 font-medium px-2 py-0.5 bg-white border border-gray-200 rounded">
              SQL
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
