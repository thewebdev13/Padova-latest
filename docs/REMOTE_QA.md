# Remote QA

Same Padova application, separate optimized `.next-qa` build and persistent synthetic `.data/remote-qa` fixture. No separate product, Supabase project/schema, cloud migration, historical import or financial cutover. Existing Practice contains historical labels and is intentionally not exposed. Production settings and operational gate are not changed.

The free Cloudflare Quick Tunnel gives HTTPS without an account or domain. It is temporary: keep this Windows computer awake/online and both QA processes running. Restarting the tunnel changes its URL; the database and individual logins persist. There is no uptime guarantee. See [Cloudflare's Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Access

- Current URL: ignored `.data/qa-url.txt`.
- Tester login: ignored `.data/remote-qa-access/tester.json`. This is one named individual account for the outside tester, not a shared staff login. Do not distribute it to several testers. No invitation/email service is required. Tester can change their own password under Settings using the existing password-change flow.
- Separate QA Owner login: ignored `.data/remote-qa-access/owner.json`. Never send this file to the tester. Production Owner credentials do not work here.
- Owner reviews reports by signing into the QA URL as QA Owner and clicking **Review QA issues** below the banner. Tester sees only their own reports. Reports have actual user attribution, timestamps and separate storage; no screenshot upload or booking-note reuse.
- All generated booking IDs start `QA-`. Banner: **PRACTICE / QA — NOT REAL DATA**. Never enter real customer, passport, card or loyalty credentials.

Tester uses the existing EMPLOYEE permission model with a named **QA Tester** account and explicit operational grants. It supports all existing booking products, source methods, funding, receipts, edits and notes with fake data. The current simple booking form supports One Way and Round Trip; no new Multi-City feature was added. No user management, system settings, source evidence, owner accounting, full audit access, migrations or cutover permissions. Settings exposes only the tester's own account/password/recovery controls.

Synthetic catalogs include travelers, customers, company, sellers, airlines, hotel, rental provider, source methods, loyalty programs/accounts, masked payment accounts, points lots, vouchers, hotel credit and certificates. No historical labels or original spreadsheet records were copied.

## Run and recover

Node.js 24 and the existing installed dependencies are required. From this checkout:

```powershell
# Already initialized; do not reset or re-seed an existing QA database.
node scripts/qa.mjs setup
node scripts/qa.mjs build
node scripts/share-qa.mjs
# Read the current URL, then run HTTPS acceptance against that exact URL:
node scripts/qa.mjs test https://THE-CURRENT-ADDRESS.trycloudflare.com
```

Setup refuses an already completed fixture. Interrupted initial setup can resume before its ready marker is written, preserving prior rows/financial history. Initial provisioning uses audited individual recovery flows. Production `.env.local` is never loaded into QA runtime: the launcher starts with an OS-variable allowlist and suppresses Next environment-file processing. An independent guard rejects cloud/source/recovery credentials, cloud mode and any different data directory before opening a connection. Both historical file readers refuse QA, even for QA Owner. QA HTTPS login cookies are always Secure, HttpOnly and SameSite Strict. Existing origin checks, login throttles and actual-user server permissions remain enforced.

`cloudflared.exe` was downloaded from the official Cloudflare GitHub release, version 2026.10.6, into ignored `.data/qa-tools`. No software service or firewall inbound rule was installed. Start script uses hidden background processes; it refuses to take over an occupied port. Runtime process IDs are in `.data/qa-processes.json`; logs are `.data/qa-server*.log` and `.data/qa-tunnel*.log`. Stop only these identified QA processes to withdraw remote access. Do not stop the independent Practice/US servers.

Private HTTPS security proof: `.data/qa-security-proof.json`; automated checks in `scripts/test-qa.ts`. They verify anonymous denial, secure login, operational grants, booking creation/editing, catalog search, admin/settings denial, historical denial for both QA accounts, unavailable import/cutover/private-file paths, origin protection, report attribution/redaction and Owner review. All test mutations go only to QA. This launcher has no production connection or credentials and no production operation was issued.
