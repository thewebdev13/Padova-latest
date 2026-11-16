# Architecture and financial model

## Independence and ownership

The completed interface and financial workflows remain this repository's implementation. The Owner has selected the existing US `padova` schema as its permanent storage foundation, with `padova_staging` preserved as evidence. This supersedes the earlier independent-schema plan; no historical transactions are automatically adopted. Padova must own repository, hosting, database, authentication, backups and credentials before production cutover.

Next.js/React/TypeScript provides the private responsive interface and server API. PostgreSQL is the relational store; PGlite supplies isolated local PostgreSQL tests. The sole cloud target is Supabase **Padova Travel - US Private Trial**, `unugynfzmxjxifgofxjr`, `us-east-1`, using `pg`, verified TLS and existing `padova` tables. The storage adapter uses compatibility views plus targeted support structures, not duplicate root ledgers. Pools explicitly assume the non-bypass `padova_app_server` role. Supabase Auth owns passwords and UUID identities; encrypted opaque application sessions and database grants preserve immediate application revocation. The 12 reviewed legacy browser RPC paths now deny authenticated execution. Adapter migration `20261028191100_padova_existing_schema_adapter` is installed; never reinstall it. Verified TLS, restricted runtime login and real individual Owner/provider acceptance pass; public hosting remains pending. See PADOVA_ADAPTER.md for exact architecture, object summary, TLS/configuration and limitations.

## Schema boundaries

Installed incremental fulfillment extension **20261029012515** (marker `20261029_fulfillment_catalogs_units`) adds configurable programs/instruments/holder accounts, explicit money/points/count units, travel components and fulfillment links, exact component-to-lot-use provenance and append-only expected-event states. It reuses the original financial ledgers. Its frozen manifest is `db/padova/fulfillment-object-summary.json`; never regenerate or reinstall it. See `FULFILLMENT_ARCHITECTURE.md` for unit compatibility, outside-source awards, certificates, pending/actual rewards and preservation verification. All staging/evidence/review/audit/settings hashes remained unchanged after installation.

The reviewed existing-schema package lives in `db/padova/`. Numbered root `db/` migrations now serve only the original local fixture; cloud runtime refuses to execute them. Cloud startup checks the installed adapter version without changing schema. Permanent identities are UUIDs; readable booking codes use a sequence and may have rollback gaps. Timestamps preserve ordering; business dates remain ISO date-only strings at the adapter boundary. Existing New York settings and the backup/write gate remain intact.

| Area                 | Main records                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------- |
| Identity             | staff, sessions, permissions                                                                    |
| Relationships        | parties, party_relationships, traveler_private, booking_payers                                  |
| Reservations         | bookings, booking_travelers, confirmations, itinerary_revisions                                 |
| Receivables/cash     | charges, payments, payment_adjustments, payment_allocations, payment_allocation_reversals       |
| Supplier funding     | payment_accounts, funding_components, supplier_obligations                                      |
| Travel inventory     | assets, asset_lots, asset_movements, asset_sales, asset_transfers, sale/acquisition settlements |
| Earnings/obligations | commissions, commission_allocations, referrals, referral_payments                               |
| Cancellations        | refunds, refund_movements with quantity units and recognized monetary basis                     |
| Accounting/control   | profit_movements, journal_lines, commands, audit_events                                         |
| Operations           | tasks, attention_resolutions, notes, attachments metadata, migration_staging                    |

One person can have many roles and relationships. Product, source channel, actual supplier, funding components, and revenue remain separate. Customer payment source never determines supplier funding. Calendar and boards derive from canonical bookings. Customer statements follow customer responsibility and authorized payment allocations, not name matching.

## Exact amounts and posting

Application DTOs use integer cents; permanent monetary storage uses exact PostgreSQL `numeric(18,2)` dollar fields. Checked adapter conversion does not rewrite old values or silently round fractional/unsafe amounts. Points/asset quantities remain whole units, separate from basis. The original local comparison fixture retains bigint cents. FIFO uses BigInt half-up rounding and consumes the final residual exactly. Foreign-currency settlement/exchange gains remain outside this foundation.

Each financial command is validated, authorized, and posted in one transaction. A command UUID is an idempotency key scoped to an exact actor/kind/payload; changed retries are rejected. PostgreSQL transactions obtain a coarse advisory lock, deliberately favoring correctness at Padova's stated volume over throughput. PGlite serializes its single connection, and a process lock prevents opening the same persistent local store twice.

