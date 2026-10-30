import {
  BUILT_ASSET_STATES, IMPLEMENT_OUTPUTS, IMPLEMENT_UNINSTALLED, holdoutText, partLabel, partOf, rebuildableOutputs, statusChip, versionActive, vibesKey,
} from './implementWizard.js';
import { formatWhen } from './formatWhen.js';

export const CONTROL_REFRESH_MS = 15000;

export const PROGRESS_TAB = 'Progress';
export const CONTROL_TAB = 'Control Tower';

export function implementDefaultTab(view, active, picked = null) {
  const on = Boolean(active);
  if ([PROGRESS_TAB, CONTROL_TAB].includes(picked)) return { tab: picked, active: on };
  if (view && view.active === on) return view;
  return { tab: on ? PROGRESS_TAB : CONTROL_TAB, active: on };
}

const APP_STATES = {
  ACTIVE: { label: 'Running', tone: 'success', actions: [['stop', 'Stop the App']] },
  STOPPED: { label: 'Stopped', tone: 'idle', actions: [['start', 'Start the App']] },
  ERROR: { label: 'Compute failed', tone: 'error', actions: [['start', 'Start the App']] },
  STARTING: { label: 'Starting', tone: 'busy', actions: [] },
  STOPPING: { label: 'Stopping', tone: 'busy', actions: [] },
  UPDATING: { label: 'Updating', tone: 'busy', actions: [] },
  DELETING: { label: 'Deleting', tone: 'busy', actions: [] },
};

const action = (asset, name, label, danger = false) => ({ asset, action: name, label, danger });

function unreadable(entry) {
  return { state: { label: 'Cannot read', tone: 'error' }, detail: entry?.error || 'Inspire has not read it yet', actions: [] };
}

function appRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  const known = APP_STATES[entry.compute_state] || { label: entry.compute_state || 'Unknown', tone: 'warning', actions: [] };
  const actions = known.actions.map(([name, label]) => action('app', name, label, name === 'stop'));
  if (entry.compute_state === 'ACTIVE' && entry.app_state && entry.app_state !== 'RUNNING') {
    return { state: { label: `App ${entry.app_state.toLowerCase()}`, tone: 'error' }, detail: entry.app_message || 'The compute is on but the App is not running', actions };
  }
  const quiet = entry.compute_state === 'ACTIVE' && entry.app_state === 'RUNNING';
  return { state: { label: known.label, tone: known.tone }, detail: quiet ? '' : entry.app_message || '', actions };
}

function dashboardRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  if (entry.trashed) return { state: { label: 'In the trash', tone: 'error' }, detail: '', actions: [] };
  const when = entry.published_at ? `Published ${formatWhen(entry.published_at, entry.published_at)}` : 'Published';
  if (entry.published && entry.embedded) {
    return {
      state: { label: 'Shares its publisher’s access', tone: 'warning' },
      detail: `${when} with the publisher’s credentials, so anyone who can open it reads the data as the publisher. Publish again so each viewer reads it with their own access`,
      actions: [action('dashboard', 'publish', 'Publish again'), action('dashboard', 'unpublish', 'Unpublish', true)],
    };
  }
  return entry.published
    ? { state: { label: 'Published', tone: 'success' }, detail: entry.published_at ? when : '', actions: [action('dashboard', 'unpublish', 'Unpublish', true)] }
    : { state: { label: 'Not published', tone: 'idle' }, detail: 'People with access cannot open the published view', actions: [action('dashboard', 'publish', 'Publish')] };
}

function genieRow(entry) {
  return entry?.ok ? { state: { label: 'Live', tone: 'success' }, detail: '', actions: [] } : unreadable(entry);
}

