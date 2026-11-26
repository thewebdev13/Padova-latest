/**
 * Plan triage: add a new payer or referrer from inside booking/commission
 * screens without closing the window. Seed roles so the new contact is
 * usable immediately — never invent money or identity merges.
 */

export type InlinePartyCreateDefaults = {
  kind: 'person' | 'supplier' | 'partner';
  roles: string[];
};

export function inlinePartyCreateDefaults(opts: {
  fieldKey: string;
  commandKind?: string;
  /** payment.direction when creating the remitting party */
  paymentDirection?: string | null;
}): InlinePartyCreateDefaults {
  const key = String(opts.fieldKey || '');
  const command = String(opts.commandKind || '');

  if (['supplier_id', 'airline_id', 'provider_id'].includes(key))
    return { kind: 'supplier', roles: ['supplier'] };

  if (['seller_id', 'change_seller_id', 'acquisition_source_id', 'source_id'].includes(key))
    return { kind: 'partner', roles: ['seller'] };

  if (key === 'referrer_id') return { kind: 'person', roles: ['referrer'] };

  if (key === 'payer_id' || key === 'collector_id')
    return { kind: 'person', roles: ['payer'] };

  if (command === 'authorize_payer' && key === 'party_id')
    return { kind: 'person', roles: ['payer'] };

  if (command === 'payment' && key === 'party_id') {
    const dir = String(opts.paymentDirection || '');
    if (dir === 'customer') return { kind: 'person', roles: ['customer', 'payer'] };
    if (dir === 'supplier' || dir === 'asset_purchase')
      return { kind: 'partner', roles: ['seller'] };
    if (dir === 'commission') return { kind: 'person', roles: ['payer'] };
    return { kind: 'person', roles: ['payer'] };
  }

  if (command === 'referral' && key === 'party_id')
    return { kind: 'person', roles: ['referrer'] };

  return { kind: 'person', roles: [] };
}
