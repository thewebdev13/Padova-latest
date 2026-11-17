/** Entry helpers only: these never infer prices, payments, ownership or cost basis. */

/** Sum known money component costs (USD strings). Undefined if a filled cost cannot be parsed. */
export function entryBookedCostCents(
  components: Array<Record<string, any>>,
  parseUsd: (value: unknown) => number | undefined,
): number | undefined {
  if (!components.length) return undefined;
  let sum = 0;
  let any = false;
  for (const c of components) {
    if (c?.cost === '' || c?.cost == null) continue;
    let cents: number | undefined;
    try {
      cents = parseUsd(c.cost);
    } catch {
      return undefined;
    }
    if (cents === undefined) return undefined;
    sum += cents;
    any = true;
  }
  return any ? sum : undefined;
}

export function travelerNames(input: string): string[] {
  const names = new Map<string, string>();
  for (const name of input.split(/[,\r\n]+/).map((s) => s.trim().replace(/\s+/g, ' '))) {
    if (name) names.set(name.normalize('NFKC').toLocaleLowerCase(), name);
  }
  return [...names.values()];
}

/** Common IATA codes used by AirportInput — avoid treating "Tel Aviv" as TEL. */
const KNOWN_AIRPORT_CODES = new Set([
  'EWR',
  'JFK',
  'LGA',
  'TLV',
  'LHR',
  'CDG',
  'MAD',
  'FCO',
  'MXP',
  'HKG',
  'DXB',
  'MIA',
  'LAX',
  'ORD',
  'BOS',
  'AMS',
  'ZRH',
  'MNL',
  'BKK',
]);

/** Prefer leading IATA when a label like "JFK New York" was pasted. */
function airportToken(raw: string): string {
  const trimmed = raw.trim();
  if (/^[A-Za-z]{3}$/.test(trimmed) && KNOWN_AIRPORT_CODES.has(trimmed.toUpperCase()))
    return trimmed.toUpperCase();
  const labeled = trimmed.match(/^([A-Za-z]{3})(?:\s+[·\-–.]?\s*|\s+)(.+)$/);
  if (labeled && KNOWN_AIRPORT_CODES.has(labeled[1].toUpperCase()))
    return labeled[1].toUpperCase();
  return trimmed;
}

function splitRouteParts(raw: string): string[] {
  return raw
    .split(/\s*(?:→|–|—|->|-|\bto\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function flightEndpoints(values: Record<string, any>) {
  const originRaw = String(values.origin ?? '').trim();
  const destRaw = String(values.destination ?? '').trim();
  const originSet = originRaw !== '';
  const destSet = destRaw !== '';

  // Bad intake sometimes stuffed the whole "JFK New York to TLV" into From only.
  if (originSet && !destSet) {
    const fromOrigin = splitRouteParts(originRaw);
    if (fromOrigin.length >= 2) {
      return {
        origin: airportToken(fromOrigin[0]),
        destination: airportToken(fromOrigin[fromOrigin.length - 1]),
      };
    }
  }

  if (originSet && destSet) {
    return {
      origin: airportToken(originRaw),
      destination: airportToken(destRaw),
    };
  }
  const raw = String(values.route ?? '').trim();
  // Accept CODE-CODE, arrows, and prose "JFK New York to TLV" / "JFK to Tel Aviv".
  const parts = splitRouteParts(raw);
  if (parts.length >= 2) {
    return {
      origin: airportToken(parts[0]),
      destination: airportToken(parts[parts.length - 1]),
    };
  }
  return {
    origin: originSet ? airportToken(originRaw) : airportToken(parts[0] ?? ''),
    destination: destSet ? airportToken(destRaw) : '',
  };
}

export function flightEndpointChange(values: Record<string, any>, key: string, value: string) {
  const endpoints = { ...flightEndpoints(values), [key]: value };
  return {
    ...values,
    ...endpoints,
    route:
      endpoints.origin || endpoints.destination
        ? [endpoints.origin, endpoints.destination].join('-')
        : '',
  };
}

export function eligibleProfileContact(p: Record<string, any>) {
  return (
    p.kind === 'person' &&
    !p.archived_at &&
    !p.details?.traveler_review_only &&
    !['airline', 'property', 'rental'].some((role) => p.roles?.includes(role))
  );
}

export function inventoryOption(asset: Record<string, any>, unit: string) {
  const quantity = asset.balance ?? asset.quantity;
  const available =
    quantity == null
      ? 'Unknown available'
      : unit === 'money'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
            Number(quantity) / 100,
          )
        : `${Number(quantity).toLocaleString('en-US')} ${unit}`;
  const issuer =
    asset.issuer && !asset.name.toLocaleLowerCase().includes(asset.issuer.toLocaleLowerCase())
      ? asset.issuer
      : '';
  return {
    value: asset.id,
    label: asset.name,
    detail: [asset.kind, issuer, asset.expires_on ? `Expires ${asset.expires_on}` : '']
      .filter(Boolean)
      .join(' · '),
    badge: available,
  };
}
