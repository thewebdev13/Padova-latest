CONTINUE THE EXISTING PADOVA SYSTEM BUILD.
This is NOT a new project and NOT a rebuild.
Use the current:

- repository
- branch
- database
- Supabase project
- migrations
- code
- tests
- imported/staging data
- documentation
- authentication
- permissions
- audit system
- migration work already completed
  First inspect the CURRENT repository state and BUILD_STATE only enough to know what is already implemented.
  Do not redo completed working functionality.
  Do not spend substantial time planning.
  Do not write another architecture report.
  EXECUTE this plan from the first unfinished applicable step onward.
  The repository and its documentation are the source of continuity. Do not depend on the previous Codex conversation.
  The business requirements are already decided.
  Your job is now IMPLEMENTATION.
  The system should be sophisticated underneath but extremely simple for employees to use.
  Build in this order:

1. Correct core data model
2. New Booking workflow
3. Booking Detail workflow
4. Fulfillment/acquisition model
5. Points, vouchers, credits, certificates, brokers
6. Customer and supplier payments
7. Profit/accounting calculations
8. Historical migration
9. Lists/dashboard/search
10. Permissions/testing/mobile
11. Documentation
    Do NOT prioritize right now:

- AI assistant
- client portal
- integrated email
- public booking engine
- elaborate analytics
- decorative animations
- optional future features
  Get the core Padova operating system working first.
  \==================================================

1. CORE MODEL ==================================================
   Every booking follows:
   BOOKING
   → one or more TRAVEL COMPONENTS
   → each Travel Component can have one or more FULFILLMENT COMPONENTS.
   This is the core architecture.
   Do NOT create completely different booking architectures for:

- Cash Booking
- Points Booking
- Voucher Booking
- Certificate Booking
- Capital One Booking
- Amex Booking
  Those are different fulfillment/acquisition methods inside the same booking architecture.
  Booking is the customer/commercial container.
  Support:
- Booking ID
- Customer / Billed To
- Company if applicable
- Travelers / Guests
- Booking owner/employee
- Created date
- Booking date
- Overall booking status
- Customer-facing notes
- Internal notes
- Next action
- Follow-up date
- Customer charges
- Customer payments
- Customer balance
- Padova direct cost
- Current profit
- Attention status
- Source provenance
- Activity/audit history
  Do not put every airline/hotel field directly on Booking.
  Those belong to Travel Components.
  One Booking can contain multiple Travel Components.
  Initial types:
- Flight
- Hotel
- Car Rental
- Transfer / Tour
- Other
  Keep type extensible.
  FLIGHT COMPONENT:
- traveler(s)
- origin
- destination
- departure date/time
- arrival date/time
- flight number
- marketing carrier
- operating carrier
- cabin
- PNR
- ticket number
- confirmation
- status
- fare/restriction notes
  HOTEL COMPONENT:
- property
- brand
- guest(s)
- check-in
- check-out
- room type
- confirmation
- status
- benefits
- cancellation/restriction notes
  Do not make every optional field mandatory.
  This answers:
  HOW DID PADOVA OBTAIN OR FUND THIS TRAVEL?
  One Travel Component can have ONE OR MANY Fulfillment Components.
  Initial categories:

1. Cash / Card
2. Outside Supplier / Broker
3. Padova-Owned Points / Miles
4. Outside-Source Points / Miles
5. Voucher / Travel Credit / Gift Card
6. Certificate / Award / Benefit
7. Portal Rewards Mechanism
8. Existing Padova Credit
9. Mixed
10. Other / Custom
    These should be configurable.
    Tomorrow additional methods should be addable WITHOUT redesigning the database.
    Do NOT use one generic Supplier field for everything.
    A booking may involve:
    TRAVEL PROVIDER
    Who actually provides the travel.
    Example: United Lufthansa Hilton hotel
    BOOKED THROUGH
    Where the reservation was actually created.
    Example: United.com Aeroplan Amex Travel Capital One Travel GDS OTA another agency
    PROGRAM / ISSUER
    Example: Membership Rewards Aeroplan World of Hyatt Hilton Honors
    SOURCE / BROKER / PURCHASED FROM
    The person/company supplying value to Padova.
    ACCOUNT / CERTIFICATE HOLDER
    Whose account or certificate was used.
    PAYEE
    Who Padova actually paid money to.
    These may all be different.
    Reuse the existing directory/entity architecture where possible.
    A single person/company may have multiple roles:

