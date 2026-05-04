/**
 * Removes the common Databricks-style yellow "AI-generated / demonstration / not liable"
 * disclaimer block when it appears inside strings (e.g. Genie text, notebook exports).
 */
export function stripAiDemoDisclaimerHtml(s) {
  if (typeof s !== 'string' || !s) return s;
  let out = s;
  out = out.replace(
    /<div\b[^>]*\bstyle\s*=\s*(["'])(?:(?!\1).)*#\s*fff3cd(?:(?!\1).)*\1[^>]*>[\s\S]*?<\/div>/gi,
    (m) => {
      const L = m.toLowerCase();
      if (L.includes('disclaimer') && L.includes('ai-generated') && L.includes('liable')) return '';
      return m;
    },
  );
  return out.replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** Removes matching disclaimer nodes if they exist in the live DOM (same document as the app). */
export function removeInjectedDisclaimerBanner(root = typeof document !== 'undefined' ? document.body : null) {
  if (!root?.querySelectorAll) return;
  try {
    const candidates = root.querySelectorAll('div[style*="FFF3CD"], div[style*="fff3cd"], div[style*="#FFF3CD"]');
    candidates.forEach((el) => {
      const text = (el.textContent || '').toLowerCase();
      if (text.includes('disclaimer') && text.includes('ai-generated') && text.includes('liable')) {
        el.remove();
      }
    });
  } catch {
    /* ignore */
  }
}
