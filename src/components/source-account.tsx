'use client';
import { dateLabel } from '@/lib/display-date';
type R = Record<string, any>;
const money = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v / 100);
export default function SourceAccount({
  rows,
  payments,
  assets,
  open,
}: {
  rows: R[];
  payments: R[];
  assets: R[];
  open: (type: string, id: string) => void;
}) {
  let balance = 0;
  return (
    <section className="section-body">
      <p>
        Recorded obligations less payments and corrections. A negative balance is a seller advance
        or credit. Inventory acquisition and booking use are separate.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Booking / event</th>
              <th>Payable</th>
              <th className="money">Added</th>
              <th className="money">Settled / credited</th>
              <th className="money">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              balance += Number(r.credit) - Number(r.debit);
              return (
                <tr key={r.id}>
                  <td>{dateLabel(r.date)}</td>
                  <td>
                    {r.booking_id ? (
                      <button
                        className="booking-code"
                        onClick={() => open('booking', r.booking_id)}
                      >
                        {r.code}
                      </button>
                    ) : (
                      r.kind.replaceAll('_', ' ')
                    )}
                    <small>{r.kind.replaceAll('_', ' ')}</small>
                  </td>
                  <td>
                    {r.account === 'asset_acquisition_payable' ? 'Inventory purchase' : 'Booking'}
                  </td>
                  <td className="money">{money(Number(r.credit))}</td>
                  <td className="money">{money(Number(r.debit))}</td>
                  <td className="money">{money(balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>
        <strong>Recorded source balance: {money(balance)}</strong>
      </p>
      {payments.length > 0 && (
        <>
          <h3>Actual seller payments</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / reference</th>
                  <th>Method</th>
                  <th>Purpose</th>
                  <th className="money">Paid</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {dateLabel(p.paid_on)}
                      <small>{p.reference || 'No reference'}</small>
                    </td>
                    <td>{p.method}</td>
                    <td>
                      {p.direction === 'asset_purchase'
                        ? 'Inventory purchase'
                        : 'Booking settlement'}
                    </td>
                    <td className="money">{money(Number(p.current_amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {assets.length > 0 && (
        <>
          <h3>Acquired inventory</h3>
          {assets.map((a) => (
            <p key={a.id}>
              <button className="booking-code" onClick={() => open('asset', a.id)}>
                {a.name}
              </button>{' '}
              · Original cost {money(Number(a.acquisition_cost))} · Paid{' '}
              {money(Number(a.acquisition_paid))} · Due {money(Number(a.acquisition_due))}
            </p>
          ))}
        </>
      )}
    </section>
  );
}
