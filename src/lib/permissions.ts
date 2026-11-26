export const PERMISSIONS = {
  view_partnerships: 'View partnership organizations, histories and work queues',
  manage_partnerships: 'Manage partnership contacts, opportunities, research and follow-ups',
  import_partnerships: 'Import and reconcile partnership sources',
  approve_partnership_outreach: 'Approve specific partnership message drafts and recipients',
  manage_partnership_ai: 'Connect and revoke your restricted partnership AI access',
  operations: 'Bookings, customers, companies, tasks and calendar',
  view_sale_price: 'View customer sale price and customer statements',
  view_supplier_cost: 'View supplier costs and balances',
  view_booking_profit: 'View individual booking profit and margin',
  view_total_profit: 'View overall/monthly profit and company financial totals',
  view_asset_basis: 'View travel asset acquisition cost and cost basis',
  view_accounting: 'View accounting reports, cash flow and exports',
  edit_payments: 'Create, allocate and correct customer payments',
  edit_customer_charges: 'Create and adjust customer charges',
  manage_funding: 'Manage supplier funding and supplier payments',
  view_refunds: 'View operational refund cases',
  issue_refunds: 'Issue, receive and correct refunds/cancellations',
  view_commissions: 'View commissions and referral obligations',
  manage_commissions: 'Manage commissions, referrals and their receipts/payouts',
  manage_assets: 'Manage Travel Assets, transfers and sales',
  edit_completed_bookings: 'Edit completed bookings and their financial terms',
  view_traveler_sensitive: 'View/edit protected traveler and passport information',
  view_audit: 'View complete audit history',
  manage_users: 'Manage individual users, access and recovery',
  manage_settings: 'Manage settings, payment accounts and backup/admin information',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export type Role = 'OWNER' | 'EMPLOYEE';
export type Actor = {
  id: string;
  name: string;
  permissions: string[];
  role?: Role;
  authVersion?: number;
};
export const OWNER_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];
/**
 * Plan v1 staff default: daily booking/money work is allowed.
 * Hide only company-wide / monthly profit totals and Owner admin surfaces.
 */
export const EMPLOYEE_PERMISSIONS: Permission[] = [
  'operations',
  'view_sale_price',
  'view_supplier_cost',
  'view_booking_profit',
  'view_asset_basis',
  'edit_payments',
  'edit_customer_charges',
  'manage_funding',
  'view_refunds',
  'issue_refunds',
  'view_commissions',
  'manage_commissions',
  'manage_assets',
  'view_traveler_sensitive',
  'view_partnerships',
  // Explicitly NOT included: view_total_profit, view_accounting, manage_users,
  // manage_settings, view_audit, edit_completed_bookings (separate grant),
  // manage_partnerships / import / outreach / AI.
];
export function hasPermission(actor: Actor, permission: Permission) {
  return actor.role === 'OWNER' || actor.permissions.includes(permission);
}
export function requirePermission(actor: Actor, permission: Permission) {
  if (!hasPermission(actor, permission)) throw new Error(`Permission required: ${permission}`);
}
export function effectivePermissions(actor: Actor): Permission[] {
  return actor.role === 'OWNER'
    ? [...OWNER_PERMISSIONS]
    : OWNER_PERMISSIONS.filter((p) => actor.permissions.includes(p));
}
export function commandPermission(kind: string): Permission {
  if (kind === 'review_resolution') return 'manage_settings';
  if (
    [
      'party',
      'edit_party',
      'merge_party',
      'relationship',
      'booking',
      'booking_draft',
      'booking_draft_delete',
      'booking_draft_restore',
      'booking_source_method',
      'booking_source_profile',
      'booking_source_profile_link',
      'program',
      'revise',
      'note',
      'note_hide',
      'note_restore',
      'task',
      'update_task',
      'complete_task',
      'resolve_attention',
      'travel_component',
      'revise_travel',
      'link_booking',
      'unlink_booking',
      'booking_extra',
      'booking_change',
      'booking_document',
      'booking_document_hide',
    ].includes(kind)
  )
    return 'operations';
  if (kind === 'traveler') return 'view_traveler_sensitive';
  if (
    ['payment', 'allocate', 'correct_payment', 'authorize_payer', 'return_customer_credit'].includes(
      kind,
    )
  )
    return 'edit_payments';
  if (
    [
      'commission',
      'commission_receipt',
      'referral',
      'pay_referral',
      'revise_referral',
      'reverse_referral',
      'reverse_referral_payment',
      'void_money_back',
      'deny_money_back',
      'deduct_money_back',
    ].includes(kind)
  )
    return 'manage_commissions';
  if (['cancel', 'receive_refund', 'pay_refund', 'reconcile_supplier_return'].includes(kind))
    return 'issue_refunds';
  if (
    [
      'fund',
      'price_match_event',
      'fulfill',
      'revise_fulfillment',
      'reverse_fulfillment',
      'link_fulfillment',
      'confirm_travel_no_cost',
      'cancellation_cost',
    ].includes(kind)
  )
    return 'manage_funding';
  if (['charge', 'confirm_sale', 'booking_taxes'].includes(kind)) return 'edit_customer_charges';
  if (['payment_account', 'instrument', 'program_account', 'update_fee_settings'].includes(kind))
    return 'manage_settings';
  if (kind === 'invoice_draft') return 'view_sale_price';
  if (['invoice_approve', 'invoice_mark_sent', 'invoice_void'].includes(kind))
    return 'manage_settings';
  if (
    [
      'acquire_asset',
      'revise_asset',
      'sell_asset',
      'trade',
      'benefit',
      'voucherize',
      'transfer_asset',
      'convert_asset',
      'expire_asset',
      'void_credit',
      'receive_asset_sale',
      'pay_asset_purchase',
      'expected_event',
      'update_expected_event',
    ].includes(kind)
  )
    return 'manage_assets';
  throw new Error('Unknown command permission');
}
