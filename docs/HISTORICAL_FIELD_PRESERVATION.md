IMPORTANT ADDITION TO MY HISTORICAL MIGRATION INSTRUCTIONS:
Do NOT limit the historical booking import to the small list of fields previously mentioned.
I want the historical migration to be COMPREHENSIVE.
For every booking/transaction in the old accounting sources, inspect EVERY populated column, field, note, reference and related PM record.
The rule is:
IF THE OLD SYSTEM CONTAINS INFORMATION, PRESERVE IT.
Do not cherry-pick only: customer, traveler, PNR, sale, cost, dates.
There is substantially more information in the old accounting and I want as much of it as possible carried into Padova.
==================================================
1. INVENTORY EVERY SOURCE FIELD ==================================================
Before finishing the migration, create a field-level inventory of ALL relevant columns/tabs in:
- 2026 Accounting
- PM accounting 2026
- additional current PM tabs including group billing
- preserved historical/staging evidence
- other documented source material where relevant
For EVERY source field classify it as:
A. Structured Padova field B. Structured financial/acquisition field C. Historical/source detail preserved for later classification D. Needs Review E. Truly irrelevant/system-only data
Do not silently ignore populated fields.
Where available, preserve things such as:
- exact original customer name
- normalized customer
- traveler names
- number of passengers
- company
- sale amount
- paid/payment text
- payment method
- payment references
- cost
- original rate
- new/final rate
- cash funding
- voucher funding
- credit funding
- other funding
- online/reference price
- route
- origin
- destination
- departure date
- return date
- additional dates
- airline
- hotel/property
- PNR
- second/additional PNRs
- ticket numbers
- confirmations
- Capital One confirmation/reference
- account used
- booking/source channel where determinable
- seller/source information where present
- credit/voucher information
- travel-credit amounts
- commission information
- refund information
- cancellation information
- booking-change information
- fare differences
- notes
- internal notes
- employee/worker notes
- status information
- historical comments
- references
- any other populated field that helps explain what happened
This list is illustrative, NOT exhaustive.
The source files themselves determine the complete field list.
This is critical.
If the old accounting contains useful information but the current Padova model does not yet have the correct structured destination:
PRESERVE IT ANYWAY.
Attach it to the migrated booking/transaction as structured source metadata, historical detail, evidence, or another safe extensible mechanism.
I need to be able to open the booking and recover the original information later.
Tomorrow we will define more exact booking/acquisition types.
That should allow us to RECLASSIFY preserved information later.
It should NOT require going back and rediscovering information that was discarded during migration.
For every migrated historical booking, retain a readable source snapshot/payload of the relevant original row(s).
I want traceability such as:
2026 Accounting tab row original field/value pairs
and where relevant:
PM accounting 2026 tab row original field/value pairs
Do not merely preserve a row number.
Preserve the meaningful values.
If one booking has information across multiple places:
2026 Accounting + PM accounting + group billing + review/evidence records
link those pieces to the SAME historical booking where confidently matched.
Do not create multiple bookings merely because the information came from several source rows.
Historical information should not disappear into database tables that I cannot see.
For migrated bookings, provide an expandable area such as:
Historical Source Details
or equivalent.
It should allow the Owner to see important original information that has not yet been converted into normal Padova structured fields.
This can be hidden/secondary so the normal UI remains clean.
Historical notes are important.
Do not summarize them away.
Preserve the original note text and its source.
If structured information can confidently be extracted from notes, that is fine, but KEEP THE ORIGINAL NOTE ALSO.
Blank means unknown/not supplied unless an established rule says otherwise.
Examples:
blank cost ≠ $0
blank payment ≠ unpaid unless supported
blank acquisition source ≠ direct supplier
blank booking channel ≠ direct airline
Do not fill blanks with convenient defaults.
PM accounting often contains detail not obvious from the main sheet.
Preserve all relevant PM information, including where available:
- original rate
- new rate
- travel credit
- price-match status
- attempts
- approvals
- denials
- confirmation/reference
- account
- relevant notes
- other populated PM fields
Established rule remains:
PM “new rate” generally means final confirmed cost.
Do not reduce the entire PM record to only that one number.
If a field says something about payment, funding, credit, cost or another financial fact but it is not sufficiently verified to create a real ledger transaction:
DO NOT DISCARD IT.
Preserve it as historical evidence.
Then mark the structured financial posting as unverified / Needs Review where appropriate.
This is especially important for:
old free-text payment information prior AI allocations unclear funding descriptions voucher/credit descriptions.
Tomorrow I will provide a more complete list of the booking/acquisition methods Padova uses.
Therefore the migration today must retain enough information that tomorrow we can say:
“This old record was actually a points booking.”
or:
“This was a free-night certificate bought from another person.”
or:
“This was purchased hotel credit.”
or:
“This ticket was acquired through another agency.”
and update the structured classification WITHOUT rereading and reconstructing the original spreadsheet row manually.
Before declaring the historical import complete, produce a field coverage report.
For each source column/field show:
- source workbook/tab
- source field/column
- number of populated records
- Padova destination
- mapped / preserved raw / Needs Review / intentionally excluded
- reason if intentionally excluded
I want ZERO meaningful populated source fields silently lost.
Do not wait for tomorrow merely because some complex booking types are not fully classified.
For each booking:
Import all certain structured information.
Preserve all additional source information.
Flag only the pieces whose meaning is genuinely unresolved.
The goal is that the new Padova record contains essentially the COMPLETE historical picture available from the old accounting, even if some information remains temporarily under Historical Source Details instead of its final structured location.
Do not make me rebuild this information manually later.
Do not stop and ask me about each field.
Read the entire source schema yourself.
Map what is obvious.
Preserve what is not yet obvious.
Never discard meaningful information.
Continue until you have exhausted the historical information that can safely be brought into Padova.