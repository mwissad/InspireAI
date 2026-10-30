const lower = (text) => (/^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text);

export function amountText(value, kind, currency) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return '';
  if (kind === 'percent') return `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
  const text = n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return kind === 'money' && currency ? `${text} ${currency}` : text;
}

export const assumptionLabel = (name) => {
  const words = String(name || '').toLowerCase().replace(/_+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

export const columnWords = (name) => String(name || '').replace(/_+/g, ' ').trim();

export function nothingToActText(run) {
  if (!run || run.records == null) return '';
  if ((run.act_now_records || 0) + (run.review_records || 0) > 0) return '';
  const reason = run.nothing_to_act || (run.records === 0 ? 'the last run wrote no records' : 'no record reached Act now or Review in the last run');
  return `Nothing to act on yet, because ${lower(reason)}`;
}

export function tiersText(run) {
  if (run?.basis === 'measured' && run.act_now_amount != null && run.review_amount != null) {
    return `Act now from ${amountText(run.act_now_amount, 'money', run.currency)} at stake, Review from ${amountText(run.review_amount, 'money', run.currency)}, `
      + 'every other row Monitor.';
  }
  if (run?.basis === 'predicted') {
    if (run.accepted === true) return 'A model passed this use case\u2019s acceptance check in the last run, so acceptance no longer holds its rows at Monitor.';
    if (run.accepted === false) return 'No model passed this use case\u2019s acceptance check in the last run, so no row is actionable yet.';
    return 'A row is called actionable only after a model passes this use case\u2019s acceptance check.';
  }
  return '';
}

export function lastRunText(run) {
  if (!run || run.records == null) return '';
  const stake = run.value_at_stake != null ? `, with ${amountText(run.value_at_stake, 'money', run.currency)} at stake on them` : '';
  return `The last run flagged ${run.act_now_records || 0} Act now and ${run.review_records || 0} Review of ${run.records} rows${stake}.`;
}

export function historyLines(history, currency) {
  return (history || []).map((h, i) => {
    const older = history.slice(i + 1).find((x) => x.name === h.name);
    const from = older ? ` from ${amountText(older.value, h.kind, currency)}` : '';
    return `${h.changed_by || 'Someone'} set ${assumptionLabel(h.name)}${from} to ${amountText(h.value, h.kind, currency)} in the App${h.note ? `: ${h.note}` : ''}`;
  });
}
