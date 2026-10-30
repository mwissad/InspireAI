import { useState } from 'react';
import {
  AlertTriangle, AppWindow, Ban, Bell, Briefcase, ExternalLink, Eye, EyeOff, Hammer, LayoutDashboard, Loader2, NotebookPen, PanelRightOpen, Pause, Play, Plus, Radar,
  RefreshCw, RotateCcw, Square, Trash2, Zap,
} from 'lucide-react';
import BodyPortal from './BodyPortal';
import GenieLogo from './GenieLogo';
import ImplementStatusBadge from './ImplementStatusBadge';
import { IconChip, PANEL_CLASS, SectionTitle } from './BuildUi';
import { controlTiles, controlActionText, removeConfirmed } from '../lib/implementControl';
import { formatWhen } from '../lib/formatWhen';

const ACTION_ICONS = { stop: Square, start: Play, unpublish: EyeOff, publish: Eye, cancel: Ban };
const ASSET_ICONS = { build: Hammer, job: Briefcase, dashboard: LayoutDashboard, genie_space: GenieLogo, app: AppWindow, alert: Bell };
const TONE_CHIP = { success: 'success', error: 'error', warning: 'warning', busy: 'red', idle: 'idle' };
const BUTTON = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium disabled:opacity-50';

export function ConfirmDialog({ title, confirmLabel, useCaseId, busy, onCancel, onConfirm, children }) {
  const [typed, setTyped] = useState('');
  const ok = removeConfirmed(typed, useCaseId);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label={title} className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-md p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <div className="text-[12px] text-text-secondary space-y-2">{children}</div>
          <label className="block text-[12px] text-text-secondary">
            Type <span className="font-mono font-semibold text-text-primary">{useCaseId}</span> to confirm
            <input
              autoFocus
              aria-label="Type the use case id to confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="mt-1 w-full border border-border rounded-md px-2 py-1.5 font-mono text-[12px] bg-surface"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border">Cancel</button>
            <button
              type="button"
              disabled={!ok || busy}
              onClick={onConfirm}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-error-solid disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

function DetailsButton({ label, onDetails }) {
  return (
    <button type="button" aria-label={`${label} details`} onClick={onDetails} className={`${BUTTON} border border-border bg-surface text-text-primary`}>
      <PanelRightOpen size={11} /> Details
    </button>
  );
}

function RetryButton({ failed, disabled, onRetry }) {
  return (
    <button type="button" disabled={disabled} onClick={onRetry} title={failed.error || undefined} aria-label={`Retry the ${failed.label}`}
      className={`${BUTTON} border border-error/40 bg-surface text-error-fg`}>
      <RotateCcw size={11} /> Retry
    </button>
  );
}

function RowControls({ row, active, actionBusy, submitBusy, failed = null, onAction, onToggleSchedule, onRemove, onDetails = null, onRetry }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {row.url && (
        <a href={row.url} target="_blank" rel="noreferrer" className={`${BUTTON} font-semibold text-white bg-db-red-solid hover:opacity-90`}>
          Open <ExternalLink size={11} />
        </a>
      )}
      {onDetails && <DetailsButton label={row.label} onDetails={onDetails} />}
      {row.actions.map((a) => {
        const Icon = ACTION_ICONS[a.action] || Square;
        const key = `${a.asset}:${a.action}`;
        const blocked = actionBusy !== '' || (active && a.asset !== 'build');
        return (
          <button
            key={key}
            type="button"
            disabled={blocked}
            title={blocked && active ? 'Wait for the build to finish, or stop the build first' : undefined}
            onClick={() => onAction(a)}
            className={`${BUTTON} border bg-surface ${a.danger ? 'border-error/40 text-error-fg' : 'border-border text-text-primary'}`}
          >
            {actionBusy === key ? <Loader2 size={11} className="animate-spin" /> : <Icon size={11} />} {a.label}
          </button>
        );
      })}
      {row.schedule && (
        <button type="button" disabled={active || submitBusy} onClick={onToggleSchedule} className={`${BUTTON} border border-border bg-surface text-text-primary`}>
          {row.schedule.on ? <Pause size={11} /> : <Play size={11} />} {row.schedule.label}
        </button>
      )}
      {failed && <RetryButton failed={failed} disabled={active || submitBusy} onRetry={onRetry} />}
      {!failed && row.lakebaseSwitch && (
        <button type="button" disabled={active || submitBusy} onClick={onRetry} className={`${BUTTON} border border-border bg-surface text-text-primary`}>
          <Zap size={11} /> Switch to Lakebase
        </button>
      )}
      {row.removable && (
        <button type="button" disabled={active || submitBusy} onClick={() => onRemove(row)} className={`${BUTTON} border border-error/40 bg-surface text-error-fg`}>
          <Trash2 size={11} /> Remove
        </button>
      )}
    </div>
  );
}

