# Final implementation pass — 30 October 2026

Existing branch, repository, US foundation and `.data/owner-acceptance` Practice retained. No production migration installation, final source capture, financial cutover, identity merge, evidence edit or gate/settings change.

## Delivered

- Shared explicit eligibility on search, New Booking, travel providers and older booking commands: customer, traveler, airline, property, rental and seller are independent. Generic supplier, hotel brand, platform or issuer never qualifies an airline. Fourteen known Practice references gained subtypes without replacing IDs/history. The loader no longer defaults unsuffixed names to person or promotes rate sources to sellers.
- Accounts require explicit Padova ownership, active status, compatible account type and supported payment methods. Every actual card outflow needs an eligible saved account, including older financial paths. All 13 existing source-labelled Practice accounts were reviewed and retained as ownership Unknown; a separate explicitly synthetic card supports QA. No PAN/CVV metadata.
- Compact four-column desktop entry; one-way/round-trip; conditional products; distinct PNR/source confirmation; simple funding choice; automatic seller/customer balances; exact point rates; optional taxes with no double counting; FIFO owned inventory; seller-owned value stays external. Customer Paid follows totals until manually overridden. Hotel commission dollars/percentage and actual receipts remain independent.
- Compact role-specific inline creation persists independently and selects its new record. Traveler creation needs only name. Quick Paste uses an editable deterministic Field: Value protocol, exact eligible matches, unresolved-match warnings and retained unknown labels. Preview creates no records. Pasted payment claims need explicit review/save and normal validation. No AI integration.
- Exact obligation settlement supports many payments/many obligations, automatic selection only when unambiguous, relational links, immutable history, serialized transactions and a database guard against wrong seller/booking/command and over-allocation. Historical allocations were not guessed/backfilled.
- Owner Attention has append-only source resolution events with locator, evidence ID, issue/proposal, decision/status, destinations, actor and time. Original source cases, preparations, 135 traveler holds and financial flags stay distinct. Party edits cannot overwrite preserved source claims.
- Operational input, state responses and ordinary CSV exports redact likely payment numbers; original restricted evidence/provenance remains intact. Employee party payloads omit source provenance. UUIDs and ordinary airline ticket references survive. No suspected source number was printed or copied into notes.

## Importer boundary

`src/lib/financial-importer.ts` executes reviewed source-event plans through existing commands in one atomic transaction. Stable keys use source system, approved source identity and event role, independently of name, snapshot or amount. Changed accepted payloads fail; corrections require explicit dated correction events. Result references link parties, travelers, bookings, obligations, receipts/allocations, assets/movements, commissions and refunds. Provenance/reviewer decisions commit with commands and actual individual actor attribution.

`scripts/import-reviewed-practice.ts <private-plan.json>` runs an approved event plan only in existing Practice after stopping its server. It does not interpret historical Paid labels or invent unresolved mappings. Plans/results remain private. The Practice entrypoint refuses `padova` storage. The prepared `importReviewedFinancialPlan` production path binds commands to existing `padova_staging.migration_mappings` atomically through two narrowly scoped private functions, without granting runtime staging access. It requires an active individual Owner, the existing backup/operational gate, a separate default-disabled historical authorization, a specifically approved capture no older than 24 hours, and a recorded reconciliation/cutover review. Source changes fail against the accepted SHA256 fingerprint; original evidence/mappings remain untouched. No application command can enable this authorization. **No production migration or authorization was applied. Fresh source delta/reconciliation, final hosted acceptance and explicit Owner cutover approval remain mandatory.**

`scripts/final-practice-replay.ts` posted one synthetic 14-event plan covering parties/traveler, booking/charge, receipts/allocations, seller obligation/payment/allocation, acquisition/use, commission/receipt and refunds. Repeated replay kept complete hashes/counts identical across 18 tables: **zero additional economic events**. A reporting query failed after the initial successful commit; replaying the same keys recovered the report without re-creating events. Proof: ignored `.data/final-practice-replay.json`. Real historical financial claims remain staged; no older capture was adopted as final balances.