- Customer
- Traveler
- Company
- Provider
- Agency
- Broker
- Points supplier
- Certificate seller
- Voucher seller
- Account holder
- Payee
- Referrer
- Commission payer
- Collecting agency
  Do not unnecessarily duplicate one person because they have several roles.
  IMPORTANT USABILITY RULE.
  Anywhere the system asks for a person/company/source/program/etc., I must never be blocked because the option is not already in the dropdown.
  Relevant selectors should allow:
- Search existing
- Select existing
- Add New / Other
- Unknown where appropriate
  This applies to:
- Customer
- Traveler
- Company
- Provider
- Broker / Source
- Purchased From
- Points Supplier
- Certificate Holder
- Voucher Seller
- Account Holder
- Payee
- Booking Agent
- Program
- Instrument
- Referrer
- Commission Payer
- Booking Channel
- other relevant counterparties
  ADD NEW / OTHER should allow a lightweight inline record.
  Minimum required:
- Name / Label
  Optional:
- Person or Company
- Phone
- Email
- WhatsApp/contact
- Notes
- Program/type
  Do NOT force creation of a full supplier profile before continuing.
  UNKNOWN must mean:
  "We know an outside source exists, but its identity is not currently known."
  Unknown is different from blank.
  Unknown is different from Direct Airline.
  A custom entity created inline should become searchable/reusable afterward.
  If a very similar existing name exists, warn about a possible duplicate.
  Create/reuse an extensible Program catalog.
  Examples:
- Amex Membership Rewards
- Chase Ultimate Rewards
- Capital One Miles
- Citi ThankYou
- Bilt
- Aeroplan
- United MileagePlus
- American AAdvantage
- Hilton Honors
- Marriott Bonvoy
- World of Hyatt
- Other
  This list is NOT exhaustive.
  Allow adding programs through configuration/data rather than schema changes.
  Create/reuse configurable Instrument definitions.
  Families:
  MONETARY VALUE
- Voucher
- Travel Credit
- Airline Credit
- Hotel Credit
- Gift Card
  POINTS / MILES
- Bank Points
- Airline Miles
- Hotel Points
  CERTIFICATES / BENEFITS
- Free Night Certificate
- Guest of Honor-type Award
- Upgrade Award
- Suite Upgrade
- Companion Certificate
- Discount Certificate
- Other Certificate
  PORTAL / REWARD MECHANISMS
- Amex Pay With Points
- Chase Points Boost
- Other Portal Mechanism
  OTHER / CUSTOM
  Different instrument definitions may specify:
- unit type
- quantity required?
- monetary face value applicable?
- expiry applicable?
- partial use?
- account/holder relevant?
- inventory relevant?
- externally supplied?
- Padova-owned?
- custom/dynamic fields
  Do NOT create a new physical database schema every time a new certificate/program appears.
  Do not force everything to use dollars.
  Examples:
  Voucher: $1,000 face value.
  Points: 100,000 points.
  Certificate: 1 certificate.
  A certificate may have NO legitimate dollar face value.
  Support:
- unit type
- quantity
- monetary face value if applicable
- acquisition cost
- remaining quantity/value
- remaining cost basis
  Fields as applicable:
- Provider
- Booked Through
- Payee
- Amount
- Payment Date
- Payment Method / Account Label
- Transaction Reference
- Status
  Example:
  Provider: United
  Booked Through: United Direct
  Padova Paid: $900
  Use when an outside source agrees to provide the travel/award for a fixed amount.
  Track:
- Source / Broker
- What they are supplying
- Program if relevant
- Account holder if relevant
- Agreed Padova cost
- Taxes/fees paid separately
- Amount paid source
- Balance owed source
- Payment status
- Confirmation/reference
- Raw quote/notes
  Example:
  Travel Provider: Lufthansa
  Booked Through: Aeroplan
  Source: Broker X
  Padova owes Broker X: $850
  Taxes: $82
  Total Padova direct cost: $932
  Customer price: $1,300
  Do NOT create Padova Aeroplan inventory if Broker X owns the points.
  Track:
