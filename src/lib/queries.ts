import { draftKind } from './draft-kind';
import { historicalDraftReview } from './historical-draft-review';
import { historicalRecordPresentation } from './historical-record-presentation';
import { inferLooseIntakeHints } from './intake-email-hints';
import { Database, Row, one } from './db';
import { economics, supplierOutstanding } from './finance';
import { Actor, hasPermission, requirePermission, effectivePermissions } from './permissions';
import { bookingVisibility, assetVisibility, partyVisibility } from './visibility';
import { freshActor } from './users';
import {
  hasFulfillmentSchema,
  effectiveTravelComponents,
  effectiveFulfillments,
} from './fulfillment';
import { businessDate } from './business-date';
import { effectiveAsset } from './asset-revisions';
import { latestCreditRequests } from './v1-entry';
import { travelerReviewIndex } from './traveler-review-store';
import { hasPayableTerms } from './commission-payables';
import { operationalViews } from './operational-views';
import { financialActivity } from './financial-activity';
import { summarizeActivity } from './activity-summary';
import { historicalPreparationDetail } from './historical-preparation-store';

/** Attach referring-org ids from partnership CRM links (read-back for staff; not a second cost). */
async function attachReferringOrganizations(db: Database, bookings: Row[]) {
  if (!bookings.length) return;
  const schema = db.storage === 'padova' ? 'padova' : 'public';
  const enabled = !!(
    await db.query('SELECT to_regclass($1) name', [`${schema}.pt_referrals`])
  ).rows[0]?.name;
  if (!enabled) return;
  const rows = (
    await db.query(
      `SELECT DISTINCT ON (r.booking_id) r.booking_id, r.organization_id, g.name organization_name
       FROM pt_referrals r
       JOIN pt_organizations g ON g.id = r.organization_id
       WHERE r.booking_id = ANY($1::uuid[]) AND r.kind = 'booking'
       ORDER BY r.booking_id, r.created_at DESC`,
      [bookings.map((b) => b.id)],
    )
  ).rows;
  const byBooking = new Map(rows.map((r) => [r.booking_id, r]));
  for (const booking of bookings) {
    const link = byBooking.get(booking.id);
    if (!link) continue;
    booking.referring_organization_id = link.organization_id;
    booking.referring_organization_name = link.organization_name;
  }
}

