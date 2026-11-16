# Handoff CSV / Excel evidence inventory — 16 November 2026

**Read-only study.** These files are **evidence**, not a “upload all CSV into Padova” job.  
`START HERE` + financial README say: prefer newest verified sheet; dedupe ScanPay by transaction IDs; **completed imports must not be replayed**; daily production stays unlocked; historical posting remains **gated**.

Local copies extracted under (ignored) `.data/handoff-financial-20261113/` for analysis only.

---

## 1) What the client actually asked

From `START HERE - Padova Programmer Handoff.txt` + `PROGRAMMER_HANDOFF_MESSAGE.md` + financial README:

| Ask | Meaning |
|-----|---------|
| Finish existing system | Not redesign; historical info correctly organized |
| Spreadsheets / CSV | **Read-only evidence** — match/reconcile, don’t invent |
| Already posted batches | **Never restart** executors / replay completed imports |
| Remaining history | Build Owner question list → only **approved** batches post |
| Local first | Review + synthetic/local tests before prod financial writes |

So: **nahi** — saari CSV seed/import karke live books fill nahi karni.  
**haan** — depth study, crosswalk, remaining gaps list, local evidence load for analysis, then Owner-approved posts only.

---

## 2) Loose CSVs in Drive folder (bakups-16-11-26)

### A. `PM accounting 2026 - 2026 accounting (1).csv` (~1033 data rows, 26 cols)
Owner main **2026** sheet export. Columns include: client %, PRICE GIVEN TO CLIENT, charged, Payed CC/TC, Original Rate, passengers, Route, booking/travel dates, Airline reference, Account Under, Cap1 Reference, Travel Credit, NOTES…  
**Role:** primary sale/cost/payment **claims** for 2026 reconciliation (same family as `PM accounting 2026.xlsx`).

### B. `Acounting 2025 - End of 25.csv` (~403 rows, 18 cols)
Messy header (starts `795 | .89 total | Sale Price | Paid | cost…`). Looks like **2025 end** workbook export.  
**Role:** prior-year context / vouchers-cash trail — **not** the 2026 finish scope unless Owner expands scope. Prefer leave as evidence; don’t bulk-post into 2026 books.

### C. ScanPay folder (16 files)
| File | Rows | Role |
|------|-----:|------|
| `payment-report-1793864196.csv` | 103 | Native ScanPay **payments** (Payment ID SP…, amounts, customer, invoice links, fees, refunds) |
| `payouts-1794260260.csv` | 26 | Bank **payouts** to Chase (PO-…) |
| `payouts-transactions-*.csv` (14 files) | 1–6 each | Line items linking SP payments ↔ payouts; one file has charge+refund pair |

**Role:** receipt / payout **source of truth** for card collections. Overlapping exports — **dedupe by Payment ID / Transaction ID / Payout ID**. Many invoice allocations already posted (see §4); leftover = match files that are not posting proof.

---

## 3) Excel workbooks (`Accounting and Other Original Excel Workbooks/`)

| File | Use for finish-2026? |
|------|----------------------|
| **PM accounting 2026.xlsx** | Yes — newest PM working sheet (~1034 accounting rows + Cancellations, GDS, vouchers…) |
| **2026 Accounting.xlsx** | Yes as sibling — Sale/Paid/cost style (~1080) |
| **Padova Travels Accounting 2026 - Working System.xlsx** | Yes — structured **Accounting / Payments / Splits / Booking Details / Original Source Archive** (reconciliation layer) |
| CLIENT_RESULTS*.xlsx | No (flight price research) |
| KASHRUS26.xlsx | No (kashrus lists) |
| CPA February 2026.xlsx | Optional commissions research only |
| New Microsoft Excel Worksheet-1.xlsx | Capital gains scratch — out of scope |

Prefer **Owner’s newest verified sheet** per topic (START HERE). CSV exports of PM/2025 are downloads of those sheets — use workbook when formulas/tabs matter.

---

## 4) Financial Reconciliation ZIP (87 evidence files) — already done vs open

Inside zip (key paths):

- **Posted / never restart:** invoice allocation batches in `continuation-status.json` (93+ events across multiple batch IDs); verified-fees-v2 `b1653500-…`; ScanPay confirmed-flights batch `18efa911-…` (hosted readback; **do not restart**).
- **Final import 5 Nov:** 1058 events replayed once; `historicalPostingAuthorized: false`; daily unlocked; **fullHistoricalFinancialCertification: false**.
- **Evidence tables** (snapshots, not live DB):  
  `bookings_current` 760 · `payments_current` 294 · `allocations_current` 103 · `bank_transactions` 447 · `review_queue_current` 919 · `owner_decisions` 169 (+ more in zip: vouchers, credits, cancellations, source_rows huge, etc.).
- **Named remaining holds** (from `remaining-holds.json`, not a full census): Fair House dates technical; 7 processor fees; original refunded-charge fee; Srulys/StRegis; Robert voucher refund unknowns; Prager clearing; B7W5UY credit basis; GISLVP promised refund; earlier $50.60 invoice (don’t re-ask).
- **Owner answers already locked** (Shaya $2274.81, Kelemer $1662, Marnie/Chaim/Hamburger/Matis/Perlowitz, Fair House blanks, GISLVP keep-as-is, etc.) — do **not** re-ask.

Handoff baseline still cited elsewhere: ~**37** price holds among unfinished price posting; payments/cost/refunds/vouchers/commissions are **outside** that 37.

---

## 5) What “local pe data load” safely means

**Allowed now**
1. Keep evidence under `.data/handoff-financial-20261113/` (started).
2. Optionally symlink/copy loose CSVs + ScanPay folder next to it for one tree.
3. Build **read-only crosswalks** (sheet ↔ ScanPay ID ↔ bank ref ↔ existing PDV booking) — JSON/markdown for Owner questions.
4. Local synthetic DB: practice **intake drafts** from Field:Value samples — **not** bulk historical money import.

**Not allowed without Owner + gates**
- Replay completed import/allocation executors.
- Blind CSV → live bookings/payments on QA or production.
- Invent sale=0, dates, identity merges, or cost from blank cells.
- Unlock historical posting / run new hosted financial batches without approved list.

---

## 6) Recommended sequence (developer)

1. **Inventory done** (this file) — confirm with Owner that 2026 finish uses PM + Working System + ScanPay + bank ZIP, not 2025/kashrus.
2. Extract rest of ZIP tables needed for remaining holds (cost crosswalks, scanpay match JSONs) into `.data/` as needed.
3. From `remaining-holds` + `exact-remaining-matches` + PM rows still unmatched: fill `OWNER_REMAINING_QUESTIONS_DRAFT.md` with **concrete** IDs/cents.
4. Owner answers → prepare **one** new batch → approve → post once → never replay.
5. Parallel product work (intake/affiliate) continues; daily QA/prod use stays up.

---

## 7) Quick counts (loose package only)

- Accounting CSVs: **2** (2025 + 2026 PM)
- ScanPay CSVs: **16** (1 payment report + 1 payouts + 14 payout-tx)
- Excel workbooks: **8** (3 primary accounting + 5 tangential)
- Financial ZIP: **87** evidence/status/match files (+ bank PDFs)

`testdata/intake-samples/07-reservations.csv` is **synthetic intake test data**, not Owner accounting.