function alertRow(entry) {
  if (!entry?.ok) return unreadable(entry);
  if (entry.trashed) return { state: { label: 'In the trash', tone: 'error' }, detail: '', actions: [] };
  const when = entry.checked_at ? ` (checked ${formatWhen(entry.checked_at, entry.checked_at)})` : '';
  if (entry.state === 'TRIGGERED') return { state: { label: 'Triggered', tone: 'warning' }, detail: `The latest check found rows to act on${when}`, actions: [] };
  if (entry.state === 'OK') return { state: { label: 'OK', tone: 'success' }, detail: `The latest check found nothing to act on${when}`, actions: [] };
  if (entry.state === 'ERROR') return { state: { label: 'Check failed', tone: 'error' }, detail: `The alert query failed on its latest check${when}; open the alert to see why`, actions: [] };
  if (entry.state && entry.state !== 'UNKNOWN') return { state: { label: entry.state, tone: 'warning' }, detail: when.trim(), actions: [] };
  return { state: { label: 'Not checked yet', tone: 'idle' }, detail: 'It checks after each run of the job', actions: [] };
}

const OUTPUT_ROWS = { dashboard: dashboardRow, genie_space: genieRow, app: appRow, alert: alertRow };
const OUTPUT_URLS = { dashboard: 'dashboard_url', genie_space: 'genie_space_url', app: 'app_url', alert: 'alert_url' };
const OUTPUT_IDS = { dashboard: 'dashboard_id', genie_space: 'genie_space_id', app: 'app_name', alert: 'alert_id' };
const OUTPUT_NAMES = { dashboard: (a) => a?.name, genie_space: (a) => a?.title, app: (a) => a?.name, alert: (a) => a?.name };

function jobRow(entry, spec) {
  const scheduled = Boolean(spec?.schedule?.enabled);
  const schedule = { label: scheduled ? 'Pause the schedule' : 'Resume the schedule', on: scheduled };
  const withHoldout = (detail) => [detail, holdoutText(spec)].filter(Boolean).join('. ');
  if (!entry?.ok) {
    const row = unreadable(entry);
    return { ...row, detail: withHoldout(row.detail), schedule };
  }
  const plan = withHoldout(entry.schedule
    ? `${entry.schedule.paused ? 'Schedule paused' : 'Scheduled'}: ${entry.schedule.cron} (${entry.schedule.timezone})`
    : 'No schedule');
  const runs = entry.active_runs;
  if (runs == null) {
    return { state: { label: 'Runs unknown', tone: 'error' }, detail: `${plan}. Inspire cannot read its runs: ${entry.runs_error || 'no answer'}`, actions: [], schedule };
  }
  if (!runs.length) return { state: { label: 'Idle', tone: 'idle' }, detail: plan, actions: [], schedule };
  return {
    state: { label: `${runs.length} running`, tone: 'busy' }, detail: plan, schedule, url: runs[0].url || '',
    actions: [action('job', 'cancel', 'Stop the running job', true)],
  };
}

function builtWarnings(latest, id) {
  const warnings = latest?.asset_status?.[id]?.warnings;
  return Array.isArray(warnings) ? warnings.map((w) => String(w ?? '').trim()).filter(Boolean) : [];
}

export const APP_BACKEND_FACTS = {
  lakebase: 'Reads Lakebase: pages load instantly',
  delta: 'Reads Delta tables: pages take a few seconds to load',
};

export function appBackendFacts(latest) {
  const asset = latest?.asset_status?.app || {};
  const built = asset.backend == null && BUILT_ASSET_STATES.includes(asset.state) ? 'delta' : asset.backend;
  if (!Object.prototype.hasOwnProperty.call(APP_BACKEND_FACTS, built)) return { backend: '', lakebaseSwitch: false };
  const outputs = latest?.spec_json?.outputs || {};
  const wanted = outputs.app_backend === 'lakebase' && outputs.app_access === 'sp' && !outputs.merge?.app;
  return { backend: APP_BACKEND_FACTS[built], lakebaseSwitch: built === 'delta' && wanted };
}

