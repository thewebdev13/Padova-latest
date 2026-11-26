/**
 * Plan: supplier refund tracked separately — expected → received / denied (+ date).
 * Denied posts as supplier_received form `denied` with recognized basis 0 (no invented recovery).
 */

export const SUPPLIER_REFUND_DENIED_FORM = 'denied';

export type SupplierRefundStatus = 'expected' | 'partial' | 'received' | 'denied';

export function supplierRefundFormsIncludeDenied(
  receivedForms: string | null | undefined,
): boolean {
  return String(receivedForms || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(SUPPLIER_REFUND_DENIED_FORM);
}

/** Derive Plan status from expected vs received totals + forms. Never invents amounts. */
export function supplierRefundStatus(input: {
  supplier_expected?: number | null;
  received?: number | null;
  received_forms?: string | null;
}): SupplierRefundStatus {
  const expected = Number(input.supplier_expected ?? 0);
  const received = Number(input.received ?? 0);
  const denied = supplierRefundFormsIncludeDenied(input.received_forms);
  if (!(expected > 0) && !(received > 0)) return 'expected';
  if (received >= expected && expected >= 0) {
    if (denied && received > 0) return 'denied';
    return 'received';
  }
  if (received > 0) return denied ? 'denied' : 'partial';
  return 'expected';
}

export function supplierRefundStatusLabel(status: SupplierRefundStatus): string {
  if (status === 'expected') return 'Expected';
  if (status === 'partial') return 'Partly received';
  if (status === 'received') return 'Received';
  return 'Denied';
}

export function supplierRefundDenyPlanHint(): string {
  return 'Plan: mark supplier return denied when nothing will be recovered. Clears the supplier follow-up; does not invent cash or inventory.';
}
