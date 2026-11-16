# V1 product pass — archived working checklist

Started 29 October 2026, Asia/Jerusalem. Owner authorized two autonomous end-to-end passes. Only the existing local acceptance workspace (`localhost:3003`, `.data/owner-acceptance`) receives practice data. Real US ledger, staging and historical evidence remain untouched. Existing grouping confirmations remain authoritative.

Current requested pass: **completed**. See [IMPLEMENTATION_PASS_20261029.md](IMPLEMENTATION_PASS_20261029.md) for the verified 18-scenario Owner matrix, Employee pass and final test results. The checklist and checkpoints below are preserved historical working notes; their pending statuses and old gap reports are superseded by that dated result. Production deployment and future capabilities retain their separate boundaries.

| Area                              | Pass 1 browser | Defects / verification                                                 | Pass 2  |
| --------------------------------- | -------------- | ---------------------------------------------------------------------- | ------- |
| Dashboard, attention, calendar    | pending        | defaults, dates, navigation, mobile, financial visibility              | pending |
| People, travelers, families       | pending        | canonical groups, structured details, editing, protected fields        | pending |
| Companies, employees, suppliers   | pending        | canonical parties/relationships, statements, large selectors           | pending |
| Booking/create/edit/search        | pending        | products/channels, multi-PNR/traveler, drafts, status, back/cancel     | pending |
| Customer payments/allocations     | pending        | grouped/partial/third-party, correction, over-allocation               | pending |
| Supplier funding/payments         | pending        | obligations, allocations, cash/card, accounts, exact units             | pending |
| Credits/assets/points/Capital One | pending        | FIFO, acquisition/use/return/sale/transfer/expiry, no duplicate gain   | pending |
| Commissions/collectors/referrals  | pending        | expected vs received, grouped receipt, payout conditions               | pending |
| Cancellation/refund/change        | pending        | components, noncash forms, partial traveler, dated corrections         | pending |
| Tasks/attention                   | pending        | links, assignees, status, follow-up, resolution history                | pending |
| Reports/accounting/profit/history | pending        | customer statements, month movements, cash vs profit, audit            | pending |
| Users/permissions/recovery        | pending        | Owner/Employee, revocation, setup/reset/codes, no leaks                | pending |
| Desktop/mobile/accessibility      | pending        | each major form, focus, scrolling, selectors, feedback                 | pending |
| Historical migration preparation  | pending        | read-only reconciliation/provenance/delta/idempotency; no live posting | pending |
| Production readiness              | pending        | deployment/recovery/security checklist; no paid or external activation | pending |

## Defects

- P22: combined travel required leaving New Booking and could not atomically assign funding to specific travel. Added repeatable explicit travel rows and required funding assignments, independent providers/sources/channels/dates/PNRs, envelope dates and original snapshot. Direct entry into a component date initially cleared on rerender; corrected using the working date input pattern and rebuilt browser save passed (`PDV-1201`, $1,500 sale/$1,250 cost/$250 profit). Fixed-price outside-source cost is entered once. Independent travel-row editing after save remains a gap; originals remain immutable. Full backend and restricted adapter regressions pass.

- P17: component dates/status were not authoritative in calendar/upcoming views. Added shared date-window matching with legacy fallback, no synthetic travel in gaps, no canceled-component fallback, and matching product filters in day detail. Browser: `PDV-1135` canceled hotel absent under Hotel on December 1; active flight remains under Flight. Regression tests pass.
- P18: initial simple booking funding was not linked to an initial travel component. New single-product UI now requests atomic travel/funding links, retaining existing command compatibility and immutable original rows. Browser `PDV-1168`: inline hotel provider creation retained all draft fields; $500 sale/$400 card cost/$500 Wire receipt yields $100 profit, zero customer due and $400 supplier due; one travel and linked fulfillment appear immediately.
- P19: new catalog choices needed a page change, and refreshed instrument metadata initially came back with blank unit/default Core role. Nested Program → Instrument → Fulfillment creation now preserves draft fields; returned metadata supplies unit/role directly. Rebuilt browser retest passes: new certificate selected, `count` units, `Ancillary` role, parent booking/travel intact. Ancillary-only acquisition retains its actual role/basis and cannot imply a funded base stay; regression passes.
- P20: payee/holder/provider and catalog selectors lacked inline creation. Added scoped inline creation, possible-duplicate-name warning, nested catalog support, and initial-funding payee/asset creation. Sources & Brokers reuses the existing canonical party directory. Initial-funding additions still need their browser pass on the latest build.
- P21: explicit Unknown outside source could otherwise inherit a direct airline's payable. Unknown identity is preserved in itinerary/component metadata; both funding paths require an actual payee instead of silently borrowing the provider. No invented unknown financial party or $0 cost is posted.