export async function snapshot(db: Database, actor: Actor) {
  requirePermission(actor, 'operations');
  actor = await freshActor(db, actor);
  requirePermission(actor, 'operations');
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const canAssets = can('manage_assets') || can('view_asset_basis');
  const canCommissions = can('view_commissions') || can('manage_commissions');
  const canRefunds = can('view_refunds') || can('issue_refunds');
  const fulfillmentEnabled = await hasFulfillmentSchema(db);
  const bookingEntryEnabled = !!(
    await db.query('SELECT to_regclass($1) name', [
      db.storage === 'padova' ? 'padova.booking_source_methods' : 'public.booking_source_methods',
    ])
  ).rows[0].name;
  const partnershipsEnabled = !!(
    await db.query('SELECT to_regclass($1) name', [
      db.storage === 'padova' ? 'padova.pt_organizations' : 'public.pt_organizations',
    ])
  ).rows[0].name;
  const finalIntegrityEnabled = !!(
    await db.query('SELECT to_regclass($1) name', [
      db.storage === 'padova'
        ? 'padova.review_resolution_events'
        : 'public.review_resolution_events',
    ])
  ).rows[0].name;
  const sourceProfilesEnabled = !!(
    await db.query('SELECT to_regclass($1) name', [
      db.storage === 'padova' ? 'padova.booking_source_profiles' : 'public.booking_source_profiles',
    ])
  ).rows[0].name;
  const bookings = (
    await db.query(`SELECT b.id,b.code,b.customer_id,b.supplier_id,b.product,b.channel,b.summary,
    b.booked_on,b.travel_start,b.travel_end,b.reservation_status,b.confirmation_status,
    b.document_status,b.itinerary - 'historical_sources' AS itinerary,b.revision,b.currency,b.created_at,
    ${db.storage === 'padova' ? 'b.adapter_managed,' : ''}
    b.sale,b.paid,b.funding_cost,b.obligations,b.supplier_paid,b.expected_commission,b.profit,b.refund_due,
    p.name customer,s.name supplier,
    COALESCE((SELECT string_agg(reference,' · ') FROM confirmations c WHERE c.booking_id=b.id),'') confirmations,
    COALESCE((SELECT string_agg(p.name,', ') FROM booking_travelers t JOIN parties p ON p.id=t.person_id WHERE t.booking_id=b.id AND t.status='Active'),'') travelers,
    COALESCE((SELECT string_agg(n.body,' ') FROM notes n WHERE n.record_type='booking' AND n.record_id=b.id),'') search_notes
    FROM booking_balances b JOIN parties p ON p.id=b.customer_id LEFT JOIN parties s ON s.id=b.supplier_id ORDER BY b.travel_start,b.code`)
  ).rows;
  const refunds = (
    await db.query(`SELECT r.*,b.code,b.summary,p.name customer,(SELECT c.payload->>'travel_component_id' FROM commands c WHERE c.id=r.command_id) travel_component_id,
    COALESCE((SELECT sum(amount) FROM refund_movements m WHERE m.refund_id=r.id AND m.kind='supplier_received'),0) received,
    COALESCE((SELECT string_agg(DISTINCT form,', ') FROM refund_movements m WHERE m.refund_id=r.id AND m.kind='supplier_received'),'') received_forms,
    COALESCE((SELECT sum(amount) FROM refund_movements m WHERE m.refund_id=r.id AND m.kind='customer_credit_handed_over'),0) handed_over,
    COALESCE((SELECT sum(amount) FROM refund_movements m WHERE m.refund_id=r.id AND m.kind='customer_paid'),0) paid
    FROM refunds r JOIN bookings b ON b.id=r.booking_id JOIN parties p ON p.id=b.customer_id`)
  ).rows;
  const payments = (
    await db.query(
      'SELECT b.*,p.name party FROM payment_balances b JOIN parties p ON p.id=b.party_id ORDER BY b.paid_on DESC',
    )
  ).rows;
  const originalAssets = (
    await db.query('SELECT * FROM asset_balances ORDER BY expires_on NULLS LAST,name')
  ).rows;
  const assets = await Promise.all(originalAssets.map((asset) => effectiveAsset(db, asset)));
  for (const asset of assets) {
    if (asset.ownership !== 'Padova' || !asset.seller_id) continue;
    const originalCost = (
      await one(
        db,
        "SELECT CASE WHEN count(*) FILTER(WHERE basis IS NULL)>0 THEN NULL ELSE COALESCE(sum(basis),0) END amount FROM asset_movements WHERE asset_id=$1 AND kind='acquisition'",
        [asset.id],
      )
    ).amount;
    const cost = originalCost == null ? null : Number(originalCost);
    const paid = Number(
      (
        await one(
          db,
          'SELECT COALESCE(sum(amount),0) amount FROM asset_acquisition_payments WHERE asset_id=$1',
          [asset.id],
        )
      ).amount,
    );
    Object.assign(asset, {
      acquisition_cost: cost,
      acquisition_paid: paid,
      acquisition_due: cost == null ? null : cost - paid,
    });
  }
  const commissions = (
    await db.query(`SELECT c.*,b.code,p.name payer,s.name collector,cmd.created_at AS posted_at,
    COALESCE((SELECT sum(amount) FROM commission_allocations a WHERE a.commission_id=c.id),0) received
    FROM commissions c
    JOIN bookings b ON b.id=c.booking_id
    JOIN parties p ON p.id=c.payer_id
    LEFT JOIN parties s ON s.id=c.collector_id
    LEFT JOIN commands cmd ON cmd.id=c.command_id
    ORDER BY cmd.created_at DESC NULLS LAST, c.id DESC`)
  ).rows;
  const parties = (await db.query('SELECT * FROM parties WHERE archived_at IS NULL ORDER BY name'))
    .rows;
  const tasks = (await db.query('SELECT * FROM tasks ORDER BY due_on NULLS LAST,created_at DESC'))
    .rows;
  const attention: Row[] = [];
  if (can('view_asset_basis'))
    for (const asset of assets.filter((a) => a.remaining_basis == null))
      attention.push({
        key: `asset-basis:${asset.id}`,
        fingerprint: 'unknown',
        title: `${asset.name} · Acquisition basis Unknown`,
        detail:
          'Quantity and ownership are known. Value and affected booking profit remain incomplete.',
        record_type: 'asset',
        record_id: asset.id,
        kind: 'Incomplete booking',
      });
  const today = await businessDate(db);
  if (can('view_asset_basis'))
    for (const asset of assets.filter((a) => a.acquisition_due > 0))
      attention.push({
        key: `asset-purchase:${asset.id}`,
        fingerprint: String(asset.acquisition_due),
        title: `${asset.name} · Acquisition balance`,
        detail:
          'Actual acquired inventory remains partly/unpaid; booking usage is not another purchase cost.',
        amount: asset.acquisition_due,
        record_type: 'asset',
        record_id: asset.id,
        kind: 'Asset acquisition',
      });
  // Bound work to the existing production pool size. Financial calculations stay
  // request-local and unchanged; hundreds of bookings must not load serially.
  for (let offset = 0; offset < bookings.length; offset += 5) {
    await Promise.all(
      bookings.slice(offset, offset + 5).map(async (b) => {
        Object.assign(b, await economics(db, b.id, { booking: b, today }));
      }),
    );
  }
  if (canCommissions) await attachReferringOrganizations(db, bookings);
  for (const b of bookings) {
    const e = b;
    if (!b.travelers?.trim())
      attention.push({
        key: `traveler-missing:${b.id}`,
        fingerprint: String(b.revision),
        title: `${b.code} · Traveler missing`,
        detail: 'Select the actual traveler; the billed customer is not a traveler by default.',
        booking_id: b.id,
        kind: 'Traveler missing',
      });
    if (b.itinerary?.sale_known === false)
      attention.push({
        key: `sale-unknown:${b.id}`,
        fingerprint: String(b.revision),
        title: `${b.code} · Missing sale price`,
        detail: 'Customer sale remains Unknown; no price was inferred.',
        booking_id: b.id,
        kind: 'Missing sale price',
      });
    const op = b.itinerary?.operational_entry;
    for (const request of latestCreditRequests(b.itinerary?.price_match_history)) {
      if (['Pending', 'Approved', 'Attempted'].includes(request.status))
        attention.push({
          key: `credit-request:${request.request_id}`,
          fingerprint: request.id,
          title: `${b.code} · Capital One credit ${request.status.toLowerCase()}`,
          detail:
            'Expected credit is not received value. Follow up on the account-specific request.',
          ...(can('view_supplier_cost')
            ? { amount: request.expected_credit ?? request.requested_amount }
            : {}),
          booking_id: b.id,
          kind: 'Credit request',
        });
    }
    const missingEnd =
      op && fulfillmentEnabled
        ? (
            await db.query(
              "SELECT id FROM travel_components WHERE booking_id=$1 AND product IN ('Hotel','Car') AND details->>'end_date_known'='false'",
              [b.id],
            )
          ).rows.length
        : 0;
    if (missingEnd)
      attention.push({
        key: `end-date:${b.id}`,
        fingerprint: String(b.revision),
        title: `${b.code} · Missing end date`,
        detail: 'Checkout/drop-off date is Unknown; the calendar shows only the known start date.',
        booking_id: b.id,
        kind: 'Missing end date',
      });
    if (op) {
      if (!op.source_method_id)
        attention.push({
          key: `booking-method:${b.id}`,
          fingerprint: 'unknown',
          title: `${b.code} · Booking method Unknown`,
          detail: 'Record where the reservation was booked when known.',
          booking_id: b.id,
          kind: 'Booking method',
        });
      const method = op.source_method_id
        ? (
            await db.query('SELECT award FROM booking_source_methods WHERE id=$1', [
              op.source_method_id,
            ])
          ).rows[0]
        : null;
      if (method?.award && !op.award_program_id)
        attention.push({
          key: `award-program:${b.id}`,
          fingerprint: 'unknown',
          title: `${b.code} · Missing award program`,
          detail: 'Record the actual loyalty program when known.',
          booking_id: b.id,
          kind: 'Missing award program',
        });
    }
    if (e.customer_balance > 0)
      attention.push({
        key: `balance:${b.id}`,
        fingerprint: String(e.customer_balance),
        title: `${b.code} · Customer balance`,
        detail: `${b.customer} has an unpaid balance`,
        amount: e.customer_balance,
        booking_id: b.id,
        kind: 'Customer balance',
      });
    if (e.recorded_supplier_balance > 0)
      attention.push({
        key: `supplier:${b.id}`,
        fingerprint: String(e.recorded_supplier_balance),
        title: `${b.code} · Supplier balance`,
        detail: 'Recorded supplier obligations remain unpaid',
        amount: e.recorded_supplier_balance,
        booking_id: b.id,
        kind: 'Supplier balance',
      });
    const sources = (
      await db.query(
        'SELECT DISTINCT o.supplier_id,p.name FROM supplier_obligations o JOIN parties p ON p.id=o.supplier_id WHERE o.booking_id=$1',
        [b.id],
      )
    ).rows;
    for (const source of sources) {
      const outstanding = Number((await supplierOutstanding(db, b.id, source.supplier_id)).amount);
      if (
        outstanding < 0 ||
        (outstanding > 0 && (e.recorded_supplier_balance ?? e.supplier_balance) <= 0)
      )
        attention.push({
          key: `source-reconciliation:${b.id}:${source.supplier_id}`,
          fingerprint: String(outstanding),
          title: `${b.code} · ${outstanding < 0 ? 'Supplier payment reconciliation' : 'Source balance due'}`,
          detail:
            outstanding < 0
              ? `${source.name}: actual allocated payments exceed the corrected obligation. Reconcile the source credit or allocation; no refund was invented.`
              : source.name,
          amount: Math.abs(outstanding),
          booking_id: b.id,
          kind: 'Supplier allocation',
        });
    }
    if (canCommissions && b.commission_incomplete)
      attention.push({
        key: `commission-details:${b.id}`,
        fingerprint: 'unknown',
        title: `${b.code} · Commission details incomplete`,
        detail: 'Expected commission or its payer/basis is not yet established.',
        booking_id: b.id,
        kind: 'Commission',
      });
    if (
      b.cost_incomplete ||
      (b.itinerary?.cost_status === undefined && Number(b.funding_cost) === 0 && Number(b.sale) > 0)
    )
      attention.push({
        key: `cost:${b.id}`,
        fingerprint: 'missing',
        title: `${b.code} · Final cost pending`,
        detail: b.summary,
        booking_id: b.id,
        kind: 'Incomplete booking',
      });
  }
  for (const p of payments.filter(
    (p) => p.direction === 'customer' && Number(p.current_amount) > Number(p.allocated),
  ))
    attention.push({
      key: `unallocated:${p.id}`,
      fingerprint: String(Number(p.current_amount) - Number(p.allocated)),
      title: 'Unallocated customer credit',
      detail: `${p.party} · ${p.reference}`,
      amount: Number(p.current_amount) - Number(p.allocated),
      kind: 'Payment allocation',
    });
  for (const p of payments.filter(
    (p) => p.direction === 'supplier' && Number(p.current_amount) > Number(p.allocated),
  ))
    attention.push({
      key: `supplier-payment:${p.id}`,
      fingerprint: String(Number(p.current_amount) - Number(p.allocated)),
      title: 'Unallocated supplier payment',
      detail: `${p.party} · ${p.reference}`,
      amount: Number(p.current_amount) - Number(p.allocated),
      kind: 'Supplier allocation',
    });
  for (const r of refunds)
    if (
      Number(r.supplier_expected) > Number(r.received) ||
      Number(r.customer_due) > Number(r.paid) + Number(r.handed_over)
    )
      attention.push({
        key: `refund:${r.id}`,
        fingerprint: `${r.received}:${r.paid}`,
        title: `${r.code} · Unresolved refund`,
        detail: r.reason,
        booking_id: r.booking_id,
        kind: 'Refund',
        amount: Number(r.customer_due) - Number(r.paid),
      });
  const mismatches = (
    await db.query(`SELECT m.id,m.form,r.booking_id,b.code FROM refund_movements m JOIN refunds r ON r.id=m.refund_id JOIN bookings b ON b.id=r.booking_id
    LEFT JOIN funding_components f ON f.id=r.funding_component_id WHERE m.kind='supplier_received' AND m.form NOT IN ('cash','Supplier payable credit') AND (f.asset_id IS NULL)`)
  ).rows;
  for (const m of mismatches)
    attention.push({
      key: `refund:${m.id}`,
      fingerprint: m.form,
      title: `${m.code} · Refund form needs review`,
      detail: `Cash/card funding returned as ${m.form}. Review responsibility and customer settlement.`,
      booking_id: m.booking_id,
      kind: 'Refund',
    });
  for (const c of commissions)
    if (Number(c.gross) - Number(c.retained) > Number(c.received))
      attention.push({
        key: `commission:${c.id}`,
        fingerprint: String(c.received),
        title: `${c.code} · Commission ${c.due_on && String(c.due_on) < today ? 'overdue' : 'not received'}`,
        detail: c.collector ?? c.payer,
        booking_id: c.booking_id,
        amount: Number(c.gross) - Number(c.retained) - Number(c.received),
        kind: 'Commission',
      });
  for (const a of assets.filter((a) => a.ownership === 'Padova' && Number(a.balance) < 0))
    attention.push({
      key: `negative-inventory:${a.id}`,
      fingerprint: String(a.balance),
      title: 'Rewards deficit requires resolution',
      detail: `${a.name} has a negative operational position of ${Math.abs(Number(a.balance)).toLocaleString('en-US')} ${a.unit ?? 'units'} after an actual reversal. Reconcile the issuer obligation or acquire replacement value; prior usage is preserved.`,
      kind: 'Rewards deficit',
    });
  for (const a of assets)
    if (
      a.expires_on &&
      Number(a.balance) > 0 &&
      String(a.expires_on) <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    )
      attention.push({
        key: `expiry:${a.id}`,
        fingerprint: String(a.balance),
        title: 'Travel asset expiring',
        detail: `${a.name} · ${a.expires_on}`,
        kind: 'Asset expiration',
      });
  const resolutions = (await db.query('SELECT * FROM attention_resolutions')).rows;
  const economicKinds = new Set([
    'Customer balance',
    'Supplier balance',
    'Supplier allocation',
    'Incomplete booking',
    'Missing sale price',
    'Commission',
    'Commission details',
    'Refund',
    'Credit request',
    'Asset acquisition',
    'Payment allocation',
    'Rewards deficit',
    'Traveler missing',
  ]);
  const visibleAttention: Row[] = attention
    .map((a): Row => ({
      ...a,
      acknowledged: resolutions.some(
        (r) => r.attention_key === a.key && r.fingerprint === a.fingerprint,
      ),
    }))
    .filter((a) => economicKinds.has(a.kind) || !a.acknowledged);
  let movements: Row[] = [],
    journal: Row[] = [],
    referrals: Row[] = [],
    sales: Row[] = [],
    cashMovements: Row[] = [];
  if (can('view_total_profit')) {
    movements = (
      await db.query(
        "SELECT p.*,b.code,to_char(b.booked_on,'YYYY-MM') booking_month FROM profit_movements p LEFT JOIN bookings b ON b.id=p.booking_id ORDER BY effective_on DESC,kind",
      )
    ).rows;
  }
  if (can('view_accounting')) {
    cashMovements = (
      await db.query(
        "SELECT effective_on,sum(debit-credit)::bigint amount FROM journal_lines WHERE account='cash' GROUP BY effective_on ORDER BY effective_on",
      )
    ).rows;
    journal = (
      await db.query(
        'SELECT account,sum(debit)::bigint debit,sum(credit)::bigint credit FROM journal_lines GROUP BY account ORDER BY account',
      )
    ).rows;
  }
  if (canCommissions) {
    referrals = bookings.flatMap((b) => b.commission_payables ?? []);
    for (const referral of referrals) {
      const booking = bookings.find((b) => b.id === referral.booking_id);
      if (!booking) continue;
      if (
        referral.expected_due == null ||
        (referral.expected_due > referral.paid && referral.hold_reason)
      )
        visibleAttention.push({
          key: `referral-hold:${referral.id}`,
          fingerprint: `${referral.revision}:${referral.expected_due}:${referral.hold_reason}`,
          title: `${booking.code} · Commission Payable ${referral.expected_due == null ? 'amount unknown' : 'pending'}`,
          detail: `${referral.referrer} · ${referral.hold_reason}`,
          booking_id: booking.id,
          kind: 'Commission',
        });
      if (referral.recovery_due > 0)
        visibleAttention.push({
          key: `referral-recovery:${referral.id}`,
          fingerprint: `${referral.recovery_due}`,
          title: `${booking.code} · Referral recovery`,
          detail: `${referral.referrer} · Prior payment preserved; underlying earned amount has decreased`,
          amount: referral.recovery_due,
          booking_id: booking.id,
          kind: 'Commission',
        });
      const outstanding = referral.payable_now;
      const key = `referral:${referral.id}`,
        fingerprint = `${outstanding}:${booking.reservation_status}`;
      if (
        outstanding > 0 &&
        !resolutions.some((r) => r.attention_key === key && r.fingerprint === fingerprint)
      )
        visibleAttention.push({
          key,
          fingerprint,
          title: `${booking.code} · Commission Payable due`,
          detail: referral.referrer,
          amount: outstanding,
          booking_id: booking.id,
          kind: 'Commission',
        });
    }
  }
  if (canAssets) {
    sales = (
      await db.query(
        'SELECT s.*,a.name asset,p.name buyer,CASE WHEN s.payment_id IS NOT NULL THEN s.proceeds ELSE COALESCE((SELECT sum(amount) FROM asset_sale_receipts r WHERE r.sale_id=s.id),0) END received FROM asset_sales s JOIN assets a ON a.id=s.asset_id JOIN parties p ON p.id=s.buyer_id',
      )
    ).rows;
  }
  const audit = (
    await db.query(
      "SELECT e.*,COALESCE(s.name,e.actor) actor_name FROM (SELECT DISTINCT ON (command_id) * FROM audit_events WHERE kind NOT LIKE 'padova.%' ORDER BY command_id,created_at DESC) e LEFT JOIN staff s ON s.id::text=e.actor ORDER BY e.created_at DESC LIMIT 80",
    )
  ).rows;
  const relationships = (await db.query('SELECT * FROM party_relationships')).rows;
  const travelerLinks = (await db.query('SELECT * FROM booking_travelers')).rows;
  const paymentAccounts = (
    await db.query('SELECT * FROM payment_accounts WHERE archived_at IS NULL ORDER BY name')
  ).rows;
  const staff = (await db.query('SELECT id,name FROM staff WHERE active=true ORDER BY name')).rows;
  const fundingComponents =
    can('manage_funding') || can('issue_refunds') || can('view_supplier_cost')
      ? (
          await db.query(
            `SELECT f.*,b.code,a.kind asset_kind,a.ownership asset_ownership,EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text) reversed${fulfillmentEnabled ? ',(SELECT d.travel_component_id FROM fulfillment_details d WHERE d.funding_component_id=f.id) travel_component_id' : ''} FROM funding_components f JOIN bookings b ON b.id=f.booking_id LEFT JOIN assets a ON a.id=f.asset_id`,
          )
        ).rows
      : [];
  const sourceReviews =
    db.storage === 'padova' && actor.role === 'OWNER'
      ? (
          await db.query(
            "SELECT id,category,title,status,version,created_at FROM padova.review_cases WHERE status<>'resolved' ORDER BY created_at,id LIMIT 100",
          )
        ).rows
      : [];
  const sourceReviewCount =
    db.storage === 'padova' && actor.role === 'OWNER'
      ? Number(
          (
            await one(
              db,
              "SELECT count(*) AS count FROM padova.review_cases WHERE status<>'resolved'",
            )
          ).count,
        )
      : 0;
  const operationalGate =
    db.storage === 'padova' && can('manage_settings')
      ? await one(
          db,
          'SELECT business_timezone,operational_entry_enabled,backup_verified_at FROM padova.settings WHERE id=true',
        )
      : null;
  const travelComponents = fulfillmentEnabled ? await effectiveTravelComponents(db) : [];
  for (const booking of bookings) {
    const listed = travelComponents.filter((t) => t.booking_id === booking.id);
    if (
      listed.length &&
      listed.every((t) => t.status === 'Cancelled') &&
      booking.reservation_status !== 'Cancelled'
    ) {
      const key = `travel-status:${booking.id}`,
        fingerprint = listed
          .map((t) => t.id)
          .sort()
          .join(':');
      if (!resolutions.some((r) => r.attention_key === key && r.fingerprint === fingerprint))
        visibleAttention.push({
          key,
          fingerprint,
          booking_id: booking.id,
          title: `${booking.code} · Review booking status`,
          detail:
            'All listed travel components have cancellation cases. Confirm the remaining whole-booking disposition; no automatic cancellation was inferred.',
          kind: 'Travel status',
        });
    }
    const references = travelComponents
      .filter((t) => t.booking_id === booking.id)
      .flatMap((t) => [
        ...(t.details?.confirmations ?? []),
        ...(t.details?.booking_source_confirmation ?? []),
        ...(t.details?.ticket_numbers ?? []),
      ]);
    booking.confirmations = [
      ...new Set(
        [...String(booking.confirmations ?? '').split(' · '), ...references].filter(Boolean),
      ),
    ].join(' · ');
  }
  const programs = fulfillmentEnabled
    ? (await db.query('SELECT * FROM programs ORDER BY name')).rows
    : [];
  const instruments = fulfillmentEnabled
    ? (await db.query('SELECT * FROM instruments ORDER BY name')).rows
    : [];
  const programAccounts =
    fulfillmentEnabled && canAssets
      ? (await db.query('SELECT * FROM program_accounts ORDER BY name')).rows
      : [];
  const expectedEvents =
    fulfillmentEnabled && can('manage_assets')
      ? (
          await db.query(
            "SELECT e.*,u.status,u.id update_id,CASE WHEN u.status='Posted' THEN COALESCE((c.payload->>'quantity_actual')::bigint,e.quantity_expected) END quantity_actual FROM expected_events e JOIN LATERAL(SELECT * FROM expected_event_updates WHERE event_id=e.id ORDER BY created_at DESC,id DESC LIMIT 1) u ON true JOIN commands c ON c.id=u.command_id ORDER BY e.created_at DESC",
          )
        ).rows
      : [];
  const filteredAttention = visibleAttention.filter((a) =>
    ['Supplier balance', 'Supplier allocation'].includes(a.kind)
      ? can('view_supplier_cost') || can('manage_funding')
      : a.kind === 'Customer balance'
        ? can('view_sale_price')
        : a.kind === 'Incomplete booking'
          ? can('view_supplier_cost')
          : a.kind === 'Commission'
            ? canCommissions
            : ['Asset expiration', 'Rewards deficit'].includes(a.kind)
              ? canAssets
              : a.kind === 'Refund'
                ? canRefunds
                : true,
  );
  const payableTermsEnabled = await hasPayableTerms(db);
  return {
    payableTermsEnabled,
    financialActivity: await financialActivity(db, {
      bookings,
      payments,
      refunds,
      accounts: (await db.query('SELECT * FROM payment_accounts')).rows,
      can,
    }),
    operationalViews: operationalViews({
      bookings,
      sales,
      assets,
      parties,
      commissions,
      referrals,
      refunds,
      expectedEvents,
      attention: filteredAttention,
      can,
    }),
    referralTerms:
      canCommissions && payableTermsEnabled
        ? (
            await db.query(
              'SELECT t.*,c.actor,COALESCE(s.name,c.actor) actor_name FROM commission_payable_revisions t JOIN commands c ON c.id=t.command_id LEFT JOIN staff s ON s.id::text=c.actor ORDER BY t.effective_on,t.revision',
            )
          ).rows
        : [],
    referralPayments: canCommissions
      ? (
          await db.query(
            'SELECT p.*,rp.referral_id,r.booking_id FROM referral_payments rp JOIN referrals r ON r.id=rp.referral_id JOIN payment_balances p ON p.id=rp.payment_id ORDER BY p.paid_on,p.created_at',
          )
        ).rows
      : [],
    referralPaymentAdjustments:
      canCommissions && (await hasPayableTerms(db))
        ? (
            await db.query(
              "SELECT a.*,rp.referral_id,c.payload->>'date' effective_on,COALESCE(s.name,c.actor) actor_name FROM commission_payout_adjustments a JOIN referral_payments rp ON rp.payment_id=a.payment_id JOIN commands c ON c.id=a.command_id LEFT JOIN staff s ON s.id::text=c.actor ORDER BY c.created_at",
            )
          ).rows
        : [],
    fulfillmentEnabled,
    reviewResolutionEvents:
      finalIntegrityEnabled && actor.role === 'OWNER'
        ? (
            await db.query(
              'SELECT * FROM review_resolution_events ORDER BY created_at DESC,id DESC LIMIT 100',
            )
          ).rows
        : [],
    finalIntegrityEnabled,
    sellerObligations:
      finalIntegrityEnabled &&
      can('view_supplier_cost') &&
      (can('edit_payments') || can('manage_funding'))
        ? (
            await db.query(
              'SELECT o.*,p.name seller,o.amount-COALESCE((SELECT sum(a.net_amount) FROM obligation_settlements s JOIN net_allocations a ON a.id=s.allocation_id WHERE s.obligation_id=o.id),0) exact_remaining FROM supplier_obligations o JOIN parties p ON p.id=o.supplier_id',
            )
          ).rows
        : [],
    bookingEntryEnabled,
    partnershipsEnabled,
    referralOrganizations:
      partnershipsEnabled && (can('manage_commissions') || can('view_partnerships'))
        ? (
            await db.query(
              `SELECT g.id,g.name,g.location,g.accounting_party_id,p.name accounting_party,
                a.id agreement_id,a.terms,a.starts_on,a.ends_on
               FROM pt_organizations g
               JOIN parties p ON p.id=g.accounting_party_id
               JOIN pt_agreements a ON a.organization_id=g.id
               WHERE a.status='accepted'
                 AND a.version=(SELECT max(x.version) FROM pt_agreements x WHERE x.organization_id=g.id)
                 AND a.starts_on<=$1::date
                 AND (a.ends_on IS NULL OR a.ends_on>=$1::date)
                 AND a.terms IS NOT NULL
                 AND a.terms->>'calculation' IS NOT NULL
               ORDER BY g.name`,
              [today],
            )
          ).rows
        : [],
    sourceProfilesEnabled,
    bookingSourceProfiles: sourceProfilesEnabled
      ? (await db.query('SELECT * FROM booking_source_profiles ORDER BY name')).rows
      : [],
    sourceProfileAssets:
      sourceProfilesEnabled && canAssets
        ? (await db.query('SELECT * FROM source_profile_assets')).rows
        : [],
    travelerReview: finalIntegrityEnabled
      ? await travelerReviewIndex(actor, db.storage !== 'padova', db)
      : null,
    bookingSourceMethods: bookingEntryEnabled
      ? (await db.query('SELECT * FROM booking_source_methods ORDER BY name')).rows
      : [],
    bookingDrafts: bookingEntryEnabled
      ? (
          await db.query(
            `SELECT id,title,created_at,entry,entry->>'summary' AS summary,entry->'itinerary'->>'historical_reconciliation_status' AS historical_status
             FROM booking_drafts d
             WHERE created_by=$1
               AND NOT EXISTS(
                 SELECT 1 FROM commands c
                 WHERE c.kind='booking' AND c.result IS NOT NULL
                   AND c.payload->'operational'->>'draft_id'=d.id::text
               )
               AND NOT EXISTS(
                 SELECT 1 FROM commands c
                 WHERE c.kind='booking_draft_delete' AND c.result IS NOT NULL
                   AND c.payload->>'draft_id'=d.id::text
               )
             ORDER BY created_at DESC LIMIT 50`,
            [actor.id],
          )
        ).rows.map((draft): Row => {
          const { entry, ...metadata } = draft;
          const kind = draftKind(draft);
          const facts = historicalRecordPresentation(entry);
          const customer = parties.find((p) => p.id === entry.customer_id)?.name;
          const intake = entry?.intake_provenance;
          // Existing blank email drafts: derive display hints from subject/raw (no money invent).
          const loose =
            intake?.source === 'email'
              ? inferLooseIntakeHints({
                  subject: intake?.subject,
                  text: entry?.intake_raw_text || entry?.recovery_paste || '',
                  from_address: intake?.from_address,
                })
              : {};
          const customerHint =
            customer ||
            (typeof entry?.intake_customer_label === 'string' &&
            entry.intake_customer_label.trim()
              ? entry.intake_customer_label.trim()
              : null) ||
            (typeof entry?.intake_party_hints?.customer === 'string' &&
            entry.intake_party_hints.customer.trim()
              ? entry.intake_party_hints.customer.trim()
              : null) ||
            loose.customer ||
            null;
          const productHint = entry?.product || loose.product || null;
          const routeHint =
            entry?.route ||
            entry?.location ||
            facts.route ||
            loose.route ||
            loose.property ||
            null;
          const pnrHint = entry?.primary_reference || loose.primary_reference || null;
          const travelHint = entry?.travel_start || loose.travel_start || null;
          return {
            ...metadata,
            kind,
            intake_source: intake?.source ?? null,
            intake_filename: intake?.filename ?? null,
            intake_from: intake?.from_address ?? null,
            intake_subject: intake?.subject ?? null,
            intake_mailbox: intake?.mailbox ?? null,
            intake_received_at: intake?.received_at ?? null,
            intake_customer: customerHint,
            intake_product: productHint,
            intake_route: routeHint,
            intake_travel_start: travelHint,
            intake_pnr: pnrHint,
            intake_sale: entry?.sale ?? null,
            display_title:
              kind === 'historical_booking'
                ? [
                    customer,
                    facts.route || 'Historical booking',
                    (entry.confirmations ?? []).join(' · '),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : kind === 'voucher_sale'
                  ? draft.summary
                  : [
                      customerHint,
                      productHint,
                      routeHint,
                      pnrHint,
                    ]
                      .filter(Boolean)
                      .join(' · ') || draft.title,
          };
        })
      : [],
    historicalPreparation: null,
    travelComponents,
    programs,
    instruments: instruments.map((i) =>
      can('manage_settings')
        ? i
        : {
            id: i.id,
            program_id: i.program_id,
            name: i.name,
            unit: i.unit,
            role: i.role,
            active: i.active,
          },
    ),
    programAccounts,
    expectedEvents: expectedEvents.map((e) =>
      can('view_supplier_cost')
        ? e
        : { id: e.id, kind: e.kind, status: e.status, booking_id: e.booking_id, due_on: e.due_on },
    ),
    sourceReviews,
    sourceReviewCount,
    operationalGate,
    actor: {
      id: actor.id,
      name: actor.name,
      role: actor.role,
      permissions: effectivePermissions(actor),
    },
    localDemo: false,
    developmentData: !process.env.DATABASE_URL,
    qaMode: process.env.PADOVA_QA === '1',
    today,
    bookings: bookings.map((b) => bookingVisibility(b, actor)),
    parties: parties.map((p) => partyVisibility(p, actor)),
    relationships,
    travelerLinks,
    paymentAccounts,
    staff,
    fundingComponents: fundingComponents.map((r) => {
      const x = { ...r };
      if (!can('view_supplier_cost')) delete x.cost;
      return x;
    }),
    payments: payments.filter((p) =>
      p.direction === 'customer'
        ? can('edit_payments') || can('view_sale_price')
        : p.direction === 'supplier'
          ? can('manage_funding') || can('view_supplier_cost')
          : p.direction === 'commission'
            ? canCommissions
            : p.direction === 'asset_purchase'
              ? can('view_asset_basis')
              : p.direction === 'asset_sale'
                ? canAssets
                : canRefunds,
    ),
    assets: canAssets ? assets.map((a) => assetVisibility(a, actor)) : [],
    refunds: canRefunds
      ? refunds.map((r) => {
          const x: Row = { ...r, unit: r.quantity_unit ?? r.unit };
          if (!can('view_supplier_cost')) delete x.expected_basis;
          return x;
        })
      : [],
    commissions: canCommissions ? commissions : [],
    referrals,
    sales: sales.map((r) => assetVisibility(r, actor)),
    movements: can('view_booking_profit')
      ? movements
      : movements.reduce((all: Row[], m) => {
          const key = `${m.effective_on}:${m.kind}:${m.booking_month}`;
          const existing = all.find((x) => x.key === key);
          if (existing) existing.amount += Number(m.amount);
          else
            all.push({
              id: key,
              key,
              effective_on: m.effective_on,
              kind: m.kind,
              booking_month: m.booking_month,
              amount: Number(m.amount),
            });
          return all;
        }, []),
    journal,
    cashMovements,
    tasks,
    attention: filteredAttention,
    audit: (can('view_audit') ? audit : audit.filter((a) => a.actor === actor.id)).map((a) => {
      const { before_value, after_value, ...safe } = summarizeActivity(a, actor, bookings);
      return safe;
    }),
  };
}
export async function detail(db: Database, actor: Actor, type: string, id: string): Promise<Row> {
  requirePermission(actor, 'operations');
  actor = await freshActor(db, actor);
  requirePermission(actor, 'operations');
  const can = (p: Parameters<typeof hasPermission>[1]) => hasPermission(actor, p);
  const finance = can('view_accounting');
  const canAssets = can('manage_assets') || can('view_asset_basis');
  const canCommissions = can('view_commissions') || can('manage_commissions');
  const canRefunds = can('view_refunds') || can('issue_refunds');
  if (type === 'historical') return historicalPreparationDetail(actor, id, db);
  if (type === 'draft') {
    const draft = await one(
      db,
      `SELECT id,title,entry FROM booking_drafts d
       WHERE id=$1 AND created_by=$2
         AND NOT EXISTS(
           SELECT 1 FROM commands c
           WHERE c.kind='booking_draft_delete' AND c.result IS NOT NULL
             AND c.payload->>'draft_id'=d.id::text
         )`,
      [id, actor.id],
    );
    if (actor.role === 'OWNER' && draft.entry?.itinerary?.historical_reconciliation_status)
      draft.review = await historicalDraftReview(db, draft);
    return draft;
  }
  if (type === 'booking') {
    const b = await economics(db, id);
    if (canCommissions) await attachReferringOrganizations(db, [b]);
    const travelers = (
      await db.query(
        'SELECT p.*,t.status FROM booking_travelers t JOIN parties p ON p.id=t.person_id WHERE t.booking_id=$1',
        [id],
      )
    ).rows;
    const notes = (
      await db.query(
        "SELECT n.*,COALESCE(s.name,n.actor) actor_name FROM notes n LEFT JOIN staff s ON s.id::text=n.actor WHERE n.record_type='booking' AND n.record_id=$1 ORDER BY n.created_at,n.id",
        [id],
      )
    ).rows;
    const activity = (
      await db.query(
        `SELECT e.id,e.actor,COALESCE(s.name,e.actor) actor_name,e.kind,e.created_at,e.reason,e.before_value,e.after_value FROM audit_events e LEFT JOIN staff s ON s.id::text=e.actor WHERE e.record_id=$1 AND e.kind NOT LIKE 'padova.%' ORDER BY e.created_at`,
        [id],
      )
    ).rows;
    const revisions = (
      await db.query(
        'SELECT * FROM itinerary_revisions WHERE booking_id=$1 ORDER BY revision DESC',
        [id],
      )
    ).rows;
    const charges = (
      await db.query('SELECT * FROM charges WHERE booking_id=$1 ORDER BY effective_on', [id])
    ).rows;
    const allocations = (
      await db.query(
        'SELECT a.*,a.net_amount amount,p.direction,p.method,p.reference,p.paid_on FROM net_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=$1',
        [id],
      )
    ).rows.filter((a) =>
      a.direction === 'customer'
        ? can('edit_payments') || can('view_sale_price')
        : can('view_supplier_cost') || can('manage_funding'),
    );
    const funding =
      can('view_supplier_cost') || can('manage_funding') || can('issue_refunds')
        ? (
            await db.query(
              "SELECT f.*,a.name asset,EXISTS(SELECT 1 FROM commands c WHERE c.kind IN ('revise_fulfillment','reverse_fulfillment') AND c.result->>'reversed_funding_id'=f.id::text) reversed FROM funding_components f LEFT JOIN assets a ON a.id=f.asset_id WHERE f.booking_id=$1",
              [id],
            )
          ).rows
        : [];
    const enabled = await hasFulfillmentSchema(db);
    const assetAcquisitions = can('view_asset_basis')
      ? (
          await db.query(
            `SELECT a.id,a.name,p.name seller,
      COALESCE((SELECT sum(basis) FROM asset_movements m WHERE m.asset_id=a.id AND m.kind='acquisition'),0) cost,
      COALESCE((SELECT sum(amount) FROM asset_acquisition_payments x WHERE x.asset_id=a.id),0) paid
      FROM assets a JOIN parties p ON p.id=a.seller_id WHERE a.source_booking_id=$1 AND a.ownership='Padova'`,
            [id],
          )
        ).rows.map((a) => ({ ...a, due: Number(a.cost) - Number(a.paid) }))
      : [];
    const sourceBalances = [];
    if (can('view_supplier_cost')) {
      const sources = (
        await db.query(
          'SELECT DISTINCT o.supplier_id,p.name FROM supplier_obligations o JOIN parties p ON p.id=o.supplier_id WHERE o.booking_id=$1',
          [id],
        )
      ).rows;
      for (const source of sources) {
        const paid = Number(
          (
            await one(
              db,
              "SELECT COALESCE(sum(a.net_amount),0) amount FROM net_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.booking_id=$1 AND p.party_id=$2 AND p.direction='supplier'",
              [id, source.supplier_id],
            )
          ).amount,
        );
        const due = Number((await supplierOutstanding(db, id, source.supplier_id)).amount);
        if (paid || due)
          sourceBalances.push({ party_id: source.supplier_id, name: source.name, paid, due });
      }
    }
    const travelComponents = enabled ? await effectiveTravelComponents(db, id) : [];
    const fulfillments =
      enabled && (can('view_supplier_cost') || can('manage_funding'))
        ? await effectiveFulfillments(db, id)
        : [];
    return {
      assetAcquisitions,
      sourceBalances,
      travelComponents,
      fulfillments: fulfillments.map((f) => {
        const r = { ...f };
        if (!can('view_supplier_cost')) {
          delete r.cost;
          delete r.terms;
        }
        return r;
      }),
      booking: bookingVisibility(b, actor),
      travelers: travelers.map((p) => partyVisibility(p, actor)),
      notes,
      activity: activity.map((a) => summarizeActivity(a, actor, [b], id)),
      revisions: revisions.map((revision) => ({
        ...revision,
        snapshot: bookingVisibility(revision.snapshot, actor),
      })),
      charges: can('view_sale_price') ? charges : [],
      allocations,
      funding: funding.map((r) => {
        const x = { ...r };
        if (!can('view_supplier_cost')) delete x.cost;
        return x;
      }),
    };
  }
  if (type === 'person') {
    const person = await one(db, 'SELECT * FROM parties WHERE id=$1', [id]);
    const privateData = can('view_traveler_sensitive')
      ? (await db.query('SELECT * FROM traveler_private WHERE person_id=$1', [id])).rows[0]
      : null;
    const notes = (
      await db.query('SELECT * FROM notes WHERE record_id=$1 ORDER BY created_at', [id])
    ).rows;
    const activity = (
      await db.query(
        'SELECT e.id,e.actor,COALESCE(s.name,e.actor) actor_name,e.kind,e.created_at FROM audit_events e LEFT JOIN staff s ON s.id::text=e.actor WHERE e.record_id=$1 ORDER BY e.created_at',
        [id],
      )
    ).rows;
    const entries = (
      await db.query(
        `SELECT c.effective_on::text date,b.code||' · '||b.summary label,c.amount::bigint debit,0::bigint credit FROM charges c JOIN bookings b ON b.id=c.booking_id WHERE b.customer_id=$1
      UNION ALL SELECT p.paid_on::text,'Allocated payment · '||p.method||' · '||p.reference,0::bigint,a.net_amount FROM net_allocations a JOIN payments p ON p.id=a.payment_id JOIN bookings b ON b.id=a.booking_id WHERE b.customer_id=$1 AND p.direction='customer'
      UNION ALL SELECT p.paid_on::text,'Unallocated customer credit · '||p.reference,0::bigint,p.current_amount-p.allocated FROM payment_balances p WHERE p.party_id=$1 AND p.direction='customer' AND p.current_amount>p.allocated
      UNION ALL SELECT p.paid_on::text,'Customer refund paid · '||p.reference,p.amount,0::bigint FROM payments p WHERE p.party_id=$1 AND p.direction='customer_refund'
      ORDER BY date,label`,
        [id],
      )
    ).rows;
    const sourceAccounts = [
      ...(can('view_supplier_cost') ? ['supplier_payable'] : []),
      ...(can('view_asset_basis') ? ['asset_acquisition_payable'] : []),
    ];
    const sourceStatement = sourceAccounts.length
      ? (
          await db.query(
            `SELECT j.id,j.effective_on date,j.booking_id,b.code,j.account,j.debit,j.credit,c.kind
       FROM journal_lines j JOIN commands c ON c.id=j.command_id LEFT JOIN bookings b ON b.id=j.booking_id
       WHERE j.party_id=$1 AND j.account=ANY($2::text[]) ORDER BY j.effective_on,c.created_at,j.id`,
            [id, sourceAccounts],
          )
        ).rows
      : [];
    const sourceBookingIds = (
      await db.query(
        `SELECT DISTINCT booking_id FROM supplier_obligations WHERE supplier_id=$1
       UNION SELECT source_booking_id FROM assets WHERE seller_id=$1 AND source_booking_id IS NOT NULL`,
        [id],
      )
    ).rows.map((r) => r.booking_id);
    return {
      person: partyVisibility(person, actor),
      privateData,
      notes,
      activity,
      statement: can('view_sale_price') ? entries : [],
      sourceStatement,
      sourceBookingIds,
    };
  }
  if (type === 'asset') {
    if (!canAssets) throw new Error('Permission required: manage_assets or view_asset_basis');
    const asset = await effectiveAsset(
      db,
      await one(db, 'SELECT * FROM asset_balances WHERE id=$1', [id]),
    );
    const lots = (
      await db.query('SELECT * FROM asset_lots WHERE asset_id=$1 ORDER BY acquired_on', [id])
    ).rows;
    const movements = (
      await db.query(
        'SELECT m.*,b.code FROM asset_movements m LEFT JOIN bookings b ON b.id=m.booking_id WHERE m.asset_id=$1 ORDER BY m.effective_on,m.id',
        [id],
      )
    ).rows;
    const notes = (
      await db.query('SELECT * FROM notes WHERE record_id=$1 ORDER BY created_at', [id])
    ).rows;
    const sales = (
      await db.query(
        `SELECT s.*,p.name buyer,CASE WHEN s.payment_id IS NOT NULL THEN s.proceeds ELSE COALESCE((SELECT sum(amount) FROM asset_sale_receipts r WHERE r.sale_id=s.id),0) END received FROM asset_sales s JOIN parties p ON p.id=s.buyer_id WHERE s.asset_id=$1 ORDER BY s.effective_on`,
        [id],
      )
    ).rows;
    return {
      asset: assetVisibility(asset, actor),
      lots: lots.map((r) => assetVisibility(r, actor)),
      movements: movements.map((r) => assetVisibility(r, actor)),
      notes,
      sales: sales.map((r) => assetVisibility(r, actor)),
    };
  }
  throw new Error('Unsupported detail type');
}
