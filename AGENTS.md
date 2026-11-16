# Repository Guidelines

## Current direction and precedence

The Owner’s latest instructions supersede earlier independent-schema/prototype wording: continue this application by reusing and extending the existing US Supabase `padova` foundation in project `unugynfzmxjxifgofxjr` (us-east-1). Preserve `padova_staging`, source evidence, provenance, review/audit history and existing test schemas. Never create a duplicate schema/project or reinstall the installed adapter. Migration `20261028191100_padova_existing_schema_adapter` is already installed; marker `20261028_existing_padova_adapter` is authoritative. Continue routine additive implementation and verification autonomously. Stop for destructive/irreversible operations, evidence changes, paid services/material costs, or financially consequential ambiguous business rules. Keep the operational gate locked until independent backup/restore and hosted acceptance are verified.

## Permanent Padova Rules

- Historical files remain read-only evidence. Do not import them into live records. Owner-approved existing US `padova`/`padova_staging` are the permanent database foundation; reuse them safely.
- Financial integrity is critical: exact money, relational constraints, atomic transactions, concurrency protection, and idempotency are required.
- Never destructively delete financial history. Corrections preserve prior values, actor, time, reason, and dated accounting effects.
- Ambiguous historical data belongs in Needs Review. Never guess.
- Read `docs/MASTER_REQUIREMENTS.md` and `docs/BUILD_STATE.md` on resumption. Update BUILD_STATE throughout implementation and before ending a session.
- Test financial workflows before calling them complete. Keep local readiness and production readiness distinct.
- Use professional TypeScript standards, server-side permissions, and no secrets or production traveler data in Git.
- Require individual staff sessions everywhere. Never add a shared login or development authentication bypass. Enforce independent permissions on server reads/writes and retain actual-user attribution.
- Use only Supabase `unugynfzmxjxifgofxjr` (US Private Trial, us-east-1). No duplicate schema/project or test-schema deletion. The existing adapter is installed; never reinstall it. Routine additive work is authorized; stop for destructive/evidence/cost/financial-policy decisions. See `docs/PADOVA_ADAPTER.md`.

## Project Structure & Module Organization

`src/app/` contains interface/API; `src/components/` shared UI; `src/lib/` storage/Auth adapters, financial commands, permissions and queries. `db/padova/` contains reviewed existing-schema extensions; numbered `db/` migrations serve the original local fixture only. `tests/` holds integration scenarios, `scripts/` setup/recovery tools, and `docs/` project memory. `.data/` is ignored runtime data.

## Build, Test, and Development Commands

Use Node.js 24 and `npm ci`. Run `npm run db:migrate`, `npm run db:seed`, then `npm run dev` for synthetic local development. Verify with `npm test`, `npm run typecheck`, `npm run build`, and `npm run test:http`. Use `npm run format` / `npm run format:check` for Prettier. Stop the local server before persistent database scripts.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, descriptive domain names, and server-only financial mutations. Keep source channel, product, funding, and revenue independent. Money uses integer cents; quantities use whole units. Formatting is defined in `.prettierrc.json`.

## Testing Guidelines

Node test runner + tsx executes `tests/*.test.ts` against isolated PostgreSQL instances. Verify economics, allocations, balances, cost basis, journal reconciliation, dated movements, audit history, retries, and failure paths. Add regression coverage for financial fixes. No numerical coverage threshold is configured.

## Commit & Pull Request Guidelines

Use focused imperative commits. Pull requests explain behavior, validation, relevant issues, and setup/migration steps. Include screenshots for interface changes.

## Security & Configuration

Never commit secrets, credentials, or local environment files. Provide placeholder values in an example configuration file when needed, and ignore generated output and local dependencies.
