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
      <h1>Partnerships · ChatGPT connection</h1>
      <p>Signed in as {data.actor.name}. Each connection uses your individual permissions.</p>
      {data.error ? (
        <p role="alert">{data.error}</p>
      ) : (
        <>
          <p>
            MCP endpoint: <code>{data.resource}</code>
          </p>
          <p>
            Add this private MCP server in your intended ChatGPT account using OAuth. A reachable
            HTTPS origin or configured secure tunnel is required.
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
            amounts. Access tokens last one hour; rotating refresh tokens keep this connection
            available for up to seven days. It can be revoked below.
          </p>
          <button onClick={() => void approve()}>Authorize this connection</button>
          <a href="/partnerships/connect" style={{ marginLeft: 20 }}>
            Cancel
          </a>
        </section>
      )}
      <h2>Your connections</h2>
      {!data.grants.length && <p>No OAuth connection has been established.</p>}
      {data.grants.map((g: R) => (
        <article key={g.id} style={{ padding: 16, border: '1px solid #dce3dd', margin: '10px 0' }}>
          <p>{g.scopes.join(', ')}</p>
          <p>{g.revoked_at ? 'Revoked' : `Expires ${g.expires_at}`}</p>
          <p>Last authenticated MCP request: {g.last_used_at ?? 'Not yet observed'}</p>
          {!g.revoked_at && <button onClick={() => void revoke(g.id)}>Revoke</button>}
        </article>
      ))}
      <p>
        Gmail and WhatsApp are separate imports. This connection does not enable background mailbox
        synchronization.
      </p>
    </main>
  );
}