## Migrations

- Practice **016_final_entry_integrity**: explicit account metadata, exact allocation links, immutable review decisions.
- Practice **017_obligation_settlement_guard**: database seller/allocation/obligation relationship and total guards.
- Prepared US **20261029225428_final_entry_integrity.sql**: equivalent additive extension in existing `padova`, using existing adapter views/server policies, plus default-disabled financial import authorization and nullable/uniquely indexed event links in the existing staging mapping table. CLI-created file, **not installed**, dependent on the earlier prepared booking-entry extension. No duplicate schema/project or adapter reinstall. Checksum/status: `db/padova/final-entry-summary.json`.
- Private content-hash backups preceded both Practice upgrades. Frozen installed US artifacts, evidence, staging, test schemas and gate/settings were unchanged. The US gate was already enabled after earlier verification; this pass did not toggle it. Historical importer posting is independently disabled.

## Browser acceptance

Normal individual Demo Owner session; synthetic Practice saves only. Amounts are USD.

| Case                                        | Proof                       | Result                                                                        |
| ------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| 1 United round trip / Amex / outside seller | PDV-1498                    | Sale 925, cost/due 700, profit 225                                            |
| 2 Delta one way / award / 50,000 miles      | PDV-1533                    | Seller 650 settled + tax 30; cost 680, customer paid 925, profit 245          |
| 3 Owned points + tax                        | PDV-1534                    | Original basis 600 + tax 30 = 630                                             |
| 4 Outside voucher                           | PDV-1535                    | Face 600, cost/payable 450; no owned inventory                                |
| 5 Owned voucher partial                     | PDV-1536                    | Use 100, original basis 80; unused balance retained                           |
| 6 Outside certificate                       | PDV-1537                    | Count 1, cost 200, paid 50, due 150                                           |
| 7 Normal Padova card                        | PDV-1538                    | Saved card outflow 500; profit 425                                            |
| 8 Customer own card                         | PDV-1539                    | Direct 500; Padova cost 0; separate customer fee 100                          |
| 9 Hotel expected commission                 | PDV-1540                    | Sale 1,000, cost 900, expected 100, received 0                                |
| 10 Other requires description               | PDV-1541                    | Blank invalid; airport transfer costs 50 + 25                                 |
| 11 Inline traveler                          | PDV-1539                    | Independently saved/selected; eligible card owner                             |
| 12 Inline seller                            | PDV-1541                    | Independently saved and selected                                              |
| 13 Partial customer payment                 | PDV-1538                    | Received 300; due 625                                                         |
| 14 Partial seller payment                   | PDV-1537                    | Paid 50; due 150                                                              |
| 15 Exact obligations                        | PDV-1541                    | One payment 60 allocated 50 + 10; due 15                                      |
| 16 Quick Paste                              | Unsaved editable preview    | Supplied format parsed; unresolved identities flagged; unknown label retained |
| 17 Invalid airline                          | Browser + integration tests | Capital One has no eligible airline result; forged IDs rejected server-side   |

Award-to-GDS removed Loyalty Program; Round Trip-to-One Way removed Return Date. Paid followed 925→950→925. Browser QA found a hotel checkout cleared by the flight one-way paste default; the condition was corrected, and PDV-1540 checkout was revised to November 22 through history with unchanged money. No shared login/bypass.

## Validation and remaining gates

Final results are in BUILD_STATE and private `.data/final-*-tests.txt` / `.data/final-build.txt`. The isolated production-binding test proves default denial, current-capture scoping, atomic mapping/financial replay, changed-payload rejection, rollback after late failure, byte-identical source evidence and denial of browser function access/runtime staging reads. Production readiness remains separate: current reviewed source-event plans, final delta/reconciliation, account ownership verification, prepared migration review/application and hosted acceptance/cutover approval remain required. The 135 traveler holds can remain review items and do not block ordinary Practice operations.
