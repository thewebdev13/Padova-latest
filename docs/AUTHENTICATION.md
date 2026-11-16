# Individual authentication and permissions

Hosted authentication now uses the existing US project's **Supabase Auth** and `padova.staff.user_id`, preserving this guide's roles, granular grants and interface. Provider tokens are encrypted behind the opaque app session; Padova does not store hosted password hashes. The local adapter and review-only SQL are implemented but unapplied. Read [PADOVA_ADAPTER](PADOVA_ADAPTER.md) for provider recovery semantics, setup prerequisites and exact review. Scrypt details below apply to the original local comparison fixture only.

The owner's 28 October 2026 requirement supersedes the initial development preview. Every environment now requires an individual staff email/password and server-issued session. There is no shared Padova account, default password, public signup, local owner bypass, or environment flag that grants access.

## First Owner and additional staff

For the original local comparison fixture, stop its server and run local migrations before `npm run staff:create`. For hosted Padova, first approve/install the existing-schema extensions and complete private CA/Auth configuration; **do not run the numbered local migrations against cloud**. Then run `npm run staff:create` in an interactive terminal with the verified actual Owner's name/email and a private password of at least 14 characters. Password input is hidden. This works only before staff accounts exist; subsequent users require authenticated **Users & Permissions**.

The initial Owner receives eight personal recovery codes in that terminal, shown once. Store them privately in an owner-controlled password manager or protected offline location. Never commit, share as a common login, or store them beside the database. No real Owner/Employee identity has been provisioned by the build; synthetic identities exist only in isolated tests.

Sign in, open **Users & Permissions**, and create each additional person with their own email and display name. New employees receive no usable default password. Issue a private setup/reset link and deliver it to the verified person. The recipient sets their own password and receives personal recovery codes. Additional employees require data records and grants, not schema changes.

## Roles and independent permissions

**OWNER / ADMIN** always has full system access, including user/permission administration, settings, accounting, audit and backup information.

**EMPLOYEE / WORKER** defaults to `operations` and `edit_payments`: booking/customer/company operations, tasks/calendar, and customer payment creation/allocation/correction. Customer sale prices, supplier costs, booking/company profit, margins, asset basis, accounting, protected traveler data, refunds/commissions and administration require additional explicit grants. Booking creation without charge permission records operational data with zero customer charge for later authorized completion; it does not invent a price.

| Grant                                     | Scope                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `view_sale_price`                         | Individual customer charges, balances and statements                                          |
| `view_supplier_cost`                      | Booking supplier/acquisition costs and supplier balances                                      |
| `view_booking_profit`                     | Individual expected booking profit                                                            |
| `view_total_profit`                       | Overall/monthly profit movements; no individual identifiers without booking-profit permission |
| `view_asset_basis`                        | Asset/lot cost and remaining cost basis                                                       |
| `view_accounting`                         | Accounting reports, cash flow and accounting exports                                          |
| `edit_payments`                           | Customer payment entry, allocation and corrections                                            |
| `edit_customer_charges`                   | Sale/fee entry and charge adjustments                                                         |
| `manage_funding`                          | Funding and supplier settlement operations                                                    |
| `view_refunds` / `issue_refunds`          | Refund case visibility / refund and cancellation actions                                      |
| `view_commissions` / `manage_commissions` | Commission/referral visibility / management                                                   |
| `manage_assets`                           | Travel asset transactions; does not grant cost-basis visibility                               |
| `edit_completed_bookings`                 | Changes to traveled or past-travel bookings and financial terms                               |
| `view_traveler_sensitive`                 | Protected traveler, DOB, KTN and passport information                                         |
| `view_audit`                              | Wider activity history; raw financial event payloads remain Owner-only                        |
| `manage_users`                            | Individual accounts, grants, deactivation and recovery administration                         |
| `manage_settings`                         | Reusable payment accounts, settings and backup/admin information                              |

The Owner edits individual checkboxes. Cost, price, booking profit, company totals, asset basis and accounting are separate server permissions. Denied amounts are omitted from responses, including detail views, histories and command replies. Employee dashboards show operational counts by default. Existing financial corrections retain their financial safety checks; this change does not implement the still-pending broader refund/funding correction workflows.

Delegated user administrators cannot promote themselves/others to Owner or administer permissions beyond their own grants. The last active Owner cannot be demoted/deactivated. Access changes revoke the target's sessions and pending reset links. Deactivation also invalidates personal recovery codes, preserves the staff row/history, and blocks login/recovery. Reactivation is explicit.

## Recovery and password changes

V1 has two recovery paths:

1. **Personal recovery code:** choose “Use a personal recovery code” at sign-in, provide your own email, one unused code and a new password. This works for a sole Owner without another signed-in administrator. Successful recovery invalidates all previous codes, returns eight replacements once, and revokes all prior sessions/reset links.
2. **Owner-assisted link:** “Forgot your password?” records an enumeration-safe request. An authorized Owner verifies identity and issues a random, hashed, single-use link valid for 30 minutes. The raw link is returned only once to the authorized operator, never listed in audit/history. Its secret is in the URL fragment rather than server request URLs. The recipient sets a password, saves new personal recovery codes, and signs in again.

Automatic email delivery is not configured. Owner-assisted delivery currently uses a verified private channel. Personal codes provide recovery without email credentials. Passwords, raw reset tokens and recovery codes are never stored in audit records.

Any signed-in user can change their own password after current-password verification, or replace their own personal recovery codes after password verification. Password changes revoke all sessions and reset links. Personal-code replacement invalidates old codes and pending reset links without changing role/grants. Keep currently valid codes protected; recovery codes are account credentials, not shared organizational access.

## Sessions, audit and verification

Passwords use salted, versioned scrypt (`N=16384,r=8,p=5`); existing earlier-format hashes are accepted and upgraded after a valid login where policy permits. See [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Opaque random session tokens are stored only as hashes, expire after eight hours, and use HttpOnly/SameSite cookies. Cookies are Secure on HTTPS. Production still requires owner-controlled HTTPS hosting and infrastructure review.

Login and recovery throttling persists in PostgreSQL across server processes/restarts. Successful credential recovery clears the account's login throttle. Session authorization checks active status and current authorization version on every request; material financial writes refresh that principal inside the transaction. Logout, deactivation, permission changes and password recovery invalidate appropriate sessions. The client clears previous-user detail state on logout/401 and rechecks on focus/every 30 seconds; already downloaded information cannot be recalled from a user's possession.

Financial actions preserve the actual authenticated staff UUID and timestamp in the financial audit. Immutable security history separately records successful/failed authentication, user administration, grants, deactivation, recovery issuance/use, password changes and code rotation. Unauthenticated recovery events identify their credential method rather than pretending an Owner was logged in.

Tests cover independent grants and response omission, direct endpoint attacks, deactivation, stale principals, session revocation, self-escalation, last-owner protection, reset expiry/replay/concurrency, sole-owner personal-code recovery, persistent throttling, and material-action attribution. Production MFA/SSO, proxy-wide abuse controls, automatic recovery email and cloud deployment remain separate infrastructure decisions.