export function controlRows(live, latest) {
  const assets = live?.assets || {};
  const targets = live?.targets || {};
  const spec = latest?.spec_json || {};
  const rows = [];
  if (targets.build) {
    rows.push({ id: 'build', label: 'Build', name: `spec v${latest?.spec_version ?? ''}`, removable: false,
      state: { label: 'Building', tone: 'busy' }, detail: latest?.status || '', actions: [action('build', 'cancel', 'Stop the build', true)] });
  }
  if (targets.job) rows.push({ id: 'job', label: 'Job', name: `job ${targets.job}`, removable: false, ...jobRow(assets.job, spec) });
  for (const output of IMPLEMENT_OUTPUTS) {
    if (!targets[output.id]) continue;
    const entry = assets[output.id];
    rows.push({
      id: output.id,
      label: output.label,
      name: OUTPUT_NAMES[output.id](entry) || String(targets[output.id]),
      url: latest?.[OUTPUT_URLS[output.id]] || entry?.url || '',
      removable: true,
      warnings: builtWarnings(latest, output.id),
      ...(output.id === 'app' ? appBackendFacts(latest) : {}),
      ...OUTPUT_ROWS[output.id](entry),
    });
  }
  return rows;
}

const DELIVERED_WORDS = { dashboard: ['dashboard', 'dashboards'], genie_space: ['Genie Agent', 'Genie Agents'], app: ['App', 'Apps'], alert: ['alert', 'alerts'] };

export function deliveredOutputs(latest) {
  return IMPLEMENT_OUTPUTS.filter((output) => latest?.[OUTPUT_URLS[output.id]]).map((output) => output.id);
}

export function buildSummary(items) {
  const list = Array.isArray(items) ? items : [];
  const mvps = list.filter((item) => item.state?.kind === 'mvp');
  const inGroup = (group) => mvps.filter((item) => item.state.group === group);
  const delivered = IMPLEMENT_OUTPUTS
    .map((output) => {
      const count = mvps.filter((item) => deliveredOutputs(item.latest).includes(output.id)).length;
      return { id: output.id, count, text: `${count} ${DELIVERED_WORDS[output.id][count === 1 ? 0 : 1]}` };
    })
    .filter((entry) => entry.count > 0);
  return {
    mvps: mvps.length,
    building: inGroup('in_progress'),
    ready: inGroup('ready').length,
    failed: inGroup('failed').length,
    notebooks: list.filter((item) => item.state?.kind === 'notebook' && item.notebook?.state === 'ready').length,
    notStarted: list.filter((item) => item.state?.group === 'not_started').length,
    delivered,
  };
}

export function controlTiles(live, latest, { active = false, buildingNow = '' } = {}) {
  const rows = controlRows(live, latest);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chosen = latest?.spec_json?.outputs || {};
  const assets = latest?.asset_status || {};
  return {
    strips: rows.filter((row) => row.id === 'build' || row.id === 'job'),
    tiles: IMPLEMENT_OUTPUTS.map((output) => {
      const row = byId.get(output.id);
      if (row) return { output, kind: 'live', row };
      if (!chosen[output.id]) return { output, kind: 'off' };
      if (active) return { output, kind: 'building', now: buildingNow === output.label };
      if (assets[output.id]?.state === 'failed') return { output, kind: 'failed', error: String(assets[output.id].error || '') };
      if (!live) return { output, kind: 'checking' };
      return { output, kind: 'missing' };
    }),
  };
}

export function removeChanges(latest, output) {
  const spec = latest?.spec_json || {};
  return {
    outputs: { ...(spec.outputs || {}), [output]: false },
    removed_outputs: { ...(spec.removed_outputs || {}), [output]: 'delete' },
  };
}

const DONE = ['ready', 'ready_with_warnings'];
const BUILD_STEP = { queued: 0, checking: 2 };
const WARNING_START = /; (?=[A-Z][A-Za-z ]{0,40}: )/;
const savedVibes = (row, id) => String(row?.spec_json?.outputs?.[vibesKey(id)] ?? '').trim();

export function vibeWarnings(row, id) {
  const label = IMPLEMENT_OUTPUTS.find((o) => o.id === id)?.label || id;
  const lead = `${label} vibe not done: `;
  const listed = [...String(row?.status_message || '').split(WARNING_START), ...builtWarnings(row, id)];
  return [...new Set(listed.filter((w) => w.includes(lead)).map((w) => w.slice(w.indexOf(lead)).trim()))];
}

