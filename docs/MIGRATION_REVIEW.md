# Review of the declined Supabase installation

28 October 2026. Target: **Padova Travel - US Private Trial**, **`unugynfzmxjxifgofxjr`**. Review only; no remote write was performed. The Owner explicitly denied this installation. Do not retry it or use another write channel.

## Exact artifact

The declined request combined repository migrations 001–010 with `SET LOCAL search_path=public,pg_catalog` and a guard rejecting any pre-existing public tables. The later local review artifact `.data/us-supabase-install.sql` contains that same migration body and guard, additionally wrapped in explicit `BEGIN`/`COMMIT`. Its unchanged SHA-256 is `d7036f3ddcd72c32d7b9bb86f546bf089f6939ad96f6d86a01f75f7d5d918132`. Preserve it as evidence; it is not an approved installation script.

## Deletion, row overwrites and replacements

All names below resolve to `public` in that bundle.

| Statement                                                                 | Exact scope/effect                                                                                                                                                           | Original reason                                                                                  | Needed for a fresh installation?                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `DELETE FROM sessions` (artifact line 254, migration 008)                 | Deletes **every row** of `public.sessions`, with no WHERE clause. It is not `auth.sessions`.                                                                                 | Invalidate sessions when upgrading older local authentication to authorization-version checking. | **No.** A new session table is empty; omit this operation.        |
| `UPDATE staff SET role='OWNER' WHERE 'admin'=ANY(permissions)` (line 245) | Overwrites `role` for staff whose old permission array includes `admin`.                                                                                                     | Convert legacy local administrators to Owner role.                                               | **No.** Define the final role column when creating the new table. |
| `UPDATE staff SET permissions=...` (lines 246–251)                        | Overwrites `permissions` for **every staff row**. Maps old operations/payments/sensitive/finance/admin grants to current grants; unrecognized old grant names are discarded. | Upgrade the old coarse permission model.                                                         | **No.** Create fresh users/grants explicitly later.               |
| `CREATE OR REPLACE VIEW payment_balances` (lines 195–197)                 | Replaces that view's query definition; changes allocation totals to net amounts after reversals. Does not remove payment/allocation rows.                                    | Add correction-aware balances after migration 001's initial view.                                | **No replacement needed.** Create only the final view once.       |
| `CREATE OR REPLACE VIEW booking_balances` (lines 198–206)                 | Replaces that view's query definition; customer/supplier paid totals use net allocations. Does not remove bookings or payments.                                              | Same correction-aware upgrade.                                                                   | **No replacement needed.** Create only the final view once.       |

The full bundle creates staff, sessions and both views earlier in the same transaction. With its guard passing and no concurrent DDL, the staff/session writes would affect **zero rows**, and the view replacements would replace newly created views. That limits their expected effect, but does not make those statements appropriate unexplained fresh-install SQL. Migration 008 run separately against an existing application database could remove real application sessions and overwrite real grants.

There is **no `DROP`, `TRUNCATE`, `DROP ... CASCADE`, schema reset, function replacement, policy removal, or existing-row upsert** in the submitted body. `BEFORE UPDATE OR DELETE` in trigger declarations and `TG_OP='DELETE'` in a guard function prevent future destructive actions; they do not execute deletes during installation. Migration ledger INSERTs add new rows only.

## Access and definition changes

These are not data deletion, but can break access and must be scoped explicitly:

- **Migration 004:** loops over **every table then present in `public`**, enables RLS, and revokes all table privileges from `PUBLIC`, `anon` and `authenticated`. It revokes PUBLIC execution of `prevent_history_change()`. The initial empty-public-table guard limits the expected target to new tables, but this broad loop is unsuitable as a general existing-project migration and does not guard against concurrent table creation.
- **Migration 005:** enables RLS on `payment_allocation_reversals`; revokes PUBLIC privileges on that table and `net_allocations`.
- **Migration 006:** revokes PUBLIC execution of `verify_journal_balance()`, `verify_inventory_balance()` and `guard_command()`.
- **Migration 007:** adds `refund_movements.recognized_basis`; changes `net_allocations`, `payment_balances`, `asset_balances` and `booking_balances` to `security_invoker=true` so views respect caller access. No stored rows are removed.
- **Migration 008:** adds `staff.role`, `staff.auth_version`, `staff.updated_at` and `sessions.auth_version`, creates the case-insensitive unique staff-email index, and enables RLS/revokes PUBLIC/anon/authenticated access on `recovery_requests`, `password_reset_tokens`, `auth_throttles`, `security_audit`.
- **Migration 009:** enables RLS/revokes PUBLIC/anon/authenticated access on `personal_recovery_codes`.
- **Migration 010:** enables table RLS and revokes all privileges from PUBLIC/anon/authenticated/service_role on the exact 46 tables and four views below. It changes `search_path` and revokes execution for those same roles on the four zero-argument trigger functions listed below; revokes their access to sequence `booking_number`. It does not alter role definitions, passwords or project settings.
- **Migration 002:** adds `refunds.unit` and `refunds.expected_basis`. These and the other added columns/constraints/indexes are on tables the full bundle has just created; they can be defined in the final initial schema instead.

