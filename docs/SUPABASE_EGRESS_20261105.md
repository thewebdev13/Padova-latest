# Supabase egress reduction — 5 November 2026

## Follow-up observed 7 November 2026

Authenticated refreshed dashboard: cycle total **31.366 GB** (production **27.458 GB**, QA **3.908 GB**), up **6.110 GB** from the earlier reading. The cumulative increase includes late release-day metrics and is not a clean post-release measurement. Complete day **6 November**: organization Shared Pooler **2.057 GB**, Auth **1.673 MB**; production pooler **1.792 GB**, Auth **954.877 KB**; QA pooler **271.528 MB**, Auth **758.53 KB**. This does **not** meet the 100 MB/day target: roughly 20 times that target and about 62 GB/30 days if repeated. That extrapolation is not proof that necessary optimized business traffic cannot fit the Free plan; remaining traffic origins need investigation. Current quota margin: **negative 26.366 GB**. November 7 is partial and metrics refresh hourly.

The current banner and detailed grace notice both show **9 November 2026** as the restriction deadline, replacing the December 6 date previously displayed. Notice says restricted requests return HTTP 402. Owner notification is urgent. No production changes or new recurring monitoring were performed during this one-time follow-up. Private screenshot: `.data/egress-release/usage-followup-20261107.jpg`.

## Verified usage

Organization `iftwnlcmpyjljbbsvnxm` remains Free; no card, upgrade or paid service.
Dashboard cycle: 27 October–27 November 2026. Observed before release:

| Scope                             |            Egress |
| --------------------------------- | ----------------: |
| Organization                      |         25.256 GB |
| Production `unugynfzmxjxifgofxjr` | 22.001 GB (87.1%) |
| QA `cnpyvmhgbtyleckyirye`         |  3.255 GB (12.9%) |
| Difference at displayed precision |          0.000 GB |

The allowance is 5 GB, not the email's 5.5 GB warning threshold. Current margin is
**negative 20.256 GB**. Usage already served cannot be removed retroactively.
The dashboard displays a grace deadline of **6 December 2026** and refreshes hourly.
Its banner says the previous cycle exceeded quota although the selected current
cycle also exceeds it; do not reinterpret that platform wording as a second bill.

The organization chart for 5 November shows Shared Pooler **13.506 GB**, Auth
**3.101 MB**. QA on that day shows Shared Pooler **521.811 MB**, Auth **1.435 MB**.
QA 4 November: Shared Pooler **880.370 MB**, Auth **2.705 MB**. This is direct pooled
Postgres traffic, not a REST response-byte report. API gateway logs do not provide
exact per-query network bytes. No fabricated service totals or backup attribution.
Both projects have zero Storage buckets/objects, zero Edge Functions; organization
usage shows zero cached egress, Storage size, Realtime connections/messages and
Edge invocations. Auth is small relative to pooled reads. No Storage changes needed.

## Actual causes and changes

- Every browser tab previously fetched the whole state every 30 seconds, including
  hidden tabs, plus focus reloads. An authenticated 30-second revision check now
  returns only a digest. Audited command/security changes trigger fresh reads;
  command completion always queues a read after the command. Hidden tabs do not
  poll; focus/visibility checks cannot overlap. Full fallback every 30 minutes
  covers administrative changes outside application commands. No financial balance
  cache, session bypass or permission relaxation.
- Production historical preparation index: **2,190 calls / 8,998,710 rows** in
  query statistics since 27 October. It was loaded on every Owner refresh despite
  showing 100 rows. Now only requested on Attention, with SQL search/status filters,
  deterministic 100-row pages and an extra-row continuation check. Counts are server
  aggregates; full facts, rationale and compressed evidence remain on authorized
  detail. Measured query JSON: **5,041,268 → 47,446 bytes** for the first page.
- Booking itineraries contained **10,839,513 bytes** of `historical_sources` across
  the production population. A narrow list projection omits that evidence field.
  Original stored evidence and Owner detail remain intact. Worker redaction remains.
