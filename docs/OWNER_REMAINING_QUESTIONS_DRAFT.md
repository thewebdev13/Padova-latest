# Owner remaining questions — concrete draft (not posted)

Prepared **16 November 2026** from handoff evidence (as-of ~10–12 Nov snapshots).  
**Read-only.** No amounts guessed. **No completed-import / allocation-executor replay.**  
Post only after Owner answers (where needed) + **new approved batch**.

Evidence map: `docs/HANDOFF_CSV_EVIDENCE_INVENTORY_20261116.md`  
Local extract: `.data/handoff-financial-20261113/`

### Snapshot caveats (not a live census)
- Open inventory: **37** receipts with unallocated value; **65** unknown sales; **545** unknown net-cost flags (flag ≠ missing documents).
- Sheet-cost recheck: among **546** final-cost-pending flags, **529** already have recorded sheet costs; **17** not matched to one sheet cost.
- Unresolved evidence register: **112** tracked groups (categories below) — older Nov 5 register; later ScanPay/fee work closed some items — verify live before posting.
- Daily production unlocked; historical batch authorization **closed**.

---

## Do not ask again (Owner already answered)

| Topic | Locked fact |
|-------|-------------|
| Shaya / Etihad C8I74O | Sale/payment **$2,274.81** |
| Kelemer | **$1,612 + $50 = $1,662**; keep $1,662 payment; no −$195.08 correction |
| Robert $449.09 change | Parent **B96Q4U** |
| Fair House | Stay dates may stay **blank** |
| GISLVP / H-YTQMPW | Keep booking; **$479.10** unexplained; promised refund ≠ received |
| Rachel/Moshe | Padova-behalf reimbursed/paid; method unknown OK |
| Rita $950 | Itinerary fee on sheet (row 763) |
| Chaim $390 | Row 495 climbers/netski; **not** JECKLO flight |
| Marnie $1,498 | Row 501 / ALA4SE; payer = Yehuda Chaim Liebman brother (no merge) |
| Hamburger $749.70 | Row 234 ZNHTY9 / PDV-1231 / bank 28813972813; cost $733.93 |
| Matis $90 | Row 214 Hilton; cost $50 |
| Perlowitz | Row 231 **$4,609** / cost $3,741.47 / SP260417-01901 |
| Galimidi $100 | Certificate/Kugler points trail; preserve assets |
| Earlier invoice $50.60 | Owner-known unknown — **do not ask** |
| Sale dates | Can wait; unknown stays unknown |

---

## Batch A — Exact receipt matches ready to prepare (Owner: approve allocation posting only)

Facts already in sheets/matches/`exact-remaining-matches.json`. **`financialPosting: false`** at checkpoint. One receipt → one receipt; allocate to booking(s) without inventing sale/cost.

| Customer | Receipt / ref | Sheet / booking clue | Remaining cents | Prep note |
|----------|---------------|----------------------|----------------:|-----------|
| Marnie Liebman | Bacf3H8J42Yw | row 501 ALA4SE | 149800 | Existing unpaid booking; family payer note preserved |
| Jacob Hamburger | 28813972813 | row 234 ZNHTY9 / PDV-1231 | 74970 | Bank Jacob vs sheet Yanky — preserve both labels |
| Penina Elbaz | 2Hy0K5B7Iftt | row 261 CF7XDE | 93915 | Bank payer ≠ billed Yosef — no silent merge |
| Penina Elbaz | 2Hy0K5B7J7F9 | row 262 CFELTD | 86592 | same |
| Etc Worldwide LLC | 28108454733 | row 98 QWGEAR | 64344 | Business payer vs sheet “etc” |
| Moishe Steinhaus | 2166882028Gb | row 10 CQO54K | 29518 | Bank vs sheet moishe yaakov |
| Ahron Perlowitz | SP260417-01901 | row 231 | 460900 | Card sale facts locked |
| Matis Goldsmith | Cofuk69Doxln | row 214 Hilton | 9000 | **No linked booking yet** — create/link only with Owner OK |
| Rita Lipshitz | 31261085627 | row 763 fee $950 | 95000 | **No linked booking yet** |
| Chaim Reznitsky | Bacyoff140Ox | row 495 $390 / cost $300 | 39000 | **No linked booking** — separate activity |
| Yitzchak Galimidi | Bacszhtmhesm | row 561 $100 cert | 10000 | Asset/certificate trail; hotel cash ~$250 uncertain |

**Prepared (not posted):** `docs/BATCH_A_ALLOCATION_PREP_20261116.md` + `.data/handoff-financial-20261113/batch-a-allocation-prep-20261116.json`  
- **A1 ready:** Marnie→PDV-1371, Hamburger→PDV-1231, Penina→PDV-1243/1244, Etc→PDV-1165, Moishe→PDV-1108 (**$4,991.39**).  
- **A2 blocked:** Perlowitz (no booking / date), Matis, Rita, Chaim $390, Galimidi.  
Owner message draft: `docs/OWNER_MESSAGE_BATCH_A_B_DRAFT.md`.

