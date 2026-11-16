# Padova V1 master acceptance

30 October 2026. Product acceptance uses the current branch, existing Practice and existing isolated remote QA. Production deployment and financial cutover are separate controlled steps.

## System and normal entry

Customer/company and traveler IDs link to a booking, its versioned travel, booking method and optional reusable source profile. Travel provider, outside seller, payment account and inventory owner remain independent. Seller purchases create exact obligations; actual payments settle those obligations. Owned value consumes original lots. Customer charges and receipts retain many-to-many allocations underneath the short entry form. All changes retain individual actor, date, command and audit history.

Normal entry: select customer/travelers → product, itinerary and dates → Booked Through → relevant payment/value → customer price and payment status → Save. Optional travel fields, taxes, component details and commission receipts are contextual or collapsed. Unknown optional information creates attention rather than fictional money. Reservation Summary and Booking Notes remain separate, initially two lines, and expand as typed. Save stays in the footer.

Profiles store safe nickname/provider/holder/identifier/status/notes, independently from the paying card. A Capital One request has its own stable ID and append-only updates. Pending/Approved never generate assets or realized benefit. Received creates one account-linked credit with face value and basis; later use consumes that basis without recognizing benefit again. Other profiles cannot use it. Conversion retains its profile; transfers to a different or unlinked pool are rejected. Original booking cost, actual net cost and expected net cost remain distinct.

Percentage pricing stores comparable price, basis-point discount and authoritative final customer price; nearest-cent half-up rounding is explicit. Only staff authorized to change customer charges can override. Point rates use exact integer arithmetic and default to cents per point; fractional-cent quotes require an agreed fixed cost. Commission percentages use the final customer sale before additional charges; fractional cents require exact fixed dollars. Existing commission accrual accounting is preserved; receipts never recognize revenue twice. Current profit includes received commission only, alongside the separately labeled expected final profit.

## Requirements matrix

PASS means an existing usable workflow was retained and verified. FIXED means completed or corrected in this pass. Evidence combines the actual browser cases below with financial, adapter, security and import tests.

Result: **16 PASS / 16 FIXED / 5 INTENTIONALLY DEFERRED**. No remaining product P0/P1 blocker was found in this acceptance scope.

| #   | Requirement                                                                            | Result                 |
| --- | -------------------------------------------------------------------------------------- | ---------------------- |
| 1   | One connected customer/traveler/travel/funding/payment/asset model                     | PASS                   |
| 2   | Existing US foundation, source evidence and approved mappings retained                 | PASS                   |
| 3   | Individual sessions, eligibility, tax authorization and independent server permissions | PASS                   |
| 4   | Dense desktop entry, compact optional actions and accessible Save                      | FIXED                  |
| 5   | Separate two-line expanding summary and notes                                          | FIXED                  |
| 6   | Direct-click traveler results without repeated Use buttons                             | FIXED                  |
| 7   | Multiple travelers, inline creation, duplicate warnings and prior matching retained    | PASS                   |
| 8   | One Way departure only; Round Trip departure/return                                    | PASS                   |
| 9   | Conditional Multi-City segments, date validation, saved display and versioned editing  | FIXED                  |
| 10  | Independent airline PNR, source confirmation and optional ticket/flight fields         | PASS                   |
| 11  | Searchable, operationally extensible booking methods                                   | PASS                   |
| 12  | Contextual GDS/Amex/Capital One/Award confirmation labels                              | FIXED                  |
| 13  | Reusable source account/profile IDs, inline creation and later audited linking         | FIXED                  |
| 14  | Multiple account-specific Capital One requests with all five requested statuses        | FIXED                  |
| 15  | Separate expected and actual net cost; expected credits create no value                | FIXED                  |
| 16  | Received account credit, remaining balance, future use, basis and replay protection    | FIXED                  |
| 17  | Inherited award program with explicit exceptional program selection                    | FIXED                  |
| 18  | Default cents-per-point calculation and clearly labeled Total Purchase Cost            | FIXED                  |
| 19  | Purchased/original quantity versus actual redeemed quantity preserved when different   | PASS                   |
| 20  | Contextual outside seller booking/points/voucher/certificate and mixed funding         | PASS                   |
| 21  | Explicit tax bearer and account; no duplicate cost                                     | PASS                   |
| 22  | Manual customer price remains authoritative                                            | PASS                   |
| 23  | Percentage-off comparable pricing, savings and authorized override                     | FIXED                  |
| 24  | Fixed/percentage hotel commission calculator and clear calculation basis               | FIXED                  |
| 25  | Expected/received commission, outstanding balance and separate current profit          | FIXED                  |
| 26  | Simple Paid/Partial/Unpaid receipts and balances over existing allocations             | PASS                   |
| 27  | Asset ownership, quantity, original basis, expiry and use history                      | PASS                   |
| 28  | Deterministic reviewed Quick Paste without automatic posting                           | PASS                   |
| 29  | Copy AI Instructions and Copy Example, usable with outside AI                          | FIXED                  |
| 30  | Automatic credit/commission, balance, missing-cost, refund and expiry attention        | FIXED                  |
| 31  | Existing staging, owner decisions, traveler and Chase/payment matching retained        | PASS                   |
| 32  | Exact money, atomic commands, concurrent-use protection and idempotent importer        | PASS                   |
| 33  | Integrated AI parsing/API                                                              | INTENTIONALLY DEFERRED |
| 34  | New external supplier/issuer integrations                                              | INTENTIONALLY DEFERRED |
| 35  | Independent permanent production hosting and hosted production acceptance              | INTENTIONALLY DEFERRED |
| 36  | Secure attachment storage and branded document generation                              | INTENTIONALLY DEFERRED |
| 37  | Fresh-source reconciliation, real historical financial posting and cutover             | INTENTIONALLY DEFERRED |

