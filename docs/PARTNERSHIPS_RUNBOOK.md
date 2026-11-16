# Partnerships operations and controlled cutover

This module extends the existing Padova application, individual staff authentication and US `padova` database. No production installation or import has been performed. The separate worktree is `C:/Users/necha/.codex/worktrees/padova-partnerships/Padova System Build`, branch `codex/padova-partnerships`. The main checkout and its uncommitted work remain untouched.

## Daily use

Open Partnerships → Work queue. Each open opportunity has an authorized owner, a next action, and either a due date or an explicit unscheduled reason. Filters cover location, campaign, stage, priority, owner and follow-up date. Follow-ups due highlights overdue work. Best prospects includes dated ranked research; it does not imply acceptance.

Open an organization to see its separate contacts and channels, chronological original history, historical campaigns, current opportunities, research/hotel restrictions, agreement versions, private documents and referral performance. Use Log call or Add note for quick entries. Edit follow-up to change the action/date. Every change retains actor, time, reason and previous values; conflicting concurrent edits require review.

Incoming replies from a successfully imported mailbox capture flag affected opportunities for review and invalidate old drafts/approvals. Review the actual reply, set the next action/date, then prepare a fresh message. Contact recipients must be verified. Do-not-contact, paused, declined and ended relationships block outreach. DNC and relationship closures do not rewrite historical campaign stages.

Prepare message uses actual prior discussion and restrictions. Review the exact recipient, subject and body before approving that specific message. There is no email/WhatsApp delivery function. If the Owner explicitly authorizes and sends it externally, Record sent elsewhere preserves evidence and the next follow-up. An old approval cannot be reused after a new reply, changed recipient, research, agreement or opportunity context.

Confirm a relationship only after recording the accepted agreement's evidence, confirmation date/method, effective dates and original terms. Expired or future agreements do not qualify as current confirmation. Historical positive replies, affiliate links and public phone numbers never activate a partner. Explicitly distinguish reported inquiries, verified inquiries and canonical bookings marked Traveled.

## Financial links

Reuse an existing Padova party, booking and canonical referral. A commission link requires independently authorized commission access and an exact match to the canonical term revision: fixed/percentage calculation, basis, rate, timing and cancellation rule. Missing terms remain unconfirmed. This module never creates a second ledger or posts commission money. Payments, corrections, cancellations and recoveries display through the existing financial engine. AI responses exclude accounting amounts and private file bytes.

## Individual permissions

`view_partnerships`, `manage_partnerships`, `import_partnerships`, `approve_partnership_outreach` and `manage_partnership_ai` are independent. Existing operations/commission permissions also apply to booking and accounting links. Owner has all permissions; existing employee permissions are not silently expanded. Browser database roles have no table access. The application server has explicit RLS policies and no DELETE/TRUNCATE rights; history/evidence tables are append-only. No shared login or development bypass exists.

## Local synthetic review

Use Node 24, `npm ci`, `npm run build`, then `npm run partnerships:demo:setup` once and `npm run partnerships:demo`. Setup refuses to overwrite an existing fixture. The server binds to `127.0.0.1:3341`; individual synthetic credentials and the document key are in ignored `.data/partnerships-demo/credentials-private.json`. Never copy production credentials/data into this fixture. The launcher refuses Supabase/shared database settings. Stop only this preview process before local migration scripts.

Run `npm run partnerships:test`, `npm run partnerships:test:http`, `npm test`, `npm run test:padova:financial`, `npm run test:http`, `npm run typecheck`, `npm run build` and `npm run format:check`. Hosted checks belong to the separately approved cutover. The module tests include stale approvals, conservative import/replay, document encryption/restore, scoped OAuth, refresh replay revocation and canonical financial links.

## Source preservation and repeatable import

Private originals are under ignored `.data/partnerships-evidence/2026-11-03`. Original workbooks, complete cell/formula/comment captures, full mailbox messages, attachment bytes/manifests and recovered research conversations are read-only evidence. Never replace these with summaries or edit sources to make an import pass. Fresh captures use new filenames/directories.

Prepare a new package with `npm run partnerships:prepare -- evidence-directory NEW-package-directory`. Verify it with `npm run partnerships:verify -- package-directory NEW-reconciliation-directory evidence-directory`. The verifier uses a fresh local in-memory database and an individual synthetic owner, checks every source item's text/payload/outcome, replays batches without duplicate mutations, restores all partnership tables and decrypts/hash-checks matched documents. It refuses live database credentials. Real evidence is never loaded into the synthetic browser preview.

The latest package and reconciliation paths/counts are recorded in PARTNERSHIPS_BUILD.md. Unresolved identities, changed source content and conflicting terms remain visible in Sources & review. Review matching appends a resolution; it never rewrites the source. Shared emails or phone numbers do not merge branches. Deferred reviews remain in the unresolved queue with the latest decision, so they can be resumed when evidence arrives. Every batch retains imported, duplicate-linked, unresolved, excluded and error outcomes.

