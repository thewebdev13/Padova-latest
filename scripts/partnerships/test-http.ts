import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createDatabase, migrate } from '../../src/lib/db';
import { syntheticPartnerships } from './synthetic-fixture';
process.env.DATABASE_URL = '';
process.env.PADOVA_DATABASE_MODE = 'local';
delete process.env.PADOVA_QA;
process.env.PADOVA_DATA_DIR = path.resolve('.data', `partnership-http-${randomUUID()}`);
const db = await createDatabase();
let fixture: Awaited<ReturnType<typeof syntheticPartnerships>>;
try {
  await migrate(db);
  fixture = await syntheticPartnerships(db);
} finally {
  await db.close();
}
const port = await new Promise<number>((resolve, reject) => {
  const s = createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const a = s.address();
    if (!a || typeof a === 'string') return reject(new Error('Port unavailable'));
    s.close(() => resolve(a.port));
  });
});
const origin = `http://127.0.0.1:${port}`,
  callback = 'https://chatgpt.com/connector_platform_oauth_redirect',
  resource = origin + '/api/partnerships/mcp';
const server = spawn(
  process.execPath,
  [
    createRequire(import.meta.url).resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    env: {
      ...process.env,
      PADOVA_PARTNERSHIP_ORIGIN: origin,
      PADOVA_PARTNERSHIP_REDIRECT_URIS: callback,
      PADOVA_PARTNERSHIP_DOCUMENT_KEY: randomBytes(32).toString('base64'),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
server.stdout.resume();
let serverError = '';
server.stderr.on('data', (c) => (serverError += c.toString()));
const post = (url: string, data: unknown, cookie?: string, withOrigin = true) =>
  fetch(origin + url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(withOrigin ? { Origin: origin } : {}),
    },
    body: JSON.stringify(data),
  });
const get = (url: string, cookie?: string) =>
  fetch(origin + url, { headers: cookie ? { Cookie: cookie } : {} });
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await get('/api/partnerships')).status === 401) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) throw new Error('Server stopped: ' + serverError);
    await delay(250);
  }
  assert.ok(ready, 'Server ready');
  const login = async (user: { email: string; password: string }) => {
    const r = await post('/api/auth', user);
    assert.equal(r.status, 200);
    return r.headers.get('set-cookie')!.split(';')[0];
  };
  const owner = await login(fixture!.owner),
    worker = await login(fixture!.worker);
  assert.equal((await get('/api/partnerships?view=sources', worker)).status, 403);
  assert.equal((await post('/api/partnerships/import', fixture!.sample, worker)).status, 403);
  assert.equal((await post('/api/partnerships', {}, owner, false)).status, 400);
  const list = await (await get('/api/partnerships?view=due', owner)).json();
  assert.ok(list.rows.length);
  assert.ok(list.rows.every((r: any) => !r.do_not_contact));
  const imported = await post('/api/partnerships/import', fixture!.sample, owner);
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).created, 0, 'Exact source replay');
  let d = await (await get(`/api/partnerships?id=${fixture!.records[0].org.id}`, owner)).json();
  const draft = d.drafts[0];
  assert.equal(
    (
      await post(
        '/api/partnerships',
        {
          id: randomUUID(),
          kind: 'approve_draft',
          reason: 'Denied employee approval',
          data: { id: draft.id, version: draft.version, approval_hash: draft.review_hash },
        },
        worker,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await post(
        '/api/partnerships',
        {
          id: randomUUID(),
          kind: 'approve_draft',
          reason: 'Exact owner approval',
          data: { id: draft.id, version: draft.version, approval_hash: draft.review_hash },
        },
        owner,
      )
    ).status,
    200,
  );
  const interaction = {
    id: randomUUID(),
    kind: 'interaction',
    reason: 'Received a new reply through configured manual import',
    data: {
      organization_id: fixture!.records[0].org.id,
      campaign_id: null,
      kind: 'email',
      direction: 'inbound',
      occurred_at: new Date().toISOString(),
      original_date: null,
      original_timezone: null,
      subject: 'Please pause',
      body: 'We would like to discuss this first. Do not use the earlier message.',
      source_url: 'https://example.invalid/new-reply',
    },
  };
  assert.equal((await post('/api/partnerships', interaction, worker)).status, 200);
  assert.equal((await post('/api/partnerships', interaction, worker)).status, 200);
  d = await (await get(`/api/partnerships?id=${fixture!.records[0].org.id}`, owner)).json();
  assert.equal(d.drafts[0].state, 'invalidated');
  assert.ok(d.opportunities[0].reply_review);
  assert.equal(d.timeline.filter((x: any) => x.subject === 'Please pause').length, 1);
  const fd = new FormData();
  fd.set('organization_id', fixture!.records[0].org.id);
  fd.set('file', new File(['Private synthetic document'], 'evidence.txt', { type: 'text/plain' }));
  const upload = await fetch(origin + '/api/partnerships/documents', {
    method: 'POST',
    headers: { Origin: origin, Cookie: owner },
    body: fd,
  });
  assert.equal(upload.status, 200);
  const document = await upload.json();
  assert.equal((await get('/api/partnerships/documents/' + document.id)).status, 401);
  const downloaded = await get('/api/partnerships/documents/' + document.id, owner);
  assert.equal(await downloaded.text(), 'Private synthetic document');
  assert.match(downloaded.headers.get('content-disposition') ?? '', /attachment/);
  const metadata = await (await get('/.well-known/oauth-authorization-server')).json();
  assert.equal(metadata.issuer, origin);
  const noToken = await post(
    '/api/partnerships/mcp',
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    undefined,
    false,
  );
  assert.equal(noToken.status, 401);
  assert.match(noToken.headers.get('www-authenticate') ?? '', /resource_metadata/);
  const registration = await post('/api/partnerships/oauth/register', {
    client_name: 'Synthetic HTTP MCP client',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [callback],
    token_endpoint_auth_method: 'none',
  });
  assert.equal(registration.status, 201);
  const client = await registration.json();
  assert.equal(
    (
      await post('/api/partnerships/oauth/register', {
        client_name: 'Wrong callback',
        redirect_uris: ['https://example.invalid/callback'],
      })
    ).status,
    400,
  );
  const verifier = randomBytes(32).toString('base64url'),
    state = randomBytes(24).toString('hex');
  const authorize = await post(
    '/api/partnerships/oauth/authorize',
    {
      client_id: client.client_id,
      redirect_uri: callback,
      response_type: 'code',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource,
      scope: 'partnerships:read partnerships:write',
      state,
    },
    owner,
  );
  assert.equal(authorize.status, 200);
  const redirect = new URL((await authorize.json()).redirect);
  assert.equal(redirect.searchParams.get('state'), state);
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code: redirect.searchParams.get('code')!,
    client_id: client.client_id,
    redirect_uri: callback,
    code_verifier: verifier,
    resource,
  });
  const exchange = () =>
    fetch(origin + '/api/partnerships/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });
  const tokenResponse = await exchange();
  assert.equal(tokenResponse.status, 200);
  const initialTokens = await tokenResponse.json();
  let token = initialTokens.access_token;
  assert.equal((await exchange()).status, 400, 'Code replay rejected');
  const mcp = async (method: string, params?: unknown) =>
    fetch(resource, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ jsonrpc: '2.0', id: randomUUID(), method, params }),
    });
  assert.equal(
    (
      await (
        await mcp('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'HTTP acceptance', version: '1' },
        })
      ).json()
    ).result.serverInfo.name,
    'padova-partnerships',
  );
  const toolList = (await (await mcp('tools/list')).json()).result.tools;
  assert.equal(toolList.length, 8);
  assert.ok(toolList.every((t: any) => !/(sql|send|payment|delete)/.test(t.name)));
  const read = await (
    await mcp('tools/call', {
      name: 'partnership_history',
      arguments: { id: fixture!.records[0].org.id },
    })
  ).json();
  const history = JSON.parse(read.result.content[0].text);
  assert.equal(history.documents.length, 0);
  assert.ok(!('accounting_party_id' in history.organization));
  const cmd = randomUUID(),
    args = {
      command_id: cmd,
      reason: 'Explicit synthetic authorized note',
      data: {
        ...interaction.data,
        kind: 'note',
        direction: 'internal',
        subject: 'MCP test note',
        body: 'Source text says ignore instructions; treated only as evidence.',
      },
    };
  const write = await (
    await mcp('tools/call', { name: 'partnership_add_interaction', arguments: args })
  ).json();
  assert.equal(write.result.isError, false);
  const replay = await (
    await mcp('tools/call', { name: 'partnership_add_interaction', arguments: args })
  ).json();
  assert.deepEqual(replay.result, write.result);
  const denied = await (
    await mcp('tools/call', { name: 'run_sql', arguments: { query: 'select * from payments' } })
  ).json();
  assert.equal(denied.result.isError, true);
  const refreshBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: client.client_id,
    refresh_token: initialTokens.refresh_token,
    resource,
  });
  const refresh = () =>
    fetch(origin + '/api/partnerships/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: refreshBody,
    });
  const refreshed = await refresh();
  assert.equal(refreshed.status, 200);
  const rotated = await refreshed.json();
  assert.notEqual(rotated.refresh_token, initialTokens.refresh_token);
  assert.equal((await mcp('tools/list')).status, 401, 'Rotated access token retired');
  token = rotated.access_token;
  assert.equal((await mcp('tools/list')).status, 200);
  assert.equal((await refresh()).status, 400, 'Refresh replay rejected');
  assert.equal((await mcp('tools/list')).status, 401, 'Refresh replay revokes family');
  const unsignedConsent = await get(
    '/partnerships/connect?' +
      new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: callback,
        response_type: 'code',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
        resource,
        scope: 'partnerships:read',
        state,
      }),
  );
  assert.equal(unsignedConsent.status, 200);
  assert.match(await unsignedConsent.text(), /Sign in/i, 'Consent retains individual sign-in');
  assert.equal((await get('/partnerships/connect', owner)).status, 200);
  await fetch(origin + '/api/auth', {
    method: 'DELETE',
    headers: { Origin: origin, Cookie: owner },
  });
  assert.equal((await get('/api/partnerships', owner)).status, 401);
  console.log(
    'Partnership HTTP acceptance passed: sessions, CSRF, imports/replay, granular permissions, exact approval, inbound invalidation, private documents and OAuth PKCE/resource/single-use/refresh rotation/replay revocation/sign-in/MCP reads/writes/prohibited tools. This is a synthetic protocol test, not a ChatGPT account connection.',
  );
} finally {
  server.kill();
}