---

## Batch B — Named policy holds (need facts or explicit “leave Unknown”)

From `remaining-holds.json` (asOf 2026-11-10). Do not invent cash dates or fee splits.

**Owner-ready Q&A (checkboxes + suggested reply):** `docs/BATCH_B_OWNER_QA_20261116.md`  
**JSON:** `.data/handoff-financial-20261113/batch-b-owner-qa-20261116.json`

| # | Item | Amount | Suggested default |
|---|------|--------|-------------------|
| B1 | Fair House $319 (draft `7f5f167e-…`) | 31900¢ | Keep blank dates / unposted |
| B2 | Seven processor fees | **85548¢** | Proportional split |
| B3 | Original refunded-charge fee | **16463¢** | Needs Review |
| B4 | Srulys June check + StRegis | **109955¢** | Needs Review |
| B5 | Robert voucher Zelle refund | **142982¢** | Date/account Unknown |
| B6 | Prager clearing | **254066¢** | Clear 143916+110150; leave 23¢ Unknown |
| B7 | B7W5UY travel-credit basis | face **83137¢** | Keep Unknown |
| B8 | GISLVP promised refund | **47910¢** | Still expected only |
| B9 | Earlier invoice $50.60 | 5060¢ | **No question** |

---

## Batch C — Sheet cost still unmatched (17 bookings)

Recheck: not among the 529 with a single recorded sheet cost. Owner: provide cost **or** keep Unknown (never invent 0).

**Owner-ready Q&A:** `docs/BATCH_C_UNMATCHED_COSTS_QA_20261116.md`  
**JSON:** `.data/handoff-financial-20261113/batch-c-unmatched-costs-20261116.json`

Tiers: **C1** fee-only (1602/1605) · **C2** paid missing cost (1535/1536/1587/1581/1604) · **C3** conflict **PDV-1598** ($1752.66 vs $2158.90) · **C4** sale+cost Unknown · **C5** cancelled · **C6** Fair House (=B1).  
Default reply pack: all **Keep Unknown** except C3 if Owner picks a number.

---

## Batch D — Other unallocated receipts (inventory, still open at snapshot)

Beyond Batch A — **26** receipts, **~$46,437** remaining.

**Owner-ready shortlist + reply template:** `docs/BATCH_D_UNALLOCATED_RECEIPTS_20261116.md`  
**JSON:** `.data/handoff-financial-20261113/batch-d-unallocated-20261116.json`

Tiers: **D1** near candidates (Kurtz/Savitz/Weinberg/Braun $319/Kelemer $1662) · **D2** multi-booking (Robert/Stefansky/Fishing/Prager) · **D3** no hit (Gross/Ehrlichster/Holdco/Bennish/Berman…) · **D0** $50.60 do-not-ask.

Send **after** A1/A2/B — don’t overload first Owner message.

---

## Batch E — Broader unresolved register (112 groups — summary only)

Categories (Nov 5 register; verify before re-asking):

| Category | Count |
|----------|------:|
| Refund / credit settlement | 44 |
| Receipt allocation / payer relationship | 23 |
| Processor payout detail | 14 |
| Existing voucher ownership / origin | 11 |
| Commission status / allocation | 7 |
| Current Capital One credit / net-cost link | 5 |
| Migration identity / date | 3 |
| Voucher sale date / settlement | 2 |
| Other (1 each) | 4 |

**Owner Q:** After Batches A–D, work refund/credit and voucher categories in a **second** question pack (do not dump all 112 at once). Processor payout detail may be fillable from ScanPay payout CSVs already in the Drive folder without Owner if IDs match.

---

## Batch F — Ledger unknown sales (65 bookings)

Many imported with sale Unknown by design. Sheet recheck claimed **56** of those have a recorded positive sheet sale in notes path — **still not auto-posted**.

**Owner Q:** Prefer (1) keep Unknown until reviewed, or (2) authorize a **sale-note → price posting** batch only for Owner-checked codes? If (2), start with a short list Owner picks — do not post all 65 blindly.

Sample codes still unknown at inventory: PDV-1131, 1181, 1186, 1187, 1109, 1169, 1167, 1114, 1126, 1334, 1355, 1357, 1373, 1191, 1390, …

---

## Proposed order to Owner

1. **Approve Batch A** allocations for existing bookings (no new guesses).  
2. Answer **Batch B** (especially B2 fees, B8 GISLVP settlement, B1 Fair House).  
3. **Batch C** cost Unknown vs amount (17 lines).  
4. **Batch D** large unallocated receipts.  
5. Later: refunds/vouchers (E) and unknown sales policy (F).

Programmer next (still no post): prepare Batch A draft packets from match JSON + live QA/prod read-only check when access exists.
