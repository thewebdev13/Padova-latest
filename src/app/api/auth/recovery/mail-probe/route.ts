import { NextResponse } from 'next/server';
import { database } from '@/lib/db';
import { refreshGmailAccessToken, refreshTokenForMailbox } from '@/lib/email-gmail';
import { sendPasswordResetEmail } from '@/lib/password-reset-mail';

/**
 * QA-only: prove password-reset mail delivery without guessing staff emails.
 * GET ?setup=OAUTH_SETUP_SECRET&to=you@example.com
 * Never available when PADOVA_QA is off / production-like.
 */
function qaSurface() {
  return (
    process.env.PADOVA_QA === '1' ||
    /qa\.padovatravel\.com/i.test(String(process.env.PADOVA_PUBLIC_APP_URL || '')) ||
    /qa\.padovatravel\.com/i.test(String(process.env.VERCEL_PROJECT_PRODUCTION_URL || ''))
  );
}

export async function GET(request: Request) {
  if (!qaSurface()) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }
  const url = new URL(request.url);
  const setup = url.searchParams.get('setup') || '';
  const expected = process.env.PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET?.trim() || '';
  if (!expected || setup !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const mailbox =
    process.env.PADOVA_PASSWORD_RESET_MAILBOX?.trim() ||
    process.env.PADOVA_PASSWORD_RESET_FROM?.trim() ||
    'bookings@padovatravel.com';
  const refreshPresent = Boolean(refreshTokenForMailbox(mailbox));
  const resendPresent = Boolean(
    process.env.PADOVA_RESEND_API_KEY?.trim() || process.env.RESEND_API_KEY?.trim(),
  );
  const to = (url.searchParams.get('to') || '').trim().toLowerCase();

  const report: Record<string, unknown> = {
    mailbox,
    refresh_token_present: refreshPresent,
    resend_present: resendPresent,
    public_app_url: process.env.PADOVA_PUBLIC_APP_URL || null,
  };

  if (refreshPresent) {
    try {
      await refreshGmailAccessToken(refreshTokenForMailbox(mailbox)!);
      report.gmail_token_refresh = 'ok';
    } catch (err) {
      report.gmail_token_refresh = 'failed';
      report.gmail_token_error = err instanceof Error ? err.message.slice(0, 240) : String(err);
    }
  } else {
    report.gmail_token_refresh = 'skipped_no_token';
  }

  if (to && (refreshPresent || resendPresent)) {
    try {
      const sent = await sendPasswordResetEmail({
        to,
        resetUrl: 'https://qa.padovatravel.com/#reset=mail-probe-test-only',
        expiresMinutes: 5,
      });
      report.send_test = sent ? 'accepted' : 'no_provider';
    } catch (err) {
      report.send_test = 'failed';
      report.send_error = err instanceof Error ? err.message.slice(0, 240) : String(err);
    }
  } else if (!to) {
    report.send_test = 'skipped_pass_to_query';
  }

  if (url.searchParams.get('list_staff') === '1') {
    try {
      const db = await database();
      const rows = await db.query(
        'SELECT lower(email) AS email, active, role FROM staff ORDER BY email ASC LIMIT 50',
      );
      report.staff = rows.rows.map((r) => ({
        email: String(r.email || ''),
        active: Boolean(r.active),
        role: String(r.role || ''),
      }));
      report.staff_count = rows.rows.length;
    } catch (err) {
      report.staff_error = err instanceof Error ? err.message.slice(0, 240) : String(err);
    }
  }

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
