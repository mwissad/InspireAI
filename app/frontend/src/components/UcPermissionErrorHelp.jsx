import { useState } from 'react';
import { AlertCircle, Check, Copy } from 'lucide-react';

/**
 * Rich error panel when a failure is likely missing UC / workspace permissions.
 * @param {{ guidance: ReturnType<import('../lib/ucPermissionErrors').interpretUcPermissionError> }} props
 */
export default function UcPermissionErrorHelp({ guidance }) {
  const [copied, setCopied] = useState(false);
  if (!guidance) return null;

  const copyAdminText = async () => {
    if (!guidance.adminEmailText) return;
    try {
      await navigator.clipboard.writeText(guidance.adminEmailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!guidance.isPermissionIssue) {
    return (
      <div className="flex items-start gap-2 p-3 bg-error-bg border border-error/20 rounded-lg mb-6">
        <AlertCircle size={16} className="text-error-fg shrink-0 mt-0.5" />
        <p className="text-sm text-error-fg">{guidance.userMessage}</p>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-error/25 bg-error-bg/80 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-error/15">
        <AlertCircle size={18} className="text-error-fg shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-error-fg">{guidance.title}</p>
          <p className="text-sm text-text-secondary mt-1">{guidance.userMessage}</p>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
            Ask your admin to grant
          </p>
          <ul className="space-y-1.5 text-xs text-text-secondary">
            {guidance.adminBullets.map((line) => (
              <li
                key={line}
                className={line.startsWith('  ') ? 'font-mono text-[11px] text-text-primary pl-3' : 'list-disc ml-4'}
              >
                {line.startsWith('  ') ? line.trim() : line}
              </li>
            ))}
          </ul>
        </div>

        {guidance.adminEmailText && (
          <button
            type="button"
            onClick={copyAdminText}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-smooth"
          >
            {copied ? <Check size={14} className="text-success-fg" /> : <Copy size={14} />}
            {copied ? 'Copied for admin' : 'Copy message for admin'}
          </button>
        )}

        {guidance.technicalDetail && (
          <details className="text-[11px] text-text-tertiary">
            <summary className="cursor-pointer hover:text-text-secondary">Technical details</summary>
            <pre className="mt-2 p-2 rounded-lg bg-surface border border-border text-[10px] text-text-secondary whitespace-pre-wrap break-words font-mono">
              {guidance.technicalDetail}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