- Program
- Padova account/profile
- Quantity
- Inventory lot(s)
- Cost basis consumed
- Booking channel
- Taxes/fees
- Transfer required?
- Status
  Points must come from actual Padova inventory if Padova owns them.
  Each points/miles acquisition lot stores:
- Program
- Account/profile
- Source/seller
- Acquisition date
- Original quantity
- Acquisition cost
- Unit acquisition rate
- Fees
- Remaining quantity
- Remaining cost basis
- Restrictions
- Expiry if applicable
- Status
- Notes
  Do not merge lots and lose provenance.
  Use established FIFO logic unless existing documentation specifies another approved method.
  Never overwrite inventory balances.
  Use movements/events.
  Examples:
- Purchase
- Acquisition
- Transfer Out
- Transfer In
- Bonus
- Redemption
- Rebate
- Refund / Redeposit
- Sale
- Conversion
- Adjustment
- Expiration
  Balances derive from movement history.
  Use when outside party owns the points.
  Track:
- Program
- Source / Broker
- Account holder if known
- Quantity if known
- Rate if applicable
- Rate unit
- Fixed supplier amount if applicable
- Taxes/fees
- Transaction mechanism
- Booked Through
- Confirmation
- Settlement status
  Do NOT create Padova inventory unless ownership actually transfers to Padova.
  Never store an unexplained number like:
  1.365
  Store:
- Quantity
- Rate
- Rate Unit
- Currency
- Calculated Total
  Possible rate units:
- cents per point
- dollars per 1,000
- percentage of face
- fixed total
- dollars per certificate
- other
  Track:
- Instrument type
- Issuer/program
- Holder
- Source / Purchased From
- Original face/usable value
- Padova acquisition cost
- Acquisition percentage if relevant
- Acquired date
- Expiry
- Restrictions
- Amount used
- Basis consumed
- Remaining face/value
- Remaining basis
  Example:
  Voucher Face: $1,000
  Padova paid: $800
  Use: $500 face
  Do NOT automatically make booking cost $500.
  Allocate the correct economic cost basis.
  Track:
- Program
- Certificate Type
- Holder/Account
- Source / Purchased From
- Padova-Owned or Outside-Supplied
- Acquisition Cost
- Quantity
- Acquired Date
- Expiry
- Restrictions
- Linked Booking
- Role in Booking
- Status
  ROLE:
  A. Base Travel / Stay Instrument
  or
  B. Ancillary Benefit / Upgrade
  This distinction is critical.
  A Guest-of-Honor-type award may enhance a reservation without paying for the underlying hotel stay.
  Do not require fake face values.
  Support program-specific fields dynamically.
  AMEX BUSINESS PLATINUM PAY WITH POINTS
  Track:
- Portal
- Selected Airline
- Gross Points Redeemed
- Expected Rebate %
- Expected Rebate Points
- Actual Rebate Points
- Rebate Status
- Rebate Posting Date
- Net Realized Points
- Inventory Owner
- Supplier/Source
- Booking Cash Equivalent
- Padova Settlement Cost
- Customer Sale
  External supplier case:
  If an outside supplier owns the points, the supplier's rebate belongs to the supplier.
  Padova cost is the amount Padova owes the supplier.
  Padova must NOT count supplier internal economics as Padova profit.
  Padova-owned case:
  Record gross redemption first.
  Record rebate later as its own movement.
  Example:
  -574,000 points redemption +200,900 rebate
  Do NOT simply record -373,100 initially.
  CHASE POINTS BOOST
  Track:
- Card/program
- Portal
- Actual redemption rate
- Actual points charged
- Cash portion
- Portal price
- Comparable external price
- Owner/source
- Padova cost
- Customer sale
  Do not assume all Chase redemptions have one fixed value.
  Track:
- Source Program
- Source Account
- Destination Program
- Destination Account
- Quantity Out
- Transfer Ratio
- Transfer Bonus
- Quantity In
- Transfer Fee
- Requested Date
- Completed Date
- Status
- Confirmation
- Cost Basis transferred
  Statuses:
- Requested
- Pending
- Completed
- Failed
- Cancelled
  Only completed transfer movements affect settled destination inventory.
  Support Expected vs Actual.
  Examples:
- points rebate
- points redeposit
- commission
- refund
- price-match credit
- supplier reimbursement
- referral payment
  Store:
