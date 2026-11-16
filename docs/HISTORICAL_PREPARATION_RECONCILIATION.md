# Historical preparation reconciliation — 29 October 2026

Existing US project: `unugynfzmxjxifgofxjr`, `us-east-1`. Original sources, `padova_staging` evidence, prior review/audit history and test schemas remain unchanged. No historical financial cutover was performed.

| Exclusive source-row category                                      |      Rows |
| ------------------------------------------------------------------ | --------: |
| Prepared identifiable booking row                                  |       501 |
| Linked duplicate/supporting row                                    |       999 |
| Needs Review: unsafe/missing identity or unclassified relationship |     1,378 |
| Preserved header/formula/supporting row                            |     1,231 |
| **Total captured populated source rows**                           | **4,109** |
| Intentionally discarded/excluded                                   |     **0** |

The first two categories map **1,500 source rows to 501 prepared booking targets**. All 1,500 unchanged, uniquely matched existing evidence links are **accepted** in the existing `padova_staging.migration_mappings` table. Three initially proposed supporting links were conservatively moved to Needs Review after the relational guard exposed their ambiguous target; no ambiguous target was inserted and the failed batch rolled back.

**2,878 rows carry unresolved financial review**. This is an overlapping dimension, not an additional population to add to 4,109. Explicit source sale/cost claims are staged, not posted. Blank/unparseable costs remain Unknown, rather than zero or unpaid. Ambiguous dates, parties and references retain their complete original source context. No guessed receipts, allocations, assets, costs or profits were created.

## Durable records and exact preservation

- `padova.historical_booking_preparations`: 501 immutable operational preparation records, with `financial_postings_authorized=false` enforced by a constraint.
- `padova.historical_source_preparations`: all 4,109 complete original captured source rows, losslessly compressed, with SHA-256, original capture provenance, source fingerprints, facts, classification and review rationale.
- Existing mapping table: 1,500 accepted links to these preparation targets; actual administrative operator `postgres` is retained in rationale/preparation metadata, without impersonating a staff actor.
- Runtime has SELECT only on preparation tables; browser roles have no table access. Fresh individual Owner authorization is required by every application historical read; Employee reads are denied.

Readback with the dedicated `padova_backup` login in a repeatable-read **READ ONLY** transaction verified every payload, field, provenance value, fingerprint, classification and prepared fact against the private capture. Live bookings, asset movements and journal lines remain zero. Original 37,071 evidence records, 947 review cases, original audit records and operational settings retain their preflight hashes.

Private working artifacts are under `.data/historical-cutover/prepared-bookings/`. They contain actual source data and must never enter Git. Public non-secret installed/checksum/count proof is `db/padova/historical-preparation-summary.json`.

## Idempotency

The same private preparation input replays with zero new target IDs. All **186 identical generated SQL batches** were then executed a second time against the same US project. Counts remain 501 targets / 4,109 sources / 1,500 accepted mappings; new bookings, source rows and mappings are zero. No duplicate customers, travelers, receipts, assets or financial movements were created. Complete remote payload verification was repeated after replay.

## Controlled next step

These are useful reviewable historical preparations, not live financial bookings. Continue record-specific review without blocking the mapped population. After Owner acceptance, refresh the live source delta and control any adoption/financial posting separately. Never reinstall the original adapter or either frozen new migration, rewrite source evidence, or infer a payment from a historical Paid label.
