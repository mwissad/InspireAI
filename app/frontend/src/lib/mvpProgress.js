import { IMPLEMENT_OUTPUTS, IMPLEMENT_ACTIVE_STATUSES } from './implementWizard.js';
import { formatDuration } from './formatWhen.js';

export const MVP_BUILD_STAGES = [
  { id: 'Plan', label: 'Plan', working: 'Inspire is planning the build' },
  { id: 'Instruction', label: 'Instruction', working: 'Inspire is writing the Genie Code instruction' },
  { id: 'Genie Code', label: 'Start Genie Code', working: 'Inspire is starting Genie Code' },
  { id: 'Genie build', label: 'Genie builds the notebook', working: 'Genie is building the notebook' },
  { id: 'Preview run', label: 'Preview run', working: 'Inspire is running the notebook on a preview' },
];

const EARLIER_PHASES = { genie_space: ['Genie space'] };

const FINISH_STAGE = { id: 'Done', label: 'Done', working: 'Inspire is scheduling and sharing the MVP', phases: ['Schedule', 'Sharing', 'Done'] };

const STEP_STATES = { started: 'running', ended_success: 'done', ended_warning: 'warning', ended_error: 'error' };
export const MVP_REPAIR_PHASE = 'Self-repair';
const WHOLE_BUILD = 'the MVP build';
const RUN_STARTING_STATES = ['PENDING', 'QUEUED', 'BLOCKED'];

