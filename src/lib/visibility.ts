import { Row } from './db';
import { Actor, hasPermission } from './permissions';
export function partyVisibility(row: Row, actor: Actor) {
  if (actor.role === 'OWNER') return row;
  const details = { ...row.details };
  delete details.traveler_source_claims;
  delete details.source_provenance;
  delete details.raw_text;
  delete details.raw_cell;
  return { ...row, details };
}
export function bookingVisibility(row: Row, actor: Actor) {
  const b = { ...row };
  if (b.itinerary?.operational_entry) {
    b.itinerary = { ...b.itinerary, operational_entry: { ...b.itinerary.operational_entry } };
    if (!hasPermission(actor, 'view_commissions') && !hasPermission(actor, 'manage_commissions'))
      delete b.itinerary.operational_entry.commission;
    if (!hasPermission(actor, 'view_sale_price'))
      for (const key of ['additional_charge', 'pricing']) delete b.itinerary.operational_entry[key];
    if (!hasPermission(actor, 'view_supplier_cost')) {
      delete b.itinerary.operational_entry.components;
      delete b.itinerary.operational_entry.taxes;
    }
  }
  if (b.itinerary && actor.role !== 'OWNER') {
    b.itinerary = { ...b.itinerary };
    delete b.itinerary.historical_sources;
  }
  if (b.itinerary && !hasPermission(actor, 'view_supplier_cost')) {
    b.itinerary = { ...b.itinerary };
    delete b.itinerary.price_match_history;
  }
  if (!hasPermission(actor, 'view_sale_price'))
    for (const k of ['sale', 'paid', 'customer_balance', 'refund_due']) delete b[k];
  if (!hasPermission(actor, 'view_supplier_cost'))
    for (const k of [
      'funding_cost',
      'obligations',
      'supplier_paid',
      'supplier_balance',
      'recorded_supplier_balance',
      'generated_value',
      'net_economic_cost',
    ])
      delete b[k];
  if (!hasPermission(actor, 'view_booking_profit'))
    for (const k of ['profit', 'gross_profit', 'margin', 'current_profit']) delete b[k];
  if (!hasPermission(actor, 'view_commissions') && !hasPermission(actor, 'manage_commissions'))
    for (const k of [
      'expected_commission',
      'commission_incomplete',
      'referral_due',
      'referral_accrued',
      'referral_recovery',
      'commission_payables',
      'gross_profit',
      'received_commission',
      'current_profit',
      'referring_organization_id',
      'referring_organization_name',
    ])
      delete b[k];
  return b;
}
export function assetVisibility(row: Row, actor: Actor) {
  const r = { ...row };
  if (!hasPermission(actor, 'view_asset_basis'))
    for (const k of [
      'remaining_basis',
      'basis',
      'cost',
      'recognized_basis',
      'opening_cost',
      'acquisition_cost',
      'acquisition_paid',
      'acquisition_due',
    ])
      delete r[k];
  return r;
}
