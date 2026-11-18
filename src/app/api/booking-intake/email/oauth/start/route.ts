import { NextResponse } from 'next/server';
import { currentActor } from '@/lib/auth';
import {
  assertEmailOAuthSetupAccess,
  buildGoogleEmailOAuthUrl,
  emailOAuthRedirectUri,
  signEmailOAuthState,
} from '@/lib/email-oauth-hosted';
import { assertAllowedIntakeMailbox } from '@/lib/booking-intake';
import { AccessError } from '@/lib/users';

/**
 * Hosted Gmail OAuth start — Owner opens this on phone/laptop.
 * No local script. No mailbox password shared with the developer.
 * Auth: signed-in staff OR ?setup=<PADOVA_EMAIL_INTAKE_OAUTH_SETUP_SECRET>
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mailboxRaw = url.searchParams.get('mailbox') || '';
    const setup = url.searchParams.get('setup') || url.searchParams.get('key');
    const actor = await currentActor();
    if (setup) assertEmailOAuthSetupAccess(setup);
    else if (!actor) throw new AccessError('Sign in required, or use a setup link from the developer', 401);

    const mailbox = assertAllowedIntakeMailbox(mailboxRaw);
    const redirectUri = emailOAuthRedirectUri(request.url);
    const state = signEmailOAuthState(mailbox);
    const googleUrl = buildGoogleEmailOAuthUrl({ mailbox, redirectUri, state });
    return NextResponse.redirect(googleUrl, { status: 302 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unable to start email OAuth';
    return NextResponse.json(
      { error: message },
      { status: e instanceof AccessError ? e.status : 400 },
    );
  }
}
