# Production extension installation — 2 November 2026

The Owner explicitly required a separate production-safe migration, preserving the earlier QA-only artifact unchanged. Official Supabase CLI created `supabase/migrations/20261102124456_production_entry_extensions.sql`; SHA256 `24076930ee08404d8e4574f7b2e7f3d2c54af9461f2ad5a9df3be9004284ca75`. It contains only the accepted application's nullable Unknown basis, immutable supplier-allocation corrections and Direct Airline/Provider catalogs. Commission Payable was already installed and was not reinstalled.

Production preflight refuses the QA environment marker, missing accepted prerequisites, an existing extension, unlocked gates and missing native immutable-history protection. The QA migration remains byte-identical at SHA256 `48815d5527747d510a4775b0c8867065f12a8d5eb416f43a7764f3af3e318127`. No QA data, historical events, adapter reinstall or gate activation is included.

Fresh production backup `4d1906df-fddb-4e44-84c8-721bc7261c2c`, SHA256 `bc4af499f8fe14931179635f60709372b16900abd0e82061f45df5ff45992586`, independently restored 118 tables and two Auth users. The exact new SQL passed on that fresh loopback restore with all original table values preserved, private grants verified and a simulated QA target rejected. The encrypted archive was uploaded to the established private Owner-only backup folder; key custody remains separate.

The separate migration was then applied successfully to `unugynfzmxjxifgofxjr` through Supabase migration tooling. Verification found the accepted marker, the private correction table with RLS, backup-reader access and all five nullable basis columns. Zero parties/bookings/financial corrections were added. Both gates remained false.

A subsequent read-only live comparison matched all 118 original table hashes/counts, excluding only the newly inserted marker and two catalog entries. The existing financial/staging evidence, mappings, users and decisions are unchanged.

Post-change archive `2f861f0e-2d8b-46f0-86cc-b505d15254f2`, SHA256 `5dd0c59e82028e69748c4756783e815c09bf78358e8cb9c1416a297a537794f1`, independently restored 119 tables and both Auth users, all values matched, restored entry disabled. Its encrypted copy is also in the existing private backup folder. Managed-platform configuration/account recovery remains separately preserved in the established Recovery Kit.

Rollback must preserve additive history and nullable Unknown values. Redeploy the accepted application or apply a reviewed forward correction; do not drop financial tables, convert Unknown to zero, or overwrite later real bookings with an old whole-database snapshot. Hosted acceptance and historical posting remain separate gates.
