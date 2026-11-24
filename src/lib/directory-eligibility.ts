import type { Row, SQL } from './db';
import { eligibleProfileContact } from './booking-ux';

export const directoryRoles = [
  'customer',
  'traveler',
  'airline',
  'property',
  'rental',
  'seller',
  'commission_payer',
  'contact',
] as const;
export type DirectoryRole = (typeof directoryRoles)[number];

/** Purchased From / seller payee — not referral partners (those use Commission Payable). */
export function hasSellerAcquisitionRole(p: Row): boolean {
  const roles = Array.isArray(p.roles) ? p.roles : [];
  return (
    roles.includes('seller') ||
    roles.includes('source') ||
    roles.includes('supplier') ||
    p.kind === 'supplier'
  );
}

export function eligibleParty(p: Row, role: DirectoryRole): boolean {
  if (role === 'contact') return eligibleProfileContact(p);
  if (p.archived_at || p.details?.traveler_review_only) return false;
  if (!Array.isArray(p.roles) && role !== 'seller') return false;
  if (role === 'seller') return hasSellerAcquisitionRole(p);
  return (
    Array.isArray(p.roles) &&
    (p.roles.includes(role) ||
      (role === 'commission_payer' &&
        (p.kind === 'company' ||
          [
            'property',
            'airline',
            'rental',
            'seller',
            'platform',
            'consolidator',
            'intermediary',
          ].some((r) => p.roles.includes(r))))) &&
    (role !== 'traveler' || p.kind === 'person')
  );
}
export async function requirePartyRole(tx: SQL, id: string, role: DirectoryRole) {
  const p = (await tx.query('SELECT * FROM parties WHERE id=$1', [id])).rows[0];
  if (!p || !eligibleParty(p, role)) throw new Error(`Selected party is not eligible as ${role}`);
  return p;
}
export function accountSupports(a: Row, method: string): boolean {
  const methods =
    a.supported_methods ??
    (a.kind === 'Card'
      ? ['Card']
      : a.kind === 'Bank'
        ? ['ACH', 'Wire', 'Check', 'Zelle', 'Bank']
        : []);
  return (
    !a.archived_at &&
    a.active !== false &&
    a.ownership === 'Padova' &&
    methods.includes(method) &&
    (method !== 'Card' || a.kind === 'Card')
  );
}
export async function validatePaymentAccount(
  tx: SQL,
  accountId: string | null | undefined,
  method: string | undefined,
) {
  if (!accountId) {
    if (method === 'Card') throw new Error('Card outflow requires a saved Padova card account');
    return;
  }
  const a = (await tx.query('SELECT * FROM payment_accounts WHERE id=$1', [accountId])).rows[0];
  if (!a || !method || !accountSupports(a, method))
    throw new Error('Payment account is not eligible for this payment method');
}
export function providerRole(product: string): DirectoryRole {
  return product === 'Flight' ? 'airline' : product === 'Hotel' ? 'property' : 'rental';
}
