import { copyV130TrackingFields, v130View } from './v130UseCase.js';

function applyInspireTrackingId(uc, trackId) {
  if (trackId == null || String(trackId).trim() === '') return;
  const tid = String(trackId).trim();
  const prev = String(uc.No ?? uc.id ?? '').trim();
  if (prev && prev !== tid) uc.catalog_no = prev;
  uc.id = tid;
  uc.No = tid;
}

function cloneDomainUseCaseForList(uc) {
  try {
    return typeof structuredClone === 'function' ? structuredClone(uc) : { ...uc };
  } catch {
    return { ...uc };
  }
}

export function buildUseCaseList(results, usecases) {
  let allUseCases = [];
  try {
    // Prefer results_json domains (rich structure), then overlay __inspire_usecases tracking fields (notebook_path, genie_instruction).
    if (Array.isArray(results?.domains)) {
      for (const domain of results.domains) {
        const ucs = Array.isArray(domain?.use_cases) ? domain.use_cases : [];
        for (const uc of ucs) {
          const base = cloneDomainUseCaseForList(uc);
          allUseCases.push({ ...base, _domain: domain.domain_name || '' });
        }
      }
    } else if (usecases && usecases.length > 0) {
      allUseCases = usecases.map((uc) => ({
        ...uc,
        _domain: uc['Business Domain'] || uc.domain || uc._domain || '',
        Name: uc.Name || uc.use_case_name || uc.name || '',
        Statement: uc.Statement || uc.description || uc.problem_statement || '',
        Solution: uc.Solution || uc.solution || '',
        Priority: uc.Priority || uc.priority || '',
        SQL: uc.SQL || uc.sql || uc.sql_query || '',
      }));
    } else if (Array.isArray(results?.use_cases)) {
      for (const uc of results.use_cases) {
        allUseCases.push(cloneDomainUseCaseForList(uc));
      }
    } else if (Array.isArray(results)) {
      for (const uc of results) {
        allUseCases.push(cloneDomainUseCaseForList(uc));
      }
    }

    if (usecases && usecases.length > 0 && allUseCases.length > 0) {
      const rowKey = (uc) => String(uc?.No ?? uc?.id ?? uc?.['No'] ?? '').trim();
      const tableById = new Map();
      for (const row of usecases) {
        const k = rowKey(row);
        if (k) tableById.set(k, row);
      }
      for (const uc of allUseCases) {
        const k = rowKey(uc);
        if (!k) continue;
        const row = tableById.get(k);
        if (!row) continue;
        const trackId = row.id ?? row.No ?? row['No'];
        applyInspireTrackingId(uc, trackId);
        const nb = row.notebook_path || row.Notebook_Path || row.NOTEBOOK_PATH || '';
        if (nb && !uc.notebook_path) uc.notebook_path = nb;
        const ggi = row.generate_genie_code_instruction;
        if (ggi != null && String(ggi).trim() !== '') uc.generate_genie_code_instruction = String(ggi).trim();
        const hgc = row.has_genie_code;
        if (hgc != null && String(hgc).trim() !== '') uc.has_genie_code = String(hgc).trim();
        const gi = row.genie_instruction || row.Genie_Instruction || '';
        if (gi && !uc.genie_instruction) uc.genie_instruction = gi;
        const desc = row.description || row.Description;
        if (desc && !uc.description) uc.description = desc;
        const sn = row.short_name || row.shortName;
        if (sn && !uc.short_name) uc.short_name = sn;
        const copyScore = (field) => {
          const v = row[field];
          if (v == null || v === '') return;
          if (uc[field] != null && uc[field] !== '') return;
          uc[field] = v;
        };
        copyScore('priority_score');
        copyScore('value_score');
        copyScore('feasibility_score');
        for (const field of ['quality', 'quality_mode', 'elite_status', 'elite_score', 'elite_assessment', 'selection_flags', 'selection_drop_reason']) {
          if (row[field] != null && row[field] !== '' && (uc[field] == null || uc[field] === '')) uc[field] = row[field];
        }
        copyV130TrackingFields(uc, row);
      }
      // When domain JSON `No`/`id` ≠ tracking table `id`, attach scores by Name + Business Domain.
      const normKey = (name, domain) =>
        `${String(name || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${String(domain || '').trim().toLowerCase().replace(/\s+/g, ' ')}`;
      const byNameDomain = new Map();
      for (const row of usecases) {
        const nm = String(row.Name || '').trim();
        if (!nm) continue;
        const k = normKey(nm, row._domain || row['Business Domain'] || '');
        byNameDomain.set(k, row);
      }
      for (const uc of allUseCases) {
        const nm = String(uc.Name || '').trim();
        if (!nm) continue;
        const hasScore =
          uc.priority_score != null && uc.priority_score !== '' && Number.isFinite(Number(uc.priority_score));
        if (hasScore) continue;
        const row = byNameDomain.get(normKey(nm, uc._domain || uc['Business Domain'] || ''));
        if (!row) continue;
        const copyScore2 = (field) => {
          const v = row[field];
          if (v == null || v === '') return;
          if (uc[field] != null && uc[field] !== '') return;
          uc[field] = v;
        };
        copyScore2('priority_score');
        copyScore2('value_score');
        copyScore2('feasibility_score');
        if (!uc.Priority && row.Priority) uc.Priority = row.Priority;
        if (!uc.Quality && row.Quality) uc.Quality = row.Quality;
        copyV130TrackingFields(uc, row);
        const trackId = row.id ?? row.No ?? row['No'];
        applyInspireTrackingId(uc, trackId);
        const ggi2 = row.generate_genie_code_instruction;
        if (ggi2 != null && String(ggi2).trim() !== '') uc.generate_genie_code_instruction = String(ggi2).trim();
        const hgc2 = row.has_genie_code;
        if (hgc2 != null && String(hgc2).trim() !== '') uc.has_genie_code = String(hgc2).trim();
        const nb2 = row.notebook_path || row.Notebook_Path || row.NOTEBOOK_PATH || '';
        if (nb2 && !uc.notebook_path) uc.notebook_path = nb2;
        const gi2 = row.genie_instruction || row.Genie_Instruction || '';
        if (gi2 && !uc.genie_instruction) uc.genie_instruction = gi2;
      }
    }
  } catch (err) {
    console.error('Error extracting use cases:', err);
    allUseCases = [];
  }
  for (const uc of allUseCases) {
    if (uc && typeof uc === 'object') uc._v130 = v130View(uc);
  }
  return allUseCases;
}
