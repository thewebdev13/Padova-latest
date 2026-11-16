# Padova project review — 5 November 2026

Owner requested whole-project verification, then compact transaction rows with payment signals and normal historical detail screens. Daily entry, $0 hosting, separate QA/production, source evidence and prior decisions are preserved. This report distinguishes verified application behavior from incomplete historical reconciliation.

## Confirmed findings and work

| Area | Finding | Current result |
| --- | --- | --- |
| Historical booking coverage | Identical complete main/PM entries get different preparation IDs because source workbook/tab is part of identity, causing false conflicts. | Conservative cross-workbook copy matching yields 41 candidates, retains accepted identities, and passes restored-production replay/rollback. Five upcoming trips corroborated with native mail; one airline overlap warning retained. None posted. |
| Next 30 days | Matching list silently capped at five and missed return/later-leg travel. | Cap removed, chronological next travel dates including explicit returns and later segments; cancellations and Unknown returns excluded. Live application fix; missing historical candidates remain separate. |
| Historical record editing | Read-only source dump provides no correction action. | Normal trip/sale fields, editable facts, append-only actor/reason history and collapsed Original records. Exact cents/Unknown, approximate dates, stale fingerprints and retries preserved. Synthetic save/reopen and 390px browser checks pass. Actual reported production trip opens correctly. |
| Transactions list | 21 held records dominate above real transactions and look like the whole population. | 489 posted bookings shown separately from 21 collapsed held records; one compact row per booking/sale, customer/seller payment flags and existing authorized follow-up queues. Unknown is Review, never Paid. Desktop/mobile verified. |
| Initial workspace load | Financial projections run serially for every booking. | Bounded groups of five preserve calculations; live financial fingerprint matches. Authenticated production snapshot still took 59.1 seconds. Initial loading remains a performance limitation; do not call it fast or fully resolved. |
| Financial behavior | Verify new transactions, commissions, refunds, credits, assets, history and permissions. | Clean full rerun 262/262, restricted-adapter 147/147, HTTP/security and 12 hosted QA workflow groups pass. Additional presentation/correction tests and native-schema corrections pass. No financial production writes. |
| Historical financial completion | Held sale and other unsupported evidence are not completed financial transactions. | Existing facts and receipts preserved; no invented basis/date/settlement or duplicate posting. Import readiness remains separate from daily entry. |

## Verification and recovery

Encrypted archive d67e3f6f independently restores 141 tables and four Auth users exactly. Managed-platform recovery remains in the separate Recovery Kit. Prior live deployments and checksums remain rollback options. Live readback verifies production project unugynfzmxjxifgofxjr, 489 bookings, 90 payments, 21 held drafts, unchanged financial projections and daily gate enabled. Existing QA stays isolated. The narrow @vercel/functions 3.10.6 patch removes the transitive Zod advisory; npm production audit reports zero vulnerabilities. No schema migration or financial import occurred.

An initial full-suite attempt hit a native V8 JIT crash, without a failed business assertion. Isolated fulfillment rerun passed 22/22 and the subsequent complete run passed 262/262. Final presentation follow-ups have focused tests, typecheck and hosted builds. Do not describe the earlier full suite as having run after every later presentation-only edit.

Private proofs, source-only manifests, screenshots, logs and importer rehearsal are under `.data/upcoming-review/`. The final source-price fallback is application 74ef30a; deployment acceptance is recorded in BUILD_STATE after live confirmation.

## Remaining work and limits

41 recovered historical candidates pass exact restored-production rehearsal (90 events, zero creates on replay, rollback/change protection and Unknown preservation, no payment/journal/sale changes), but have not been registered or posted to production. Historical balances, asset bases, payment allocations and settlement evidence remain partial. Missing dates and contradictory source notes are not silently resolved by the presentation layer. A recorded price/cost is clearly distinct from a confirmed posted balance. No new end-to-end browser booking-speed measurement was completed in this pass; do not claim the 30–60 second standard was proven.

Do not turn a green test suite into a claim that all historical source data has been reconciled or posted. Record actual results and remaining blockers here as work completes.
