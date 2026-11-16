The current application is missing major pieces of the Padova operating model.
Do not ask me to re-explain these concepts one by one. The business rules have already been worked out. Use this message together with BUSINESS_REFERENCE.md, docs/MASTER_REQUIREMENTS.md, MIGRATION_REVIEW.md, docs/PADOVA_ADAPTER.md, EXISTING_PADOVA_ASSESSMENT.md and the existing source evidence as the implementation contract.
Before asking me to test again, bring the actual application into compliance with this operating model.
A Padova booking is NOT simply:
Customer
- Supplier
- Sale price
- Cost
That is far too simplistic.
Every booking must keep separate:
1. Customer / financially responsible party
2. Travelers
3. Travel product being sold
4. Booking/purchase channel
5. Actual travel supplier
6. Acquisition source / who Padova bought value from
7. Funding components used by Padova
8. Padova cost basis
9. Customer sale price
10. Customer payments
11. Supplier obligations/payments
12. Revenue components
13. Commissions
14. Referral obligations
15. Assets/credits/vouchers created or consumed
16. Changes/cancellations/refunds
17. Profit and later profit adjustments
18. Audit/history
DO NOT collapse these concepts into generic fields.
CUSTOMER / FINANCIALLY RESPONSIBLE PARTY
This means the person or company that owes Padova money.
The financially responsible party is NOT necessarily:
- the traveler
- the person who paid
- the employee
- the supplier
A booking may have:
- one customer responsible for several travelers
- a company responsible for an employee
- multiple customer payments from different people
TRAVELERS
Travelers must be independently searchable.
One customer may have multiple travelers.
A traveler may appear on many bookings.
Travelers should not have to be recreated for every booking.
COMPANIES
Companies must be searchable entities.
Companies may have employees/travelers attached.
Company travel policies may later contain Tier/Level settings.
DIRECTORY SEARCH
Search must:
- search as the user types
- handle partial names
- avoid duplicate choices
- use the approved grouping/consolidation decisions
- preserve historical/raw labels in history without showing bad duplicates as normal selectable choices
The normal New Booking workflow should be easy enough to use every day.
STEP 1 — CUSTOMER
Choose/create the financially responsible customer/company.
STEP 2 — TRAVELERS
Choose one or multiple travelers.
Search existing travelers first.
Allow creation of a new traveler without losing the booking being entered.
STEP 3 — TRAVEL PRODUCT
What is being sold?
Examples:
- Flight
- Hotel
- Flight + Hotel
- Other supported product
This is NOT the same as the booking channel or supplier.
STEP 4 — TRAVEL DETAILS
For flight bookings support, as applicable:
- origin
- destination
- travel dates
- airline
- flight numbers
- PNR(s)
- ticket/confirmation numbers
- multiple travelers
- potentially multiple PNRs
Do not force unrelated information into one free-text notes field.
THESE ARE THREE DIFFERENT THINGS.
BOOKING / PURCHASE CHANNEL
This answers:
“WHERE/HOW DID PADOVA BOOK THIS?”
Examples:
- Direct airline
- Capital One
- GDS
- OTA
- consolidator
- another travel agency
- seller/intermediary
- other configured source
This should normally be a selector/searchable selector.
ACTUAL SUPPLIER
This answers:
“WHO ACTUALLY PROVIDES THE TRAVEL?”
Examples:
- United Airlines
- El Al
- Hilton
- Marriott
Example:
Booking Channel = Capital One Actual Supplier = United Airlines
Those are NOT interchangeable.
ACQUISITION SOURCE
This answers:
“WHO DID PADOVA ACQUIRE THE VALUE FROM?”
This becomes especially important for:
- vouchers
- credits
- points
- discounted tickets
- another agency
- private sellers
- intermediary arrangements
Example:
Actual Supplier = United Airlines Asset Type = United voucher Voucher Seller = John Smith
John Smith is NOT the airline and NOT necessarily the booking channel.
The system needs the amount Padova sold the booking for.
This is separate from:
- supplier cost
- money collected so far
- voucher face value
- cost basis
- commission
- profit
BOOKING SALE
Example:
Customer price = $1,200
That means the customer owes Padova $1,200 unless adjusted.
CUSTOMER BALANCE
Customer balance should be calculated from:
Sale / customer charges minus allocated customer receipts minus valid customer refunds/credits as applicable
Never infer “paid” simply because some payment text exists somewhere.
PAYMENTS MUST BE ENTERED ONCE.
A payment can cover multiple bookings.
A booking can receive multiple payments.
Therefore use:
RECEIPT + RECEIPT ALLOCATIONS
Example:
Customer sends one $5,000 ACH.
It covers: Booking A: $2,000 Booking B: $1,500 Booking C: $1,500
There should be ONE $5,000 receipt.
Then three allocations.
Do NOT create three fake payments.
PAYMENT METHODS
Standard selector should include the approved methods such as:
- Zelle
- ACH
- Check
- card where applicable
- other approved method
If different people pay parts of the same booking, preserve the payer information.
OVERPAYMENT
If customer money exceeds current booking balances, the remaining amount may become customer credit/unallocated value according to the business rules.
It must not disappear.
CUSTOMER SALE and PADOVA COST are separate.
SUPPLIER OBLIGATION
Record what Padova owes for the travel.
SUPPLIER PAYMENT
Record the actual payment Padova made.
SUPPLIER ALLOCATION
One supplier payment may cover multiple obligations.
One obligation may be paid through several funding sources/payments.
Do not treat supplier payment and supplier obligation as identical.
Padova may fund one booking using multiple things simultaneously.
Funding must therefore be COMPOSABLE.
Possible funding components include:
- normal cash/card
- purchased voucher
- Padova-owned voucher
- Padova-owned credit
- points/miles
- Capital One credit
- seller-funded value
- other tracked assets
- mixed combination of the above
Example:
Final booking cost = $900
Funding: $400 card $300 Padova-owned credit $200 voucher
The system must show all three.
Do NOT create one generic “Cost = $900” field and throw away how it was actually funded.
If Padova buys a voucher or credit from someone, track:
- asset type
- program/supplier
- seller/source
- original face value
- amount Padova paid
- percentage of face paid
- cost basis
- date acquired
- restrictions
- expiration
- identifying/account information where appropriate
- amount used
- remaining face value
- remaining carrying/cost basis
EXAMPLE
Padova buys a $1,000 United voucher for $800.
Record:
Supplier/program = United Face value = $1,000 Seller = actual seller Amount paid = $800 Acquisition percentage = 80% Initial cost basis = $800
If $500 face is later used, cost basis must be allocated appropriately.
Do not calculate profit merely because $500 of face value was consumed.
The profit comes from the economics of the booking and asset cost basis.
Credits/vouchers/points belonging to Padova are assets.
Use an asset ledger.
Track:
SOURCE → ACQUISITION → MOVEMENTS → USE / SALE / CONVERSION → REMAINING VALUE
An asset can come from:
- purchasing it
- price match
- cancellation
- booking change
- refund
- returned points
- another transaction
Never create profit twice when an existing Padova asset is reused.
This is a critical real-world workflow.
Example already established:
Original price: $790.60 Card amount: $612.52 Existing credit used: $178.08 Final/new rate: $592.68 New generated credit: $197.92
Interpretation:
ORIGINAL RATE $790.60
FUNDING AT PURCHASE Card: $612.52 Existing Padova credit: $178.08
Those total $790.60.
Then price match/new rate produces:
FINAL CONFIRMED COST $592.68
NEWLY GENERATED PADOVA CREDIT $197.92
The PM “new rate” is generally the final confirmed cost.
The existing $178.08 credit was REAL funding.
The new $197.92 credit is NEW Padova-owned value generated from the transaction.
When that new $197.92 is used later, DO NOT recognize the same economic benefit as new profit again.
Track the chain.
Attempted / pending / approved / denied price matches belong in history.
The final confirmed result belongs on the operational booking.
Sometimes a transaction creates or converts value into a voucher.
Track the relationship:
Original booking → resulting credit → resulting voucher → voucher movements → later booking usage
Conversion of one Padova asset into another Padova asset does NOT by itself create additional profit.
Example:
Booking creates $300 Padova credit.
Later that $300 becomes a voucher.
That is not another $300 of profit.
It is a conversion/movement of the same underlying value.
If Padova sells a voucher/credit, track:
- asset sold
- buyer
- face value transferred
- carrying/cost basis transferred
- sale amount
- gain/loss
Example:
Remaining voucher face = $500 Remaining basis = $400
Padova sells it for $350.
Realized result = $50 loss.
Do not compare only face value to sale amount.
Points require their own economics.
Track:
- program
- account/holder
- acquisition lot
- source/seller
- quantity acquired
- acquisition price
- acquisition rate
- taxes/fees
- transfers
- bonuses
- points used
- points returned
- expiration if relevant
- owned inventory versus access-on-demand
- remaining lot
- cost basis
If several point lots exist, preserve basis allocation/FIFO logic according to the existing implementation rules.
Profit is not merely:
Sale minus one generic cost field.
Revenue/profit can include separate components:
- markup
- service fee
- supplier commission
- rebate
- price-match value
- other approved Padova-owned value
- referral consequences
- asset gains/losses
These components need provenance.
The booking should ultimately show its CURRENT economics clearly.
Track:
- booking
- supplier
- gross commission
- percentage
- expected amount
- payer/source
- collecting agency if one is involved
- retained percentage/amount by collecting agency
- expected Padova net
- expected payment date
- actual amount received
- actual date received
- receipt/allocation
Commission terms should reflect the terms applicable to that booking.
If commission is expected and remains unpaid beyond the configured period, such as approximately 30 days after stay where applicable, create an attention item.
Track referral obligations separately.
Possible fields:
- referrer
- booking
- basis/rule
- amount or percentage
- expected obligation
- payment status
- payment date
Where referral compensation depends on commission being received, do not show it as completed before commission actually arrives.
Do not overwrite the booking and erase what happened.
Preserve history.
For cancellation/refund track separately:
SUPPLIER SIDE
- refund expected
- refund received
- form of refund
- supplier cancellation fee
- voucher/credit generated if applicable
CUSTOMER SIDE
- customer refund due
- customer refund paid
- refund method
- retained Padova booking/service fee if applicable
A supplier credit is NOT automatically the same thing as cash.
If the customer receives/owns a managed credit, preserve:
- owner
- restrictions
- expiry
- remaining balance
Split mixed funding component-by-component.
Changing a flight should not be mislabeled as a new booking fee.
Track separately where applicable:
- original booking
- change event
- fare difference
- supplier fee
- Padova fee
- additional customer charge
- additional supplier cost
- resulting refund/credit
- updated itinerary/version
Preserve the earlier state in history.
A booking has CURRENT economics.
But monthly reporting must also preserve WHEN changes happened.
Example:
October originally shows +$200 profit.
In December new information proves true booking profit should be +$120.
Current booking profit becomes $120.
October historical booking economics are corrected conceptually.
December gets a prior-period adjustment of -$80.
Monthly reporting therefore distinguishes:
- profit from new/current-period bookings
- prior-period adjustments
- net movement
Do not simply rewrite December as if the original booking occurred in December.
The system should proactively surface items such as:
- unpaid customer balances
- overdue supplier obligations
- expected refunds not received
- customer refunds not paid
- commissions overdue
- referral payments due
- unallocated customer receipts
- unallocated supplier payments
- expiring assets
- missing sale price
- missing cost
- unresolved migration records
- accounting discrepancies
- supplier issue
- failed/incomplete workflow
Tasks should support:
- linked record
- assignee
- due date
- priority
- status
- notes
- activity/history
Every material financial or operational action must preserve:
- user
- timestamp
- action
- affected record
- before/after or event details where appropriate
Do not destructively erase financial history.
Use correction/reversal/event patterns where appropriate.
OWNER
Full access including:
- customer sale
- supplier cost
- booking profit
- overall/monthly profit
- asset basis
- accounting
- users
- permissions
- audit
- settings
- backups
EMPLOYEE
Can have operational access but sensitive finance is hidden by default.
Granular permissions should control things such as:
- customer sale price
- supplier cost
- booking profit
- total profit
- asset basis
- accounting reports
- payments
- refunds
- completed-booking edits
- assets
- user management
Do not rely only on hiding buttons in the browser. Enforcement must exist at the appropriate backend/database authorization layer too.
The application should be FAST for a travel agent.
Use selectors/searchable selectors when values already exist.
Examples:
Booking Channel should NOT require deleting “Direct airline” and typing something else.
Supplier should be searchable.
Customer should be searchable.
Traveler should be searchable.
Company should be searchable.
Payment method should be selectable.
Funding type should be selectable.
Asset type should be selectable.
Use “Other — specify” only for genuine exceptions.
Do not force standardized information into notes.
Do not show raw duplicate directory labels as normal choices after a consolidation decision.
Money fields must clearly show currency/unit.
Points fields must clearly show quantity/program rather than pretending they are dollars.
When I open a booking, I should be able to understand without hunting through unrelated screens:
WHO
- customer
- travelers
- company if applicable
WHAT
- travel product
- itinerary
- PNR/confirmation
WHERE IT WAS BOUGHT
- booking/purchase channel
WHO PROVIDES IT
- actual supplier
WHO/WHAT PADOVA ACQUIRED VALUE FROM
- acquisition source if applicable
HOW PADOVA FUNDED IT
- funding components
WHAT PADOVA PAID / COST BASIS
- supplier/final cost
- assets consumed
- cost basis
WHAT CUSTOMER OWES
- sale price
WHAT CUSTOMER PAID
- receipts/allocations
WHAT PADOVA STILL OWES
- supplier balance
WHAT CUSTOMER STILL OWES
- customer balance
WHAT VALUE RESULTED
- credits/vouchers/points/refunds created
WHAT PADOVA MADE
- current booking economics/profit, subject to permission
WHAT STILL NEEDS ATTENTION
- tasks/reviews/issues
Before asking me to test again, YOU must test these yourself in the isolated test workspace.
CASE A — SIMPLE DIRECT BOOKING
Customer buys United ticket.
Booking channel = Direct airline Actual supplier = United Sale = known amount Cost = known amount Customer pays by Zelle Padova pays supplier by card
Verify balances and profit.
CASE B — DIFFERENT BOOKING CHANNEL
Booking channel = Capital One Actual supplier = United
The UI must clearly show BOTH.
CASE C — PURCHASED VOUCHER
Padova buys $1,000 face voucher for $800 from a seller.
Then uses $500 face toward a booking.
Verify:
- seller
- face
- acquisition %
- basis
- remaining face
- remaining basis
- booking funding
- profit
CASE D — EXISTING PADOVA CREDIT
Use an existing Padova credit to fund a new booking.
Verify the system does not recognize the original economic benefit twice.
CASE E — MIXED FUNDING
Booking funded by:
- card
- voucher
- credit
Verify all components independently.
CASE F — CAPITAL ONE PRICE MATCH
Use the established example:
Original rate $790.60 Card $612.52 Existing credit $178.08 Final/new rate $592.68 New credit $197.92
Verify the entire chain.
CASE G — POINTS
Acquire/use points with cost basis.
Verify quantity, lot and cost.
CASE H — GROUP CUSTOMER PAYMENT
One payment covers multiple bookings.
Verify one receipt plus multiple allocations.
CASE I — MULTIPLE PAYMENTS
One booking paid by multiple receipts/payers.
CASE J — COMMISSION
Expected commission and later receipt.
CASE K — REFUND
Supplier refund plus customer refund, including non-cash credit where applicable.
CASE L — BOOKING CHANGE
Fare difference versus Padova fee must remain separate.
CASE M — AMBIGUOUS HISTORICAL RECORD
Do NOT guess.
Create/retain Needs Review.
Before asking me to resume owner acceptance testing, produce a requirements coverage audit.
For every major requirement above show:
- Requirement
- Current UI location
- Database/table/model supporting it
- Status: implemented / partially implemented / missing
- Test performed
- Result
Anything marked missing or partially implemented that is required for everyday Padova operation should be fixed before returning the system to me.
Do not give me another generic “tests pass” statement if the tests do not cover these workflows.
Automated tests must test the required business behavior.
Do NOT bulk-import the historical financial ledger until this core model is correct.
However, continue preparing:
- source mapping
- provenance
- deduplication
- migration mappings
- idempotent reruns
- delta detection because the spreadsheets remain active
- Needs Review routing
- reconciliation
2026 Accounting remains the master source according to the established rules.
PM “new rate” is generally final confirmed cost.
Old AI allocations are evidence, NOT automatically verified payment truth.
Blank cost is NOT zero.
Historical source files remain READ ONLY.
Do not ask me questions about implementation details already resolved by this specification or the repository documentation.
If the requirement is clear: implement it test it fix it continue
Only stop if:
1. Two materially different business interpretations remain possible after reviewing all source documentation.
2. Choosing incorrectly would materially change money, balances, profit, ownership or accounting.
3. You need to take a destructive/irreversible action.
4. You need a credential/verification only I can provide.
5. There is a material new paid cost.
Everything else should be completed autonomously.
I should not need to sit beside the computer for hours finding basic missing functionality.
You have the specification.
Perform the requirements audit, implement the missing workflows, test every representative case above, correct the UX, and then return the application to me for owner acceptance testing.
Do not optimize only for “the code builds.”
Optimize for:
“Can Padova Travels actually run its real business correctly in this system?”