const PART_STATES = [...BUILT_ASSET_STATES, 'failed'];
const ASSET_WHAT = {
  notebook: 'The Genie Code notebook that finds the rows to act on',
  ai_reasoning: 'Why each row is flagged, what to do, and how sure',
  value_formula: 'How the money at stake on each row is counted',
  app_page: 'A page of the App',
  dashboard_chart: 'A chart on the dashboard',
  dashboard: 'The whole dashboard',
  genie_space: 'How Genie answers questions on this use case',
  app: 'The whole App',
  alert: 'Emails people when the latest run has rows to act on',
};
const ASSET_NOUNS = { app_page: 'page', dashboard_chart: 'chart', ai_reasoning: 'part', value_formula: 'part', notebook: 'notebook', dashboard: 'dashboard', genie_space: 'Genie Agent', app: 'App', alert: 'alert' };
const ASSET_PILLS = {
  ready: { label: 'Ready', tone: 'success' },
  ready_with_warnings: { label: 'Ready with warnings', tone: 'warning' },
  failed: { label: 'Failed', tone: 'error' },
  rebuilding: { label: 'Rebuilding', tone: 'busy' },
};
const ALL_ASSETS = 'all';
const OPTION_PREFIXES = { dashboard: ['dashboard_'], genie_space: ['genie_space_', 'genie_questions'], app: ['app_'], alert: ['alert_'] };

export function vibeChecks(raw) {
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter((check) => check && typeof check === 'object' && String(check.ask ?? '').trim()).map((check) => ({
    ask: String(check.ask).trim(),
    done: String(check.status ?? '').trim().toLowerCase() === 'done',
    evidence: String(check.evidence ?? '').trim(),
  }));
}

export function checksSummary(checks) {
  const done = checks.filter((check) => check.done).length;
  return `You asked for ${checks.length} ${checks.length === 1 ? 'thing' : 'things'}. Done: ${done} of ${checks.length}.`;
}

export function missingAsks(checks) {
  return checks.filter((check) => !check.done).map((check) => check.ask);
}

export function askCount(text) {
  return String(text ?? '').split(/\n+|;|\.(?:\s+|$)|,\s*and\s+|\s+and\s+|,\s+/).map((s) => s.trim()).filter((s) => s.length > 3).length;
}

function builtChecks(rows, version, id) {
  const output = partOf(id)?.output || id;
  let row = rows.find((r) => r.spec_version === version);
  let back = Number(row?.spec_json?.rollback_outputs?.[output]);
  while (row && Number.isInteger(back) && back < row.spec_version) {
    row = rows.find((r) => r.spec_version === back);
    back = Number(row?.spec_json?.rollback_outputs?.[output]);
  }
  return { checks: vibeChecks(row?.asset_status?.[id]?.vibes_checks), checkedOn: row?.spec_version ?? null };
}

function assetPill(entry, checks, rebuilding) {
  if (rebuilding) return ASSET_PILLS.rebuilding;
  const state = entry?.state || 'ready';
  if (state === 'ready' && checks.some((check) => !check.done)) return ASSET_PILLS.ready_with_warnings;
  return ASSET_PILLS[state] || statusChip(state);
}

function rebuildTargets(latest, base) {
  if (String(latest?.change_classes || '').split(',').some((c) => ['initial', 'data', 'config'].includes(c.trim()))) return ALL_ASSETS;
  const spec = latest?.spec_json || {};
  const ids = new Set([...(spec.retry_outputs || []), ...Object.keys(spec.rollback_outputs || {})]);
  const before = base?.spec_json?.outputs || {};
  const after = spec.outputs || {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key.endsWith('_vibes') && String(before[key] ?? '').trim() !== String(after[key] ?? '').trim()) ids.add(key.slice(0, -'_vibes'.length));
  }
  for (const [output, prefixes] of Object.entries(OPTION_PREFIXES)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => prefixes.some((prefix) => key.startsWith(prefix)));
    const moved = JSON.stringify(before.merge?.[output] ?? '') !== JSON.stringify(after.merge?.[output] ?? '');
    if (moved || keys.some((key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))) ids.add(output);
  }
  if (String(base?.spec_json?.data?.notes ?? '').trim() !== String(spec.data?.notes ?? '').trim()) ids.add('notebook');
  return ids;
}