- Economics previously reread every booking balance and business date after the
  list had already obtained them. Production recorded **255,916** balance reads;
  QA **235,842**. The list now reuses its same-request row and date. Command/detail
  calculations still read fresh rows. Exact monetary SQL types remain unchanged.
- Saved draft lists return only IDs/titles/timestamps. Entry payloads load when
  continuing a draft, with server-side `created_by` restriction including for Owners.
- QA recorded **7,093** full booking-list calls since 1 November. Interactive idle
  polling shares the same fix. Unit and restricted-adapter tests use isolated local
  databases; this pass does not repeatedly run hosted financial mutations.

Statistics are cumulative since each project's reset, not billing-cycle byte
counters. They prove actual query repetition but cannot precisely separate manual
browser use, hosted test use and unattended open tabs retrospectively.

## Offline before/after verification

Same existing restored fixture, 489 bookings, read-only transaction and restricted
application role. No cloud download. JSON bytes measure returned data, not exact
Postgres/TLS wire overhead. Private proof: `.data/egress-offline-comparison.json`.

| Measure                       |      Previous |         Optimized |
| ----------------------------- | ------------: | ----------------: |
| Queries per full snapshot     |         5,430 |             4,450 |
| Database result JSON          |  27,228,130 B |       1,358,541 B |
| Browser state JSON            |  14,425,625 B |       1,857,751 B |
| Local elapsed time            |      4,884 ms |          2,695 ms |
| Idle revision database result | full snapshot | 670 B / 3 queries |

Financial projections for every booking, operational views, financial activity and
journal are deeply equal. Snapshot no longer includes historical source content;
authorized detail retains it. The revision endpoint's HTTP JSON is under 100 bytes.
Actual network savings include authentication and protocol overhead not in this table.

## Health and recovery

Keep three daily production health checks and existing watchdog unchanged. Read:
installed adapter marker only. Live verification: 200, 144 response bytes,
`no-store`, correct production ref, 5 November 19:49 UTC. At 90 calls/month the
response bodies total 12,960 bytes, excluding transport overhead; health is not a
material cause. No financial queries, fake records or backups in health.

Production statistics record 30 COPY reads of staging evidence (1,143,175 rows)
and 3,758 COPY calls across tables, reflecting multiple recovery captures. Those
counts do not reveal exact billed bytes or distinguish all capture/readback work.
Do not reduce required pre-posting captures or omit evidence from backups.
Existing encrypted archive, off-device proof, separate key and 141-table/three-user
restore verification remain valid. This code-only optimization uses the already
restored local copy for comparisons instead of downloading another cloud population.
Restore verification and archive hashing can be repeated locally; off-device
readback remains required for each new uploaded backup. Downloads from Drive are
not Supabase Storage egress. Recovery configuration/code is unchanged.

## Forecast and free monitoring