function stepPayload(row) {
  let payload = row?.result_json;
  if (typeof payload === 'string' && payload) {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  return payload && typeof payload === 'object' ? payload : {};
}

function stepPhase(row, payload) {
  const phase = String(payload.phase || '');
  if (phase) return phase;
  const named = /^Inspire is working on (.+)$/i.exec(String(row?.step_name || ''));
  return named ? named[1] : '';
}

function timeOf(value) {
  const ms = Date.parse(String(value || '').replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : null;
}

function stepEvents(steps) {
  return (steps || [])
    .map((row, order) => {
      const payload = stepPayload(row);
      return { row, payload, order, at: timeOf(payload.event_at) ?? timeOf(row?.last_updated) };
    })
    .sort((a, b) => ((a.at ?? Infinity) - (b.at ?? Infinity)) || a.order - b.order);
}

function sameVersion(payload, latest) {
  const ours = Number(latest?.spec_version);
  const theirs = Number(payload.spec_version);
  return !Number.isFinite(ours) || !Number.isFinite(theirs) || ours === theirs;
}

export function mvpRepairOf(steps, latest) {
  let found = null;
  for (const { row, payload, at } of stepEvents(steps)) {
    const attempt = Number(payload.attempt);
    if (stepPhase(row, payload) !== MVP_REPAIR_PHASE || !Number.isInteger(attempt) || attempt < 2 || !sameVersion(payload, latest)) continue;
    const attempts = Number(payload.attempts);
    found = {
      attempt,
      attempts: Number.isInteger(attempts) && attempts >= attempt ? attempts : null,
      step: String(payload.step || WHOLE_BUILD),
      why: String(payload.why || '').trim(),
      at,
    };
  }
  return found;
}

function repairLine(repair, status) {
  if (!repair) return '';
  const count = `${repair.attempt}${repair.attempts ? ` of ${repair.attempts}` : ''}`;
  const part = repair.step === WHOLE_BUILD ? '' : ` for ${repair.step}`;
  if (IMPLEMENT_ACTIVE_STATUSES.includes(status)) return `Attempt ${count}${part}: Inspire is fixing it${repair.why ? `: ${repair.why}` : ''}`;
  if (['ready', 'ready_with_warnings'].includes(status)) return `Built on attempt ${count}${part}${repair.why ? `. What Inspire fixed: ${repair.why}` : ''}`;
  return '';
}

function roundOf(payload) {
  const round = Number(payload.round);
  if (!Number.isInteger(round) || round < 1) return null;
  return payload.failure ? round + 1 : round;
}

export function mvpStages(steps, latest, { now = Date.now(), stalled = null } = {}) {
  const outputs = latest?.spec_json?.outputs || {};
  const plan = [
    ...MVP_BUILD_STAGES,
    ...IMPLEMENT_OUTPUTS.filter((o) => outputs[o.id]).map((o) => ({ id: o.label, label: o.label, phases: EARLIER_PHASES[o.id] || [], working: `Genie is building the ${o.label}` })),
    FINISH_STAGE,
  ];
  const stages = plan.map((stage) => ({ ...stage, state: 'waiting', started: null, ended: null, round: null, rounds: null }));
  const indexOf = (phase) => stages.findIndex((s) => s.id.toLowerCase() === phase.toLowerCase()
    || (s.phases || []).some((p) => p.toLowerCase() === phase.toLowerCase()));
  const rank = { running: 0, done: 1, warning: 2, error: 3 };
  const seenAt = new Map();
  const repair = mvpRepairOf(steps, latest);
  const since = repair && repair.step === WHOLE_BUILD ? repair.at : null;
  for (const { row, payload, at } of stepEvents(steps)) {
    if (since !== null && at !== null && at < since) continue;
    const index = indexOf(stepPhase(row, payload));
    if (index < 0) continue;
    const stage = stages[index];
    const state = STEP_STATES[String(row.status || '')];
    if (!state) continue;
    if (stage.started === null || (at !== null && at < stage.started)) stage.started = at;
    if (state !== 'running' && (stage.ended === null || (at !== null && at >= stage.ended))) stage.ended = at;
    const before = seenAt.has(index) ? seenAt.get(index) : undefined;
    const newer = before === undefined || at === null || before === null || at > before;
    const tie = at !== null && at === before && rank[state] >= rank[stage.state];
    if (newer || tie) {
      stage.state = state;
      stage.round = roundOf(payload);
      stage.rounds = Number.isInteger(Number(payload.rounds)) && Number(payload.rounds) > 0 ? Number(payload.rounds) : null;
      seenAt.set(index, at);
    }
  }
  const status = String(latest?.status || '');
  const finished = ['ready', 'ready_with_warnings'].includes(status);
  const failed = status === 'failed';
  const active = IMPLEMENT_ACTIVE_STATUSES.includes(status);
  if (active) {
    stages.forEach((s, i) => {
      const restartedAt = seenAt.get(i);
      if (s.state !== 'running' || restartedAt === undefined || restartedAt === null) return;
      stages.slice(i + 1).forEach((later, offset) => {
        const laterAt = seenAt.get(i + 1 + offset);
        if (laterAt === undefined || laterAt === null || laterAt >= restartedAt) return;
        Object.assign(later, { state: 'waiting', started: null, ended: null, round: null, rounds: null });
        seenAt.delete(i + 1 + offset);
      });
    });
  }
  const last = stages.reduce((found, s, i) => (s.state !== 'waiting' ? i : found), -1);
  stages.forEach((s, i) => { if (s.state === 'waiting' && i < last) s.state = 'skipped'; });
  const finish = stages[stages.length - 1];
  if (finished) {
    if (finish.state === 'waiting' || finish.state === 'running') finish.state = status === 'ready' ? 'done' : 'warning';
    stages.forEach((s) => { if (s.state === 'waiting') s.state = 'skipped'; });
  }
  if (failed) {
    if (!stages.some((s) => s.state === 'error')) {
      const broken = stages.find((s) => s.state === 'running') || stages.find((s) => s.state === 'waiting');
      if (broken) broken.state = 'error';
    }
    stages.forEach((s) => { if (s.state === 'running') s.state = 'error'; if (s.state === 'waiting') s.state = 'not_reached'; });
  }
  if (active && stalled) {
    stages.forEach((s) => { if (s.state === 'running') s.state = 'error'; if (s.state === 'waiting') s.state = 'not_reached'; });
  } else if (active && !stages.some((s) => s.state === 'running')) {
    const next = stages.find((s) => s.state === 'waiting');
    if (next) {
      next.state = 'next';
      next.started = stages.reduce((t, s) => (s.ended !== null && s.ended > (t ?? -Infinity) ? s.ended : t), null) ?? timeOf(latest?.created_at);
    }
  }
  for (const s of stages) {
    const end = ['running', 'next'].includes(s.state) ? now : s.ended;
    s.elapsed = s.started !== null && end !== null && end >= s.started ? formatDuration(end - s.started) : '';
  }
  return stages;
}

export function mvpProgressSummary(stages, latest, { now = Date.now(), stalled = null, repair = null } = {}) {
  const counted = stages.filter((s) => s.state !== 'skipped');
  const settled = counted.filter((s) => ['done', 'warning'].includes(s.state)).length;
  const current = stages.find((s) => ['running', 'next'].includes(s.state)) || null;
  const created = timeOf(latest?.created_at);
  const ended = stages.reduce((t, s) => (s.ended !== null && s.ended > (t ?? -Infinity) ? s.ended : t), null);
  const status = String(latest?.status || '');
  const active = IMPLEMENT_ACTIVE_STATUSES.includes(status) && !stalled;
  const span = created === null ? '' : formatDuration((active ? now : ended ?? now) - created);
  let headline = '';
  if (active && status === 'queued' && !current?.started) headline = 'Waiting for the build job to start';
  else if (active && current) headline = `${current.working}…`;
  else if (active) headline = 'Inspire is working…';
  const round = active && current?.state === 'running' && current.round > 1 ? current.round : null;
  const rounds = round ? `Round ${round}${current.rounds ? ` of ${current.rounds}` : ''}: Genie is fixing what failed in round ${round - 1}` : '';
  const fixing = stalled ? '' : repairLine(repair, status);
  return {
    active,
    current,
    percent: counted.length ? Math.round((settled / counted.length) * 100) : 0,
    headline,
    detail: [fixing, rounds].filter(Boolean).join('. '),
    span: span ? `${active ? 'Running for' : 'Took'} ${span}` : '',
  };
}

export function stagesRecorded(stages) {
  return (stages || []).some((s) => s.id !== FINISH_STAGE.id && s.state !== 'skipped');
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function feedLine(item) {
  const kind = String(item?.kind || '');
  const text = String(item?.text || '');
  if (kind === 'message') return { who: 'genie', tone: 'plain', text };
  if (kind === 'stopped') return { who: 'genie', tone: 'warning', text: `Stopped: ${text}` };
  if (kind === 'error') return { who: 'genie', tone: 'error', text: `Genie hit an error: ${text}` };
  if (kind === 'turn_done') return { who: 'genie', tone: 'quiet', text: 'Genie finished its turn' };
  if (kind === 'activity') {
    const commands = Number(item.commands) || 0;
    const failed = Number(item.failed) || 0;
    const files = Array.isArray(item.files) ? item.files : [];
    const parts = [];
    if (commands) parts.push(`Ran ${plural(commands, 'command')}${failed ? ` (${failed} failed)` : ''}`);
    if (files.length) parts.push(`${parts.length ? 'edited' : 'Edited'} ${files.join(', ')}`);
    return { who: 'genie', tone: 'quiet', text: parts.join(' · ') };
  }
  if (kind === 'run') {
    const what = item.check ? 'The alert check run' : 'The preview run';
    const state = String(item.state || '');
    const result = String(item.result || '');
    const after = Number(item.seconds) > 0 ? ` (${formatDuration(Number(item.seconds) * 1000)})` : '';
    if (RUN_STARTING_STATES.includes(state)) return { who: 'inspire', tone: 'quiet', text: `${what} is starting${after}` };
    if (state === 'RUNNING' || state === 'TERMINATING') return { who: 'inspire', tone: 'quiet', text: `${what} is running${after}` };
    if (state === 'TERMINATED' && result === 'SUCCESS') return { who: 'inspire', tone: 'plain', text: `${what} finished${after}` };
    return { who: 'inspire', tone: 'error', text: `${what} ended: ${[state, result].filter(Boolean).join(' / ')}${after}` };
  }
  if (kind === 'failed') return { who: 'inspire', tone: 'error', text };
  if (kind === 'note') return { who: 'inspire', tone: 'quiet', text };
  return null;
}

export function feedKey(item) {
  return `${item?.at || ''}|${item?.kind || ''}|${String(item?.text || item?.run_id || '').slice(0, 60)}`;
}

export const FEED_WORDS_PER_SECOND = 12;

export function typedText(text, elapsedMs, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  const value = String(text || '');
  const tokens = value.split(/(\s+)/);
  const words = Math.max(0, Math.floor((Math.max(0, Number(elapsedMs) || 0) / 1000) * wordsPerSecond));
  let shown = 0;
  let out = '';
  for (const token of tokens) {
    if (!/^\s+$/.test(token) && token) {
      if (shown >= words) return out.trimEnd();
      shown += 1;
    }
    out += token;
  }
  return out;
}

export function typingDone(text, elapsedMs, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  return typedText(text, elapsedMs, wordsPerSecond) === String(text || '');
}

export function feedTypesOut(item) {
  return ['message', 'stopped', 'error'].includes(String(item?.kind || ''));
}

const newestOf = (feed) => feed.reduce((most, item) => {
  const at = Date.parse(item?.until || item?.at || '');
  return Number.isFinite(at) && at > most ? at : most;
}, -Infinity);

const buildOf = (status) => {
  const latest = status?.latest || {};
  return [latest.session_id, latest.use_case_id, latest.spec_version, latest.implement_run_id].map((v) => String(v ?? '')).join('|');
};

export function steadyFeed(previous, next) {
  const before = previous?.feed;
  const after = next?.feed;
  if (!next || !Array.isArray(before) || !before.length || buildOf(previous) !== buildOf(next)) return next;
  const list = Array.isArray(after) ? after : [];
  if (list.length >= before.length && newestOf(list) >= newestOf(before)) return next;
  return { ...next, feed: before };
}

export function feedArrivals(previous, feed, at) {
  const next = new Map(previous || []);
  for (const item of Array.isArray(feed) ? feed : []) {
    const key = feedKey(item);
    if (!next.has(key)) next.set(key, previous ? at : 0);
  }
  return next;
}

export function typingSchedule(feed, arrivals, wordsPerSecond = FEED_WORDS_PER_SECOND) {
  const starts = new Map();
  let end = 0;
  for (const item of Array.isArray(feed) ? feed : []) {
    const key = feedKey(item);
    const arrived = arrivals?.get(key) || 0;
    if (!arrived || !feedTypesOut(item)) continue;
    const line = feedLine(item);
    if (!line?.text) continue;
    const start = Math.max(arrived, end);
    end = start + (line.text.split(/\s+/).filter(Boolean).length / wordsPerSecond) * 1000;
    starts.set(key, start);
  }
  return { starts, end };
}
