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
};

type Pending = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

/**
 * Professional in-app confirm — replaces browser window.confirm.
 * White panel, high contrast, danger only on the action button.
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    // Safer default focus: Cancel (destructive confirm is intentional click).
    const t = window.setTimeout(() => cancelRef.current?.focus(), 20);
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
      className="confirm-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onResolve(false);
      }}
    >
      <div
        className={`confirm-dialog confirm-dialog-tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <div className="confirm-dialog-body">
          <div className={`confirm-dialog-icon confirm-dialog-icon-${tone}`} aria-hidden>
            {tone === 'danger' ? <Trash2 size={20} strokeWidth={1.75} /> : <AlertTriangle size={20} strokeWidth={1.75} />}
          </div>
          <div className="confirm-dialog-copy">
            <h2 id={titleId}>{pending.title}</h2>
            <p id={messageId}>{pending.message}</p>
          </div>
        </div>
        <div className="confirm-dialog-footer">
          <button
            ref={cancelRef}
            type="button"
            className="confirm-dialog-btn confirm-dialog-btn-cancel"
            onClick={() => onResolve(false)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-dialog-btn ${
              tone === 'danger' ? 'confirm-dialog-btn-danger' : 'confirm-dialog-btn-primary'
            }`}
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
