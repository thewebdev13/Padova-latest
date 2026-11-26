type Data = Record<string, any>;
export type BookingRecovery = {
  version: 1;
  actorId: string;
  commandKey: string;
  savedAt: string;
  values: Data;
  components: Data[];
  traveler: string;
  paste: string;
};
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (actorId: string) => `padova:booking-recovery:v1:${actorId}`;
const snoozeKey = (actorId: string) => `padova:booking-recovery:snooze:v1:${actorId}`;

export function readBookingRecovery(actorId: string, storage?: Store): BookingRecovery | null {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    const d = JSON.parse(store?.getItem(key(actorId)) ?? 'null');
    return d?.version === 1 &&
      d.actorId === actorId &&
      /^[\da-f-]{36}$/i.test(d.commandKey) &&
      d.values &&
      Array.isArray(d.components)
      ? d
      : null;
  } catch {
    return null;
  }
}
export function writeBookingRecovery(draft: BookingRecovery, storage?: Store): boolean {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage);
    if (!store) return false;
    // The entry form has no payment credential fields. Do not persist passwords
    // or full card numbers accidentally included in unapplied pasted text.
    const paste = draft.paste
      .replace(/^(.*(?:password|security code|cvv|secret key)\s*:).*$/gim, '$1 [removed]')
      .replace(/\b(?:\d[ -]?){15,19}\b/g, '[payment number removed]');
    store.setItem(key(draft.actorId), JSON.stringify({ ...draft, paste }));
    return true;
  } catch {
    return false;
  }
}
export function clearBookingRecovery(actorId: string, storage?: Store, session?: Store) {
  try {
    (storage ?? (typeof window === 'undefined' ? undefined : window.localStorage))?.removeItem(
      key(actorId),
    );
  } catch {
    /* Storage may be disabled. */
  }
  clearBookingRecoverySnooze(actorId, session ?? storage);
}

/** Server drafts already live under Drafts — do not force-open them on every refresh. */
export function isServerDraftRecovery(draft: BookingRecovery | null | undefined): boolean {
  const id = draft?.values?.draft_id;
  return typeof id === 'string' && id.length > 0;
}

export function snoozeBookingRecoveryAutoOpen(actorId: string, storage?: Store) {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage);
    store?.setItem(snoozeKey(actorId), '1');
  } catch {
    /* Storage may be disabled. */
  }
}

export function clearBookingRecoverySnooze(actorId: string, storage?: Store) {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage);
    store?.removeItem(snoozeKey(actorId));
  } catch {
    /* Storage may be disabled. */
  }
}

export function isBookingRecoveryAutoOpenSnoozed(actorId: string, storage?: Store): boolean {
  try {
    const store = storage ?? (typeof window === 'undefined' ? undefined : window.sessionStorage);
    return store?.getItem(snoozeKey(actorId)) === '1';
  } catch {
    return false;
  }
}

/**
 * Plan v1: unfinished booking must NOT auto-popup on load.
 * Recovery data may still exist for an explicit Continue action; Drafts list is the reopen path.
 */
export function shouldAutoOpenBookingRecovery(
  _actorId: string,
  _draft: BookingRecovery | null,
  _session?: Store,
): boolean {
  return false;
}

export type LocalBookingRecoveryOffer = {
  commandKey: string;
  savedAt: string;
  hasPaste: boolean;
};

/**
 * Plan Do-now: never auto-open; surface a Continue/Discard offer for local unfinished
 * recovery only. Server drafts (`draft_id`) stay on the Drafts list — not this banner.
 */
export function localBookingRecoveryOffer(
  actorId: string,
  draft: BookingRecovery | null | undefined,
): LocalBookingRecoveryOffer | null {
  if (!draft || draft.actorId !== actorId) return null;
  if (isServerDraftRecovery(draft)) return null;
  if (!draft.commandKey) return null;
  return {
    commandKey: draft.commandKey,
    savedAt: String(draft.savedAt || ''),
    hasPaste: Boolean(String(draft.paste || '').trim()),
  };
}

/** Defaults for Continue unfinished — never invents booking money fields. */
export function bookingRecoveryContinueDefaults(draft: BookingRecovery): Data {
  return {
    ...draft.values,
    components: draft.components,
    pending_traveler: draft.traveler,
    recovery_paste: draft.paste,
    resume_recovery: true,
  };
}
