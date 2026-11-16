IMPORTANT: Treat this as a MASTER CLARIFICATION of how Padova Travels actually operates.
Some earlier instructions oversimplified the business into a normal travel-agency system. That was wrong.
Do NOT reduce Padova to:
Customer → Booking → Airline/Hotel → Sale → Cost → Profit.
Padova has significantly more complicated acquisition, funding, asset, payment and profit workflows.
This message, together with the existing repository source-of-truth documents and preserved evidence, should be used to understand the business before you make further UI decisions.
If an older UI suggestion conflicts with the business model below, THIS BUSINESS MODEL WINS.
Do not throw away working backend/accounting/security work. Correct and extend the implementation where necessary.
Do not make the frontend complicated merely because the backend is sophisticated.
The target is:
VERY POWERFUL SYSTEM UNDERNEATH + VERY SIMPLE SYSTEM TO USE.
==================================================
1. WHAT PADOVA TRAVELS ACTUALLY IS ==================================================
Padova Travels is not merely an agency that buys a ticket from an airline and adds a markup.
Padova may make money or acquire travel in many different ways.
Examples include:
- normal airline tickets
- hotel bookings
- direct airline bookings
- tickets booked through Capital One
- tickets booked through another booking source/channel
- discounted tickets acquired through another person or business
- buying airline vouchers from people
- buying airline credits from people
- buying hotel credits/value from people
- using Padova-owned vouchers or credits
- selling vouchers/credits
- buying or using points/miles
- points bookings with separate cash taxes/fees
- mixed cash + voucher + credit + points funding
- Capital One price matches and resulting credits
- commissions
- collecting-agency commissions
- referral arrangements
- service fees
- markups
- refunds
- cancellation credits
- ticket changes and fare differences
- assets created from previous bookings and reused later
The system must understand the economics behind all of these.
The system must NEVER assume:
“Actual Supplier = where Padova bought it.”
Those are completely different concepts.
A booking needs to separate these concepts.
A. WHO IS THE CUSTOMER?
Who is being billed / financially responsible?
B. WHO IS TRAVELING?
One or multiple travelers.
C. WHAT DID WE SELL?
Flight, hotel, or another travel product/component.
D. WHO ACTUALLY PROVIDES THE TRAVEL?
Example: United Airlines El Al Hilton Marriott
Call this the TRAVEL SUPPLIER or ACTUAL SUPPLIER.
E. WHERE/HOW DID PADOVA BOOK IT?
Examples: Direct airline Capital One GDS OTA Consolidator Another agency Other channel
Call this BOOKED THROUGH / BOOKING CHANNEL.
F. WHO DID PADOVA ACTUALLY BUY VALUE FROM?
This is extremely important.
Examples:
- direct supplier
- another travel agency
- private seller
- voucher seller
- credit seller
- points seller
- hotel-credit seller
- intermediary
Call this PURCHASED FROM / ACQUISITION SOURCE.
This may be completely different from the actual travel supplier.
G. WHAT DID PADOVA USE TO FUND THE BOOKING?
Examples:
- normal card/cash funding
- purchased voucher
- Padova-owned voucher
- purchased credit
- Padova-owned credit
- points/miles
- Capital One credit
- seller-funded value
- combinations of multiple sources
H. WHAT IS PADOVA'S TRUE COST?
This is based on actual acquisition economics and cost basis.
I. WHAT DID PADOVA CHARGE THE CUSTOMER?
Customer sale.
J. HOW DID THE CUSTOMER PAY?
Receipts and allocations.
K. WHAT OTHER REVENUE OR VALUE DID PADOVA EARN?
Markup Fee Commission Price-match/rebate value Asset gain/loss Other valid components
These concepts must remain separate even if the everyday UI hides advanced pieces until needed.
Do not design the database around dozens of rigid booking types like:
“Voucher booking” “Points booking” “Capital One booking” “Normal booking”
Those are combinations of components.
A booking can contain one or multiple travel components.
For example:
Customer trip → flight → hotel
or:
Flight booking → two PNRs → three travelers
The economics are then composed from the actual funding/acquisition/revenue components.
That allows unusual cases without rebuilding the software every time Padova finds a new way to acquire travel.
CUSTOMER / BILLED TO
The customer is the person/company financially responsible for the booking.
Do not assume customer = traveler.
Examples:
Parent pays for children.
Company pays for employee.
One person pays for several travelers.
TRAVELERS
Travelers must exist independently and be searchable.
One traveler may appear on many bookings.
One customer can have many travelers.
Do not recreate travelers every time.
Support useful traveler information needed by the business.
FAMILIES / GROUPS
The system should be capable of associating related travelers/customers where helpful without merging people who should remain separate.
Use the confirmed directory/grouping decisions already collected.
Preserve raw historical labels in evidence/history but do not show bad duplicates as active selections.
COMPANIES
Companies are first-class entities.
Companies may contain employees/travelers.
A company can be responsible for bookings.
Padova's corporate model includes TWO separate employee settings.
TIER 1–3
This relates to ticket flexibility / purchasing strategy.
Conceptually:
Tier 1: Deepest discount / least flexibility.
Tier 2: Some flexibility, potentially more work/cost.
Tier 3: Greater flexibility / safer fare structure.
LEVEL A–C
This relates to traveler comfort / cabin policy.
For example, a company may allow premium economy or business when the price difference falls within configured thresholds.
These are separate axes.
An employee may therefore have:
Tier 2 + Level B
Do not collapse these into one “traveler level.”
Company-level defaults and employee-specific assignments should be supportable.
Support, where relevant:
- customer
- travelers
- airline
- origin
- destination
- travel dates
- flight numbers
- PNR
- multiple PNRs
- ticket/confirmation numbers
- booking status
- travel status
- itinerary versions
- notes
Do not force structured information into one giant notes box.
Hotels are also part of the business.
Support:
- hotel/property
- traveler/guest
- stay dates
- confirmation number
- booked-through channel
- actual hotel/supplier
- purchased-from/acquisition source where different
- customer sale
- Padova cost
- commission
- expected benefits where relevant
- refund/cancellation rules
- payment/funding
Padova may use premium hotel programs and benefits, including programs such as FHR/THC where applicable.
Hotel value may also be acquired indirectly.
For example, Padova may purchase hotel credit/value from another person.
That must be treated as an asset/acquisition, not incorrectly recorded as if Padova simply paid the hotel in cash.
The system must answer:
WHERE/HOW WAS THIS BOOKED?
Examples may include:
Direct airline Capital One GDS OTA Consolidator Another agency Other approved channel
This should normally be a controlled searchable selection.
Do not force the user to erase “Direct airline” and type something else.
This is separate from Travel Supplier.
Example:
Booked Through: Capital One
Actual Supplier: United Airlines
Both must be visible.
This is one of the major pieces that was missing.
The system needs to answer:
WHO DID PADOVA BUY THIS TICKET, VOUCHER, CREDIT, POINTS OR OTHER VALUE FROM?
Examples:
- supplier directly
- travel agency
- private individual
- points seller
- voucher seller
- credit seller
- hotel-credit seller
- other intermediary
The seller does NOT necessarily need to be a formal Supplier record before entry.
Sellers vary.
Allow seller/acquisition information such as:
- name
- phone
- WhatsApp/contact
- email
- reference
- notes
Where appropriate allow linking to an existing entity, but do not force every one-off seller through a complicated supplier onboarding process.
Padova sometimes acquires travel value for less than its face or usable value.
This is fundamental.
Example:
Face value: $1,000
Padova paid: $800
Acquisition percentage: 80%
True initial cost basis: $800
The system needs BOTH:
face/usable value AND actual Padova acquisition cost.
The percentage should be visible/calculable.
Do not lose this information.
Padova may buy vouchers/credits from people.
Track:
- asset type
- airline/program
- who sold it to Padova
- seller contact details
- original face value
- amount Padova paid
- acquisition percentage
- acquisition date
- cost basis
- restrictions
- passenger restriction if applicable
- transferability
- expiry
- identifying reference
- amount used
- face value remaining
- cost basis remaining
- source evidence
- notes
EXAMPLE:
United voucher face value: $1,000
Purchased from: Seller X
Padova paid: $800
Purchase percentage: 80%
Cost basis: $800
If Padova later uses only $500 face toward a ticket, allocate the appropriate basis to that booking.
Do not treat $500 face as $500 Padova cost.
This same concept is NOT limited to airline vouchers.
Padova may buy hotel credits/value from people.
Example:
Hotel usable value: $500
Padova pays seller: $350
Acquisition percentage: 70%
Track it as an asset with:
- hotel/program/source
- seller
- face/usable value
- acquisition amount
- acquisition percentage
- cost basis
- restrictions
- expiration
- usage
- remaining value
- remaining basis
The architecture must support new asset/value types without major redesign.
Padova may also sell owned travel assets.
Track:
- asset
- buyer
- face/value transferred
- carrying basis transferred
- sale amount
- date
- resulting gain/loss
Example:
Remaining face: $500
Remaining basis: $400
Sold for: $350
Result: $50 realized loss.
Do not calculate result from face value alone.
POINTS BOOKINGS ARE A REAL PADOVA WORKFLOW.
Do not treat points as a note.
Points/miles need proper inventory and cost basis.
Track, where applicable:
- loyalty program
- account/holder
- seller/source
- acquisition lot
- quantity
- acquisition cost
- acquisition rate
- purchase date
- transfers
- transfer bonuses
- taxes/fees
- points used
- points returned
- expiration
- remaining quantity
- remaining basis
- owned inventory vs access-on-demand
A booking can contain:
points + cash taxes/fees + possibly another funding component.
If different acquisition lots exist, preserve proper lot/basis allocation according to the existing financial engine/FIFO rules.
If points are returned after cancellation, return them to the correct inventory/economic chain rather than creating fake new value.
One booking may use several funding sources.
Example:
Total supplier cost: $900
Funded with:
$400 card $300 existing Padova credit $200 voucher
The system must preserve each funding component.
Do not flatten everything into:
“Cost = $900.”
For normal bookings, the UI can keep this simple.
Show:
How Padova Paid / Funded It
Then allow:
Add another funding source
Advanced funding should appear only when necessary.
Normal supplier funding should also track the useful operational information.
Examples may include:
- card/cash/payment source
- account where relevant
- amount
- date
- confirmation/reference
- supplier obligation it pays
Keep customer payment and supplier funding separate.
This established example must work correctly.
Original: $790.60
Paid/funded initially:
Card: $612.52
Existing credit used: $178.08
Total: $790.60
Then Capital One price match results in:
Final/new rate: $592.68
New credit generated: $197.92
Interpretation:
The existing $178.08 credit was REAL funding.
The PM “new rate” is generally the final confirmed cost.
The newly generated $197.92 becomes NEW Padova-owned value/credit.
It needs provenance back to this booking.
When that $197.92 is used on a future booking, do NOT recognize its economic benefit as new profit a second time.
Track:
booking → price-match result → created credit → later movements/use.
Price-match attempts may have statuses such as:
attempted pending approved denied
The final booking should show the confirmed result.
The history should preserve attempts.
A Padova asset may become another Padova asset.
Example:
Booking produces credit → credit becomes voucher → voucher is later used.
Conversion does NOT create additional profit.
The same underlying value must retain provenance.
Track the chain:
source booking → credit → conversion → voucher → movements → later booking usage.
Customer sale price is separate from Padova acquisition cost.
Example:
Customer charged: $1,200
That establishes customer obligation before payments/adjustments.
Do not infer sale amount from payment amount.
A customer payment is entered ONCE.
Payments must support MANY-TO-MANY allocations.
One payment can pay several bookings.
One booking can receive several payments.
EXAMPLE:
Customer sends one ACH: $5,000
Allocation:
Booking A: $2,000
Booking B: $1,500
Booking C: $1,500
There should be:
ONE $5,000 receipt + THREE allocations.
Do not manufacture three fake payments.
Likewise one booking can have:
Zelle from Person A + check from Person B + another ACH later.
Preserve payer where relevant.
Common customer methods include:
Zelle ACH Check and other legitimate methods.
Customer overpayment/unallocated money must not disappear.
It may remain unallocated or become customer credit according to the business rules.
Separate:
WHAT PADOVA OWES from WHAT PADOVA ACTUALLY PAID.
Supplier obligation and supplier payment are different concepts.
Supplier payments should also support allocations.
One supplier payment can satisfy multiple obligations.
One obligation can involve multiple funding/payment components.
The system must understand that:
face value ≠ Padova cost.
points face/retail value ≠ Padova cost.
voucher value ≠ Padova basis.
credit amount ≠ necessarily new profit when reused.
True economics must flow from actual acquisition basis.
Padova profit cannot be modeled only as:
Sale minus generic cost.
Revenue/economic value may come from:
- markup
- service/booking fee
- supplier commission
- price-match/rebate value
- asset acquisition discount
- asset sale gain/loss
- other legitimate revenue components
- referral obligations reducing Padova economics
Do not double count.
A value created once must not become new profit every time it moves through another Padova asset.
Commissions need proper tracking.
Track, where relevant:
- booking
- hotel/supplier
- gross commission
- commission percentage
- expected amount
- payer/source
- collecting agency
- collecting agency retained percentage/amount
- Padova expected net
- expected payment date
- actual amount received
- actual date received
- allocation/remittance information
If a commission is expected but remains missing approximately 30 days after the stay where that rule applies, it should become a Things That Need Attention item.
Commission terms must correspond to the booking's terms, not whatever the supplier terms happen to be months later.
Padova may owe referral money.
Track:
- referrer
- related booking
- basis
- percentage or amount
- expected obligation
- status
- paid amount/date
Where the referral is payable only after Padova receives commission, do not mark it payable/complete prematurely.
A booking change is NOT automatically a booking fee.
This was already important in existing invoicing/accounting.
Separate, where relevant:
- original booking
- change event
- fare difference
- airline/supplier change fee
- Padova service/change fee
- additional customer charge
- additional Padova cost
- refund/credit generated
- new itinerary/version
Example:
Customer changes a flight.
$100 may be fare difference.
Later another $50 may be additional fare difference.
Those are not automatically “booking fees.”
Preserve the history.
Supplier side and customer side are separate.
SUPPLIER SIDE
Track:
- refund expected
- refund received
- amount
- form
- cancellation fee
- credit/voucher created
CUSTOMER SIDE
Track:
- refund due
- refund paid
- amount
- method
- Padova fee retained if applicable
CASH IS NOT THE SAME AS CREDIT.
If supplier returns airline credit, do not record it as cash.
Ownership is critical.
A cancellation may create:
CUSTOMER-OWNED CREDIT
or
PADOVA-OWNED VALUE
Those are not interchangeable.
For customer-managed travel credits track where applicable:
- customer/traveler owner
- supplier
- restrictions
- passenger restriction
- transferability
- expiry
- original amount
- remaining amount
- source booking
For Padova-owned value, use the Padova asset ledger/cost basis rules.
If a booking used:
card + voucher + credit
a cancellation/refund must preserve what happened to each component.
Do not simplify the entire refund into one cash number if that did not actually happen.
The system needs BOTH:
current booking economics AND monthly movement history.
Example:
October booking initially shows: +$200
In December we discover the correct profit was: +$120
Current booking profit becomes: $120
The later accounting movement is: December prior-period adjustment -$80
Do not make it look like the entire booking occurred in December.
Reports should be able to distinguish:
- new/current-period booking profit
- prior-period adjustments
- net monthly movement
Padova needs an active operational attention system.
Examples:
- customer owes money
- supplier payment overdue
- refund expected but missing
- customer refund due
- commission overdue
- referral payment due
- customer receipt not fully allocated
- supplier payment not fully allocated
- expiring voucher/credit/points
- missing cost
- missing sale price
- conflicting source data
- migration review
- supplier problem
- incomplete booking
- failed workflow
This should be useful operationally, not merely a database status field.
Tasks should support:
- linked customer
- linked traveler
- linked booking
- linked supplier/asset when appropriate
- owner/assignee
- due date
- priority
- status
- notes
- activity/history
The system should make upcoming travel obvious.
Calendar/upcoming travelers should derive from canonical booking data, not duplicate manually entered schedules.
The system should support the concept of booking documents and itinerary versions.
A changed itinerary should not destroy the prior itinerary.
There should eventually be explicit operations such as:
Generate/prepare itinerary and Send to Client
Do not mark something “sent” merely because a PDF exists.
Document uploads/storage may still be unfinished today, but the architecture should support it.
Padova ultimately should NOT remain a disconnected accounting database.
Communication is an important part of the future operating system.
The product should be capable of eventually including:
- email connected to customer
- email connected to booking
- communication timeline
- incoming/outgoing correspondence
- searchable history
- drafts/replies
- attachments
- operational tasks created from communications
This does not mean we should delay the entire V1 until every email integration is completed.
It DOES mean the information architecture should leave a natural place for Communications rather than forcing a redesign later.
The long-term system may include AI/chat assistance.
Examples:
- ask about a booking
- summarize customer history
- find outstanding items
- draft client communication
- explain booking economics
- surface upcoming issues
Again, do not delay core accounting merely to finish AI now.
But do not design the system as if accounting is the entire product.
Future possibilities can include:
- client portal
- itinerary/document access
- corporate setup
- Padova gift-card/value products
- additional integrations
These are not launch blockers.
Do not waste launch time building unrelated public travel content, public flight search engines, travel guides, public trip reports, etc.
Owner/Admin needs full access.
Owner may see:
- sale
- supplier cost
- profit
- total/monthly profit
- asset basis
- accounting
- reports
- users
- permissions
- audit
- settings
- backup/recovery controls
Employees need personal logins.
Employee access should be granular.
Potential permissions include:
- sale price
- supplier cost
- booking profit
- total/monthly profit
- asset cost basis
- accounting reports
- customer payments
- refunds
- assets
- completed-booking edits
- user management
Sensitive finance should not be exposed simply because someone can open a booking.
Permissions must be enforced at backend/database level as appropriate, not merely hidden in the UI.
Every material action should preserve:
- actor/user
- timestamp
- action
- affected record
- relevant before/after/event information
Do not destructively erase accounting history.
Use corrections, reversals, movements or archived versions as appropriate.
This system is financially important.
Required principles include:
- permanent IDs
- fixed-precision financial values
- atomic financial operations
- audit history
- soft delete/archive rather than casual destructive deletion
- test vs production separation
- backups
- restore testing
- Padova-controlled credentials
- no dependence on a single laptop
- no dependence on the owner's memory
Historical source data remains extremely important.
The primary historical accounting source is:
2026 Accounting.
It is the master transaction/accounting source.
PM accounting 2026 contains important additional background/details, especially Capital One / price-match information.
PM-only/canceled records can still matter and must not simply disappear because they are absent from the main sheet.
The old AI/Codex workbook is evidence/reference only.
Do not assume an old AI allocation proves a payment occurred.
PRIOR AI PAYMENT ALLOCATIONS ARE EVIDENCE, NOT AUTOMATICALLY VERIFIED PAYMENT TRUTH.
PM “new rate” generally means final confirmed cost.
BLANK COST DOES NOT MEAN ZERO.
If sources conflict and the business rule does not resolve it, preserve both and send it to Needs Review.
Do not guess.
Known source anomalies already documented should remain controlled review items rather than being silently “fixed.”
The business is still operating in the old spreadsheets while Padova is being completed.
Do NOT expect the source spreadsheets to freeze during development.
Migration needs:
- snapshots
- source provenance
- stable fingerprints/identifiers
- migration batches
- idempotent processing
- delta detection
- duplicate prevention
At final cutover:
read the then-current sources again → compare with prior snapshots → find additions/changes → reconcile → import only what is necessary → prove there are no duplicates/omissions.
Every migrated record should retain, where available:
- source workbook
- source tab
- source row/evidence record
- source identifier/fingerprint
- snapshot/batch
- resulting Padova record
Running migration logic twice must NOT create duplicate:
- bookings
- customers
- travelers
- receipts
- allocations
- supplier payments
- assets
- commissions
- refunds
- profit movements
Needs Review is intentional.
Do not “clean” historical accounting by inventing answers.
Examples:
missing cost conflicting payment evidence unclear customer unclear asset ownership source discrepancy unmatched historical row
should remain reviewable with source evidence.
This is one of the most important requirements.
The user should NOT be confronted with every possible financial concept when entering a normal booking.
NORMAL BOOKING EXPERIENCE SHOULD BE FAST.
A normal flight entry might show clearly:
Customer / Billed To Travelers Flight details Booked Through Travel Supplier Customer Price Padova Cost / How Padova Paid Customer Payment Save
Then advanced actions appear only when needed:
Add another funding source Use voucher/credit Use points Purchased from someone Add commission Add referral Add refund/change Advanced financial details
Use progressive disclosure.
The complex engine should work underneath.
Avoid making the user decode database terminology.
Examples of clearer UI concepts:
Customer / Billed To
Travelers
Booked Through
Travel Supplier
Purchased From
How Padova Paid / Funded It
Customer Price
Customer Payments
Padova Cost
Customer Balance
Supplier Balance
Profit
Credits / Vouchers / Points
Use precise terminology but make it understandable.
Opening one booking should immediately answer the practical questions.
WHO?
Customer Travelers Company if relevant
WHAT?
Travel product Trip/stay details PNR/confirmation status
WHERE WAS IT BOOKED?
Booked Through
WHO ACTUALLY PROVIDES THE TRAVEL?
Travel Supplier
IF PADOVA ACQUIRED VALUE FROM SOMEONE ELSE:
Purchased From
WHAT DID THE CUSTOMER PAY / OWE?
Sale Payments Customer balance
WHAT DID PADOVA PAY / USE?
Supplier obligation Funding Cost basis Supplier balance
WHAT ASSETS WERE USED OR CREATED?
Voucher Credit Points Other asset
WHAT DID PADOVA MAKE?
Profit/current economics, subject to permission
WHAT STILL NEEDS ATTENTION?
Outstanding tasks/issues/reviews.
The user should not need to hunt through six unrelated pages to understand one booking.
Do NOT blindly copy a generic sidebar or the friend's software.
The friend's software is useful as evidence of ONE THING:
a very sophisticated system can still look extremely simple.
Design Padova's navigation around Padova's actual workflows.
Likely major concepts include things such as:
Dashboard / Home Bookings Customers/Clients Suppliers/Sources Assets / Credits / Vouchers / Points Tasks / Attention Financials Communications Calendar / Upcoming Activity Settings
BUT DO NOT treat those exact menu names as a new rigid business rule.
First understand the business model above, then create the simplest sensible information architecture around it.
The dashboard should surface what actually matters.
Examples:
- bookings needing attention
- upcoming travelers
- unpaid customer balances
- supplier obligations
- overdue refunds
- overdue commissions
- expiring travel assets
- tasks
- recent activity
- useful business totals according to user permission
Do not fill it with meaningless decorative statistics.
Search should be useful across the system.
Users should be able to find things through:
- customer name
- traveler
- company
- PNR
- confirmation
- supplier
- booking
- seller/acquisition source
- useful references
Searchable selectors must use real directory/reference data.
Do NOT test only toy CRUD records.
Before giving the system back for Owner acceptance, test real business scenarios in an isolated test environment.
At minimum:
CASE 1 — NORMAL DIRECT AIRLINE
Booked Through: Direct airline
Travel Supplier: United Airlines
Normal card cost and customer payment.
CASE 2 — CAPITAL ONE
Booked Through: Capital One
Travel Supplier: United Airlines
Verify these remain separate.
CASE 3 — DISCOUNTED TICKET / ACQUISITION SOURCE
Travel Supplier: Airline
Purchased From: third party/person/agency
Track true purchase cost and seller.
CASE 4 — PURCHASED AIRLINE VOUCHER
Face: $1,000
Paid: $800
Acquisition: 80%
Partially use it and verify remaining face and basis.
CASE 5 — PURCHASED HOTEL CREDIT
Buy hotel value from a person for less than usable value.
Use part of it toward a hotel booking.
Verify source, percentage, basis and remaining asset.
CASE 6 — POINTS BOOKING
Points inventory + cash taxes/fees.
Verify basis and remaining points.
CASE 7 — MIXED FUNDING
Card + voucher + credit.
CASE 8 — CAPITAL ONE PRICE MATCH
Original: $790.60
Card: $612.52
Existing credit: $178.08
Final/new rate: $592.68
New generated credit: $197.92
Verify NO duplicate profit.
CASE 9 — GROUPED CUSTOMER RECEIPT
One ACH/Zelle/check funds several bookings.
One receipt, many allocations.
CASE 10 — MULTIPLE PAYERS/PAYMENTS
Several receipts fund one booking.
CASE 11 — COMMISSION
Expected commission → collecting agency if relevant → actual receipt.
CASE 12 — REFERRAL
Referral obligation with correct trigger.
CASE 13 — CANCELLATION
Cash refund vs credit clearly distinct.
CASE 14 — BOOKING CHANGE
Fare difference vs Padova fee clearly distinct.
CASE 15 — ASSET SALE
Sell voucher/credit and calculate result from basis.
CASE 16 — AMBIGUOUS HISTORICAL RECORD
Do not guess.
Needs Review.
Before asking the Owner to spend more hours manually discovering missing functionality:
Review the ENTIRE existing repository implementation against this specification and the existing source-of-truth documents.
For each major business capability determine:
IMPLEMENTED CORRECTLY
PARTIALLY IMPLEMENTED
MISSING
WRONGLY MODELED
Then fix the missing/wrong items that are clear.
Do NOT merely produce a giant report and stop.
Use the audit to drive implementation.
“83 tests passed” is not useful if the tests only prove the code does what an incomplete specification said.
Tests must cover the actual economics/workflows above.
Especially:
- acquisition source vs travel supplier
- acquisition percentages
- asset basis
- partial asset use
- points basis
- grouped payments
- multiple payments
- mixed funding
- Capital One generated credit
- no double profit
- refunds
- commissions
- prior-period adjustments
- permissions
- idempotent migration
The user should not have to understand:
database schemas ledger internals migration architecture cost-basis algorithms journal mechanics
to enter a normal booking.
Those mechanisms exist to HELP the user.
Do not make the user operate them manually.
You now have extensive business rules.
If a decision is clearly resolved by:
- this specification
- repository documentation
- historical evidence
- existing approved rules
then implement it, test it and continue.
Only interrupt the user when:
1. Two materially different business interpretations remain possible.
2. Choosing incorrectly would materially change financial/accounting results.
3. An action could destructively alter production/historical data.
4. A credential/verification requires the user.
5. A material paid service/cost requires approval.
Do not stop for ordinary UI/programming decisions.
Padova Travels should eventually be able to run its business from this system rather than from a collection of spreadsheets.
It should handle the complicated reality of:
customers travelers corporate accounts flights hotels booking sources actual suppliers third-party sellers discounted acquisitions airline vouchers hotel credits points/miles mixed funding Capital One credits payments allocations supplier obligations commissions referrals refunds changes assets profit tasks attention items communications audit permissions historical migration
while still feeling SIMPLE to the user.
The user should feel:
“I know exactly where to click.”
not:
“I need an accounting degree to enter a ticket.”
Do not ask the Owner to explain all of this again.
1. Re-read the existing source-of-truth repository documentation.
2. Compare the current application against this complete business model.
3. Preserve all correct backend/security/accounting work.
4. Correct concepts that were modeled incorrectly.
5. Implement missing core workflows.
6. Simplify the frontend around the actual workflows using progressive disclosure.
7. Populate the isolated test environment with representative realistic data.
8. Run all representative business cases above.
9. Fix the problems you find.
10. Run full regression/security/permission/mobile/desktop testing.
11. Keep historical bulk financial migration out of production until the accounting model passes these tests.
12. Continue preparing the safe/idempotent historical migration in parallel.
13. Do not return the application to the Owner for another manual acceptance pass until you have independently walked through the complete system and can show that the core Padova business model is actually represented.
The goal is not another partial prototype.
The goal is a Padova Travels operating system that reflects how the agency REALLY works.