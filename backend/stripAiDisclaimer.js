/**
 * Removes the common Databricks-style yellow "AI-generated / demonstration / not liable"
 * disclaimer block from stored text (Genie instructions, etc.).
 */
function stripAiDemoDisclaimerHtml(s) {
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

/** Walk JSON-like trees and strip disclaimer HTML from string fields that look affected. */
function stripDisclaimerDeep(val) {
  if (typeof val === 'string') {
    const L = val.toLowerCase();
    if (L.includes('fff3cd') || (L.includes('disclaimer') && L.includes('ai-generated'))) {
      return stripAiDemoDisclaimerHtml(val);
    }
    return val;
  }
  if (Array.isArray(val)) return val.map(stripDisclaimerDeep);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = stripDisclaimerDeep(v);
    }
    return out;
  }
  return val;
}

module.exports = { stripAiDemoDisclaimerHtml, stripDisclaimerDeep };
