# Partnerships implementation and acceptance

## Isolation and current state

Built in `C:/Users/necha/.codex/worktrees/padova-partnerships/Padova System Build`, branch `codex/padova-partnerships`. Initial base `77764e9`; latest main `cb13baf` was merged as `c6955ea`. Main remains on `codex/padova-v1`, with its original `docs/BUILD_STATE.md` and `next-env.d.ts` working changes preserved. No shared live database, source workbook, other chat, deployed application or operational gate was modified.

The module is implemented and available in the synthetic review app. Production installation/import and the permanent production ChatGPT connection await specific cutover approval. The temporary test connector contains synthetic records only. Read [PARTNERSHIPS_RUNBOOK.md](PARTNERSHIPS_RUNBOOK.md) for daily operations, manual refresh, recovery and cutover sequencing.

## Delivered behavior

- Searchable organizations/branches and multiple contacts/channels; explicit verification and do-not-contact controls.
- Owned work queues with next actions, due dates or explicit unscheduled reasons, overdue work, reply review, previous discussion and personalized message drafts.
- Current relationships/opportunities independent from historical affiliate/direct campaigns. Imported interest/public contact information never activates a partner.
- Append-only interaction history, quick notes/calls, dated sourced research, hotel arrangements/restrictions, private encrypted documents and source links.
- Versioned agreements with original wording, acceptance evidence/date/method and effective dates. Expired confirmation is flagged; superseding/ending terms cannot leave stale current active opportunities.
- Specific recipient/message approval with stale-context invalidation. No delivery API/background send exists. External sends require evidence and renewed follow-up details.
- Canonical booking/referral/commission links, independently authorized financial visibility and exact term-version matching. No competing ledger, guessed percentage, imported financial posting or automatic activation.
- Repeatable source packages, immutable snapshots/mappings, reviewed identity corrections, exact reconciliation/replay/restore and manual incremental email tooling.
- Eight restricted OAuth/MCP tools, actual-user attribution, optimistic concurrency, transaction-time authorization, one-hour access tokens, rotating refresh tokens with a seven-day absolute limit, replay-family revocation and individual revocation.

## Verified import preparation

Private evidence: `.data/partnerships-evidence/2026-11-03`. Latest package: `.data/partnerships-package-v5`. Full reconciliation/restore: `.data/partnerships-reconciliation-v7/reconciliation.json`. No real source data or encryption/session keys are committed.

| Source/item measure                                      | Verified result |
| -------------------------------------------------------- | --------------: |
| Source bundles                                           |              36 |
| Preserved source items                                   |          27,069 |
| Imported outcomes                                        |           7,143 |
| Duplicate copies linked                                  |          18,291 |
| Unresolved items                                         |           1,419 |
| Excluded with recorded reasons                           |             216 |
| Import errors                                            |               0 |
| Organizations                                            |           1,878 |
| History entries, including document events               |           5,518 |
| Dated research entries                                   |              35 |
| Open review cases, including additional source conflicts |           1,738 |
| Encrypted matched private documents                      |              36 |
| Imported active partners / financial bookings            |           0 / 0 |

All source items reconcile: 7,143 + 18,291 + 1,419 + 216 = 27,069. Review-case count is separate because an item may also carry an explicit source conflict. Headers, structural copies, unrelated operational correspondence and contextual build prompts are preserved with exclusion reasons. Source text/payload verification is full-length, including UTF-8/BOM-safe database-byte checks; JSON key-order differences are canonicalized for comparison. Identical batch replay creates no duplicates. All 22 module tables restore; encrypted documents decrypt to the captured hashes.

Captured all 14 primary workbook tabs, including hidden/archive tabs, and eight referenced/discovered workbooks. The empty secondary CRM is explicitly recorded as empty. Preserved workbook bytes and every populated row/cell, formula, cached value, comment and hyperlink. The historical offer and both recovered ChatGPT research conversations are preserved; source instructions are excluded from operational facts. The original ranked ten-prospect report, its citations, New Orleans restrictions and earlier explicit CH findings are distinct dated research; reconstructed research remains separately labeled.