Journal lines balance per command. Deferred database triggers reject unbalanced journals and invalid lot balances at commit. Financial rows, itinerary snapshots, audit entries, and posted commands reject destructive edits/deletes. Corrections append adjustments/reversals; visible views derive the current result. Application permissions and database privileges remain essential: a database owner can always alter database protections.

Expected final booking profit is:

```text
current customer charges
- consumed funding cost basis / cash acquisition costs
+ expected net commission
+ verified earned travel-credit benefits
+ actual supplier-refund cost recovery
- referral obligation
```

Profit-based referrals use positive pre-referral booking profit. Fixed referrals retain their fixed agreed value. Commission collector retention is separate from referral cost. Expected commission affects expected profit; receipts separately determine cash and payout eligibility. This is a documented V1 accrual default requiring owner acceptance, not a claim that expected income has been received.

Dated profit movements reconcile to each booking's current expected profit. Monthly prior-period adjustments sum all movements on bookings from older months, including later refunds/credit benefits. Cash reports use dated cash journal movements, so a December correction to an October payment does not rewrite October cash movement. Operational cards distinguish expected profit from cash.

## Linked workflow details

- Asset use reduces exact lots and basis and contributes that basis to booking cost. Selling posts proceeds/receivable, inventory reduction, gain/loss, buyer history, and audit events together.
- External seller-owned points open with zero Padova basis. Usage requires an explicit seller/cost and creates the seller obligation; it does not pretend Padova owned those points.
- Point transfers preserve moved basis, record both quantities/bonus, and capitalize explicit fees. The command links all movement records; multi-lot transfers retain command-level provenance.
- Voucherization creates a source-linked asset and liability with no new profit. Customer-owned assets cannot be sold as Padova inventory. The treatment/release of managed-credit liabilities still needs a reviewed business policy before production use of that area.
- Payments support grouped/partial allocations and authorized third-party payers. A cash/card funding component can post its settlement at the same time. Asset acquisition and unpaid asset-sale settlements have dedicated linked commands.
- Payment corrections preserve original totals. Downward corrections append allocation reversals; an ambiguous grouped correction requires the operator to choose a booking.
- Each refund case can point to an original funding component/traveler. Monetary cents and point units remain distinct. Original asset returns restore original lot basis. Newly issued credit can be created inside the refund transaction without an acquisition payable. Cash/customer liabilities remain separate, and noncash return does not authorize a cash payout.
- Audit events are linked to affected bookings, parties, and assets. Booking changes preserve immutable itinerary snapshots. Saving never sends any message.

## Security and deployment boundary

Staff passwords use salted scrypt hashes; sessions use random opaque tokens stored as hashes, HttpOnly cookies, expiry, and server-side active-user/permission checks. Writes require matching Origin and bounded JSON bodies. All environments require individual staff sessions; no development/shared-login bypass exists. Independent permissions control sale price, supplier cost, booking profit, company totals, asset basis, reports, payment/refund/funding/commission/asset actions, completed bookings, sensitive travelers, users and settings. Owner has full access; Employee defaults are operations plus customer payment entry. Reads are redacted server-side and mutation replies expose only record identifiers. See `AUTHENTICATION.md` for the complete role/recovery model.

RLS is enabled on application tables; no browser Data API policies grant access. Views use security-invoker behavior. Database access is server-only using restricted owner-controlled credentials. Production needs a deliberate server-role/least-privilege review, deployment authentication review, proxy-wide abuse protection, and actual Supabase/PostgreSQL integration tests. Database-persisted per-identity throttling, security response headers, expiring sessions, deactivation, user administration, personal recovery codes and Owner-assisted reset links are implemented. Secure file upload, download authorization, and document encryption still need implementation; metadata tables alone do not provide storage security.

Encrypted backup/export and an isolated local restore test are implemented. Independent backup scheduling, retention, attachment protection, deletion restrictions, alerts, and production recovery are infrastructure work. Do not promise zero data loss.

## Authentication revision — 28 October 2026

Migrations 008–009 add Owner/Employee roles, authorization versions, persistent throttles, recovery requests/tokens, personal recovery codes and immutable security audit. Existing sessions are invalidated during the permission-model upgrade. Reset/code secrets are stored only as hashes and omitted from audit history. Permission changes/deactivation revoke sessions; material financial commands refresh the actual staff principal inside the transaction. Sole-owner recovery works with a protected individual offline recovery code. No shared or default credentials are introduced.
