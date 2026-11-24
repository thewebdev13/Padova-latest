'use client';
import type { ReactNode } from 'react';

/** Form-level alert — only for issues that cannot map to a single field. */
export function FormAlert({
  children,
  title = 'Needs a fix',
  onDismiss,
}: {
  children: ReactNode;
  title?: string;
  onDismiss?: () => void;
}) {
  if (children == null || children === '') return null;
  return (
    <div className="form-alert" role="alert">
      <div className="form-alert-copy">
        <strong className="form-alert-title">{title}</strong>
        <div className="form-alert-body">{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" className="form-alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Inline message under the field that caused the problem. */
export function FieldError({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  if (children == null || children === '') return null;
  return (
    <p className="field-error" role="alert" id={id}>
      {children}
    </p>
  );
}

export function ReqMark() {
  return (
    <span className="req-star" aria-hidden="true">
      {' '}
      *
    </span>
  );
}

export function formFieldClass(base: string, hasError: boolean) {
  return `${base}${hasError ? ' has-error' : ''}`.trim();
}
