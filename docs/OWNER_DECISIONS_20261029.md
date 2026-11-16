Continue immediately. Do NOT stop for the four OWNER_QUESTIONS. Use the following decisions and finish the implementation pass.

1. CUSTOMER-OWNED CREDIT
   Customer-owned credit is NOT a Padova-owned asset.
   Track it as customer-owned/external value.
   It may be used as a fulfillment/funding component, but:

- do not add it to Padova inventory
- do not count its face value as Padova revenue
- do not count its use as Padova cost
- preserve owner = customer
- track original amount/value
- amount used
- remaining value
- issuer/program
- restrictions/expiry where known
- linked booking(s)
  If Padova merely holds/manages it for the customer, ownership still remains with the customer.

2. REVERSAL OF ALREADY-SPENT REWARDS
   Never rewrite or delete the original reward/rebate transaction.
   Create a new reversal movement linked to the original movement.
   If the reward has already been spent and the reversal causes the Padova rewards account/inventory to go negative, allow the operational balance to show the negative position and create an attention item / obligation requiring resolution.
   Do NOT change the old booking history to make it appear the reward never happened.
   If the reward belonged to an outside supplier rather than Padova, do NOT create a Padova inventory reversal unless Padova is contractually responsible for the loss.
3. CANCELED-BOOKING REFERRAL OBLIGATIONS
   Default referral rule:
   Referral is earned based on realized Padova economics, not merely because a booking was originally created.
   If a booking cancels/refunds before the referral is earned:

- cancel/reduce the unpaid referral obligation accordingly.
  If referral is defined as payable only after commission is received:
- it is not due until the commission is actually received.
  If referral was already paid and the underlying booking economics later reverse:
- do NOT delete the historical payment
- create a referral adjustment/recovery record
- preserve complete history.
  Make referral rules configurable per referral relationship where necessary, but use this as the default.

4. DEPLOYMENT / CUTOVER
   Deployment and final historical cutover must NOT block completion of the product.
   For now:

- continue using the existing current Padova repo
- continue using the existing US Supabase project
- finish the application
- finish tests
- finish migration mapping/reconciliation preparation
- do NOT create another Supabase project
- do NOT perform destructive historical cutover
- do NOT make uncertain historical financial postings live merely to call the project complete
  Prepare the application so deployment/cutover is a final controlled step after Owner acceptance.
  Do all safe migration preparation NOW.
  Continue from the current BUILD_STATE.
  Do NOT re-audit or redesign.
  Complete in this order:

1. Finish Travel Component editing.
   I must be able to open an existing booking and:

- edit flight/hotel/travel information
- add another travel component
- remove/cancel a component appropriately
- update PNR/confirmation
- update dates
- update travelers
- update provider
- preserve audit history
  Do not require rebuilding the booking.

2. Finish full Fulfillment Component editing.
   For an existing booking I must be able to:

- add fulfillment component
- edit fulfillment component
- remove/reverse component safely
- change source/broker
- change program
- change instrument
- enter/edit quantity
- enter/edit rate
- enter/edit supplier price
- enter/edit taxes/fees
- enter/edit account holder
- enter/edit booking channel
- record payment/balance
- use Add New / Other / Unknown
- add mixed fulfillment components

3. Finish OUTSIDE POINTS entry completely.
   It must support:

- Program
- Source/Broker
- Account Holder
- Points/Miles Quantity
- Quoted Rate
- Rate Unit
- Fixed Supplier Price
- Taxes/Fees
- Transaction Mechanism
- Booked Through
- Provider
- Confirmation
- PNR/Ticket
- Amount Paid Source
- Amount Owed Source
- Settlement Status
- Notes
  External supplier points must NOT become Padova inventory unless Padova actually acquired ownership.

4. Finish PORTAL REWARDS entry completely.
   Include working flows for:
   Amex Business Platinum Pay With Points
   and
   Chase Points Boost
   using the established requirements.
   Use progressive disclosure.
   Do not show portal-specific fields on ordinary bookings.
5. Finish certificate/voucher/credit editing.
   Existing assets must be usable directly from booking entry.
   Allow inline creation when needed.
   Correctly maintain:

- quantity/value
- cost basis
- remaining quantity/value
- remaining basis
- expiry
- ownership
- source
- movements

6. Finish the TWO product-review passes already referenced in BUILD_STATE.
   PASS A:
   Owner workflow review.
   Test the actual system as someone running Padova.
   PASS B:
   Employee simplicity review.
   Test whether a normal employee can create/manage an ordinary booking without understanding the accounting engine.
   FIX issues found.
   Do not merely document them.
   0 imported is NOT a completed migration.
   You correctly avoided unsafe financial posting, but now finish everything that can safely be prepared/imported without guessing.
   You already reproduced all 4,109 source rows.
   Now:
1. Complete source-to-Padova mapping logic.
1. Resolve mappings automatically where evidence is high confidence.
1. Preserve ambiguous mappings in Needs Review.
1. Create historical Booking mappings for every high-confidence identifiable booking.
1. Map/match high-confidence:

- customers
- travelers
- companies
- travel dates
- routes
- properties
- airlines
- hotels
- PNRs
- confirmations
- passenger counts
- booking notes
- source references
- customer sale where clear
- known Capital One data
- other unambiguous operational data

6. Financial data that is not safe to post must remain staged/reviewable.
   Do NOT fabricate payments/costs.
7. Blank cost remains unknown, not zero.
8. Preserve EVERY meaningful original populated source field.
9. Finish the migration-mapping table.
   Current: 947 reviews 0 accepted mappings
   That is not the desired final state.
   Automatically accept high-confidence mappings.
   Only genuine ambiguity should remain in Needs Review.
10. Perform idempotency test.
    A second identical migration run must create:
    0 duplicate bookings 0 duplicate customers 0 duplicate travelers 0 duplicate receipts 0 duplicate assets 0 duplicate financial movements.
11. Produce migration reconciliation.
    Show:

- total 4,109 source rows
- mapped
- high-confidence imported/prepared
- ambiguous review
- duplicates/linked supporting rows
- intentionally excluded
- unresolved financial records
  The numbers must reconcile to the source population.
  The four Owner questions above are now resolved.
  Continue implementation.
  Only stop for:
- destructive real-data action
- credential only Owner can provide
- material paid cost
- a NEW ambiguity that materially changes money/ownership/cost basis/profit
  If one record is ambiguous:
  Needs Review that record.
  Continue the rest.
  Before saying this pass is finished, personally verify in the browser that I can:

1. Create a normal cash booking.
2. Edit that booking afterward.
3. Add/change travel components.
4. Add/change fulfillment components.
5. Create an outside broker booking.
6. Create an outside points booking.
7. Create a Padova points booking.
8. Add/use a voucher.
9. Add/use a certificate.
10. Create mixed funding.
11. Add New / Other / Unknown inline.
12. Record customer receipt and allocation.
13. Record source obligation/payment.
14. Cancel/change a component.
15. See correct balances/cost/profit.
16. Find the booking in search/calendar.
17. View historical source detail.
18. See migrated/staged historical records and review cases correctly.
    Fix failures rather than merely reporting them.
    Continue now from the current committed state.
    Do NOT restart architecture.
    Do NOT wait for another Owner response.
    FINISH THE CURRENT IMPLEMENTATION PASS.
