# Saved programmer instructions

Saved at the Owner's request on 9 November 2026. Attach the November 7 ZIP and send the message below. The ZIP remains an immutable dated snapshot; later changes require a separately identified update. Do not silently replace it under its existing checksum.

---

Hi,

I'm handing you **Padova**, my travel business's existing operations and accounting system, for an independent review and help finishing it.

The attached ZIP contains the application source, tests, database migrations, a schema snapshot, deployment documentation and a technical handoff. Credentials and private customer evidence are intentionally excluded.

**Start with START_HERE.md inside the ZIP.** Then read the documentation in HANDOFF_2026-11-07, particularly STATUS.md, SOURCE_OF_TRUTH.md, ACCOUNTING_RULES.md, DATABASE_AND_MIGRATIONS.md, HISTORICAL_RECONCILIATION.md and BACKUP_AND_ROLLBACK.md.

This is a snapshot dated **November 7, 2026**. Verify current live conditions rather than assuming everything reported then is still current.

## What I need

Please review the actual code and workflows, run the appropriate local tests, and establish exactly what works and what still needs finishing. Don't rely solely on previous claims that something was completed or tested.

My goal is a simple, reliable system with my historical information correctly organized and connected—not another redesign or rebuild.

Please cover:

- Bookings and voucher sales appearing together in Transactions, with clear balances/status and working detail/edit screens.
- Fast booking entry, reusable traveler profiles, customers, companies, sellers and source accounts.
- Customer receipts and allocations, supplier costs and payments, commissions receivable/payable, refunds, credits, vouchers, points and historical profit.
- All eight operational views: Customer Owes, Padova Owes Sellers, Commission Receivable, Commission Payable, Pending Refunds, Pending Credits, Missing Cost and Needs Attention.
- Historical information: what has actually been imported, what remains unresolved, and whether available information is properly displayed rather than stranded in raw source records.
- Authentication, Owner/Worker permissions, sensitive information, duplicate/retry protection and audit history.
- Mobile usability, persistence, deployment, monitoring, backup and recovery.
- Test coverage and material gaps that passing tests may not reveal.

## Existing environments

- Production: https://padova-production.onrender.com
- Production Supabase: unugynfzmxjxifgofxjr
- QA: https://qa.padovatravel.com
- QA Supabase: cnpyvmhgbtyleckyirye

The handoff explains the source repository situation. The production repository is shmuelp12/padova-production; shmuelp12/tabpadova is a separate build. Development and deployed versions differ, so establish exactly which changes are live.

## Important boundaries

Begin with review and local synthetic testing. Do not change production, deploy, import historical records, run hosted write tests or make destructive changes during the initial review.

Production and QA must remain separate. Daily production use is already unlocked; incomplete historical evidence alone is not a reason to disable it.

Preserve the existing accounting model, canonical identities, prior Owner decisions, source evidence and audit history. Original accounting spreadsheets remain read-only.

Unknown amounts must remain Unknown—not silently become zero. A supplier payment must not create a second cost. One receipt covering several bookings must not become several receipts. Voucher ownership does not establish its acquisition cost. Expected refunds are not received refunds.

Keep the existing **$0 spending limit**. No upgrades or paid services without my approval. Request access through appropriate invitations, not passwords.

## Reported issues to investigate first

The handoff identifies:

- Excess Supabase free-tier usage and a restriction warning dated November 9, 2026. Check the current situation; don't assume the warning is still active or resolved.
- Local cost-display fixes that had not been deployed.
- Incomplete historical reconciliation.
- A verified backup that predates the latest historical price posting.
- A private streaming backup helper that had not been integrated into the tracked backup script.
- QA deployment metadata indicating an upload with uncommitted changes.

These are starting points, not a substitute for your independent findings.

## What I want back

Please give me:

1. A clear assessment of whether the system is reliable for daily use.
2. What is complete, incomplete, broken or unverified.
3. A prioritized list of remaining work, separating production risks, software defects, undeployed changes and historical evidence gaps.
4. Evidence for significant findings: affected workflow, relevant code/test and the smallest practical fix.
5. The minimum additional access or private evidence you need.
6. A concrete completion plan with acceptance criteria and an estimated timeline after your review.

Keep the main explanation understandable to a business owner. Do not give me a huge generic checklist or ask me to repeat information already preserved in the project.

If something cannot be verified without private evidence or live access, say so explicitly. I want an honest assessment, not another blanket "everything is done."

The ZIP's SHA-256 checksum is:

```text
6f74148e20d341ad771cabc20ca2774878836760807dcb347d38be54a2761bb6  padova-programmer-handoff-2026-11-07.zip
```

Please verify the archive and begin with the handoff's START_HERE.md.

---

## Sending/access instructions retained for future use

Files are in `C:/Users/necha/OneDrive/Documents/ChatGPT/Padova System Build`:

- `padova-programmer-handoff-2026-11-07.zip`
- `padova-programmer-handoff-2026-11-07.zip.sha256`

Attach the ZIP. The SHA256 file is plain text containing a digital fingerprint, not a password. Attach it too, or paste its contents into the message. No need to unzip before sending.

The ZIP is sufficient for code review and local synthetic operation. Live review requires scoped invitations described in ACCESS_REQUIRED.md. Historical work additionally requires selected evidence from PRIVATE_EVIDENCE_MANIFEST.md; recovery work requires separately controlled recovery access. Never send the entire .data folder, .env.local, passwords, browser profiles or recovery keys alongside encrypted archives. The programmer should first review the ZIP, then request exact missing access/evidence.