export function vibeCards(history, latest, stalled = null, notebookUrl = '') {
  const rows = [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));
  const active = versionActive(latest, stalled);
  const base = active ? rows.find((r) => DONE.includes(r.status)) : latest;
  if (!base || !DONE.includes(String(base.status))) return [];
  const chosen = latest.spec_json?.outputs || {};
  const built = rebuildableOutputs(base).map((o) => o.id);
  const targets = active ? rebuildTargets(latest, base) : new Set();
  const asking = latest.spec_json?.retry_asks || {};
  const rolling = latest.spec_json?.rollback_outputs || {};
  const at = (row) => String(row?.updated_at || row?.created_at || '');
  const liveAt = (version) => (version == null ? null : { version, at: at(rows.find((r) => r.spec_version === version)) });
  const urlOf = (output) => (output === 'notebook' ? String(notebookUrl || '') : String(base[OUTPUT_URLS[output]] || latest[OUTPUT_URLS[output]] || ''));
  const card = (id, output, entry, version, fields) => {
    const kind = partOf(id)?.kind || id;
    const { checks, checkedOn } = builtChecks(rows, version, id);
    const rebuilding = targets === ALL_ASSETS || targets.has(id) || targets.has(output);
    const gone = Object.hasOwn(OUTPUT_IDS, output) && !base[OUTPUT_IDS[output]];
    const rollback = gone ? null : Number(rolling[output]) || null;
    const asks = rollback ? 0 : Array.isArray(asking[id]) ? asking[id].length : askCount(fields.vibes);
    return {
      id, output, name: '', versions: [], warnings: [], ...fields, gone, live: liveAt(version), url: urlOf(output),
      what: String(entry?.what ?? entry?.description ?? '').trim() || ASSET_WHAT[kind], noun: ASSET_NOUNS[kind],
      checks, checkedOn, state: assetPill(entry, checks, rebuilding), building: rebuilding ? { step: BUILD_STEP[latest.status] ?? 1, asks, rollback } : null,
    };
  };
  const parts = (output) => Object.entries(base.asset_status || {})
    .filter(([id, entry]) => partOf(id)?.output === output && PART_STATES.includes(entry?.state))
    .map(([id, entry]) => {
      const name = String(entry.name ?? entry.title ?? '').trim();
      const version = BUILT_ASSET_STATES.includes(entry.state) ? (entry.spec_version ?? base.spec_version ?? null) : null;
      return card(id, output, entry, version, { label: partLabel(id, name), name, vibes: String(chosen[vibesKey(id)] ?? ''), rebuild: true });
    });
  const notebookEntry = base.asset_status?.notebook;
  const notebookVersion = notebookEntry?.spec_version ?? null;
  const notebook = notebookVersion == null ? []
    : [card('notebook', 'notebook', notebookEntry, notebookVersion, { label: 'notebook', vibes: String(latest.spec_json?.data?.notes ?? '').trim(), rebuild: true })];
  return [...notebook, ...parts('notebook'), ...IMPLEMENT_OUTPUTS.filter((o) => chosen[o.id]).flatMap((o) => {
    const entry = base.asset_status?.[o.id];
    const liveVersion = BUILT_ASSET_STATES.includes(entry?.state) ? (entry.spec_version ?? base.spec_version ?? null) : null;
    const versions = rows.filter((r) => {
      const saved = r.asset_status?.[o.id];
      return saved?.snapshot === true && r.spec_version !== liveVersion && (saved.spec_version ?? r.spec_version) === r.spec_version;
    }).map((r) => ({
      version: r.spec_version, at: at(r), status: String(r.status || ''), vibes: savedVibes(r, o.id), checks: builtChecks(rows, r.spec_version, o.id).checks,
    }));
    const whole = card(o.id, o.id, entry, liveVersion, {
      label: o.label, blurb: o.blurb, vibes: String(chosen[vibesKey(o.id)] ?? '').trim(), rebuild: built.includes(o.id), versions,
      appFollows: o.id === 'genie_space' && built.includes('app'),
    });
    whole.warnings = whole.checks.length ? [] : vibeWarnings(base, o.id);
    return [whole, ...parts(o.id)];
  }).filter((c) => c.rebuild || c.versions.length)];
}