- expected amount/quantity
- actual amount/quantity
- expected date
- actual date
- status
- variance
- linked booking/asset
  Expected does NOT equal settled.
  Separate:
- Travel Sale
- Booking / Service Fee
- Change Fee
- Fare Difference
- Other Charge
  Do not classify every additional customer charge as a booking fee.
  KEEP the many-to-many architecture.
  One actual customer receipt exists ONCE.
  One receipt may fund several bookings.
  One booking may receive several receipts.
  Receipt stores:
- Payer
- Date
- Method
- Amount
- Reference
- Notes
- Unallocated Amount
  Payment methods include:
- Zelle
- ACH
- Check
- Card
- Wire
- Other
  Do not manufacture duplicate payments.
  Separate:
  OBLIGATION
  from
  PAYMENT.
  One supplier/broker payment may cover several obligations.
  One obligation can receive multiple payments.
  This applies to:
- airline/provider
- agency
- broker
- points seller
- voucher seller
- certificate seller
- other source
  Track:
- Payee/source
- Amount owed
- Amount paid
- Remaining balance
- Payment method
- Payment date
- Reference
- Linked transaction(s)
- Status
  Padova profit uses PADOVA'S economics.
  Do not use an outside supplier's point acquisition cost as Padova's cost.
  Conceptually:
  relevant referral obligations
  Do not double-count asset value.
  Example:
  Customer pays Padova: $4,900
  Padova pays supplier: $4,400
  Supplier underlying points cost: $3,731
  PADOVA PROFIT:
  $500
  NOT:
  $1,169
  Supplier underlying cost can be stored for analysis if known.
  It must NEVER automatically affect Padova accounting.
  Every Padova-owned asset must preserve its chain.
  Example:
  Acquisition → Inventory → Movement → Booking use → Conversion → Refund/Sale → Remaining value → Remaining basis
  Do not double-recognize economic value.
  Example:
  Capital One booking generates a credit.
  Later that credit is used.
  That later use is not a second new profit event.
  Use existing established Padova rules.
  Example:
  Original Rate: 790.60
  Card: 612.52
  Existing Credit Used: 178.08
  Final/New Rate: 592.68
  New Credit Generated: 197.92
  Rules:
  Existing credit used is real funding.
  New Rate generally means final confirmed cost.
  New generated credit is Padova-owned value.
  When reused later, do not recognize it twice.
  Track:
- price-match attempt
- pending/approved/denied
- original price
- final/new rate
- existing credit used
- new credit created
- confirmation
- resulting asset
- later asset use
  The employee workflow must be extremely simple.
  Do NOT expose the full accounting engine initially.
  Use a guided flow.
  STEP 1
  CUSTOMER & TRAVELERS
- Customer / Billed To
- Search existing
- Add New / Other
  Travelers / Guests
- Search existing
- Add New
  Company optional.
  STEP 2
  TRAVEL DETAILS
  Choose:
- Flight
- Hotel
- Other
  Then show only relevant fields.
  STEP 3
  CUSTOMER SALE
- Customer Price
- Optional fees/additional charges
  Payment may be added now or later.
  STEP 4
  HOW PADOVA GOT / PAID FOR THIS
  Show simple choices:
- Cash / Card
- Outside Source / Broker
- Padova Points
- Outside Points
- Voucher / Credit
- Certificate / Award
- Portal Rewards
- Mixed
- Other
  Only reveal relevant fields after the user chooses.
  If Mixed:
- Add Fulfillment Component
  STEP 5
  Review and Save.
  Do not make staff leave the booking form unnecessarily.
  From the booking form allow:
- Add Customer
- Add Traveler
- Add Source/Broker
- Add Program
- Add Instrument
- Acquire/Add Points Lot
- Add Voucher
- Add Certificate
- Add Cash Fee
- Add another Fulfillment Component
  Then continue the same booking.
  Top summary should immediately show:
- Customer
- Travelers
- Travel
- Status
- PNR / Confirmation
- Customer Sale
- Customer Paid
- Customer Balance
- Padova Cost
- Profit if user has permission
- Attention items
  Then tabs/sections:

1. Travel
2. Fulfillment
3. Customer Payments
4. Source / Provider Payments
5. Rewards / Assets
6. Commissions
7. Changes / Refunds
8. Tasks / Notes
9. Documents
10. Activity
11. Historical Source
    Do not show every field at once.
    Make complex bookings understandable in plain English.
    Example:
    Travel: Lufthansa Business Class
    Booked Through: Aeroplan
    Fulfilled Using: 70,000 Aeroplan points from Broker X
    Padova owes Broker X: $850
    Taxes: $82
    Total Padova Cost: $932
    Customer Sale: $1,300
    Anyone viewing the booking should understand what happened without reading database tables.
    Useful default columns:

- Booking
- Customer
- Traveler
- Travel
- Dates
- PNR
- Status
- Sale
- Balance
- Attention
  Owner-sensitive optional fields:
- Cost
- Profit
  Search by:
- Customer
- Traveler
- PNR
- Confirmation
- Route
- Hotel
- Provider
- Source
  Show:
- Contact information
- Travelers/family
- Company relationship
- Open Balance
- Upcoming bookings
- Past bookings
- Payments
- Credits where relevant
- Notes/tasks
- Activity
  Keep UI clean.
  Create/use a searchable operational directory for outside sources.
  Show:
- Name
- Contact
- Roles
- Programs/instruments supplied
- Amount owed
- Recent transactions
- Open fulfillment
- Notes
  Do not confuse this with airline/hotel travel providers.
  One operational area with filters:
- Points
- Miles
- Vouchers
- Credits
- Gift Cards
- Certificates
- Other
  Show:
- Program
- Type
- Account/Holder
- Source
- Available Quantity/Value
- Cost Basis
- Expiry
- Status
- Pending movements
  Sensitive basis can be permission-controlled.
  Automatically surface:
- Customer balance due
- Provider/source amount due
- Unallocated receipt
- Missing cost
- Missing sale
- Pending rebate
- Pending transfer
- Pending refund
- Pending points redeposit
- Commission overdue
- Referral due
- Expiring asset
- Missing ticket/confirmation
- Migration ambiguity
  Historical spreadsheets remain READ ONLY.
  Never modify:
- 2026 Accounting
- PM accounting 2026
- backups
- old AI workbook
- other source files
  Use them only as evidence/source.
  STEP 1
  Read current source sheets.
  STEP 2
  Create a migration snapshot/batch.
  Preserve:
- source workbook
- tab
- row
- populated values
- fingerprint
- batch ID
  STEP 3
  Import/match directory records:
- customers
- travelers
- companies
- employees
- providers
- airlines
- hotels
- known sources/brokers
- known programs
  Use existing dedup/grouping decisions.
  STEP 4
  Create historical Booking records.
  Import all high-confidence identity/travel details:
- Customer
- Traveler
- Company
- Route
- Property
- Travel Dates
- PNR
- Additional PNR
- Confirmations
- Passenger Count
- Airlines
- Hotels
- Booking Notes
- Status
- References
- Other meaningful fields
  STEP 5
  Attach ALL meaningful source information.
  Anything that does not yet have the correct structured destination must still be preserved under:
  Historical Source Details
  or equivalent structured evidence.
  Do NOT discard it.
  STEP 6
  Import clear Customer Sale values.
  Keep online/reference price separate.
  STEP 7
  Import VERIFIED customer receipts.
  Old AI allocations are evidence only and are not automatically real payment proof.
  Use:
  ONE REAL RECEIPT + ALLOCATIONS.
  STEP 8
  Import confirmed Padova costs where meaning is clear.
  Established rule:
  PM "New Rate" generally means final confirmed cost.
  Blank cost remains NULL.
  Blank cost is NOT zero.
  STEP 9
  Import clear:
- Capital One
- vouchers/credits
- refunds
- commissions
- supplier/source payments
  when their meaning is sufficiently established.
  STEP 10
  For unresolved points/certificate/voucher/source cases:
  DO NOT omit the entire booking.
  Import all certain booking/travel/sale facts.
  Preserve all raw financial/acquisition evidence.
  Mark unresolved portion:
  Financial/Fulfillment Classification Pending
  or Needs Review.
  STEP 11
  Create migration mappings for live records.
  STEP 12
  Rerun importer/dry run.
  Verify that it does NOT duplicate records.
  Every meaningful populated source field must be:

1. Mapped into a structured Padova field
2. Preserved under Historical Source Details
3. Put into Needs Review
4. Explicitly excluded with documented reason
   ZERO silent data loss.
   Do not only import the handful of fields someone manually listed.
   Inspect the actual source schema.
   Preserve readable source evidence.
   For each historical booking retain access to:

- Workbook
- Tab
- Original Row
- Original populated fields
- Original notes
- Supporting PM row where matched
- source evidence references
  If structured information is extracted from a note:
  KEEP THE ORIGINAL NOTE TOO.
  Blank cost: NULL
  NOT: $0
  Unknown source: Unknown
  NOT: Direct Airline
  Unknown booking channel: Unknown
  NOT: Direct Airline
  Blank payment: Unknown/not established
  Do not make convenient assumptions.
  If a booking is 80% clear and 20% ambiguous:
  Import the clear 80%.
  Preserve the ambiguous 20%.
  Flag only the ambiguous portion.
  Do not omit the full booking.
  The existing spreadsheets are still actively being used.
  Migration must support later comparison:
- NEW
- CHANGED
- UNCHANGED
- REMOVED/CLEARED
- NEEDS REVIEW
  Do not duplicate previously imported unchanged records.
  Do not silently rewrite history.
  Maintain:
  Current booking economics
  AND
  the period when adjustments occurred.
  Example:
  October expected profit: +$200
  December correction: -$80
  Current booking profit: $120
  December movement: -$80
  Track where available:
- Booking
- Provider
- Commission payer
- Gross commission / %
- Expected amount
- Collecting agency
- Retained %
- Padova expected net
- Expected date
- Actual amount
- Actual date
- Status
- allocation/remittance where applicable
  Expected is not received.
  Track:
- Referrer
- Booking
- Rule
- Amount / %
- Trigger
- Expected obligation
- Payment status
- Payment date
  Some referral payments may only become due after commission is received.
  Support that relationship.
  Track booking changes separately.
  Support:
- Original booking
- Change event
- Fare difference
- Supplier fee
- Padova fee
- Additional cost
- Additional customer charge
- resulting credit/refund
- itinerary version
  Fare Difference is NOT automatically Booking Fee.
  Keep provider/source refund separate from customer refund.
  Possible returned value:
- Cash
- Card refund
- Airline credit
- Voucher
- Points
- Miles
- Certificate
- Customer credit
- Padova asset
  Track destination/owner.
  If Padova-owned points return:
  return them through inventory movement.
  If outside supplier's points return:
  do NOT create Padova inventory.
  Keep existing permissions.
  Employees may need operational information without seeing:
- Cost basis
- Broker margin
- Total company profit
- sensitive financial details
  Owner can see everything.
  Do not weaken authorization to make development easier.
  Do NOT store:
- Loyalty passwords
- Bank passwords
- Credit card login credentials
- Full credit card numbers
- Other secrets
  Use labels/references.
  For Supabase changes:
- preserve RLS/security
- use current documented practices
- do not expose service-role secrets
- verify changes with tests/advisors where appropriate
  Do NOT create hundreds of theoretical tests before basic workflows work.
  Make these first 12 end-to-end scenarios pass.
  TEST 1
  Normal direct cash airline booking.
  TEST 2
  Normal cash hotel booking.
  TEST 3
  Fixed-price outside broker award booking.
  TEST 4
  Padova-owned points booking.
  TEST 5
  Outside-source points booking.
  TEST 6
  Purchased voucher with partial use.
  TEST 7
  Purchased certificate used for hotel.
  TEST 8
  Certificate used only as an ancillary benefit.
  TEST 9
  Amex Business Platinum Padova-owned points redemption:
  gross redemption → pending rebate → posted rebate.
  TEST 10
  Capital One:
  Original: 790.60
  Card: 612.52
  Existing Credit: 178.08
  Final/New Rate: 592.68
  New Credit: 197.92
  TEST 11
  One customer receipt allocated across several bookings.
  TEST 12
  Mixed funding:
  card + Padova credit + voucher/points
  For each test verify:
- Customer balance
- Source/provider balance
- Inventory
- Cost basis
- Padova direct cost
- Padova profit
- Audit/activity history
  Then run broader regression tests.
  DO NOT:
