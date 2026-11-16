import type { Row } from './db';
import { hasPermission, type Actor } from './permissions';
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
/** Raw audit remains immutable. Only this permission-filtered sentence is sent to staff. */
export function summarizeActivity(
  event: Row,
  actor: Actor,
  bookings: Row[],
  bookingId?: string,
): Row {
  const d = event.after_value?.input ?? {},
    result = event.after_value?.result ?? {};
  const id =
    bookingId ??
    d.booking_id ??
    d.allocations?.[0]?.booking_id ??
    (event.kind === 'booking' ? result.id : undefined);
  const code = bookings.find((b) => b.id === id)?.code;
  const who = event.actor_name ?? 'Staff',
    context = code ? ` against ${code}` : '';
  let summary = `${who} ${({ party: 'added a contact', edit_party: 'updated contact details', traveler: 'updated traveler details', booking: 'created a booking', revise: 'changed the trip', revise_travel: 'updated travel details', fund: 'recorded a booking cost', fulfill: 'recorded how the trip was obtained', receive_refund: 'recorded a provider refund', pay_refund: 'refunded the customer', referral: 'recorded a commission payable agreement', pay_referral: 'recorded a commission payment', correct_payment: 'corrected a payment', resolve_attention: 'acknowledged a follow-up', commission: 'recorded commission receivable', note: 'added a note' } as Row)[event.kind] ?? event.kind.replaceAll('_', ' ')}${context}.`;
  if (['party', 'edit_party'].includes(event.kind) && d.name)
    summary = `${who} ${event.kind === 'party' ? 'added' : 'updated'} contact ${d.name}.`;
  if (event.kind === 'payment') {
    const canSee =
      d.direction === 'customer'
        ? hasPermission(actor, 'view_sale_price') || hasPermission(actor, 'edit_payments')
        : d.direction === 'supplier'
          ? hasPermission(actor, 'view_supplier_cost') || hasPermission(actor, 'manage_funding')
          : hasPermission(actor, 'view_commissions') || hasPermission(actor, 'manage_commissions');
    const allocation = (d.allocations ?? []).find((a: Row) => a.booking_id === id);
    summary = `${who} recorded ${canSee ? usd(Number(allocation?.amount ?? d.amount)) + ' ' : ''}${d.method ?? ''} ${d.direction === 'customer' ? 'receipt' : d.direction === 'supplier' ? 'seller payment' : 'commission receipt'}${context}.`;
    const old = event.before_value?.customer_balances?.[id],
      current = event.after_value?.customer_balances?.[id];
    if (
      d.direction === 'customer' &&
      hasPermission(actor, 'view_sale_price') &&
      old != null &&
      current != null
    )
      summary += ` Customer balance changed from ${usd(Number(old))} to ${usd(Number(current))}.`;
  }
  const { before_value, after_value, ...safe } = event;
  return { ...safe, summary, ...(actor.role === 'OWNER' ? { before_value, after_value } : {}) };
}
