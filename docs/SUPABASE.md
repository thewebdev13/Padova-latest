# Permanent Supabase project

**Current implementation:** [PADOVA_ADAPTER](PADOVA_ADAPTER.md) records the implemented adapter and approved migration `20261028191100_padova_existing_schema_adapter`, installed in the existing US schemas on 2026-10-28. Owner approved reuse/extension of existing `padova`/`padova_staging`; no duplicate schema is being created. Supabase Auth owns hosted credentials/IDs. Legacy installation descriptions below are historical. User's private root `.env.local` is ignored/untracked; verified TLS, restricted runtime login and Supabase Auth/session settings are configured; the real Owner is enrolled. See BUILD_STATE for current backup and acceptance status.

Owner decision, 28 October 2026: use **Padova Travel - US Private Trial**, ref **`unugynfzmxjxifgofxjr`**, region **`us-east-1`**, organization `iftwnlcmpyjljbbsvnxm`.

Dashboard: [US project](https://supabase.com/dashboard/project/unugynfzmxjxifgofxjr). API URL: `https://unugynfzmxjxifgofxjr.supabase.co`. No third project, branch, deletion, pause, reset, historical import, or replacement of existing schemas is authorized.

## Inspection and decision

Before this change the repository had no `.env.local`, Supabase config, Supabase SDK, or database-related process environment variables. It used PGlite in `.data/development`; `pg` supported an unspecified future `DATABASE_URL`. Neither existing project was wired to this build. Earlier documentation requesting a new project is superseded.

Both projects are ACTIVE_HEALTHY on PostgreSQL 17.11. No technical obstacle was found to selecting the US project. Its region matches the US business preference. Do not infer production readiness from its name or healthy status.

| Inspected project              | Existing content, counted without reading source payloads                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US `unugynfzmxjxifgofxjr`      | Older `padova` application schema and eight public RPCs, 167 evidence files, 37,071 staging evidence records, 947 review cases; old synthetic test schemas. Zero real Auth users, zero `padova.staff`/bookings, no Storage buckets/objects. |
| EU Test `qqnybbtruvkrstziswsi` | `padova_staging`: one import batch, 28 source ranges, 4,108 source rows, 62 review events. No Auth users, Storage buckets/objects or Edge Functions.                                                                                        |

The EU project is not required by this repository's runtime, but **it is not verified safe to delete**: it contains source evidence and review history. Equivalence to the US evidence has not been checked. Confirm independent exports, checksums, provenance and other consumers before any deletion recommendation; deletion still requires explicit Owner approval.

## Current-build installation

**Latest Owner approval: apply the precisely reviewed existing-schema adapter.** It is now installed in `padova`; `padova_staging` and test schemas remain preserved. No `padova_v1` creation is authorized. Read [PADOVA_ADAPTER](PADOVA_ADAPTER.md) for hosted verification and remaining runtime CA/Auth/restricted-login activation. The sections below describing old installation proposals are historical, not execution instructions.

**Superseded installation proposal:** The Owner confirmed they explicitly denied the bundle because of its destructive statements. It must not be retried. Read [MIGRATION_REVIEW](MIGRATION_REVIEW.md) for the exact audit and additive `padova_v1` alternative. The following paragraphs describe the denied public-schema proposal, not authorization to apply it. The application's current code still targets public; the dedicated-schema adaptation is pending.

The US `public` schema has no tables/views. The ten repository migrations are prepared for its `public` schema, preserving the existing `padova`, `padova_staging`, synthetic test schemas and old public RPCs. No old code/data is reused. Apply all migrations transactionally with migration 010: it explicitly denies browser/service API roles access to every current-build table, view, sequence and trigger function, enables table RLS and fixes trigger search paths. Future migrations must explicitly protect new objects against Supabase default grants.

Installation is **pending**, not completed. The first connector call failed with `Invalid or expired requestState`. After a read confirmed zero tables, the second installation was declined by the migration approval step without a reason. A final read confirmed `public.schema_migrations` is absent and `public` still has zero tables. Do not bypass this decline through another write channel. No existing project data was changed.

Concrete local review artifact: `.data/us-supabase-install.sql`, SHA-256 `d7036f3ddcd72c32d7b9bb86f546bf089f6939ad96f6d86a01f75f7d5d918132`. It wraps the ten repository migrations in one transaction and refuses installation if any public tables exist. It contains no credentials and has not been executed. Local verification: 67 tests pass, including inherited API-grant denial and preservation of separate legacy schema/RPC fixtures; typecheck passes. No current hosted success is claimed.

## Private connection activation

The application also needs the existing US database password/connection string, which connected tools cannot retrieve. It must not be reset as part of this instruction.

1. Put `PADOVA_DATABASE_MODE=supabase` and the US `DATABASE_URL` into ignored `.env.local`. Never commit it or send the password in chat.
2. Use the project's actual [Connect panel](https://supabase.com/dashboard/project/unugynfzmxjxifgofxjr?showConnect=true) URL with `sslmode=verify-full` and the appropriate trusted root certificate when needed. Use Direct for supported IPv6 or its actual Session pooler on port 5432 for IPv4. Do not guess the pooler hostname. Pooler usernames must end `.unugynfzmxjxifgofxjr`.
3. Do not run the denied bundle or `db:migrate` against cloud. First prepare/test the additive dedicated-schema replacement and adapt the existing code/checks to it. Present its exact SQL for review before remote application. The existing `db:check` still expects the old public-schema proposal and must be adapted too. Database/staff/backup scripts load `.env.local`, matching Next.js. Never run synthetic seed against cloud; the script refuses it.
4. Use an audited migration credential and a separately restricted server runtime role before production. Keep database credentials server-only. Public/anon keys cannot replace `DATABASE_URL` for this transactional server architecture.
5. Create the first individual Owner privately against this database, then add Employees through Users & Permissions. Current login/logout/recovery remain the implemented staff/session system; Supabase Auth is not silently substituted. Future Supabase Auth, Storage, migrations and configuration must all use this same project.

No restart or production rebuild was performed. The already-running local app remains local until an approved configuration activation. Cloud startup and Owner creation only check the installed schema; neither automatically installs it. Explicit cloud mode refuses missing credentials rather than falling back locally. The code rejects the EU project, third-project URLs and connection options that redirect the schema.

## Existing security findings

`padova_test_20261027_auth.users` has RLS disabled. Inspection confirmed `anon` has neither schema usage nor SELECT and `authenticated` has no SELECT; the generic table-list warning alone does not establish browser exposure. Nevertheless, review and harden this legacy synthetic table before production. Proposed remediation for Owner review: `ALTER TABLE padova_test_20261027_auth.users ENABLE ROW LEVEL SECURITY;` with policies chosen for its actual use. It was not applied. Its legacy `uid` function also has a mutable search path. The security advisor reports that warning and informational no-policy notices on the deliberately private old schemas. Current-build hardening does not alter those objects.

References: [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [search-path advisory](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
