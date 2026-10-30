import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import BodyPortal from './BodyPortal';

export default function DrawerShell({ label, closeLabel, focusKey = null, onClose, title, actions = null, below = null, footer = null, children, ...rest }) {
  const panelRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    return () => {
      const opener = openerRef.current;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    panelRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[70] flex justify-end" {...rest}>
        <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-black/40 cursor-default" onClick={onClose} />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className="relative flex h-full w-full max-w-[46rem] flex-col border-l border-border bg-surface shadow-elevated outline-none"
        >
          <div className="shrink-0 border-b border-border px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">{title}</div>
              <div className="flex shrink-0 items-center gap-1">
                {actions}
                <button type="button" onClick={onClose} className="rounded-md p-1.5 text-text-secondary hover:bg-bg-subtle" aria-label="Close" title="Close (Esc)">
                  <X size={16} />
                </button>
              </div>
            </div>
            {below}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
            {children}
          </div>

          {footer && (
            <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-panel px-4 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
