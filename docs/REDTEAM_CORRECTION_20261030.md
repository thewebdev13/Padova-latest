# Surgical red-team correction — 30 October 2026

Scope: the Owner's confirmed findings against `bf95f6b`, in the existing checkout and Practice fixture. No accounting redesign or migrations.

## Corrections

1. Quick Paste normalizes exact payment statuses. Paid/Yes, Unpaid/No and Partial are explicit; every other value remains unresolved with a warning and zero automatic receipt. Unpaid clears prior received amounts. Partial requires an actual amount. Paid remains an editable proposal before explicit Save.
2. Funding permission is enforced independently before tax-generated postings and inside the component posting function. Padova expense/outflow and seller-owed taxes cannot bypass `manage_funding` through empty normal components. Employee tax options exclude Padova; Customer, seller-borne and Included metadata create no Padova spend.
3. Manual and paste product changes share one transition function. Product-aware serialization emits only relevant fields/references. Domain validation rejects forged incompatible details/references and one-way return dates, including legacy itinerary claims. Other retains the required description rule.
4. Operational redaction recognizes spaces, hyphens and periods, with Luhn validation and explicit card-label protection. Input sanitation, API responses, directory/search output and CSV use the same protection. State error logging serializes a sanitized message rather than raw database parameters. Structured 13-digit ticket fields work; immutable restricted provenance is unchanged.
5. New Booking starts with zero funding components. Employee serialization omits unauthorized financial fields; forged funding still fails. Missing financial information remains pending for authorized completion.

P2/P3: unlabelled/repeated paste text is retained in Needs Review; points, miles, voucher, travel credit, certificate and complete booking map explicitly; unsupported Bought values remain unresolved; One Way plus Return produces a contradiction warning. Actual seller amounts determine status: $650 obligation/$50 paid is Partial/$600 due, even after initially choosing Paid. Small secondary controls, details padding and section spacing were tightened; four-column layout retained.

## Verification

Focused tests in `tests/redteam-booking.test.ts` plus `tests/entry-options.test.ts` cover all 12 requested proofs: exact Unpaid/no receipt or allocation/full balance, atomic Employee tax rejection, ordinary Employee save, shared manual/paste transitions, one-way normalization and server rejection, all three synthetic card separators, preserved typed ticket references and provenance, actual partial seller settlement, unparsed text, certificate mapping and contradictory dates. Generated synthetic payment candidates are never printed in assertions or reports. The focused set passes **14/14**.

Full regression, restricted-adapter accounting, adapter/authentication, importer replay, optimized review build, typecheck, formatting and HTTP/security acceptance are recorded in the current `docs/BUILD_STATE.md`. Private test logs are ignored under `.data/redteam-*.txt`.

## Actual Practice browser acceptance

All sessions used the existing individual credentials and normal sign-in form. No shared login, permission escalation or authentication bypass.

| Proof                        | Actual result                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Employee New Booking         | Demo Product Worker saved **PDV-1599**, Flight, no funding/taxes/charges/receipts; actual-user attribution retained.                                                                     |
| PDV-1566 regression          | Owner pasted Unpaid and saved **PDV-1600**: $925 charged, $0 paid, $925 due. Safe DB readback: no customer receipt payload, allocations, funding or seller obligations.                  |
| Manual product transition    | Populated flight/ticket fields; Flight → Hotel → Flight returned empty flight/ticket inputs.                                                                                             |
| PDV-1567 regression          | Populated flight/ticket fields, pasted Hotel and saved **PDV-1601**. Safe readback confirms no flight-only details; Hotel dates and King room retained.                                  |
| Review warnings              | Preview visibly retained Unparsed / Needs Review, unresolved “not paid” and One Way/Return contradiction. No return control/value was applied.                                           |
| Certificate + seller balance | Preview selected Certificate / Award; $650 cost/$50 paid showed Partial and $600 due. Choosing Paid then editing actual paid to $50 restored Partial. Preview discarded without posting. |

Private screenshots: `.data/redteam-employee-saved.jpg`, `.data/redteam-unpaid-saved.jpg`, `.data/redteam-hotel-saved.jpg`, `.data/redteam-partial-preview.jpg`. Safe DB proof: `.data/redteam-browser-db-proof.json`.

## Evidence retention and boundaries

**PDV-1566/1567 retained.** PDV-1566 has a charge, payment allocation, four journal lines and audit history. PDV-1567 has travel, two references and audit history. Deleting either would remove required evidence; no destructive cleanup or speculative financial correction was performed. Automated regressions now preserve their failure modes independently.

The existing synthetic 14-event Practice importer plan replays with **0 new events**, unchanged hashes/counts across 18 economic/evidence tables. No original source spreadsheet, restricted provenance, US project/schema/settings or installed migration was changed. No US migration, production cutover or fresh-source reconciliation was performed. Existing production readiness gates remain separate.
