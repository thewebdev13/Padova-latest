#!/usr/bin/env node
/**
 * One-time Google OAuth helper for Padova email intake.
 * Run locally with client id/secret in .env.local — prints refresh token for each mailbox login.
 *
 *   node --env-file-if-exists=.env.local scripts/email-intake-oauth.mjs
 *   node --env-file-if-exists=.env.local scripts/email-intake-oauth.mjs --mailbox=mindy@padovatravel.com
 *
 * Never commit the refresh token. Put it in Vercel env / .env.local only.
 */
import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.PADOVA_EMAIL_INTAKE_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.PADOVA_EMAIL_INTAKE_CLIENT_SECRET?.trim();
const PORT = Number(process.env.PADOVA_EMAIL_INTAKE_OAUTH_PORT || 8765);
const REDIRECT = `http://127.0.0.1:${PORT}/oauth/callback`;
const mailboxArg = process.argv.find((a) => a.startsWith('--mailbox='))?.slice(10);
const loginHint = mailboxArg || process.argv[2] || 'Shmuel@padovatravel.com';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set PADOVA_EMAIL_INTAKE_CLIENT_ID and PADOVA_EMAIL_INTAKE_CLIENT_SECRET first.');
  process.exit(1);
}

const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
auth.searchParams.set('client_id', CLIENT_ID);
auth.searchParams.set('redirect_uri', REDIRECT);
auth.searchParams.set('response_type', 'code');
auth.searchParams.set(
  'scope',
  'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.readonly',
);
auth.searchParams.set('access_type', 'offline');
auth.searchParams.set('prompt', 'consent');
auth.searchParams.set('login_hint', loginHint);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    if (u.pathname !== '/oauth/callback') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const err = u.searchParams.get('error');
    if (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(`OAuth error: ${err}`);
      server.close();
      process.exit(1);
    }
    const code = u.searchParams.get('code');
    if (!code) {
      res.writeHead(400);
      res.end('Missing code');
      return;
    }
    const body = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: 'authorization_code',
    });
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = await tokenRes.json();
    if (!tokenRes.ok) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json, null, 2));
      server.close();
      process.exit(1);
    }
    const refresh = json.refresh_token;
    console.log('\n=== Padova email intake OAuth success ===');
    console.log(`Mailbox login hint: ${loginHint}`);
    if (refresh) {
      console.log('Refresh token (store in env, never commit / never WhatsApp):');
      console.log(refresh);
      const hint = String(loginHint).toLowerCase();
      if (hint.startsWith('mindy@')) {
        console.log('\nSuggested env key: PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_MINDY');
      } else if (hint.startsWith('shmuel@')) {
        console.log('\nSuggested env key: PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_SHMUEL');
      } else if (hint.startsWith('bookings@')) {
        console.log('\nSuggested env key: PADOVA_EMAIL_INTAKE_REFRESH_TOKEN_BOOKINGS');
      } else {
        console.log('\nSuggested env key: PADOVA_EMAIL_INTAKE_REFRESH_TOKEN');
      }
    } else {
      console.log(
        'No refresh_token in response (Google only returns it on first consent). Revoke prior access and retry with prompt=consent.',
      );
      console.log(JSON.stringify({ access_token_present: Boolean(json.access_token) }, null, 2));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<html><body><h1>Padova email OAuth OK</h1><p>Return to the terminal for the refresh token. You can close this window.</p></body></html>',
    );
    server.close();
    process.exit(0);
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('OAuth callback failed');
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Listening on ${REDIRECT}`);
  console.log('Add this exact redirect URI in Google Cloud OAuth client.');
  console.log(`\nOpen this URL and sign in as ${loginHint}:\n`);
  console.log(auth.toString());
  console.log('\nWaiting for callback…');
});
