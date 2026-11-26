import type { Row } from './db';
import { hasPermission, type Actor } from './permissions';
import { auditEventChannel, auditEventChannelLabel } from './audit-channel';
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);

function positiveCents(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

/** Plan: dated Change — dates/summary + optional airline/customer fees (never invent). */
export function summarizeBookingChangeActivity(input: {
  who: string;
  context: string;
  data: Row;
  result?: Row;
  canSeeSale: boolean;
  canSeeCost: boolean;
}): string {
  const d = input.data;
  const parts: string[] = [];
  if (d.travel_start || d.travel_end) {
    const start = d.travel_start ? String(d.travel_start) : '…';
    const end = d.travel_end ? String(d.travel_end) : '…';
    parts.push(`dates ${start}→${end}`);
  }
  if (d.summary && String(d.summary).trim())
    parts.push(`summary “${String(d.summary).trim().slice(0, 80)}”`);
  const feeBits: string[] = [];
  if (input.canSeeCost) {
    const fare = positiveCents(d.fare_difference);
    const supplierFee = positiveCents(d.supplier_change_fee);
    if (fare != null) feeBits.push(`airline fare ${usd(fare)}`);
    if (supplierFee != null) feeBits.push(`airline change fee ${usd(supplierFee)}`);
  }
  if (input.canSeeSale) {
    const padova = positiveCents(d.padova_change_fee);
    const customer = positiveCents(d.additional_customer_charge);
    if (padova != null) feeBits.push(`Padova fee ${usd(padova)}`);
    if (customer != null) feeBits.push(`customer charge ${usd(customer)}`);
  }
  if (feeBits.length) parts.push(feeBits.join(', '));
  const reason = String(d.reason || '').trim().slice(0, 120);
  let sentence = `${input.who} recorded a booking change${input.context}`;
  if (parts.length) sentence += `: ${parts.join('; ')}`;
  sentence += '.';
  if (reason) sentence += ` Reason: ${reason}.`;
  if (input.result?.envelope_changed === false && input.result?.fees_posted === true)
    sentence += ' Fees only — trip details unchanged.';
  return sentence;
}

/** Plan: seat/bag/other extra — optional customer price + optional cost (blank = Unknown). */
export function summarizeBookingExtraActivity(input: {
  who: string;
  context: string;
  data: Row;
  result?: Row;
  canSeeSale: boolean;
  canSeeCost: boolean;
}): string {
  const d = input.data;
  const result = input.result ?? {};
  const label =
    String(result.label || d.description || d.category || 'extra').trim().slice(0, 80) || 'extra';
  const bits: string[] = [];
  if (input.canSeeSale) {
    const customer =
      positiveCents(result.customer_amount) ?? positiveCents(d.customer_amount);
    if (customer != null) bits.push(`customer ${usd(customer)}`);
    else if (d.customer_amount == null && result.customer_amount == null)
      bits.push('customer Unknown');
  }
  if (input.canSeeCost) {
    const cost = positiveCents(result.cost_amount) ?? positiveCents(d.cost_amount);
    if (cost != null) bits.push(`cost ${usd(cost)}`);
    else if (d.cost_amount == null && result.cost_amount == null) bits.push('cost Unknown');
  }
  let sentence = `${input.who} added booking extra ${label}${input.context}`;
  if (bits.length) sentence += ` (${bits.join(', ')})`;
  sentence += '.';
  const reason = String(d.reason || '').trim().slice(0, 120);
  if (reason) sentence += ` Note: ${reason}.`;
  return sentence;
}

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
  let summary = `${who} ${({ party: 'added a contact', edit_party: 'updated contact details', traveler: 'updated traveler details', booking: 'created a booking', revise: 'changed the trip', revise_travel: 'updated travel details', fund: 'recorded a booking cost', fulfill: 'recorded how the trip was obtained', receive_refund: 'recorded a provider refund', pay_refund: 'refunded the customer', referral: 'recorded a commission payable agreement', pay_referral: 'recorded a commission payment', correct_payment: 'corrected a payment', resolve_attention: 'acknowledged a follow-up', commission: 'recorded commission receivable', note: 'added a note', booking_change: 'recorded a booking change', booking_extra: 'added a booking extra' } as Row)[event.kind] ?? event.kind.replaceAll('_', ' ')}${context}.`;
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
  if (event.kind === 'booking_change') {
    summary = summarizeBookingChangeActivity({
      who,
      context,
      data: d,
      result,
      canSeeSale:
        hasPermission(actor, 'view_sale_price') || hasPermission(actor, 'edit_payments'),
      canSeeCost:
        hasPermission(actor, 'view_supplier_cost') || hasPermission(actor, 'manage_funding'),
    });
  }
  if (event.kind === 'booking_extra') {
    summary = summarizeBookingExtraActivity({
      who,
      context,
      data: d,
      result,
      canSeeSale:
        hasPermission(actor, 'view_sale_price') || hasPermission(actor, 'edit_payments'),
      canSeeCost:
        hasPermission(actor, 'view_supplier_cost') || hasPermission(actor, 'manage_funding'),
    });
  }
  const source_channel = auditEventChannel(event);
  const source_label = auditEventChannelLabel(source_channel);
  const { before_value, after_value, ...safe } = event;
  return {
    ...safe,
    summary,
    source_channel,
    source_label,
    ...(actor.role === 'OWNER' ? { before_value, after_value } : {}),
  };
}
