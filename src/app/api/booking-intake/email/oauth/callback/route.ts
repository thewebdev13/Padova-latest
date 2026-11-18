import { NextResponse } from 'next/server';
import {
  emailOAuthEnvKeyForMailbox,
  emailOAuthRedirectUri,
  exchangeEmailOAuthCode,
  verifyEmailOAuthState,
} from '@/lib/email-oauth-hosted';

function htmlPage(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.45}
  code,textarea{font-family:ui-monospace,monospace;font-size:0.85rem}
  textarea{width:100%;min-height:6rem;word-break:break-all}
  .ok{color:#0a7}
  .err{color:#b00}
  .box{background:#f6f6f6;border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}
</style></head><body>${body}</body></html>`;
}

/**
 * Google redirects here after Allow. Shows refresh token once for the developer to
 * put in Vercel env. Client never runs a local script and never shares a password.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) {
    return new NextResponse(
      htmlPage(
        'Padova email OAuth',
        `<h1 class="err">Google denied access</h1><p>${err}</p><p>Close this window and ask the developer for a new link.</p>`,
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const state = verifyEmailOAuthState(url.searchParams.get('state'));
    const code = url.searchParams.get('code');
    if (!code) throw new Error('Missing authorization code');
    const redirectUri = emailOAuthRedirectUri(request.url);
    const tokens = await exchangeEmailOAuthCode({ code, redirectUri });
    if (tokens.error) throw new Error(tokens.error);
    const envKey = emailOAuthEnvKeyForMailbox(state.mailbox);

    if (!tokens.refresh_token) {
      return new NextResponse(
        htmlPage(
          'Padova email OAuth',
          `<h1>Almost done</h1>
           <p>Google did not return a <strong>refresh token</strong> (often happens if this mailbox already authorized the app).</p>
           <div class="box">
             <p>Mailbox: <code>${state.mailbox}</code></p>
             <p>1. Open <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Google Account → Third-party access</a></p>
             <p>2. Remove access for the Padova / SVMPForge app</p>
             <p>3. Open the developer’s start link again and click Allow</p>
           </div>`,
        ),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
      );
    }

    return new NextResponse(
      htmlPage(
        'Padova email OAuth OK',
        `<h1 class="ok">Email connected</h1>
         <p>Mailbox: <code>${state.mailbox}</code></p>
         <p>Send this to your developer (or paste into Vercel yourself). Do not post it in a public chat.</p>
         <div class="box">
           <p>Env key:</p>
           <p><code>${envKey}</code></p>
           <p>Refresh token:</p>
           <textarea readonly>${tokens.refresh_token}</textarea>
         </div>
         <p>After the token is saved on the server, unread booking emails can create drafts automatically. You still approve drafts before anything goes live. You can close this page.</p>`,
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'OAuth callback failed';
    return new NextResponse(
      htmlPage('Padova email OAuth', `<h1 class="err">Could not finish</h1><p>${message}</p>`),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );
  }
}