const PICK_GROUPS = [['notebook', 'Genie Code notebook'], ['results', 'Results'], ['app', 'App'], ['dashboard', 'Dashboard'], ['genie_space', 'Genie Agent'], ['alert', 'Alert']];
const pickGroup = (card) => (card.output === 'notebook' && card.id !== 'notebook' ? 'results' : card.output);

function pickTitle(card, liveName) {
  const part = partOf(card.id);
  if (part?.kind === 'app_page') return `Page: ${card.name || part.key}`;
  if (part?.kind === 'dashboard_chart') return `Chart: ${card.name || part.key}`;
  return {
    notebook: 'Notebook', ai_reasoning: 'AI reasoning', value_formula: 'Money at stake', genie_space: 'Instructions',
    alert: liveName ? `Alert: ${liveName}` : 'Alert', app: 'The whole App', dashboard: 'The whole dashboard',
  }[card.id];
}

export function assetGroups(cards, rows = []) {
  const names = new Map((rows || []).map((row) => [row.id, String(row.name || '')]));
  const list = cards || [];
  return PICK_GROUPS.map(([key, label]) => {
    const own = list.filter((c) => pickGroup(c) === key);
    const parts = own.filter((c) => c.id !== c.output);
    const shown = ['app', 'dashboard'].includes(key) && parts.length ? parts : own;
    return {
      key,
      label,
      assets: shown.map((c) => ({
        ...c, group: label, title: pickTitle(c, names.get(c.id)), name: c.name || names.get(c.id) || '', parent: c.id === c.output ? null : list.find((p) => p.id === c.output) || null,
      })),
    };
  }).filter((group) => group.assets.length);
}

export function tryAgainChanges(id, asks) {
  return { retry_outputs: [id], retry_asks: { [id]: [...asks] } };
}

export function vibeChanges(latest, id, text) {
  const outputs = latest?.spec_json?.outputs || {};
  const next = String(text ?? '').trim();
  if (id === 'notebook') {
    const data = latest?.spec_json?.data || {};
    return next === String(data.notes ?? '').trim() ? { retry_outputs: ['notebook'] } : { data: { ...data, notes: next } };
  }
  if (partOf(id)) {
    return next === String(outputs[vibesKey(id)] ?? '').trim()
      ? { retry_outputs: [id] }
      : { outputs: { ...outputs, [vibesKey(id)]: String(text ?? '') }, retry_outputs: [id] };
  }
  return next === String(outputs[vibesKey(id)] ?? '').trim() ? { retry_outputs: [id] } : { outputs: { ...outputs, [vibesKey(id)]: next } };
}

export function rollbackChanges(latest, id, version, vibes) {
  return { rollback_outputs: { [id]: version }, outputs: { ...(latest?.spec_json?.outputs || {}), [vibesKey(id)]: String(vibes ?? '').trim() } };
}

export function removeConfirmed(typed, useCaseId) {
  return Boolean(useCaseId) && String(typed ?? '').trim() === String(useCaseId);
}

export function controlActionText(entry) {
  const who = entry?.acted_by ? ` by ${entry.acted_by}` : '';
  const when = entry?.acted_at ? `, ${formatWhen(entry.acted_at, entry.acted_at)}` : '';
  return `${entry?.message || `${entry?.asset} ${entry?.action}`}${who}${when}`;
}

const VIBE_OUTPUT_WORDS = { genie_space: 'the Genie Agent', app: 'the App', dashboard: 'the dashboard', alert: 'the alert' };
const heading = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const newestFirst = (history) => [...(history || [])].sort((a, b) => (b.spec_version || 0) - (a.spec_version || 0));

