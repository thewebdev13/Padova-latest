# Padova Travel Operations

A new private travel operations and accounting application. This repository contains no earlier Padova prototype code and no imported historical transactions.

## Run locally

The permanent cloud foundation is existing `padova`/`padova_staging` in **Padova Travel - US Private Trial**, `unugynfzmxjxifgofxjr`. The adapter migration `20261028191100_padova_existing_schema_adapter` is installed; never reinstall it. Verified TLS, restricted runtime login and individual Supabase Auth work; the real Owner is enrolled. See [PADOVA_ADAPTER](docs/PADOVA_ADAPTER.md). Do not run the numbered local migrations or seed against cloud; the application refuses this.

Requires Node.js 24 and npm. From this directory:

```powershell
npm ci
npm run db:migrate
npm run db:seed
npm run staff:create
npm run dev
```

Open [the local workspace](http://127.0.0.1:3000). Development binds to loopback and always requires your individual staff login. Run `staff:create` once to provision the first real Owner and save their personal recovery codes privately. There is no shared/default password or demo authentication bypass. Use synthetic business records locally. Stop the server with Ctrl+C before running persistent database, seed, staff, or backup scripts; a process lock prevents simultaneous local database writers. In-memory tests are independent.

The setup commands above describe the original local comparison fixture **with no cloud DATABASE_URL configured**. For the configured US application, run `npm run db:check` and use the existing individual Owner login; do not provision the first Owner again. Later users are added through authenticated Users & Permissions. Do not create a second local Owner to substitute for cloud enrollment.

`db:seed` refuses all cloud connections and skips nonempty local databases. Local database files live in ignored `.data/development/`. An earlier synthetic seed used `.data/postgres/`; it is preserved and unused.

## Verify

```powershell
npm test
npm run typecheck
npm run build
npm run test:http
npm run format:check
npm run test:padova
npm run test:padova:financial
```

Integration tests run real PostgreSQL SQL in isolated PGlite instances. HTTP acceptance starts an isolated server/database, checks login, session revocation, CSRF, permissions, operational writes, and retries, then stops its server. `npm run format` formats maintained source; original requirement snapshots are excluded.

## Main workflows

- Create a booking on one page, select canonical travelers, and enter customer charges separately from product/channel/funding.
- Add cash/card or asset funding. Choose **Supplier already paid** to post the linked payment automatically; otherwise a payable remains outstanding.
- Record customer payments once and allocate across bookings. Excess remains usable customer credit. Authorize a third-party payer explicitly from booking detail.
- Buy travel assets using exact purchase cost or a face-value percentage; use/sell partial quantities, inspect the ledger, settle acquisition costs, transfer points, or record expiration.
- Track gross commission, collector retention, receipt allocation, and immutable booking referral terms. Referral payouts wait for travel and required commission receipts.
- Record cancellation cases against original funding components. Restore original points/voucher movements or create the actual returned credit. Customer payouts wait for supplier cash unless a finance user records an explicit handling override.
- Correct payment totals with audit history. Downward corrections reverse affected allocations; grouped payments require a booking choice.
- Inspect current expected booking profit, monthly adjustments, journal balances, customer statements, calendar, tasks, and attention items.

## Staff and production configuration

Production requires an owner-controlled PostgreSQL connection in `DATABASE_URL`, a Node-compatible host, HTTPS, real staff accounts, restricted attachment storage, and independent backup infrastructure. Run migrations before serving traffic and do not copy synthetic development data into production.

`npm run staff:create` provisions only the first individual Owner using a hidden password prompt and shows personal recovery codes once. Further users are created in **Users & Permissions**. Owners have full access; Employees default to operational work and customer payment entry, with independent Owner-controlled grants for prices, costs, booking/company profit, asset basis, reports, refunds, completed bookings, assets and user administration. Deactivation/access changes revoke sessions and preserve history. Password recovery supports personal single-use codes or expiring Owner-issued links; automatic email delivery is not configured. See [AUTHENTICATION](docs/AUTHENTICATION.md) for exact setup and recovery behavior.

Cloud URLs are pinned to the US project and `padova`; no third project/schema is permitted. Configure the private settings documented in `.env.example`, including verified TLS/CA and server-only Auth/session keys. `db:inspect -- <private-env-file>` performs a READ ONLY preflight; `db:check` verifies an installed adapter. Startup never applies SQL. `.env.local` is ignored/untracked; no real users were enrolled and no cloud changes were applied. The supplied connection reached a certificate-validation block; verified connectivity and actual Auth acceptance remain pending. See [BUILD_STATE](docs/BUILD_STATE.md) for exact status.

## Backups

Set `BACKUP_DIR` to a restricted owner-controlled backup destination and `BACKUP_ENCRYPTION_KEY` to a separately stored base64 encoding of 32 random bytes. Do not store the key beside the backups or commit it. Run `npm run backup`. Local exports use PGlite archives; production uses the installed `pg_dump` client and `DATABASE_URL`. Exports are authenticated with AES-256-GCM.

For a local archive, run `npm run backup:verify -- <encrypted-pglite-file>` with the same key. Verification restores into an isolated memory database and checks basic invariants. Production restore drills, off-machine scheduling, retention, alerts, restricted deletion, and attachment backups still require infrastructure setup. A manual local export is not an independent production backup.

## Permanent project memory

- [AGENTS.md](AGENTS.md): contributor rules and financial safety requirements.
- [MASTER_REQUIREMENTS](docs/MASTER_REQUIREMENTS.md): complete supplied build request.
- [BUSINESS_REFERENCE](docs/BUSINESS_REFERENCE.md): read-only snapshot of the linked master reference.
- [ARCHITECTURE](docs/ARCHITECTURE.md): schema, posting rules, and decisions.
- [BUILD_STATE](docs/BUILD_STATE.md): verified state, limitations, and next work.