- redesign the entire project
- create another repository
- create another Supabase project
- create a parallel accounting system
- spend hours writing architectural essays
- repeatedly re-audit established requirements
- polish animations/colors before workflows work
- build AI/email/client portal now
- ask me whether you should continue
- ask me routine programming questions
  Work in SMALL EXECUTABLE BATCHES.
  For each batch:

1. Inspect only what is necessary.
2. Implement.
3. Run relevant tests.
4. Fix failures.
5. Commit logical work.
6. Immediately continue.
   Do not stop after each batch for Owner approval.
   BATCH 1
   Map existing code/schema to:

- Booking
- Travel Component
- Fulfillment Component
- Party/Source
- Program
- Instrument
- Inventory
- Customer Payments
- Source Payments
  Do NOT produce a long report.
  Move directly to implementation.
  BATCH 2
  Add/modify the MINIMUM schema required for the model above.
  Reuse existing structures where sensible.
  Do not create unnecessary duplicate tables.
  BATCH 3
  Build the complete New Booking workflow.
  BATCH 4
  Build the complete Booking Detail workflow.
  BATCH 5
  Build/reuse:
- Programs
- Instruments
- Sources/Brokers
- Assets/Inventory
  BATCH 6
  Implement:
- Padova Points
- Outside Points
- Voucher/Credit
- Certificate
- Portal Rewards
- Mixed fulfillment
  BATCH 7
  Verify:
- Customer charges
- Receipts
- Receipt allocations
- Source obligations
- Source payments
- Cost
- Profit
- Asset basis
  BATCH 8
  Run the 12 required end-to-end tests.
  FIX failures.
  Do not just report failures.
  BATCH 9
  Run comprehensive historical migration using the rules above.
  BATCH 10
  Run:
- migration mapping check
- duplicate check
- idempotency check
- reconciliation
  BATCH 11
  Make these practical and clean:
- Bookings
- Customers
- Travelers
- Companies
- Sources
- Rewards/Assets
- Things Needing Attention
  BATCH 12
  Verify Owner vs Employee permissions.
  BATCH 13
  Verify desktop and mobile core workflows.
  BATCH 14
  Update durable repository documentation.
  Commit.
  Only stop for:

1. A destructive action involving real/historical data.
2. A credential/login/verification only I can provide.
3. A material new paid cost.
4. A genuine business ambiguity where the choice materially changes:
   - Money
   - Ownership
   - Cost basis
   - Profit
   - Customer balance
   - Source/provider balance
     If one booking/record is ambiguous:
     mark it Needs Review.
     Continue everything else.
     Do NOT stop the whole build.
     Collect unresolved business questions into ONE consolidated list.
     This implementation pass is DONE when:

- Simple cash booking can be entered quickly.
- Hotel booking works.
- Broker-supplied booking works.
- Padova-owned points booking works.
- Outside-source points booking works.
- Voucher/credit works.
- Certificate works.
- Mixed fulfillment works.
- Add New / Other works everywhere relevant.
- Unknown works where relevant.
- Customer payment allocations work.
- Source obligations/payments work.
- Inventory retains quantities and basis.
- Points movements work.
- Credits/vouchers preserve face and basis.
- Certificates do not require fake dollar values.
- Padova profit uses Padova economics.
- Supplier internal economics do not distort Padova profit.
- Capital One credit chain works.
- Pending rebates/transfers/refunds work.
- Booking detail explains the transaction clearly.
- Employee workflow is simple.
- Historical bookings are substantially populated.
- Meaningful historical information is preserved.
- Migration can be rerun without duplicates.
- Permissions work.
- Core tests pass.
- Additional programs/instruments can be added tomorrow without another database redesign.
  Do NOT return another long architecture essay.
  When the implementation pass is complete, give me only:

1. WHAT IS NOW WORKING
2. HISTORICAL MIGRATION COUNTS
   - bookings
   - customers
   - travelers
   - companies
   - receipts
   - costs
   - assets
   - review cases
   - migration mappings
3. TEST RESULTS
   - passed
   - failed
   - anything still being fixed
4. GENUINE BLOCKERS
5. ONE CONSOLIDATED LIST OF DECISIONS NEEDED FROM ME
6. EXACT RECOMMENDED NEXT STEP
   BUILD IT NOW.
   DO NOT RE-DESIGN IT.
   DO NOT WAIT FOR ROUTINE APPROVAL.
   EXECUTE THE PLAN.
