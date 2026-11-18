# Email auto-intake (Gmail OAuth)

Booking-related mail becomes a **booking draft** (staff approve). Never invents money. Never creates a live booking.

## Approved intake mailboxes

- `Shmuel@padovatravel.com` — OAuth required  
- `mindy@padovatravel.com` — OAuth required (own mailbox; not an alias of bookings@)  
- `bookings@padovatravel.com` (login often `bookings@padovatravels.com`) — OAuth required  

Optional: `PADOVA_EMAIL_INTAKE_ALIAS_MAILBOXES=` comma list only if a mailbox truly is a Google alias of another.

---

## Preferred: hosted connect (Owner phone/laptop — no local script)

The client does **not** run a script and does **not** share a mailbox password.

### 1. Google Cloud (developer, once)

1. Enable **Gmail API**.
2. OAuth consent screen in **Testing** → add the three mailboxes as **Test users** (use the real Google login, e.g. `bookings@padovatravels.com`).
3. OAuth client (Web) → Authorized redirect URIs must include:

```
https://qa.padovatravel.com/api/booking-intake/email/oauth/callback
```

4. Put Client ID / Secret / setup secret on Vercel QA:

```bash
PADOVA_EMAIL_INTAKE_CLIENT_ID=...
PADOVA_EMAIL_INTAKE_CLIENT_SECRET=...
PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET=long-random
PADOVA_EMAIL_INTAKE_OAUTH_REDIRECT_URI=https://qa.padovatravel.com/api/booking-intake/email/oauth/callback
PADOVA_EMAIL_INTAKE_CRON_SECRET=...
CRON_SECRET=...   # same value OK for Vercel Cron
```

### 2. Send the Owner one link per mailbox

Replace `SETUP` with `PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET`:

```
https://qa.padovatravel.com/api/booking-intake/email/oauth/start?mailbox=bookings@padovatravels.com&setup=SETUP
https://qa.padovatravel.com/api/booking-intake/email/oauth/start?mailbox=Shmuel@padovatravel.com&setup=SETUP
https://qa.padovatravel.com/api/booking-intake/email/oauth/start?mailbox=mindy@padovatravel.com&setup=SETUP
```

Owner opens the link → Google Allow → page shows the **refresh token** + env key name.  
They send that token to you (or paste into Vercel). You never see their password.

### 3. Store tokens on QA

```bash
PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL=...
PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY=...
PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS=...
```

Redeploy, then cron/poll creates drafts from unread booking mail.

---

## Attachments (all booking patterns)

For every unread booking-related message, the poller:

1. Downloads **PDF** and common **image** attachments (confirmation screenshots).
2. Extracts text (PDF text layer / OCR when needed).
3. Runs the same reservation parsers used for Amex, United, Capital One, Chase, Etihad, hotels, etc.
4. Creates **one draft per useful file** (e.g. one passenger receipt each). Falls back to the email body if no attachment yields booking fields.
5. Never invents **Sale** amounts from unclear extras/seat fees.

---

## Auto-fetch

Call on a schedule:

`GET` or `POST` `https://qa.padovatravel.com/api/booking-intake/email/poll`  
Header: `Authorization: Bearer <CRON_SECRET>`

### cron-job.org settings (avoid Failed timeout)

- Request timeout: **90–120 seconds** (Advanced settings) — default 30s is too short when PDFs are scanned.
- Poll is capped (~5 unread per mailbox, digital PDF text only; image OCR skipped on cron).
- If a test run still times out, raise the job timeout first, then retry.

---

## Optional: local helper (developers only)

`npm run intake:email-oauth -- --mailbox=...` still works with redirect `http://127.0.0.1:8765/oauth/callback` — **not** for the client.
