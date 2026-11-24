import { sourceFingerprint, migrationCommandId } from './historical-delta';
import { referenceKey, directoryContextLabel, singleTravelerLabel } from './test-reference';

type R = Record<string, any>;
export type PreparedMapping = {
  id: string;
  sourceKey: string;
  fingerprint: string;
  status:
    'Prepared booking' | 'Linked supporting row' | 'Needs Review' | 'Preserved supporting row';
  targetId?: string;
  rationale: string;
  source: R;
  facts: R;
  financialReview: boolean;
};
const layouts: Record<string, Record<string, string>> = {
  accounting: {
    customer: 'A',
    sale: 'D',
    cost: 'F',
    passengers: 'J',
    route: 'K',
    booked: 'L',
    travel: 'M',
    airline_confirmation: 'N',
    pnr: 'O',
    confirmation: 'P',
    account: 'Q',
    capital_one_confirmation: 'R',
    notes: 'S',
  },
  '2026 accounting': {
    customer: 'B',
    sale: 'E',
    cost: 'G',
    passengers: 'K',
    route: 'L',
    booked: 'M',
    travel: 'N',
    airline_confirmation: 'O',
    account: 'P',
    capital_one_confirmation: 'Q',
    credit: 'R',
    booked_through: 'S',
    notes: 'X',
  },
  GDS: {
    passengers: 'D',
    route: 'E',
    booked: 'F',
    travel: 'G',
    airline_confirmation: 'H',
    pnr: 'I',
    cost: 'N',
  },
  'cap1 elal': {
    cost: 'B',
    passengers: 'F',
    route: 'G',
    booked: 'H',
    travel: 'I',
    airline_confirmation: 'J',
    account: 'K',
    capital_one_confirmation: 'L',
    credit: 'M',
  },
  stef: {
    sale: 'A',
    cost: 'C',
    passengers: 'G',
    route: 'H',
    booked: 'I',
    travel: 'J',
    airline_confirmation: 'K',
  },
  tranactions: { airline_confirmation: 'B', booked: 'C' },
  Cancellations: {
    capital_one_confirmation: 'B',
    route: 'D',
    passengers: 'I',
    notes: 'K',
    account: 'O',
  },
};
function cellAt(row: R, column?: string): R | undefined {
  if (!column) return;
  return Object.entries(row.original_fields ?? {}).find(
    ([key]) => key.split(', ')[0] === column,
  )?.[1] as R | undefined;
}
function scalar(cell?: R): unknown {
  return (
    cell?.effectiveValue?.stringValue ??
    cell?.effectiveValue?.numberValue ??
    cell?.userEnteredValue?.stringValue ??
    cell?.userEnteredValue?.numberValue ??
    cell?.formattedValue ??
    null
  );
}
export function historicalTravelerCell(row: R) {
  const layout = layouts[row.tab];
  const column = layout?.passengers;
  if (!column) return null;
  const cell = cellAt(row, column);
  const raw = scalar(cell);
  if (typeof raw !== 'string' || !raw.trim() || cell?.userEnteredValue?.formulaValue) return null;
  return { raw, column, cell };
}
function date(cell?: R): string | null {
  const v = scalar(cell);
  if (typeof v === 'number' && cell?.userEnteredFormat?.numberFormat?.type?.startsWith('DATE')) {
    if (!Number.isInteger(v) || v < 20000 || v > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  if (
    typeof v === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  )
    return v;
  return null;
}
function money(cell?: R): number | null {
  if (!cell || cell.effectiveValue?.errorValue || cell.userEnteredValue?.formulaValue) return null;
  const v = scalar(cell);
  const text =
    typeof v === 'number'
      ? String(v)
      : typeof v === 'string'
        ? v.replace(/^\$/, '').replaceAll(',', '').trim()
        : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const cents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  return Number.isSafeInteger(cents) ? cents : null;
}
const reference = (v: unknown) =>
  typeof v === 'string' &&
  /^[A-Z0-9]{5,12}$/i.test(v.trim()) &&
  /[A-Z]/i.test(v) &&
  !/^(unknown|pending|customer|flight|hotel|airline|confirmation)$/i.test(v.trim())
    ? v.trim().toUpperCase()
    : null;

/** Pure preparation: no operational commands, financial postings or network access. */
export function prepareHistoricalRows(
  rows: R[],
  resolveCustomer: (name: string) => string | undefined = () => undefined,
  previous: PreparedMapping[] = [],
) {
  const old = new Map(previous.map((r) => [r.sourceKey, r]));
  const mappings: PreparedMapping[] = rows.map((source) => {
    const layout = layouts[source.tab];
    const raw = Object.fromEntries(
      Object.entries(layout ?? {}).map(([field, column]) => [
        field,
        scalar(cellAt(source, column)),
      ]),
    );
    const customerLabel = typeof raw.customer === 'string' ? raw.customer.trim() : '';
    const approved = resolveCustomer(customerLabel);
    const customer =
      approved ??
      (customerLabel &&
      !directoryContextLabel(customerLabel) &&
      !/^(customer|client|total|sum|personal|refund|balance)$/i.test(customerLabel)
        ? customerLabel
        : null);
    const refs = [
      ...new Set(
        ['airline_confirmation', 'pnr', 'confirmation', 'capital_one_confirmation']
          .map((k) => reference(raw[k]))
          .filter(Boolean),
      ),
    ] as string[];
    const fields = Object.values(source.original_fields ?? {}) as R[];
    const meaningful = fields.some(
      (c) => scalar(c) !== null && String(scalar(c)).trim() && !c.userEnteredValue?.formulaValue,
    );
    const header =
      source.row === 1 ||
      Object.entries(layout ?? {}).filter(([field, column]) => {
        const v = String(scalar(cellAt(source, column)) ?? '').toLowerCase();
        return [
          'customer',
          'client',
          'sale price',
          'date of travel',
          'date booked',
          'route/stay',
          'route',
          'airline refrence',
          'airline confirmation',
          'name of passengers',
          'price given to client',
        ].includes(v.trim());
      }).length >= 2;
    const sourceKey = JSON.stringify([source.workbook_id, source.tab, source.row]);
    const fingerprint = sourceFingerprint(source.original_fields);
    const facts: R = {
      customer: customer
        ? {
            name: customer,
            id: migrationCommandId(`prepared-customer:${referenceKey(customer)}`),
            match: approved ? 'Owner-confirmed alias' : 'Exact source label',
          }
        : null,
      travelers:
        typeof raw.passengers === 'string' && singleTravelerLabel(raw.passengers)
          ? [
              {
                name: raw.passengers.trim(),
                id: migrationCommandId(`prepared-person:${referenceKey(raw.passengers)}`),
              },
            ]
          : [],
      passenger_count:
        typeof raw.passengers === 'number' &&
        Number.isInteger(raw.passengers) &&
        raw.passengers > 0 &&
        raw.passengers < 1000
          ? raw.passengers
          : null,
      route_or_property: raw.route ?? null,
      booked_on: date(cellAt(source, layout?.booked)),
      travel_on: date(cellAt(source, layout?.travel)),
      confirmations: refs,
      account_label: raw.account ?? null,
      capital_one_confirmation: reference(raw.capital_one_confirmation),
      booked_through: raw.booked_through ?? null,
      notes: raw.notes ?? null,
      customer_sale_cents: money(cellAt(source, layout?.sale)),
      source_cost_cents: money(cellAt(source, layout?.cost)),
      cost_status: money(cellAt(source, layout?.cost)) === null ? 'Unknown' : 'Staged source claim',
      payment_status: 'Unverified source claims; no receipts or allocations posted',
      raw_operational_fields: raw,
    };
    let status: PreparedMapping['status'] =
      !meaningful || header
        ? 'Preserved supporting row'
        : customer && refs.length && raw.route
          ? 'Prepared booking'
          : 'Needs Review';
    let rationale =
      status === 'Prepared booking'
        ? 'Exact customer label or approved alias, explicit confirmation and route/property identify an operational booking; financial claims remain staged.'
        : status === 'Preserved supporting row'
          ? 'Header or formula-only support preserved in full; no booking inferred.'
          : 'Missing or ambiguous booking identity; full source row retained for review.';
    let targetId =
      status === 'Prepared booking'
        ? migrationCommandId(
            `prepared-booking:${source.workbook_id}:${source.tab}:${referenceKey(customer!)}:${refs.slice().sort().join('|')}:${String(raw.travel ?? '')}`,
          )
        : undefined;
    const prior = old.get(sourceKey);
    if (prior && prior.fingerprint !== fingerprint) {
      status = 'Needs Review';
      targetId = prior.targetId;
      rationale =
        'Previously prepared source row changed; preserved prior mapping and require correction review rather than duplicate creation.';
    }
    return {
      id: migrationCommandId(`source-mapping:${sourceKey}`),
      sourceKey,
      fingerprint,
      status,
      targetId,
      rationale,
      source,
      facts,
      financialReview: meaningful && !header,
    };
  });
  // The same complete booking is recorded in the main and PM workbooks.
  // Source coordinates preserve provenance; they must not manufacture an identity conflict.
  // Require matching dated operational facts and exactly one candidate per workbook.
  const copies = new Map<string, PreparedMapping[]>();
  for (const row of mappings.filter((r) => r.status === 'Prepared booking')) {
    const f = row.facts;
    if (!f.booked_on || !f.travel_on || !f.travelers.length || !f.route_or_property) continue;
    const key = JSON.stringify([
      referenceKey(f.customer.name),
      f.booked_on,
      f.travel_on,
      referenceKey(f.route_or_property),
      [...f.confirmations].sort(),
      f.travelers.map((t: R) => referenceKey(t.name)).sort(),
    ]);
    copies.set(key, [...(copies.get(key) ?? []), row]);
  }
  for (const group of copies.values()) {
    if (group.length < 2 || new Set(group.map((r) => r.source.workbook_id)).size !== group.length)
      continue;
    const priorTargets = [
      ...new Set(
        group
          .map((r) => old.get(r.sourceKey))
          .filter((r) => r?.status === 'Prepared booking' || r?.status === 'Linked supporting row')
          .map((r) => r?.targetId)
          .filter(Boolean),
      ),
    ];
    if (priorTargets.length > 1) continue; // Existing accepted mappings are never merged here.
    const canonical =
      priorTargets[0] ??
      [...group].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey))[0].targetId;
    for (const row of group) row.targetId = canonical;
  }
  const owners = new Map<string, PreparedMapping[]>();
  for (const row of mappings.filter((r) => r.status === 'Prepared booking'))
    for (const ref of row.facts.confirmations) owners.set(ref, [...(owners.get(ref) ?? []), row]);
  // Link only one unambiguous matching target; never collapse conflicting customers/dates by PNR.
  for (const row of mappings) {
    if (
      !['Prepared booking', 'Needs Review'].includes(row.status) ||
      row.rationale.startsWith('Previously')
    )
      continue;
    const matches = [
      ...new Set((row.facts.confirmations as string[]).flatMap((ref) => owners.get(ref) ?? [])),
    ];
    const ids = [...new Set(matches.map((r) => r.targetId))];
    if (
      ids.length === 1 &&
      matches.length &&
      (!row.facts.customer ||
        referenceKey(row.facts.customer.name) === referenceKey(matches[0].facts.customer.name)) &&
      (!row.facts.travel_on ||
        !matches[0].facts.travel_on ||
        row.facts.travel_on === matches[0].facts.travel_on)
    ) {
      if (row.status === 'Needs Review') {
        row.status = 'Linked supporting row';
        row.targetId = ids[0];
        row.rationale =
          'Exact explicit confirmation links uniquely to one prepared booking; no contradictory customer or travel date.';
      }
    } else if (row.status === 'Prepared booking' && ids.length > 1) {
      row.status = 'Needs Review';
      row.targetId = undefined;
      row.rationale =
        'Confirmation appears with conflicting booking identities; no automatic merge.';
    }
  }
  const unique = new Map<string, PreparedMapping>();
  for (const row of mappings.filter((r) => r.status === 'Prepared booking')) {
    if (unique.has(row.targetId!)) {
      row.status = 'Linked supporting row';
      row.rationale =
        'Same explicit booking identity; preserved additional source row without a second booking.';
    } else unique.set(row.targetId!, row);
  }
  for (const row of mappings) {
    if (row.status === 'Linked supporting row' && (!row.targetId || !unique.has(row.targetId))) {
      row.status = 'Needs Review';
      row.targetId = undefined;
      row.rationale =
        'The confirmation candidate has conflicting booking identities; retain this supporting row for review rather than linking to an ambiguous target.';
    }
  }
  const counts = Object.fromEntries(
    ['Prepared booking', 'Linked supporting row', 'Needs Review', 'Preserved supporting row'].map(
      (status) => [status, mappings.filter((r) => r.status === status).length],
    ),
  );
  const previousTargets = new Set(
    previous.filter((r) => r.status === 'Prepared booking').map((r) => r.targetId),
  );
  return {
    mappings,
    bookings: [...unique.values()].map((r) => ({
      id: r.targetId,
      facts: r.facts,
      sources: mappings.filter((m) => m.targetId === r.targetId).map((m) => m.source),
    })),
    reconciliation: {
      totalSourceRows: rows.length,
      counts,
      uniquePreparedBookings: unique.size,
      mappedSourceRows: counts['Prepared booking'] + counts['Linked supporting row'],
      unresolvedFinancialRows: mappings.filter((r) => r.financialReview).length,
      intentionallyExcluded: 0,
      preservedSourceRows: mappings.length,
      newPreparedBookings: [...unique.keys()].filter((id) => !previousTargets.has(id)).length,
      liveFinancialPostings: 0,
      financialPostingsAuthorized: false,
    },
  };
}
