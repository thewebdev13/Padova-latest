Padova intake upload samples (synthetic — local testing only)
==============================================================

Folder: testdata/intake-samples
Also copied to Desktop as: Padova-intake-samples

How to test
-----------
1. Open http://127.0.0.1:3000 → sign in
2. Transactions → Intake draft
3. Drag/drop OR browse one file at a time
4. Create intake draft
5. Open from Drafts → Continue intake → review → Save Booking only if you intend a real local save
6. Upload creates a DRAFT only — it never posts money by itself

Files
-----
01-hotel-miami.txt          Hotel Field: Value sample
02-flight-jfk-tlv.txt       Flight round-trip / award-ish sample
03-car-mia-airport.txt      Car sample
04-other-tour-package.txt Other / custom product
05-hotel-unknowns.txt       Many Unknowns — must NOT become zero
06-flight-one-way.txt       One way + Partial payment labels
07-reservations.csv         CSV rows (parser may treat as free text/provenance)
08-confirmation.eml         Email-shaped confirmation
09-messy-freeform.txt       Unstructured note — expect Needs Review style draft

Do not use these on production. No real traveler / payment data.
