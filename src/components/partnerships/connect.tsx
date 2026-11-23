'use client';
import { useState } from 'react';
import AuthScreen from '@/components/auth-screen';
type R = Record<string, any>;
export function ConnectionSignIn({ synthetic }: { synthetic: boolean }) {
  return (
    <AuthScreen
      synthetic={synthetic}
      onLogin={async () => {
        window.location.reload();
      }}
    />
  );
}
export default function Connection({ data }: { data: R }) {
  const [message, setMessage] = useState('');
  const activeGrants = (data.grants ?? []).filter((g: R) => !g.revoked_at);
  async function approve() {
    const r = await fetch('/api/partnerships/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.consent.data),
    });
    const result = await r.json();
    if (!r.ok) setMessage(result.error);
    else window.location.assign(result.redirect);
  }
  async function revoke(id: string) {
    const r = await fetch('/api/partnerships/oauth/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (r.ok) window.location.reload();
    else setMessage('Unable to revoke connection');
  }
  return (
    <main style={{ maxWidth: 760, margin: '50px auto', padding: 25 }}>
      <a href="/">← Padova</a>
      <h1>Partnership notes · ChatGPT (optional)</h1>
      <p>Signed in as {data.actor.name}. Each link uses your individual permissions.</p>
      <section
        style={{
          margin: '18px 0',
          padding: 16,
          borderRadius: 10,
          border: '1px solid #d7e2db',
          background: '#f7faf8',
        }}
      >
        <p style={{ margin: 0, fontWeight: 650 }}>This is not the booking AI.</p>
        <p style={{ margin: '8px 0 0' }}>
          Booking intake already uses Padova’s OpenAI/API key when configured. That is separate.
          This page is only if you want <strong>ChatGPT itself</strong> (Custom GPT / MCP) to read
          partnership org notes and history. It cannot create bookings, send messages, approve
          outreach, or post money.
        </p>
      </section>
      {data.error ? (
        <p role="alert">{data.error}</p>
      ) : (
        <>
          <p>
            MCP endpoint: <code>{data.resource}</code>
          </p>
          <p>
            Only set this up when you intentionally want ChatGPT to look up partnership notes. A
            reachable HTTPS origin (or secure tunnel) is required for OAuth.
          </p>
        </>
      )}
      {message && <p role="alert">{message}</p>}
      {data.consent && (
        <section>
          <h2>Approve access for {data.consent.client.name}</h2>
          <p>Requested: {data.consent.requested.join(', ')}.</p>
          <p>
            Allows partnership search and history
            {data.consent.requested.includes('partnerships:write')
              ? ', sourced notes/research and permitted contact or follow-up edits'
              : ''}
            . It cannot send messages, approve outreach, activate partners or access accounting
            amounts. Access tokens last one hour; rotating refresh tokens keep this link available
            for up to seven days. It can be revoked below.
          </p>
          <button onClick={() => void approve()}>Authorize this ChatGPT notes link</button>
          <a href="/partnerships/connect" style={{ marginLeft: 20 }}>
            Cancel
          </a>
        </section>
      )}
      <h2>Your ChatGPT notes links</h2>
      {!activeGrants.length && (
        <p>
          No ChatGPT notes link is active for your account. You do not need one for daily
          Partnerships work in Padova.
        </p>
      )}
      {data.grants.map((g: R) => (
        <article key={g.id} style={{ padding: 16, border: '1px solid #dce3dd', margin: '10px 0' }}>
          <p>{g.scopes.join(', ')}</p>
          <p>{g.revoked_at ? 'Revoked' : `Expires ${g.expires_at}`}</p>
          <p>Last authenticated MCP request: {g.last_used_at ?? 'Not yet observed'}</p>
          {!g.revoked_at && <button onClick={() => void revoke(g.id)}>Revoke</button>}
        </article>
      ))}
      <p>
        Gmail and WhatsApp intake are separate. Booking AI / OpenAI for drafts is also separate.
        This page does not enable background mailbox sync.
      </p>
      <p>
        <a href="/">Back to Padova</a>
      </p>
    </main>
  );
}