Use the [organization Usage page](https://supabase.com/dashboard/org/iftwnlcmpyjljbbsvnxm/usage).
Select the current cycle and each project; inspect **Egress**, especially **Shared
Pooler Egress** in daily chart tooltips. Cached egress has a separate quota.
Official [egress documentation](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
explains accounting, hourly refresh and lack of retroactive reduction.

No polling monitor or new service is required. Check daily during the first week
after release, then weekly. Target a steady organization rate below **100 MB/day**
(3 GB/30 days); investigate at **3 GB/cycle**, act urgently at **4 GB/cycle**. While
the existing cycle is already over quota, compare daily increments after rollout.
Warnings do not disable normal production or weaken recovery.

Forecast formula using observed result sizes: **1.359 MB × full snapshots +
0.000670 MB × revision checks + Auth/protocol + required backup traffic**.
Illustrative one visible session, eight hours/day, 40 change-driven/manual full
refreshes plus 16 fallback refreshes/day: about **2.28 GB/month** of snapshot
results, plus about **19 MB/month** of revision results. Add measured Auth,
QA, network overhead and actual backup cadence. This is a scenario, not an observed
post-deployment forecast or guaranteed margin. Two active devices and frequent
mutations increase it; never assume a single session when interpreting the chart.

If usage rises, inspect background old-version tabs, query statistics, full-read
frequency, number of active devices, bulk historical work and required captures.
The remaining compact operational state still includes the current full booking
and directory populations for cross-view financial summaries. Further server-side
pagination/summary endpoints are a scaling follow-up; no claim that every list
was converted in this focused reduction. Preserve exact/Unknown balances.

## Release status

Owner explicitly approved QA, then production after acceptance. Hosted QA passed
at `https://qa.padovatravel.com`, deployment `dpl_6RsvJvcKuswnxBvoFgvpFqJy5AvC`:
individual Owner/Worker sessions, cross-session revision changes, stable idle and
idempotent replay, unchanged financial detail, anonymous denial and QA isolation.
Only one synthetic nonfinancial note was added. QA state is 332,912 bytes and the
revision response 79 bytes. This approval resolved the earlier upload rejection.

Production transport `7a49edca5bd8a671c02570ed6926b88ef9bd6013` is live on existing
Render service, deployment `dep-dbme3vh5efls73a8pl10`. GitHub archive download hash
matches the tested source. The first build correctly rejected the old checksum
pin; updating only the expected archive digest allowed the verified build to pass.
No schema, credentials, backup configuration, financial data or plan changes.
The previous live deployment remains the rollback point. If rebuilding that old
source, restore its corresponding expected checksum; do not remove verification.

Prepared integrated application commit: `cd6f770137512cffe1593442268ec81fdff87c72`.
125 source-only files, ZIP 357,120 bytes, SHA256
`5bb719f79eaaf175ce7064d52e2a5dd02aeee54b162f43c34d8c51301ce41372`.
Exact source matches committed files. Live Partnerships a549dcc is preserved;
Render current baseline is transport 4a039b361bd3520a076b10480da3927903318ae4,
deployment dep-dbm5vp15efls73cjm9bg. Partnerships already uses server pagination
(50 queue rows, 30 search choices) and has no continuous polling loop.

Final local validation: 241/241 regressions, 147/147 restricted financial tests,
9/9 Partnerships tests, focused draft isolation/evidence preservation, TypeScript,
formatting, integrated optimized build and HTTP/security acceptance all pass.

Hosted production acceptance passed at 20:08 UTC: health 200/144 bytes, state
1,857,959 bytes, revision 79 bytes, historical pages 45,003 and 44,570 bytes with
100 rows and no duplicate IDs across pages. Full authorized historical detail,
booking detail, Partnerships, all eight operational views, individual Owner login,
anonymous denial, no-store and draft metadata isolation pass. No production test
records or financial commands. The brief 502 during cutover cleared after startup.
Before/after aggregate checks match: 489 bookings, 90 payments, 23,123,930 payment
cents, zero journal difference, daily entry true, historical false/batch NULL.

Private proofs: `.data/egress-qa-acceptance.json`,
`.data/egress-production-acceptance.json`, `.data/egress-release/release-proof.json`
and `.data/egress-release/render-live.jpg`. Latest successfully read billing total
is the pre-release 25.256 GB above; post-release dashboard reconnection failed, so
there is no claimed new measured daily rate or guaranteed free-plan headroom yet.
Refresh older app tabs after saving drafts so they load the optimized client.

Existing package lock is unchanged. Render/npm audit reports four high-severity
package entries from one transitive Zod collection-validation memory-exhaustion
advisory via `@vercel/functions` / OIDC / CLI config. A dependency update is a
separate follow-up requiring QA; this release adds no dependency change. No new
functional P0/P1 was observed in acceptance. Do not describe the dependency audit
as clean or convert the illustrative egress scenario into a guaranteed forecast.
