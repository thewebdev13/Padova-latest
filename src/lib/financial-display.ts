type BookingFinancialState = {
  supplier_cost_incomplete?: boolean;
  cost_incomplete?: boolean;
  itinerary?: { sale_known?: boolean };
};

/** Missing selling price prevents profit calculation, not display of a known supplier cost. */
export function supplierCostIncomplete(booking: BookingFinancialState): boolean {
  return booking.supplier_cost_incomplete ?? booking.cost_incomplete ?? true;
}

export function incompleteProfitReason(booking: BookingFinancialState): string | null {
  if (supplierCostIncomplete(booking)) return 'Cost incomplete';
  if (booking.itinerary?.sale_known === false) return 'Customer price needed';
  return booking.cost_incomplete ? 'Financial details incomplete' : null;
}
