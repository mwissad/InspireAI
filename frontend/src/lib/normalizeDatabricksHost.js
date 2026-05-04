/**
 * Workspace URL for REST APIs must be the origin only (no ?o=..., no hash, no trailing slash).
 */
export function normalizeDatabricksHost(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    if (!u.hostname) return trimmed;
    return `${u.protocol}//${u.host}`;
  } catch {
    return trimmed;
  }
}