export function vibeOutputs(cards) {
  const live = new Set((cards || []).filter((c) => c.live && Object.hasOwn(VIBE_OUTPUT_WORDS, c.output)).map((c) => c.output));
  return Object.keys(VIBE_OUTPUT_WORDS).filter((id) => live.has(id));
}

export function vibePlaceholder(outputs) {
  const words = (outputs || []).map((id) => VIBE_OUTPUT_WORDS[id]).filter(Boolean);
  if (!words.length) return '';
  return `Tell us what to change in ${words.length === 1 ? words[0] : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`}`;
}

export function liveVersion(history) {
  return newestFirst(history).find((row) => DONE.includes(String(row?.status)))?.spec_version ?? null;
}

export function globalVibeChanges(text, previous) {
  return { vibes: String(text ?? '').trim(), vibe_previous: previous };
}

export function removeKeptChanges(version) {
  return { remove_kept: [Number(version)] };
}

export function uninstallChanges() {
  return { uninstall: true };
}

export function lastVibe(history) {
  const row = newestFirst(history).find((r) => r?.asset_status?.vibe && typeof r.asset_status.vibe === 'object' && !Array.isArray(r.asset_status.vibe));
  if (!row) return null;
  const vibe = row.asset_status.vibe;
  const named = (id) => String(row.asset_status?.[id]?.name ?? row.asset_status?.[id]?.title ?? '');
  const routes = Object.entries(vibe.routes && typeof vibe.routes === 'object' ? vibe.routes : {})
    .map(([id, words]) => ({ id, label: heading(partLabel(id, named(id))), words: String(words ?? '').trim() }))
    .filter((route) => route.words);
  const notRouted = (Array.isArray(vibe.not_routed) ? vibe.not_routed : [])
    .map((item) => ({ ask: String(item?.ask ?? '').trim(), reason: String(item?.reason ?? '').trim() }))
    .filter((item) => item.ask);
  return { version: row.spec_version, status: String(row.status || ''), text: String(vibe.text ?? '').trim(), previous: String(vibe.previous ?? ''), routes, notRouted };
}

export function keptVersions(history) {
  const row = newestFirst(history).find((r) => r?.asset_status?.kept && typeof r.asset_status.kept === 'object');
  const byVersion = new Map();
  for (const entry of Array.isArray(row?.asset_status?.kept?.assets) ? row.asset_status.kept.assets : []) {
    const output = IMPLEMENT_OUTPUTS.find((o) => o.id === entry?.output);
    const version = Number(entry?.version);
    if (!output || !String(entry.id ?? '').trim() || !Number.isInteger(version) || version < 1) continue;
    if (!byVersion.has(version)) byVersion.set(version, { version, keptIn: Number(entry.kept_in) || null, assets: [] });
    byVersion.get(version).assets.push({ output: output.id, label: output.label, id: String(entry.id), url: String(entry.url || ''), title: String(entry.title || '') });
  }
  return [...byVersion.values()].sort((a, b) => b.version - a.version);
}

export const ASSET_FILTERS = [['notebook', 'Notebook'], ['app', 'App'], ['dashboard', 'Dashboard'], ['genie_space', 'Genie Agent'], ['alert', 'Alert']];

export function itemAssets(item) {
  const gone = item?.latest?.status === IMPLEMENT_UNINSTALLED;
  const have = new Set(gone ? [] : deliveredOutputs(item?.latest));
  if (item?.notebook?.state === 'ready' || (!gone && item?.latest?.notebook_path)) have.add('notebook');
  return have;
}

export function assetFilterCounts(items) {
  const list = (items || []).map(itemAssets);
  return ASSET_FILTERS.map(([id, label]) => ({ id, label, count: list.filter((have) => have.has(id)).length }));
}

export function filterByAsset(groups, asset) {
  if (!asset) return groups;
  return (groups || []).map((group) => ({ ...group, items: group.items.filter((item) => itemAssets(item).has(asset)) }));
}