Full mailbox coverage is the union of the scoped search and every archived message ID: 2,250 full originals. All 2,196 workbook archive IDs were found in bookings@padovatravels.com, including four chabad@ copies. No known archived email is missing. Independent mailbox-wide completeness for other accounts is not inferred. No independently supplied WhatsApp export was found; supplied notes already in source history remain preserved.

Attachments: 146 MIME parts inventoried; 118 captured with byte/size/SHA256 checks; 28 remain inaccessible through the connector after retry. Matched unique organization/file combinations yield 36 encrypted documents. Duplicate signatures/icons retain all provenance; ambiguous files remain in private evidence/review rather than being assigned by guess. No claim of complete attachment retrieval is made.

## Actual ChatGPT account acceptance

Verified in the existing **PadovaTravels Business** workspace, using private plugin **Padova Partnerships Test**. The actual OAuth flow discovered the resource/issuer, dynamically registered the client, used PKCE and the exact stable callback, authenticated an individual synthetic staff account and granted only partnership read/write scopes.

ChatGPT searched for the synthetic Harbor organization, retrieved history, created exactly one explicitly authorized undated internal note, and read it back. The note is independently visible in the CRM timeline; the organization remains a prospect. No outreach/accounting action occurred. Proofs: `.data/partnerships-acceptance/chatgpt-roundtrip.json`, `chatgpt-roundtrip.jpg` and `chatgpt-plugin.jpg`. Plugin identifier: `plugin_asdk_app_6aebab8b91d08191a586282ed1c6a26b`. This is an actual account test, not merely an MCP protocol simulation.

The free HTTPS tunnel targets only synthetic localhost:3341. Its current URL/PID/logs are ignored in `.data/partnerships-demo/`. It depends on this computer remaining online; it is not permanent production hosting. Production setup uses the approved app origin after cutover. Mailbox refresh remains manual and separate from MCP.

## Verification

- Final full main-plus-module regression suite: **246/246 passed**, zero skipped or failed.
- 147/147 restricted native financial cases passed against the preserved foundation.
- Latest 9/9 focused module/security cases pass after the final deferred-review correction, including native preservation/RLS, refresh rotation/replay, source recovery/corrected identity attribution, document idempotency/encryption/restore, stale approvals and canonical commission payment/cancellation/reversal.
- Both isolated authenticated HTTP/security suites passed. The final module HTTP run additionally verifies form-encoded refresh rotation, retired access tokens, replay-family revocation and individual consent sign-in.
- TypeScript and optimized builds passed; repository formatting passes with canonical LF checkout normalization. Frozen adapter/fixture SQL has no semantic change.
- Browser verification covers queue/overdue work, reply review/follow-up change, personalized drafts/exact-recipient approval, the actual ChatGPT note, quick call logging, private document upload and mobile layout. Deferred unresolved records remain visible with their decision reason. Queue text wraps independently of the main ledger table styles. No whole-page mobile horizontal overflow; the wide table has its own scroll area.
- Manual email-refresh tooling preserves exact capture bytes, maps only known unique threads, keeps new threads unresolved and inventories missing attachments. Final HTTP import dry run validates all 36 bundle hashes / 27,069 items without production requests.

Review screenshots (synthetic only): [work queue](screenshots/partnerships-queue.jpg), [history and ChatGPT note](screenshots/partnerships-history.jpg), [mobile](screenshots/partnerships-mobile.jpg). Actual account acceptance conversation: [ChatGPT test](https://chatgpt.com/c/6aebacbc-57a8-83ed-938d-2fee9763ee57).

## Remaining controlled work

The isolated application, tested additive migration, complete accessible source package, reconciliation and operations runbook are ready for cutover review. Latest main remains `cb13baf`; its two uncommitted files remain untouched. Production cutover requires a fresh independent recovery proof, the reviewed additive migration/application artifact, real staff assignment, refreshed source deltas and explicit Owner approval. No business commission rule or production relationship is inferred from historical evidence.
