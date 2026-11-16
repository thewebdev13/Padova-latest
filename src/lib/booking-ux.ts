/** Entry helpers only: these never infer prices, payments, ownership or cost basis. */
export function travelerNames(input: string): string[] {
  const names = new Map<string, string>();
  for (const name of input.split(/[,\r\n]+/).map((s) => s.trim().replace(/\s+/g, ' '))) {
    if (name) names.set(name.normalize('NFKC').toLocaleLowerCase(), name);
  }
  return [...names.values()];
}

export function flightEndpoints(values: Record<string, any>) {
  const parts = String(values.route ?? '').split(/\s*(?:→|–|—|->|-)\s*/);
  return {
    origin: values.origin ?? parts[0] ?? '',
    destination: values.destination ?? (parts.length === 2 ? parts[1] : '') ?? '',
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
