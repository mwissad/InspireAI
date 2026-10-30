import { AlertTriangle } from 'lucide-react';
import { amountText, assumptionLabel, columnWords, historyLines, lastRunText, nothingToActText, tiersText } from '../lib/moneyReview';

export function NothingToActCard({ run }) {
  const text = nothingToActText(run);
  if (!text) return null;
  return (
    <section aria-label="Nothing to act on yet" role="status"
      className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-bg px-3.5 py-3 text-[13px] text-warning-fg">
      <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
      <p>{text}</p>
    </section>
  );
}

export default function MoneyReview({ money, error = '' }) {
  if (error) return <p role="alert" className="text-[12px] text-error-fg">Inspire could not read the money at stake of the last run: {error}</p>;
  if (!money) return <p className="text-[12px] text-text-secondary">Reading how the last run counted the money at stake</p>;
  const { model, run } = money;
  if (!model) {
    return (
      <p data-money-pending="" className="text-[12px] text-text-secondary">
        Genie proposes how the money at stake on each row is counted, and its assumptions, when the notebook first runs. Say below how it should be counted, and Inspire checks it after the build.
      </p>
    );
  }
  const values = Object.fromEntries(model.assumptions.map((a) => [a.name, a.value]));
  const tiers = tiersText(run);
  const lines = historyLines(money.history, model.currency);
  const outcome = lastRunText(run);
  return (
    <section aria-label="Money at stake review" className="space-y-2.5 rounded-lg border border-border bg-bg-subtle/50 p-3 text-[12px]">
      <h5 className="text-[13px] font-semibold text-text-primary">How Genie counts the money at stake</h5>
      {model.parts.length > 0 && (
        <p data-formula="" className="text-[13px] text-text-primary">
          Each row: {model.parts.map((p, i) => (p.text != null ? <span key={i}>{p.text}</span>
            : p.column ? <i key={i}>{columnWords(p.column)}</i> : <b key={i}>{amountText(values[p.assumption], p.kind, model.currency)}</b>))} = its money at stake.
        </p>
      )}
      {model.assumptions.length > 0 && (
        <table aria-label="Assumptions" className="w-full text-left">
          <thead><tr className="text-text-secondary"><th className="py-1 pr-3 font-semibold">Assumption</th><th className="py-1 pr-3 font-semibold">Value</th><th className="py-1 font-semibold">Set by</th></tr></thead>
          <tbody>
            {model.assumptions.map((a) => (
              <tr key={a.name} data-assumption={a.name} className="border-t border-border">
                <td className="py-1 pr-3 text-text-primary">{assumptionLabel(a.name)}</td>
                <td className="py-1 pr-3 font-mono text-text-primary">{amountText(a.value, a.kind, model.currency)}</td>
                <td className="py-1 text-text-secondary">{a.changed_by ? `${a.changed_by} in the App` : 'Genie, in the notebook'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {model.changed && <p className="text-text-primary">Owners changed an assumption in the App after the last run, so the next run uses the values above.</p>}
      {tiers && <p data-tiers="" className="text-text-secondary">{tiers}</p>}
      {outcome && <p data-last-run="" className="text-text-secondary">{outcome}</p>}
      {lines.length > 0 && <ul aria-label="Assumption changes" className="list-disc pl-5 text-text-secondary">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      <p data-change-how="" className="text-text-secondary">
        {model.assumptions.length > 0
          ? 'To change how it is counted, say so below and rebuild only this part. Owners of the App can change the assumption values there.'
          : 'This formula uses only each row\u2019s own numbers, so the App has no assumption to change. To change how it is counted, say so below and rebuild only this part.'}
      </p>
    </section>
  );
}