- P01: inline creation / periodic state refresh could steal focus from a selector. Removed focus-restoration on callback/busy changes; restore only on dialog unmount. Browser retest on latest build pending.
- P02: booking lacked structured itinerary, acquisition-source selector and atomic mixed initial funding. Implemented using existing model/JSON and posting helpers; A/B/C/D/E/F/G/H/L browser paths exercised. Latest simple entry and one-save customer-receipt addition need browser rerun.
- P03: missing cost showed sale as profit. Now **all API/read paths**, including legacy payloads without a cost flag, treat absent funding as unknown unless zero supplier cost was explicitly confirmed. Pending cost defers recognition. Add funding can explicitly confirm completeness; partial cost stays pending. Earlier commission-only tests now explicitly declare no supplier expense, and missing-cost allocation/cancellation tests correctly expect unknown profit. 58 adapter financial/workflow cases pass.
- P04: fare difference, supplier change fee and Padova fee were not composable during booking revision. Implemented separate postings under one versioned/audited change; browser L and prior-period/replay assertions pass.
- P05: credit conversion needed an explicit same-basis path. Added Padova-only Convert Asset, linked source lots/command and no new gain/payable. Test passes; latest browser path pending. Customer-owned responsibility policy remains separate.
- P06: commission receipt workflow required leaving the commission screen. Added atomic receipt/remittance allocation and direct action; multi-commission/counterparty/replay tests pass; browser pending.
- P07: unpaid cancellation needed a charge reduction separate from cash refund due. Added explicit reduction and supplier payable-credit form; no invented cash/payment/assets; guard counterparty/cost/remaining obligation. Test passes; browser pending.
- P08: saved traveler documents/memberships were append-only in the form and duplicate entries could be added. Added protected existing-row editing and duplicate-key preservation; browser retest pending.
- P09: supplier directory was hidden under a person filter, context creation used the wrong default, and Flight + Hotel lacked list/calendar filters. Added direct Suppliers, contextual creation and filters. Latest mobile menu shade and simplified entry need browser pass.
- P10: corporate purchasing Tier and Comfort Level were collapsed into notes. New master clarification resolves the old code uncertainty; separate default/employee fields added without automatic money/cabin thresholds. Server validation and relationship dedup/audit test pass; browser pending.
- P11: historical fields could have been cherry-picked. Full current 18-tab working capture and complete row/field payloads now preserved privately; 194 columns/831 staging field paths classified with zero exclusions. Owner-only expandable source UI and immutable preservation through ordinary edit implemented; browser/permission retest pending.
- P12: task edit/reopen omitted its hidden task ID despite passing engine tests. Fixed and browser-tested Done → Open, preserving links/notes/assignee/priority with actual-user history.
- P13: refund basis incorrectly inherited the referral's `profit` default. Removed unrelated defaults; points restored correctly in browser. Fixed points-vs-dollar labels and added supplier return forms to the display.
- P14: mobile topbar overflowed horizontally at 390px. Flexible search and tighter control spacing added; rebuilt browser retest confirms no horizontal overflow. Mobile menu keeps a visible TEST label.
- P15: signed-out synthetic login lost its TEST identity. Runtime server flag preserves the TEST marker/title across login/recovery and avoids shared-build environment confusion; rebuilt signed-out browser retest passes.
- P16: calendar navigation changed the reporting month. Separated calendar/report state; all-date trial balance labeled explicitly and CSV exports use USD with safe numeric/formula handling.

## Browser cases already exercised in this pass

- Inline certificate retest: configured count instrument; cancel preserves parent component/quantity/reference; Save acquires two owned certificates/$180 and returns with the new asset selected, count 1 and reference intact. Parent save consumes one/$90 basis and produces $278 mixed-trip profit. Unknown hotel cost kept profit pending first. Found/fixed missing certificate kind and required duplicate issuer typing; rebuilt retest succeeds. Current-build HTTP security acceptance passes. Next checks include component PNR/search/calendar aggregation and partial component cancellation; two full passes remain unfinished.

- Expanded fulfillment browser check: Settings → synthetic program/instrument creation succeeds. `PDV-1135` contains a distinct United travel component and Taylor acquisition source. 70,000 outside-source points at $850 agreed cost plus $82 cash taxes produces $1,300 sale / $932 cost / $368 profit with no owned inventory. Partial first cost remains unknown until confirmed. Cash entry asks for the cost once. Latest per-component completeness/link/no-cost and inline-certificate changes require the next rebuilt browser pass.

- A: synthetic Casey/Jordan inline create; `PDV-1035`, United / Direct Airline, two PNRs, ticket/flight fields, $1,000 sale, $800 actual supplier card, $200 profit, Zelle $1,000 → zero customer balance.
- L: same booking +$100 fare, +$25 supplier fee, $50 Padova fee within $175 customer total → sale $1,175, cost $925, profit $250; original and revised itinerary retained.
- B/C: `PDV-1036`, Capital One / United separately, voucher bought face $1,000 / cost $800; use $500 → funding cost $400, remaining face $500 / basis $400.
- F: `PDV-1037`, card $612.52 + existing full-basis credit $178.08; generated $197.92 full-basis credit, profit $197.92; overview shows net economic cost $592.68.
- D/E: card $100 + voucher $100 face/$80 basis + reuse earned $197.92 credit; sale $500 → cost $377.92 / profit $122.08, not another earned-credit benefit.
- G: acquire 50,000 United points / $600 basis; use 25,000 / $300 basis + $40 cash taxes; sale $500 → profit $160; points use whole units.
- H: one Casey receipt $775, allocations $175 to A and $600 to B, one row and zero unallocated balance. No duplicate receipts.
- J: expected gross $100 / collector retention $10 / net $90 created through UI; actual receipt and referral trigger still need browser execution on new direct-receipt UI.
- Person/traveler/family/company: create/edit, legal name/DOB/seat/loyalty/passport, household head, employee/company link and company rules saved. Subsequent Tier/Level and protected-record editor require retest.

## Stop conditions

Continue routine work. Stop only for a financially consequential unresolved business rule, destructive/irreversible production/evidence change, material cost, required private credential/verification, or materially different undocumented workflows. Preserve unfinished state in BUILD_STATE. Do not call a screen/browser path verified merely because a server test passed.
