import { ArrowRight, Zap, Shield, BarChart3 } from 'lucide-react';
import DatabricksLogo from '../components/DatabricksLogo';

const FEATURES = [
  {
    icon: Zap,
    title: 'AI-Powered Discovery',
    desc: 'Automatically identify high-value analytics use cases from your data catalog.',
  },
  {
    icon: Shield,
    title: 'Enterprise Grade',
    desc: 'Built on Databricks Unity Catalog with full governance and security.',
  },
  {
    icon: BarChart3,
    title: 'Actionable Insights',
    desc: 'Generate SQL implementations, business impact scores, and priority rankings.',
  },
];

export default function LandingPage({ onStart }) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Top bar */}
      <div className="border-b border-border px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-2.5">
          <DatabricksLogo className="w-7 h-7" />
          <span className="font-semibold text-[15px] text-text-primary tracking-tight">
            Inspire AI
          </span>
          <span className="text-[10px] font-medium text-text-tertiary border border-border rounded px-1.5 py-0.5">
            v4.1
          </span>
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-db-red-50 rounded-full mb-6">
            <span className="w-1.5 h-1.5 bg-db-red rounded-full" />
            <span className="text-xs font-medium text-db-red">
              Databricks Inspire AI Platform
            </span>
          </div>

          <h1 className="text-4xl font-bold text-text-primary leading-tight mb-4">
            Discover analytics use cases
            <br />
            from your data catalog
          </h1>

          <p className="text-lg text-text-secondary mb-8 max-w-xl mx-auto leading-relaxed">
            Leverage AI to analyze your Unity Catalog metadata and generate
            prioritized, implementation-ready analytics use cases.
          </p>

          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-6 py-3 bg-db-red text-white text-sm font-semibold rounded-lg hover:bg-db-red-hover transition-smooth shadow-sm"
          >
            Get Started
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="border-t border-border bg-bg">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-db-red-50 mb-3">
                  <f.icon size={18} className="text-db-red" />
                </div>
                <h3 className="text-sm font-semibold text-text-primary mb-1">
                  {f.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-xs text-text-tertiary">
            Powered by Databricks
          </span>
          <span className="text-xs text-text-tertiary">
            Unity Catalog / AI / SQL
          </span>
        </div>
      </div>
    </div>
  );
}