## Browser acceptance

All 19 requested cases were exercised through the real individually signed-in Practice UI. Cases share records where appropriate; none are real financial transactions.

| Requested case                                     | Browser evidence                                                                                                                              |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Round-trip card flight                          | PDV-1665: $300 sale / $200 eligible saved-card cost / $100 margin; existing traveler selected directly                                        |
| 2. One-way                                         | PDV-1666: departure only; inline traveler saved, optional missing cost remains Unknown                                                        |
| 3. Multi-City                                      | PDV-1731: JFK–ATL / ATL–LAX, Feb 1–3; second segment revised to Feb 4 with both versions retained                                             |
| 4. Amex BP outside seller                          | PDV-1699: $500 sale / $400 seller obligation                                                                                                  |
| 5. Delta seller miles                              | PDV-1698: inherited Delta, 13,000 × 1.30¢ = $169, $300 sale, no owned inventory                                                               |
| 6. Owned award                                     | PDV-1736: 13,000 owned AAdvantage points consume $91 basis; $400 sale; no new seller obligation                                               |
| 7–8. Capital One profile and multiple requests     | PDV-1732: QA Sam Venture X • 1234; $790.60 original cost, requests $197.92 and $30; first received, actual net $592.68 / expected net $562.68 |
| Additional credit reuse                            | PDV-1737: $100 credit used with its same profile; $100 basis, no second benefit; $97.92 remains                                               |
| 9–10. Seller voucher and certificate               | PDV-1700 / PDV-1701: $250 / $100 obligations; no points-rate or automatic inventory creation                                                  |
| 11. Customer card                                  | PDV-1735: $500 paid directly to provider, $0 Padova spend and $0 customer charge                                                              |
| 12. Fixed commission                               | PDV-1733: $1,000 sale / $900 cost; $100 expected, $0 received                                                                                 |
| 13, 15. Percentage commission and discount pricing | PDV-1734: $2,000 − 8% = $1,840, savings $160; $1,600 cost; 10% commission $184 expected / $50 actually received; customer paid in full        |
| 14. Manual price                                   | Round-trip, Delta, Amex, voucher and certificate cases above                                                                                  |
| 16. Quick Paste                                    | One-way, seller and hotel cases populated and explicitly saved after review                                                                   |
| 17. Copy AI workflow                               | Both copy buttons verified against the browser clipboard; example uses supported labels and Unknown stays unknown                             |
| 18–19. Inline and direct-select traveler           | PDV-1666 new QA Master Inline Traveler; PDV-1665 existing QA Final Traveler direct click                                                      |

Visual verification: 1440×900 desktop and 390×844 mobile. Default entry is 631px high and fits without internal scrolling; a basic funded entry is 741px against a 666px body, requiring 75px of internal scrolling. Mobile document width is 375px with a 355px dialog, no horizontal overflow and Save visible. Screenshots: ignored `.data/master-new-booking-desktop.png` and `.data/master-new-booking-mobile.png`. The 30-second objective remains a human speed target, not a measured staff-performance claim.

## Verification and boundaries

Verification: **179/179 full regressions**, **115/115 restricted-adapter accounting cases**, and the final **5/5 focused V1 financial/privacy checks in both stores**. Individual authentication/permissions and isolated HTTP/security acceptance passed. Optimized Practice and remote QA builds, TypeScript and configured formatting passed. Existing synthetic importer replay: **14 replayed / 0 created**, identical hashes/counts across **20 tables**. Private logs use `.data/master-*.log`. Earlier migration qualification and browser date-input failures were fixed and rerun; they are not accepted exceptions.

Local 018 adds only source profiles and immutable asset/profile links, after private hashed backups. Prepared US `20261030125035_v1_source_profiles.sql` depends on the existing installed adapter and the earlier prepared booking-entry extensions; it is **not installed**. No installed migration was regenerated. No source spreadsheet, staging decision, prior review, US setting/gate or production financial record was changed. The existing 135 ambiguous traveler holds remain reviewable. No owner decision must be repeated.

The remaining deferred items are controlled post-product work, not permission to post ambiguous historical money. This document freezes V1 product scope; real-data adoption requires fresh-source reconciliation and explicit cutover approval.
