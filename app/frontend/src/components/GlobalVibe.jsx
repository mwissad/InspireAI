import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from 'lucide-react';
import BodyPortal from './BodyPortal';
import VibesEditor from './VibesEditor';
import { vibesProblem, vibesPreview } from '../lib/implementWizard';
import { vibePlaceholder } from '../lib/implementControl';

const PRIMARY_BUTTON = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-db-red-solid hover:bg-db-red-solid-hover shadow-sm shadow-db-red/20 disabled:opacity-50';
const OUTLINE_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-surface text-text-primary hover:bg-bg-subtle disabled:opacity-50';

function PreviousDialog({ live, next, inPlace, busy, onCancel, onSend }) {
  const [choice, setChoice] = useState('');
  const options = [
    ['keep', `Keep v${live} live`, `v${live} stays as it is. Inspire builds each changed asset again next to it, named v${next}, so you can compare them. Remove v${live} later from the control tower.${inPlace ? ' The alert is changed in place.' : ''}`],
    ['remove', `Remove v${live} once v${next} is ready`, `Inspire changes each asset in place. v${live} stays live until v${next} is built, and you can still roll an asset back to it.`],
  ];
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" aria-label={`What happens to v${live}?`} className="bg-surface border border-border rounded-xl shadow-elevated w-full max-w-md p-5 space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">What happens to v{live}?</h3>
          <fieldset className="space-y-2">
            <legend className="sr-only">What happens to v{live}</legend>
            {options.map(([id, label, text]) => (
              <label key={id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] cursor-pointer ${choice === id ? 'border-db-red/40 bg-bg-subtle' : 'border-border'}`}>
                <input type="radio" name="vibe-previous" value={id} checked={choice === id} onChange={() => setChoice(id)} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block font-semibold text-text-primary">{label}</span>
                  <span className="block text-text-secondary">{text}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className={OUTLINE_BUTTON}>Cancel</button>
            <button type="button" disabled={!choice || busy} onClick={() => onSend(choice)} className={PRIMARY_BUTTON}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Build v{next}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

function LastVibe({ last }) {
  return (
    <div data-last-vibe={last.version} className="rounded-lg border border-border bg-bg-subtle/60 px-3 py-2.5 text-[12px] space-y-1.5">
      <p className="font-semibold text-text-primary">
        Your vibe on v{last.version}{last.previous === 'keep' ? ', with the version before it kept live' : ''}
      </p>
      {last.text && <p className="truncate text-text-secondary" title={last.text}>“{vibesPreview(last.text, 160)}”</p>}
      {last.routes.length > 0 && (
        <ul aria-label="Where Inspire sent your vibe" className="space-y-1">
          {last.routes.map((route) => (
            <li key={route.id} className="flex items-start gap-1.5">
              <CheckCircle2 size={12} className="mt-px shrink-0 text-success-fg" aria-hidden />
              <span><span className="font-semibold text-text-primary">{route.label}:</span> <span className="text-text-secondary">{route.words}</span></span>
            </li>
          ))}
        </ul>
      )}
      {last.notRouted.length > 0 && (
        <ul aria-label="What no asset could do" className="space-y-1">
          {last.notRouted.map((item) => (
            <li key={item.ask} className="flex items-start gap-1.5 text-warning-fg">
              <AlertTriangle size={12} className="mt-px shrink-0" aria-hidden />
              <span><span className="font-semibold">{item.ask}</span>{item.reason ? `: ${item.reason}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GlobalVibe({ outputs, live, next, locked, lockedReason = '', active, last, onSend }) {
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const problem = vibesProblem('mvp', text, 'MVP');
  const send = async (previous) => {
    setBusy(true);
    const ok = await onSend(text, previous);
    setBusy(false);
    if (ok) {
      setAsking(false);
      setText('');
    }
  };
  return (
    <section aria-label="Vibe these assets" className="border-b border-border px-4 py-4 space-y-3">
      <div>
        <h3 className="text-[15px] font-semibold text-text-primary">Vibe these assets</h3>
        <p className="text-[12px] text-text-secondary">Say what to change. Inspire sends each ask to the asset it is about, builds v{next} with your words as strict asks, and checks every one.</p>
      </div>
      <VibesEditor id="mvp" label="MVP" heading="" disabled={locked} value={text} placeholder={vibePlaceholder(outputs)} onChange={setText} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={locked || !text.trim() || Boolean(problem)} onClick={() => setAsking(true)} className={PRIMARY_BUTTON}>
          <Wand2 size={12} /> Vibe it
        </button>
        {lockedReason ? <span className="text-[11px] text-text-secondary">{lockedReason}</span>
          : active && <span className="text-[11px] text-text-secondary">A version is building now; vibe it after it finishes.</span>}
      </div>
      {last && <LastVibe last={last} />}
      {asking && (
        <PreviousDialog live={live} next={next} inPlace={outputs.includes('alert')} busy={busy} onCancel={() => setAsking(false)} onSend={send} />
      )}
    </section>
  );
}
