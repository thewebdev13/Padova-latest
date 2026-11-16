import type { Row, SQL } from './db';

export async function hasPayableTerms(db: SQL): Promise<boolean> {
  const name =
    db.storage === 'padova'
      ? 'padova.commission_payable_revisions'
      : 'public.commission_payable_revisions';
  return Boolean((await db.query('SELECT to_regclass($1) name', [name])).rows[0].name);
}

export async function requirePayableTerms(db: SQL) {
  if (!(await hasPayableTerms(db)))
    throw new Error(
      'Commission Payable extension is not installed; keep production entry disabled',
    );
}

export async function payableStates(db: SQL, booking: Row, today: string): Promise<Row[]> {
  const referrals = (
    await db.query(
      `SELECT r.*,p.name referrer,c.payload->>'cancellation_rule' cancellation_rule,c.payload->>'date' created_on
     FROM referrals r JOIN parties p ON p.id=r.referrer_id JOIN commands c ON c.id=r.command_id WHERE r.booking_id=$1 ORDER BY r.id`,
      [booking.id],
    )
  ).rows;
  const extended = await hasPayableTerms(db);
  const states: Row[] = [];
  for (const r of referrals) {
    const terms = extended
      ? (
          await db.query(
            'SELECT * FROM commission_payable_revisions WHERE referral_id=$1 ORDER BY revision DESC LIMIT 1',
            [r.id],
          )
        ).rows[0]
      : undefined;
    const paid = Number(
      (
        await db.query(
          `SELECT COALESCE(sum(p.current_amount),0) amount FROM referral_payments rp JOIN payment_balances p ON p.id=rp.payment_id WHERE rp.referral_id=$1`,
          [r.id],
        )
      ).rows[0].amount,
    );
    const basis = terms?.percentage_basis ?? 'profit';
    const calculation = terms?.calculation ?? (r.basis === 'fixed' ? 'fixed' : 'percentage');
    const canceled = ['Cancelled', 'Refund Pending'].includes(booking.reservation_status);
    const active =
      (terms?.active ?? true) &&
      (!canceled || (terms?.cancellation_rule ?? r.cancellation_rule) === 'Retain agreed amount');
    let base: number | null = null;
    if (basis === 'profit')
      base =
        booking.cost_incomplete || booking.commission_incomplete
          ? null
          : Math.max(0, Number(booking.gross_profit));
    if (basis === 'sale') base = booking.sale == null ? null : Math.max(0, Number(booking.sale));
    if (basis === 'commission')
      base = booking.commission_incomplete ? null : Number(booking.expected_commission);
    if (basis === 'commission_received') base = Number(booking.received_commission);
    if (basis === 'agreed_amount')
      base = terms?.agreed_basis == null ? null : Number(terms.agreed_basis);
    const expected = !active
      ? 0
      : calculation === 'fixed'
        ? Number(terms?.fixed_amount ?? r.fixed_amount)
        : base == null
          ? null
          : Number((BigInt(base) * BigInt(terms?.rate_bps ?? r.rate_bps) + 5000n) / 10000n);
    const earned = terms?.earned ?? true;
    const accrued = !active || !earned ? 0 : expected;
    const rule = terms?.payable_when ?? 'After travel';
    const due = String(terms?.due_on ?? r.due_on);
    let hold =
      accrued == null
        ? 'Amount unknown'
        : !active
          ? 'Reversed / cancelled'
          : !earned
            ? 'Not yet earned'
            : due > today
              ? 'Payout date not reached'
              : '';
    if (!hold && rule === 'After travel' && String(booking.travel_end) > today)
      hold = 'Travel not completed';
    if (
      !hold &&
      rule === 'After customer paid' &&
      (booking.customer_balance == null || Number(booking.customer_balance) > 0)
    )
      hold = 'Customer payment pending';
    if (
      !hold &&
      (rule === 'After commission received' || (!terms && r.after_receipt)) &&
      (booking.commission_incomplete ||
        Number(booking.expected_commission) > Number(booking.received_commission))
    )
      hold = 'Commission receipt pending';
    const outstanding = accrued == null ? null : Math.max(0, accrued - paid);
    const recovery = accrued == null ? null : Math.max(0, paid - accrued);
    states.push({
      ...r,
      ...terms,
      id: r.id,
      terms_id: terms?.id,
      revision: terms?.revision ?? 0,
      referrer_id: r.referrer_id,
      booking_id: r.booking_id,
      code: booking.code,
      calculation,
      percentage_basis: basis,
      rate_bps: Number(terms?.rate_bps ?? r.rate_bps),
      fixed_amount: Number(terms?.fixed_amount ?? r.fixed_amount),
      payable_when: rule,
      due_on: due,
      reason: terms?.reason ?? 'Original referral agreement',
      expected_due: expected,
      accrued,
      earned_on: terms?.earned_on ?? (earned ? r.created_on : null),
      earned,
      paid,
      outstanding,
      recovery_due: recovery,
      payable_now: hold || outstanding == null ? 0 : outstanding,
      hold_reason: hold,
      status: recovery
        ? 'Recovery needed'
        : accrued == null
          ? 'Needs details'
          : hold || (outstanding ? 'Payable' : 'Paid'),
    });
  }
  return states;
}