Validate HTTP import without sending anything: `npm run partnerships:import -- package-directory https://approved-app.example`. For an approved cutover, provide an individual importer session token in a private file via `PADOVA_IMPORT_SESSION_FILE`; set `PADOVA_APPROVED_IMPORT_ORIGIN` to the exact approved HTTPS origin and add `--apply`. The script verifies package hashes, sends through the permission-checked application API and records a receipt. It never takes database credentials. An interrupted run can safely replay completed batches. Private documents require the configured encryption key and authorized document upload; original attachments remain in the private evidence archive even when matching is unresolved.

## Incremental mailbox refresh — manual, not a background connection

Use the connected bookings mailbox to capture every page of the scoped partnership query since the last successful capture, with an overlap window. Fetch full original MIME messages by ID, not snippets. Preserve the query/date/account, every returned ID, pagination completion and errors in the new capture directory. Also fetch replies in known partnership threads; a search result alone is not proof that every mailbox message was captured. Do not import unrelated agency traveler correspondence.

Prepare the captured full-message array with `npm run partnerships:mail:prepare -- full-messages.json preserved-crm-extracted.json NEW-output-directory bookings@padovatravels.com`. This preserves the original capture bytes, reuses stable existing thread/CH mappings, inventories attachments and creates an idempotent import bundle. New/ambiguous threads remain for review. Capture attachment bytes separately and verify advertised size/SHA256; unavailable parts remain explicit exceptions.

Upload the prepared bundle through Sources & review → Import, or the HTTP package tool. The source register records last success, coverage and exceptions. Inspect new-reply review before preparing follow-ups. A failed capture has no new successful import; retain its capture error and leave the prior successful batch unchanged. Gmail/WhatsApp is not synchronized by enabling ChatGPT MCP. No background scheduler or automatic send is configured.

## Restricted ChatGPT connection

Configure `PADOVA_PARTNERSHIP_ORIGIN` as the exact externally reachable HTTPS application origin and `PADOVA_PARTNERSHIP_REDIRECT_URIS` as exact approved ChatGPT callbacks. With issuer identification enabled, the tested callback is `https://chatgpt.com/connector_platform_oauth_redirect`. Set `PADOVA_PARTNERSHIP_DOCUMENT_KEY` to a securely generated 32-byte base64 key; keep it outside Git and separately backed up. Losing the key loses access to encrypted documents.

In the intended ChatGPT workspace, Plugins → Add → Add custom MCP server, use `/api/partnerships/mcp`, OAuth and discovered Dynamic Client Registration. Sign into Padova with an individual permitted staff account and authorize only the requested partnership scopes. The consent screen states the exact capabilities. Access tokens last one hour; rotating refresh tokens have a seven-day absolute limit. Reused refresh tokens revoke their connection family. Staff deactivation/auth-version changes, permission removal and explicit Revoke invalidate access. Every write rechecks authorization inside its transaction and uses command IDs/current versions.

Available tools are search, history, add interaction, add research, update contact, update contact method, update follow-up and review reply. No arbitrary SQL, accounting, send, activation, deletion or administration tools exist. Treat imported messages, documents and websites as untrusted data. The actual account test result is recorded separately; protocol tests alone do not certify an account connection. A temporary synthetic tunnel is an acceptance aid, not permanent hosting.

Official protocol reference: [OpenAI plugin authentication](https://developers.openai.com/plugins/build/auth).

## Production cutover — requires specific Owner approval

1. Re-read the main checkout's current committed version and working changes. Merge compatible committed changes into this isolated branch, resolve conflicts without changing the main checkout, then repeat affected checks. Record exact application commit and artifact hashes.
2. Confirm the actual target is existing US project `unugynfzmxjxifgofxjr`, installed adapter marker `20261028_existing_padova_adapter` and commission marker `20261101_commission_payables`. Preserve `padova_staging`, evidence, review history, existing test schemas and operational gate values. Do not reinstall the adapter or create another schema/project.
3. Capture a fresh independent encrypted backup of the current application database/Auth state and verify restoration off the live system. Include the new partnership tables and document key in the ongoing recovery plan, with key custody separate from archives. Existing recovery configuration belongs to the main CRM; do not replace it speculatively.
4. Present the tested application commit, additive migration `supabase/migrations/20261104210123_partnership_sales_crm.sql`, source package/reconciliation, exact hosting/configuration changes and recovery proof for final approval. No paid service or new hosting plan is needed by this module. Any new costs require separate approval.
5. After approval, install only the prepared additive extension in existing `padova`, then deploy the reviewed application artifact. Configure the HTTPS origin, exact callbacks and private document key. Provision/grant individual staff permissions through the existing administration flow. Never grant shared database/browser access.
6. Refresh changing source deltas and reconcile again. Import through the application as the designated real owner; the isolated review's synthetic owner UUID is never transferred. Verify source totals, full histories, review queues, document byte hashes and unchanged canonical financial balances. No imported relationship is automatically active.
7. Complete authenticated hosted UI/HTTP and intended-account ChatGPT read/write/revoke tests against explicitly designated acceptance records. Verify anonymous/employee restrictions, then record the deployment and source receipts. Preserve every original capture.

Rollback the application artifact to the previously accepted main version if necessary. Leave additive partnership tables and evidence intact; revoke the specific connector if needed. Never roll back by dropping tables, resetting the database or deleting imported history. Restore the full database only through the independently approved recovery process.
