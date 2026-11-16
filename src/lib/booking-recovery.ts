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
export function clearBookingRecovery(actorId: string, storage?: Store) {
  try {
    (storage ?? window.localStorage).removeItem(key(actorId));
  } catch {
    /* Storage may be disabled. */
  }
}
