# Go-forward deployment handoff — 1 November 2026

Current production preparation: all six required extensions are now installed in the existing US project (two were already installed; four missing accepted files were applied after a fresh verified backup). The operational gate and historical financial authorization are both **false**. Pre-change and post-extension restores passed for 109 and 118 tables respectively; no historical financial records were posted. Application behavior remains the accepted `3797f89` build, with only public-CA packaging/tracing added for cloud deployment.

Hosting is **not deployed**. Existing Vercel team `padova2` is Hobby, which does not permit commercial use; Pro starts at $20/month plus usage. Automatic approval review rejected creating a dedicated production project and uploading secrets because that creation was not explicitly authorized under the established-host instruction. No project, secret upload, billing or DNS change occurred. The live QA project/domain and QA Supabase remain unchanged. Obtain explicit approval of the dedicated production target and commercially permitted hosting budget before those blocked actions. No hosted production acceptance or operational unlock is claimed.

Scope: NEW Padova bookings only, continuing accepted application `3797f89206d2ea76cda91cebccceecd0355d475c`. Historical evidence, mappings, reconciliation and cutover are unchanged. No hosting environment was created, gate unlocked or historical transaction imported. Current production schema and hosting status are recorded above.

## Deployment package

Use the established hosting architecture once its details are confirmed. The application remains a Next.js Node server using individual authenticated staff sessions and the existing US Supabase `padova` foundation in `unugynfzmxjxifgofxjr`, us-east-1. Do not deploy the local synthetic PGlite data directory or use QA credentials for production. Node 24, `npm ci`, `npm run build` and `npm start` remain the normal build/run path; the host must support the server and a verified-TLS PostgreSQL session connection. No new service, paid plan or hosting alternative is authorized by this handoff.

The installed adapter marker `20261028_existing_padova_adapter` remains authoritative. Never reinstall `20261028191100_padova_existing_schema_adapter` or run the original local `db:migrate` against US production. Through the established reviewed migration process, compare installed markers and apply only absent incremental extensions in this order:

1. `20261029012515_padova_fulfillment_catalogs_units.sql`
2. `20261029131534_padova_owned_reward_reversal_positions.sql`
3. `20261029195159_padova_booking_entry.sql`
4. `20261029225428_final_entry_integrity.sql`
5. `20261030125035_v1_source_profiles.sql`
6. `20261101193320_commission_payables.sql`

These are application extensions, not historical import instructions. The new extension reuses native `padova.referral_terms` and `padova.supplier_payments`. It removes only the one-payee-per-booking uniqueness restriction, adds immutable agreement revisions and payout corrections, and extends the existing balance view. It preserves original terms, payments, receipt-only correction constraints and the installed adapter. New tables deny browser API roles and grant only SELECT/INSERT to the existing private server role. Backup role receives SELECT when present. No UPDATE/DELETE capability is added to financial history. Prepared migration checksum is in `db/padova/commission-payables-summary.json`; regenerate only this uninstalled extension with `node scripts/prepare-commission-payables.mjs`.

## Existing production controls

Keep private production environment configuration on the established host: pinned US database mode/URL with `sslmode=verify-full` and trusted CA, existing Supabase Auth configuration and session-encryption key. Reuse the existing runtime and backup identities. Never include `.env.local`, `.data`, source documents, browser acceptance credentials or local backups in the deployable artifact. Preserve the current TLS, permission, CSRF and independent staff-session protections.

`node --use-system-ca --env-file-if-exists=.env.local --import tsx scripts/check-go-forward.ts` is an optional **read-only** deployment preflight. It checks required markers, payable relations, private runtime role, staging/settings isolation, recorded backup verification and the operational gate. It never applies SQL or opens entry. Its exit status is nonzero while these controls are incomplete. It does not claim hosted acceptance.

Before allowing real new bookings, the established deployment must pass actual hosted login/read/write acceptance and independent backup/restore verification covering the deployed extensions. The runtime cannot unlock settings. Keep the gate locked until those conditions are independently verified. Historical reconciliation is a separate hold and must not be silently imported or marked complete as part of go-forward enablement.

## Recovery

Capture an encrypted, independently restorable database/Auth/configuration recovery set through the existing recovery process before applying extensions or enabling entry. The last historical recovery result does not certify a future schema or host. Confirm the backup contains both new tables and their values after deployment. Redeploying the previous application is a code rollback only; preserve appended agreements, payments, corrections, journals and audit events. Do not drop the new tables or re-add a single-payee constraint after multiple payees have been recorded. Use dated audited corrections for financial mistakes. Restoring an entire database over intervening real bookings requires a separately reviewed recovery decision.

Exact launch hold: authorize the dedicated production target and commercially permitted plan/budget, deploy/configure it, and complete actual hosted acceptance before unlocking operational entry. US extensions are installed; both gates are locked. Local synthetic acceptance is recorded in `docs/BUILD_STATE.md` and does not authorize production entry.

Validation of the application package: 203/203 full synthetic tests, 135/135 financial tests through the restricted existing-schema replica, enhanced seven-case go-forward acceptance on both stores, TypeScript, production build, authenticated HTTP acceptance and browser commission/queue verification pass. These checks neither connect to nor modify production. The isolated review build uses `.next-review`; the separate QA build/server/credentials remain unchanged.
