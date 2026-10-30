import { useState, useCallback } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Database,
  Loader2,
  Sparkles,
  Building2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { responseError } from '../lib/apiClient';

export default function GenerateDataPage({ settings, onBack, onLaunched }) {
  const { databricksHost, token, inspireDatabase, serverEnvHasPat } = settings;
  const canCallApi = !!(databricksHost && (token || serverEnvHasPat));

  const [description, setDescription] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);

  const apiFetch = useCallback(
    async (url, opts = {}) => {
      const headers = { 'Content-Type': 'application/json', ...opts.headers };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        headers['X-DB-PAT-Token'] = token;
      }
      if (databricksHost) headers['X-Databricks-Host'] = databricksHost;
      const resp = await fetch(url, { ...opts, headers });
      if (!resp.ok) throw await responseError(resp);
      return resp.json();
    },
    [token, databricksHost],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!businessName.trim()) return setError('Business name is required.');
    if (!description.trim()) return setError('Describe the data you want to create.');
    if (!inspireDatabase) return setError('Inspire database not configured. Set INSPIRE_DATABASE in .env or Workspace setup.');

    setSubmitting(true);
    setError('');
    setLastResult(null);

    try {
      const data = await apiFetch('/api/demo-data/start', {
        method: 'POST',
        body: JSON.stringify({
          description: description.trim(),
          business_name: businessName.trim(),
          inspire_database: inspireDatabase,
        }),
      });
      setLastResult(data);
      onLaunched?.(data.session_id, data.inspire_run_id);
    } catch (err) {
      setError(err.message || 'Failed to generate data and start Inspire');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-6 transition-smooth"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-db-red/10 flex items-center justify-center shrink-0">
          <Sparkles size={24} className="text-db-red-fg" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">I don&apos;t have data</h1>
          <p className="text-sm text-text-secondary mt-1 leading-relaxed">
            Describe the demo you need. A Foundation Model writes Python code, runs it on your cluster,
            and stores <strong>five Delta tables</strong> with Unity Catalog descriptions in your existing UC catalog (same catalog as{' '}
            <code className="font-mono text-xs">{inspireDatabase?.split('.')[0] || 'INSPIRE_DATABASE'}</code>
            ). Inspire then discovers use cases from that metadata. No template fallback.
          </p>
        </div>
      </div>

      {!canCallApi && (
        <div className="mb-6 p-4 rounded-lg border border-warning/30 bg-warning-bg flex gap-3">
          <AlertCircle size={18} className="text-warning-fg shrink-0 mt-0.5" />
          <p className="text-sm text-text-secondary">
            Connect your workspace first: set <code className="text-xs">DATABRICKS_HOST</code> and{' '}
            <code className="text-xs">DATABRICKS_TOKEN</code> in <code className="text-xs">.env</code>, or use the Setup Wizard.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-text-primary mb-2">
            <Building2 size={14} className="text-text-tertiary" />
            Business name
            <span className="text-db-red-fg">*</span>
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Qatar Airways"
            className="w-full px-4 py-2.5 text-sm border border-border rounded-lg bg-surface text-text-primary glow-focus transition-smooth"
            required
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-bold text-text-primary mb-2">
            <Sparkles size={14} className="text-text-tertiary" />
            Describe your data
            <span className="text-db-red-fg">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="e.g. I want to build a demo for Qatar Airways — bookings, routes, and daily operational KPIs."
            className="w-full px-4 py-3 text-sm border border-border rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary glow-focus transition-smooth resize-y min-h-[120px]"
            required
          />
          <p className="text-[11px] text-text-tertiary mt-1.5">
            Genie-style: your prompt becomes the code, 5 tables and their column descriptions, which then run on Spark. Tables land in{' '}
            <code className="font-mono">{inspireDatabase?.split('.')[0] || 'catalog'}.inspire_demo_*</code>;
            tracking in <code className="font-mono">{inspireDatabase || 'catalog._inspire'}</code>.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-subtle border border-border">
            <Database size={12} />
            {inspireDatabase || 'Inspire DB not set'}
          </span>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-error/30 bg-error-bg text-sm text-error-fg flex gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {lastResult?.ok && (
          <div className="p-3 rounded-lg border border-success/30 bg-success-bg text-sm text-success-fg">
            <div className="flex items-center gap-2 font-medium mb-1">
              <CheckCircle2 size={16} />
              Pipeline started
            </div>
            <ol className="text-xs list-decimal list-inside space-y-0.5 mt-1">
              <li>Generate 5 Delta tables with UC table/column comments</li>
              <li>
                Run Inspire discovery →{' '}
                {lastResult.pipeline?.inspire_agent_notebook || '/Shared/inspire-ai/dbx_inspire_ai_agent'}
              </li>
            </ol>
            {lastResult.job_run_url && (
              <a
                href={lastResult.job_run_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs underline mt-2 inline-block"
              >
                Open job run in Databricks
              </a>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !canCallApi}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-db-red-solid text-white font-semibold text-sm hover:bg-db-red-solid-hover disabled:opacity-50 disabled:cursor-not-allowed transition-smooth"
        >
          {submitting ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              Starting pipeline…
            </>
          ) : (
            <>
              Generate data &amp; run Inspire
              <ArrowRight size={18} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
