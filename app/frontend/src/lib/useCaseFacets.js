import {
  inspireScoreFromUc,
  isNumericPriorityString,
  nameOfUseCase,
  scoreOf,
  favoriteKeyOf,
  fieldOf,
  hasGenieInstruction,
  hasShippedGenieCode,
  trackingIdOf,
} from './useCaseFields.js';

export const GENIE_LABELS = Object.freeze({
  shipped: 'Has Genie code',
  draft: 'Draft Genie instruction',
  none: 'No Genie code',
});

export function catalogRow(uc, index, ctx = {}) {
  const v = uc?._v130 || {};
  const id = trackingIdOf(uc);
  const favKey = favoriteKeyOf(uc);
  const status = ctx.statusOf ? ctx.statusOf(uc, id) || null : null;
  const feedbackStatus = String((v.useCaseKey && ctx.feedbackLatest?.[v.useCaseKey]?.status) || v.feedbackStatus || '').trim().toLowerCase();
  const text = (displayKey, trackingKey) => String(fieldOf(uc, displayKey, trackingKey) ?? '').trim();
  const priority = text('Priority', 'priority');
  return {
    key: `${id || 'uc'}#${index}`,
    index,
    uc,
    id,
    title: nameOfUseCase(uc) || id || `Use case ${index + 1}`,
    domain: String(uc?._domain || '').trim() || text('Business Domain', 'business_domain'),
    subdomain: text('Subdomain', 'subdomain'),
    technique: text('Analytics Technique', 'analytics_technique'),
    quality: text('Quality', 'quality'),
    priority: isNumericPriorityString(priority) ? '' : priority,
    inspire: inspireScoreFromUc(uc || {}),
    value: scoreOf(uc || {}, 'value_score', 'Value_Score', 'Value Score'),
    feasibility: scoreOf(uc || {}, 'feasibility_score', 'Feasibility_Score', 'Feasibility Score'),
    bob: v.bestOfBest || null,
    genie: hasShippedGenieCode(uc || {})
      ? GENIE_LABELS.shipped
      : hasGenieInstruction(uc || {}) ? GENIE_LABELS.draft : GENIE_LABELS.none,
    status,
    feedbackStatus,
    favorite: Boolean(favKey && ctx.favorites?.[favKey]),
  };
}
