# Batch A allocation prep — 16 November 2026

**Status: prepared, not posted.**  
Machine packets: `.data/handoff-financial-20261113/batch-a-allocation-prep-20261116.json`  
Questions overview: `docs/OWNER_REMAINING_QUESTIONS_DRAFT.md`

Snapshot bookings/receipts from handoff inventory (generated ~2026-11-10). Re-check live QA/prod before any execute.

---

## A1 — Ready to allocate (existing booking + full-sale receipt)

Total **$4,991.39** across **6** packets. One receipt → one booking; no identity merges; no new cost lines from allocation.

| Packet | Receipt | Amount | → Booking | Sale | Notes |
|--------|---------|-------:|-----------|-----:|-------|
| A1-MARNIE-ALA4SE | Bacf3H8J42Yw | $1,498.00 | **PDV-1371** ALA4SE | $1,498.00 | Payer = Yehuda Chaim Liebman brother (Owner); billed label “leibman yc bro” |
| A1-HAMBURGER-ZNHTY9 | 28813972813 | $749.70 | **PDV-1231** ZNHTY9 | $749.70 | Bank/traveler Jacob; sheet Yanky; cost $733.93 already recorded as source fact |
| A1-PENINA-CF7XDE | 2Hy0K5B7Iftt | $939.15 | **PDV-1243** CF7XDE | $939.15 | Bank Penina; billed Yosef Elbaz |
| A1-PENINA-CFELTD | 2Hy0K5B7J7F9 | $865.92 | **PDV-1244** CFELTD | $865.92 | same |
| A1-ETC-QWGEAR | 28108454733 | $643.44 | **PDV-1165** QWGEAR | $643.44 | Bank Etc Worldwide LLC |
| A1-MOISHE-CQO54K | 2166882028Gb | $295.18 | **PDV-1108** CQO54K | $295.18 | Not PDV-1169 AF24KF |

**Owner ask:** Approve posting these six allocations only (no other money changes).

---

## A2 — Blocked until booking link / extra fact

Total receipts **$6,139.00** held aside.

| Packet | Receipt | Amount | Blocker | Owner ask |
|--------|---------|-------:|---------|-----------|
| A2-PERLOWITZ | SP260417-01901 | $4,609.00 | No booking in inventory; Apr 20 vs Apr 25 outbound unproven | Confirm travel date **or** allow Unknown date path, then create + allocate |
| A2-MATIS-HILTON | Cofuk69Doxln | $90.00 | No booking | Authorize Hotel create sale $90 / cost $50 then allocate |
| A2-RITA-950 | 31261085627 | $950.00 | No booking | Authorize itinerary-fee booking (cost Unknown/sheet 0) then allocate |
| A2-CHAIM-390 | Bacyoff140Ox | $390.00 | No climbers booking; **not** JECKLO $4,340 | Authorize Other create sale $390 / cost $300 then allocate |
| A2-GALIMIDI-100 | Bacszhtmhesm | $100.00 | Certificate/asset trail | Confirm booking vs asset treatment then allocate |

---

## Safety checklist before any execute

- [ ] Live read-back: receipt still unallocated; booking sale/paid unchanged from packet
- [ ] Historical gate / approved batch set per Owner
- [ ] Do **not** restart old invoice/ScanPay executors
- [ ] Fair House / fees / GISLVP etc. stay in Batch B — not this execute
