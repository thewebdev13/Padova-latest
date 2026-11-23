'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

export type ConfirmTone = 'danger' | 'default';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Optional short note under the message (e.g. money-safety line). */
  note?: string;
};

type Pending = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

/**
 * Premium in-app confirm — replaces browser window.confirm.
 * Matches Padova modal language; never invents money; safe Cancel default.
 */
export function ConfirmDialog({
  pending,
  onResolve,
}: {
  pending: Pending | null;
  onResolve: (ok: boolean) => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => confirmRef.current?.focus(), 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onResolve(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [pending, onResolve]);

  if (!pending) return null;

  const tone = pending.tone ?? 'danger';
  const confirmLabel = pending.confirmLabel ?? (tone === 'danger' ? 'Delete' : 'Continue');
  const cancelLabel = pending.cancelLabel ?? 'Cancel';

  return (
    <div
      className="modal-backdrop confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResolve(false);
      }}
    >
      <div
        className={`modal confirm-dialog confirm-dialog-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <div className="confirm-dialog-body">
          <div className={`confirm-dialog-icon confirm-dialog-icon-${tone}`} aria-hidden>
            {tone === 'danger' ? <Trash2 size={22} /> : <AlertTriangle size={22} />}
          </div>
          <div className="confirm-dialog-copy">
            <h2 id={titleId}>{pending.title}</h2>
            <p id={messageId}>{pending.message}</p>
            {pending.note ? <p className="confirm-dialog-note">{pending.note}</p> : null}
          </div>
        </div>
        <div className="modal-footer confirm-dialog-footer">
          <button type="button" className="btn" onClick={() => onResolve(false)}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${tone === 'danger' ? 'confirm-dialog-danger' : 'primary'}`}
            onClick={() => onResolve(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Promise-based confirm for any page/module. Renders dialog via returned node. */
export function useConfirmDialog(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<Pending | null>(null);

  const onResolve = useCallback((ok: boolean) => {
    setPending((cur) => {
      cur?.resolve(ok);
      return null;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending((cur) => {
        // Supersede any open ask (treat previous as cancel).
        cur?.resolve(false);
        return { ...options, resolve };
      });
    });
  }, []);

  return {
    confirm,
    dialog: <ConfirmDialog pending={pending} onResolve={onResolve} />,
  };
}