function StripRow({ row, controls }) {
  return (
    <li data-control={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12px]">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <IconChip icon={ASSET_ICONS[row.id] || Briefcase} tone={TONE_CHIP[row.state.tone] || 'idle'} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-text-primary">{row.label}</span>
            <span className="font-mono text-[11px] text-text-secondary truncate">{row.name}</span>
            <ImplementStatusBadge state={row.state} />
          </div>
          {row.detail && <p data-control-detail="" className={row.state.tone === 'error' ? 'text-error-fg' : 'text-text-secondary'}>{row.detail}</p>}
        </div>
      </div>
      {controls}
    </li>
  );
}

const TILE_CLICK = 'cursor-pointer transition-smooth hover:border-db-red/40 hover:shadow-md';
const opensCard = (onDetails) => (e) => {
  if (!e.target.closest('a, button, input, select, textarea, label')) onDetails();
};

function LiveTile({ row, controls, onDetails }) {
  const warned = row.warnings?.length > 0;
  const tone = warned && row.state.tone === 'success' ? 'warning' : TONE_CHIP[row.state.tone] || 'idle';
  return (
    <li data-control={row.id} data-tile={row.id} onClick={opensCard(onDetails)} className={`flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5 text-[12px] shadow-sm ${TILE_CLICK}`}>
      <div className="flex items-start gap-3">
        <IconChip icon={ASSET_ICONS[row.id]} tone={tone} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-text-primary">{row.label}</span>
            <ImplementStatusBadge state={row.state} />
          </div>
          <p className="font-mono text-[11px] text-text-secondary truncate" title={row.name}>{row.name}</p>
          {row.detail && <p data-control-detail="" className={`mt-1 ${row.state.tone === 'error' ? 'text-error-fg' : 'text-text-secondary'}`}>{row.detail}</p>}
          {row.backend && <p data-app-backend="" className="mt-1 text-text-secondary">{row.backend}</p>}
        </div>
      </div>
      {warned && (
        <ul aria-label={`${row.label} warnings`} className="space-y-1 rounded-lg bg-warning-bg px-2.5 py-2 ring-1 ring-inset ring-warning/40">
          {row.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5 text-warning-fg">
              <AlertTriangle size={12} className="mt-[2px] shrink-0" aria-hidden />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
      {controls}
    </li>
  );
}

function PendingTile({ tile, liveError, active, submitBusy, failed, onAddOutput, onDetails, onRetry }) {
  const { output, kind } = tile;
  const Icon = ASSET_ICONS[output.id];
  const details = <DetailsButton label={output.label} onDetails={onDetails} />;
  if (kind === 'off') {
    return (
      <li data-tile={output.id} className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-bg-subtle/50 p-3.5 text-[12px]">
        <div className="flex items-start gap-3">
          <IconChip icon={Icon} tone="idle" size="md" />
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-text-primary">{output.label}</p>
            <p className="text-text-secondary">{output.blurb}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onAddOutput && (
            <button type="button" disabled={active} onClick={onAddOutput} className={`${BUTTON} border border-border bg-surface text-text-primary`}>
              <Plus size={11} /> Add the {output.label}
            </button>
          )}
          {details}
        </div>
      </li>
    );
  }
  const look = {
    building: { tone: 'red', text: tile.now ? 'Genie is building it now' : 'Waiting for its turn in this run' },
    failed: { tone: 'error', text: tile.error ? `It failed: ${tile.error}` : 'It failed on this version' },
    checking: { tone: 'idle', text: liveError ? 'Inspire cannot read its live status' : 'Reading its live status' },
    missing: { tone: 'warning', text: 'Not built on this version' },
  }[kind];
  return (
    <li onClick={opensCard(onDetails)} className={`relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3.5 text-[12px] shadow-sm overflow-hidden ${TILE_CLICK}`} data-tile={output.id} data-tile-kind={kind}>
      <div className="flex items-start gap-3">
        <IconChip icon={Icon} tone={look.tone} size="md" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">{output.label}</p>
          <p className={kind === 'failed' ? 'text-error-fg' : 'text-text-secondary'}>
            {kind === 'building' && tile.now && <Loader2 size={11} className="inline mr-1 align-[-1px] motion-safe:animate-spin text-db-red-fg" aria-hidden />}
            {look.text}
          </p>
        </div>
      </div>
      {kind === 'building' && (
        <div className="relative h-1 rounded-full bg-bg-subtle overflow-hidden" aria-hidden>
          <span className={`absolute inset-y-0 left-0 w-1/3 rounded-full ${tile.now ? 'bg-db-red motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]' : 'bg-border'}`} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {details}
        {failed && <RetryButton failed={failed} disabled={active || submitBusy} onRetry={onRetry} />}
      </div>
    </li>
  );
}

export function NotebookFacts({ notebook }) {
  return (
    <>
      {notebook.state.reason && <p className={notebook.state.state === 'failed' ? 'text-error-fg' : 'text-text-secondary'}>{notebook.state.reason}</p>}
      {notebook.runError && <p className="text-error-fg">{notebook.runError}</p>}
      {notebook.path && <p className="font-mono text-[11px] text-text-secondary break-all">{notebook.path}</p>}
    </>
  );
}

export function NotebookLinks({ notebook }) {
  return (
    <>
      {notebook.href && (
        <a className={`${BUTTON} font-semibold text-white bg-db-red-solid hover:opacity-90`} href={notebook.href} target="_blank" rel="noreferrer">
          Open the notebook <ExternalLink size={11} />
        </a>
      )}
      {notebook.runUrl && (
        <a className={`${BUTTON} border border-border bg-surface text-text-primary`} href={notebook.runUrl} target="_blank" rel="noreferrer">
          Open the notebook run <ExternalLink size={11} />
        </a>
      )}
    </>
  );
}

function NotebookTile({ notebook, onDetails }) {
  return (
    <li data-tile="notebook" onClick={opensCard(onDetails)} className={`sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 text-[12px] shadow-sm ${TILE_CLICK}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <IconChip icon={NotebookPen} tone={TONE_CHIP[notebook.state.tone] || 'idle'} size="md" />
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-text-primary">Genie Code notebook</span>
            <ImplementStatusBadge state={notebook.state} />
          </div>
          <NotebookFacts notebook={notebook} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <NotebookLinks notebook={notebook} />
        <DetailsButton label="Genie Code notebook" onDetails={onDetails} />
      </div>
    </li>
  );
}

function KeptVersions({ kept, locked, onRemove }) {
  return (
    <section aria-label="Kept live from earlier versions" className="px-4 pb-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Kept live from earlier versions</p>
      <ul className="mt-1.5 divide-y divide-border rounded-xl border border-border bg-surface text-[12px]">
        {kept.map((entry) => (
          <li key={entry.version} data-kept-version={entry.version} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
              <span className="font-semibold text-text-primary">v{entry.version}</span>
              {entry.assets.map((asset) => (
                <span key={`${asset.output}:${asset.id}`} className="inline-flex items-center gap-1.5 text-text-secondary">
                  <IconChip icon={ASSET_ICONS[asset.output]} size="sm" />
                  {asset.url
                    ? <a href={asset.url} target="_blank" rel="noreferrer" className="font-medium text-db-red-fg hover:underline">{asset.title || asset.label} <ExternalLink size={11} className="inline" /></a>
                    : <span className="font-medium text-text-primary">{asset.title || asset.label}</span>}
                </span>
              ))}
            </div>
            <button type="button" disabled={locked} onClick={() => onRemove(entry)} className={`${BUTTON} border border-error/40 bg-surface text-error-fg`}>
              <Trash2 size={11} /> Remove v{entry.version}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const keptNames = (entry) => entry.assets.map((asset) => asset.label).join(', ');

export default function ImplementControlTower({
  mvp = true, notebook = null, banner = null, vibe = null, kept = [], failed = [], live, liveError, latest, useCaseId, active, buildingNow, actionBusy, submitBusy,
  onAction, onRemove, onRemoveKept, onToggleSchedule, onRefresh, onAddOutput, onRetry, onDetails,
}) {
  const [removing, setRemoving] = useState(null);
  const [removingKept, setRemovingKept] = useState(null);
  const { strips, tiles } = mvp ? controlTiles(live, latest, { active, buildingNow }) : { strips: [], tiles: [] };
  const actions = mvp ? (live?.actions || []).slice(0, 5) : [];
  const hasRows = strips.length > 0 || tiles.some((t) => t.kind === 'live');
  const failedById = new Map(failed.map((o) => [o.id, o]));
  const confirmRemove = async () => {
    const row = removing;
    await onRemove(row.id);
    setRemoving(null);
  };
  const confirmRemoveKept = async () => {
    if (await onRemoveKept(removingKept.version)) setRemovingKept(null);
  };
  const controls = (row, tile = false) => (
    <RowControls
      row={row}
      active={active}
      actionBusy={actionBusy}
      submitBusy={submitBusy}
      failed={tile ? failedById.get(row.id) || null : null}
      onAction={onAction}
      onToggleSchedule={onToggleSchedule}
      onRemove={setRemoving}
      onDetails={tile ? () => onDetails(row.id) : null}
      onRetry={() => onRetry(row.id)}
    />
  );
  let hint = 'The Genie Code notebook of this use case';
  if (mvp) hint = live?.checked_at ? `Live status checked ${formatWhen(live.checked_at, live.checked_at)}` : 'Reading the live status of every asset';
  return (
    <section role="region" aria-label="Control tower" className={PANEL_CLASS}>
      <SectionTitle
        icon={Radar}
        title="Control tower"
        hint={hint}
        right={mvp && (
          <button type="button" onClick={onRefresh} aria-label="Check the live status now" className="p-1.5 rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary">
            <RefreshCw size={13} />
          </button>
        )}
      />
      {banner && <div className="px-4 pt-4">{banner}</div>}
      {liveError && <p className="px-4 pt-3 text-[12px] text-error-fg">Inspire cannot read the live status: {liveError}</p>}
      {live && !hasRows && <p className="px-4 pt-3 text-[12px] text-text-secondary">This MVP has no job or outputs yet.</p>}
      {strips.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {strips.map((row) => <StripRow key={row.id} row={row} controls={controls(row)} />)}
        </ul>
      )}
      {vibe}
      <ul className="grid gap-3 p-4 sm:grid-cols-2">
        {notebook && <NotebookTile notebook={notebook} onDetails={() => onDetails('notebook')} />}
        {tiles.map((tile) => (tile.kind === 'live'
          ? <LiveTile key={tile.output.id} row={tile.row} controls={controls(tile.row, true)} onDetails={() => onDetails(tile.output.id)} />
          : (
            <PendingTile
              key={tile.output.id}
              tile={tile}
              liveError={liveError}
              active={active}
              submitBusy={submitBusy}
              failed={failedById.get(tile.output.id) || null}
              onAddOutput={onAddOutput}
              onDetails={() => onDetails(tile.output.id)}
              onRetry={() => onRetry(tile.output.id)}
            />
          )))}
      </ul>
      {kept.length > 0 && <KeptVersions kept={kept} locked={active || submitBusy} onRemove={setRemovingKept} />}
      {actions.length > 0 && (
        <div className="px-4 py-3 border-t border-border bg-bg-subtle/50">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-secondary">Recent actions</p>
          <ul aria-label="Recent control actions" className="mt-1 text-[11px] text-text-secondary space-y-0.5">
            {actions.map((entry, i) => (
              <li key={`${entry.acted_at}-${i}`} className={entry.result === 'done' ? '' : 'text-error-fg'}>{controlActionText(entry)}</li>
            ))}
          </ul>
        </div>
      )}
      {removing && (
        <ConfirmDialog title={`Remove the ${removing.label}`} confirmLabel={`Remove the ${removing.label}`} useCaseId={useCaseId} busy={submitBusy}
          onCancel={() => setRemoving(null)} onConfirm={confirmRemove}>
          <p>
            Inspire deletes the {removing.label} <span className="font-medium text-text-primary">{removing.name}</span> in a new version of this MVP and keeps the other outputs.
            You can add it back with Edit the MVP.
          </p>
        </ConfirmDialog>
      )}
      {removingKept && (
        <ConfirmDialog title={`Remove v${removingKept.version}`} confirmLabel={`Remove v${removingKept.version}`} useCaseId={useCaseId} busy={submitBusy}
          onCancel={() => setRemovingKept(null)} onConfirm={confirmRemoveKept}>
          <p>
            Inspire deletes what v{removingKept.version} kept live ({keptNames(removingKept)}) in a new version of this MVP. The live version stays as it is.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
