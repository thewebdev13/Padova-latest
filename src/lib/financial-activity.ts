import type { Row, SQL } from './db';
import type { Permission } from './permissions';
export async function financialActivity(
  db: SQL,
  context: {
    bookings: Row[];
    payments: Row[];
    refunds: Row[];
    accounts: Row[];
    can: (p: Permission) => boolean;
  },
): Promise<Row[]> {
  const { bookings, payments, refunds, accounts, can } = context;
  const raw = (
    await db.query(
      "SELECT j.id,j.command_id,j.booking_id,j.effective_on,j.debit-j.credit amount,c.kind,c.payload,c.result,COALESCE(s.name,c.actor) actor_name FROM journal_lines j JOIN commands c ON c.id=j.command_id LEFT JOIN staff s ON s.id::text=c.actor WHERE j.account='cash' ORDER BY j.effective_on DESC,c.created_at DESC,j.id",
    )
  ).rows;
  const funding = (
    await db.query('SELECT id,booking_id,command_id,account_id,cost FROM funding_components')
  ).rows;
  return raw.flatMap((row) => {
    const d = row.payload,
      p = payments.find((p) => p.id === (d.payment_id ?? row.result?.payment_id ?? row.result?.id));
    const incoming = Number(row.amount) > 0;
    const direction =
      p?.direction ??
      (row.kind.includes('refund')
        ? 'refund'
        : row.kind.includes('referral')
          ? 'referral'
          : row.kind === 'payment'
            ? d.direction
            : incoming
              ? 'customer'
              : 'supplier');
    const allowed =
      can('view_accounting') ||
      (direction === 'customer'
        ? can('view_sale_price') || can('edit_payments')
        : direction === 'commission' || direction === 'referral'
          ? can('view_commissions') || can('manage_commissions')
          : direction.includes('refund')
            ? can('view_refunds') || can('issue_refunds')
            : can('view_supplier_cost') || can('manage_funding'));
    if (!allowed) return [];
    const refund = refunds.find((r) => r.id === d.refund_id);
    const bookingId =
      row.booking_id ??
      d.booking_id ??
      refund?.booking_id ??
      (row.kind === 'booking' ? row.result?.id : undefined) ??
      (d.allocations?.length === 1 ? d.allocations[0].booking_id : undefined);
    const booking = bookings.find((b) => b.id === bookingId);
    const matched = funding.filter((f) =>
      refund
        ? f.id === refund.funding_component_id
        : f.command_id === row.command_id && Number(f.cost) === Math.abs(Number(row.amount)),
    );
    const receipt = row.kind === 'booking' && incoming ? d.customer_payment : undefined;
    const operational =
      row.kind === 'booking' && !incoming
        ? (d.operational?.components ?? []).filter(
            (c: Row) => Number(c.paid ?? c.cost) === Math.abs(Number(row.amount)) && c.account_id,
          )
        : [];
    const accountId =
      p?.account_id ??
      d.account_id ??
      receipt?.account_id ??
      (!incoming && matched.length === 1 ? matched[0].account_id : undefined);
    const method =
      p?.method ??
      d.method ??
      receipt?.method ??
      (operational.length === 1 ? operational[0].method : undefined) ??
      '';
    return [
      {
        id: row.id,
        command_id: row.command_id,
        booking_id: bookingId,
        code: booking?.code,
        date: row.effective_on,
        amount: Number(row.amount),
        event:
          row.kind === 'booking'
            ? incoming
              ? 'customer receipt'
              : 'Padova payment'
            : row.kind.replaceAll('_', ' '),
        actor: row.actor_name,
        method,
        account:
          accounts.find((a) => a.id === accountId)?.name ??
          (accountId ? 'Saved account' : 'Account not specified'),
        reference: p?.reference ?? d.reference ?? '',
      },
    ];
  });
}