Exact migration-010 table targets (all `public`):

```text
schema_migrations, staff, sessions, parties, party_relationships,
traveler_private, payment_accounts, bookings, booking_travelers,
confirmations, itinerary_revisions, commands, charges, payments,
payment_adjustments, payment_allocations, supplier_obligations,
assets, asset_lots, asset_movements, funding_components, asset_sales,
commissions, commission_allocations, referrals, referral_payments,
refunds, refund_movements, profit_movements, journal_lines, tasks,
attention_resolutions, notes, attachments, migration_staging,
audit_events, booking_payers, asset_transfers, asset_sale_receipts,
asset_acquisition_payments, payment_allocation_reversals,
recovery_requests, password_reset_tokens, auth_throttles,
security_audit, personal_recovery_codes
```

Views: `payment_balances`, `asset_balances`, `booking_balances`, `net_allocations`.

Functions: `prevent_history_change()`, `verify_journal_balance()`, `verify_inventory_balance()`, `guard_command()`.

Sequence: `booking_number`.

Browser API access denial is intentional for this server-only architecture. It should apply only to newly created application objects, never indiscriminately to existing project objects. No RLS policies are created, replaced or dropped by this bundle.

## Existing project impact and verification

Read-only inspection after the Owner's clarification confirmed:

- No public tables, views, sequences, indexes or other `pg_class` relations; no `public.schema_migrations`.
- The eight existing public functions remain: `padova_activate_owner`, `padova_booking_detail`, `padova_command`, `padova_historical_bookings`, `padova_historical_directory`, `padova_manage_staff`, `padova_read`, `padova_references`. Their names differ from all four proposed trigger functions; the bundle contains no replacement/alteration of these eight RPCs.
- Existing `padova_staging.evidence_records`: **37,071**; `padova.review_cases`: **947**. Both remain present. Counts confirm the checked state; they are not a row-by-row checksum comparison.
- `auth.users`: **0**; `padova.staff`: **0**; Storage buckets/objects: **0**. These schemas were not targeted. No existing user would be removed or password reset by the submitted SQL.
- The proposed `padova_v1` schema does not yet exist.

The submitted body does not target `auth`, `storage`, `realtime`, `vault`, `extensions`, existing `padova*` schemas, Supabase configuration, secrets or database roles. A successful connector installation would add a Supabase migration-history record, not delete prior history. Newly created public objects would inherit project default grants until revoked within the installation transaction. Its public-wide ACL loop is the main avoidable cross-application access risk. No submitted installation took effect; this review used SELECT queries only.

## Safe additive alternative

**Superseded proposal:** The Owner subsequently stopped `padova_v1` creation and requested reuse of existing structures first. See [EXISTING_PADOVA_ASSESSMENT](EXISTING_PADOVA_ASSESSMENT.md). No schema creation or migration is authorized. The following records the earlier alternative only.

**No destructive operation is necessary for this fresh setup.** Prepare a separate reviewed initial migration that:

1. Creates a dedicated **`padova_v1`** schema in the same US project and fails if that schema already exists; no DROP, reset or reuse of a populated schema.
2. Creates the final tables, role/grant fields, constraints, views, functions, indexes and sequences directly. No session DELETE, staff UPDATE or `CREATE OR REPLACE` is needed.
3. Qualifies every object with `padova_v1`; restricts RLS/ACL changes to an explicit manifest of newly created objects. Sets trigger-function search paths to the dedicated schema and pg_catalog. Leaves public RPCs and existing schemas untouched.
4. Keeps the new schema outside browser API exposure, uses a restricted server runtime credential, and preserves the completed individual-login/permission implementation.
5. Adapts database queries, migration ledger checks, backups and configuration to that schema; tests preservation against populated legacy fixtures before requesting installation. The present code still targets `public`; this adaptation has **not** been performed or deployed by this inspection.

Do not execute the old bundle. No new project is needed. If any later proposal would remove/overwrite existing rows or objects, enumerate them and obtain explicit Owner approval first.
