// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Over an in-memory store and a scripted plugin, with the log captured as it
// would be written (the real options, redaction included).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import pino from 'pino';
import { loggerOptions } from '$lib/platform/logger.server';
import type { PluginConnectionFlow, PluginCredential, PluginFlowClient } from '$lib/plugins/api';
import { openCredential, openFlow, sealCredential, sealFlow, type ConnectionRow, type FlowRow } from './connections.server';
import { beginConnect, cancelConnect, disconnect, isOwnServer, onOrigin, pendingConnect, pollConnect, recheck, type FlowDeps, type FlowStore } from './connectionFlow.server';

const ORIGIN = 'https://cloud.example.org';
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = 'session-a';
const SECRET = 'Secret-AppPassword-7f3c9e';

let keyBefore: string | undefined;
beforeAll(() => {
  keyBefore = process.env.APP_SECRET_KEY;
  process.env.APP_SECRET_KEY = randomBytes(32).toString('base64');
});
afterAll(() => {
  if (keyBefore === undefined) delete process.env.APP_SECRET_KEY;
  else process.env.APP_SECRET_KEY = keyBefore;
});

/** The database's rows, in memory; `now` moves only when a test moves it. */
function memoryStore() {
  let now = 0;
  const flows: (FlowRow & { polling: number | null; polled: number | null; expires: number })[] = [];
  const connections: ConnectionRow[] = [];
  let ids = 0;
  const store: FlowStore = {
    async beginFlow(input) {
      // As the database's upsert: a session's new connect replaces its row and keeps its id.
      const index = flows.findIndex((f) => f.session_id === input.sessionId && f.plugin === input.plugin);
      const id = index >= 0 ? flows[index].id : `flow-${++ids}`;
      if (index >= 0) flows.splice(index, 1);
      flows.push({
        id,
        session_id: input.sessionId,
        user_id: input.userId,
        plugin: input.plugin,
        origin: input.origin,
        sealed: input.sealed,
        expires_at: new Date(now + input.ttlSeconds * 1000),
        last_polled_at: null,
        polling_until: null,
        polling: null,
        polled: null,
        expires: now + input.ttlSeconds * 1000,
      });
      return id;
    },
    async flowOf(sessionId, userId, plugin) {
      return flows.find((f) => f.session_id === sessionId && f.user_id === userId && f.plugin === plugin && f.expires > now) ?? null;
    },
    async leaseFlow(id, opts) {
      const flow = flows.find((f) => f.id === id && f.expires > now);
      if (!flow || (flow.polling !== null && flow.polling > now) || (flow.polled !== null && flow.polled > now - opts.minIntervalSeconds * 1000)) return false;
      flow.polling = now + opts.leaseSeconds * 1000;
      flow.polled = now;
      return true;
    },
    async releaseFlow(id) {
      const flow = flows.find((f) => f.id === id);
      if (flow) flow.polling = null;
    },
    async endFlow(id) {
      const index = flows.findIndex((f) => f.id === id);
      if (index >= 0) flows.splice(index, 1);
    },
    sealFlow,
    openFlow,
    sealCredential,
    openCredential,
    async connect(input) {
      const index = connections.findIndex((c) => c.user_id === input.userId && c.plugin === input.plugin);
      const replaced = index >= 0 ? connections.splice(index, 1)[0] : null;
      const id = `connection-${++ids}`;
      connections.push({
        id,
        user_id: input.userId,
        plugin: input.plugin,
        origin: input.origin,
        credential_kind: input.kind,
        sealed_credential: input.sealed,
        account_id: input.accountId,
        account_label: input.accountLabel,
        status: 'active',
        created_at: new Date(now),
        last_used_at: null,
        last_error_at: null,
      });
      await store.endFlow(input.flowId);
      return { id, replaced };
    },
    async connectionOf(userId, plugin) {
      return connections.find((c) => c.user_id === userId && c.plugin === plugin) ?? null;
    },
    async deleteConnection(userId, plugin) {
      const index = connections.findIndex((c) => c.user_id === userId && c.plugin === plugin);
      return index >= 0 ? connections.splice(index, 1)[0] : null;
    },
    async markActive(id) {
      const row = connections.find((c) => c.id === id && c.status === 'revoked');
      if (row) row.status = 'active';
      return !!row;
    },
    async markRevoked(id) {
      const row = connections.find((c) => c.id === id && c.status === 'active');
      if (row) row.status = 'revoked';
      return row ? { userId: row.user_id } : null;
    },
  };
  return { store, flows, connections, advance: (seconds: number) => (now += seconds * 1000) };
}

/** A scripted service: approval, who a credential is, what it was asked to forget. */
function scriptedService() {
  const service = {
    approvedWith: null as PluginCredential | null,
    server: ORIGIN,
    verifies: 'ok' as 'ok' | 'unauthorized' | 'unreachable',
    revokable: true,
    polls: 0,
    revoked: [] as string[],
    throwOnPoll: null as (() => never) | null,
  };
  const flow: PluginConnectionFlow = {
    begin: async () => ({ ok: true, approveUrl: 'http://cloud.internal:8080/index.php/login/v2/flow/LoginToken123?x=1', handle: 'P'.repeat(128), ttlSeconds: 1200 }),
    poll: async () => {
      service.polls++;
      if (service.throwOnPoll) service.throwOnPoll();
      return service.approvedWith ? { state: 'approved', server: service.server, credential: service.approvedWith } : { state: 'pending' };
    },
    verify: async () => (service.verifies === 'ok' ? { ok: true, accountId: 'alice', accountLabel: 'Alice Example' } : { ok: false, reason: service.verifies }),
    revoke: async (_client, credential) => {
      service.revoked.push(credential.secret);
      return service.revokable;
    },
  };
  return { service, flow };
}

function setup(over: Partial<FlowDeps> = {}) {
  const memory = memoryStore();
  const { service, flow } = scriptedService();
  const lines: string[] = [];
  const log = pino({ ...loggerOptions, level: 'debug' }, { write: (line: string) => void lines.push(line) });
  let origin: string | null = ORIGIN;
  const client = { origin: ORIGIN } as PluginFlowClient;
  const deps: FlowDeps = {
    plugin: 'acme',
    flow,
    origin: async () => origin,
    client: () => client,
    clientName: 'owlgraph (wiki.example.org)',
    userId: USER,
    sessionId: SESSION,
    store: memory.store,
    log,
    ...over,
  };
  const events = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return { deps, memory, service, lines, events, setOrigin: (value: string | null) => (origin = value) };
}

const credential = (secret = SECRET): PluginCredential => ({ kind: 'app_password', login: 'alice@example.org', secret });

/** Begins, approves at the service, and polls once the pace allows. */
async function connect(t: ReturnType<typeof setup>, secret = SECRET) {
  expect(await beginConnect(t.deps)).toMatchObject({ ok: true });
  t.service.approvedWith = credential(secret);
  return pollConnect(t.deps);
}

describe('the approve address and the server an approval names', () => {
  it('rebases the approve address onto the configured origin, keeping only its path and query', () => {
    expect(onOrigin('http://cloud.internal:8080/index.php/login/v2/flow/abc?x=1', ORIGIN)).toBe(`${ORIGIN}/index.php/login/v2/flow/abc?x=1`);
    expect(onOrigin('https://evil.example/login', ORIGIN)).toBe(`${ORIGIN}/login`);
    expect(onOrigin('not an address', ORIGIN)).toBeNull();
  });

  it("counts the configured host and port at its root only — the scheme aside, since a TLS proxy may hide it", () => {
    expect(isOwnServer(ORIGIN, ORIGIN)).toBe(true);
    expect(isOwnServer(`${ORIGIN}/`, ORIGIN)).toBe(true);
    expect(isOwnServer('http://cloud.example.org', ORIGIN)).toBe(true);
    for (const other of ['https://cloud.example.org:8443', 'https://elsewhere.example', 'https://cloud.example.org/cloud', 'https://u:p@cloud.example.org', 'javascript:alert(1)', 'nonsense']) {
      expect(isOwnServer(other, ORIGIN), other).toBe(false);
    }
  });
});

describe('connecting', () => {
  it('begins: where to approve for the browser, the handle sealed for this session alone', async () => {
    const t = setup();
    expect(await beginConnect(t.deps)).toEqual({ ok: true, approveUrl: `${ORIGIN}/index.php/login/v2/flow/LoginToken123?x=1` });
    expect(t.memory.flows).toHaveLength(1);
    expect(t.memory.flows[0].sealed).not.toContain('PPPP');
    expect(await pendingConnect(t.deps)).toEqual({ approveUrl: `${ORIGIN}/index.php/login/v2/flow/LoginToken123?x=1` });
    expect(await pendingConnect({ ...t.deps, sessionId: 'session-b' })).toBeNull();
  });

  it('begins nothing while the integration is off', async () => {
    const t = setup();
    t.setOrigin(null);
    expect(await beginConnect(t.deps)).toEqual({ ok: false, reason: 'disabled' });
    expect(t.memory.flows).toHaveLength(0);
  });

  it('asks the service at most once every few seconds, however often the browser polls', async () => {
    const t = setup();
    await beginConnect(t.deps);
    expect(await pollConnect(t.deps)).toMatchObject({ state: 'pending' });
    expect(await pollConnect(t.deps)).toMatchObject({ state: 'pending' });
    expect(t.service.polls).toBe(1);
    t.memory.advance(3.5);
    await pollConnect(t.deps);
    expect(t.service.polls).toBe(2);
  });

  it('connects once approved: verified, sealed, stored, the flow ended, the creation logged', async () => {
    const t = setup();
    expect(await connect(t)).toEqual({ state: 'connected', connectionId: expect.any(String), accountLabel: 'Alice Example' });
    expect(t.memory.flows).toHaveLength(0);
    expect(t.memory.connections).toHaveLength(1);
    const [row] = t.memory.connections;
    expect(row).toMatchObject({ origin: ORIGIN, account_id: 'alice', status: 'active' });
    expect(row.sealed_credential).not.toContain(SECRET);
    expect(openCredential(row)).toEqual(credential());
    expect(t.events()).toContainEqual(expect.objectContaining({ event: 'integration.connection_created', plugin: 'acme', connectionId: row.id, subjectId: USER, replaced: false, audit: true }));
    expect(await pollConnect(t.deps)).toEqual({ state: 'none' });
  });

  it("is another session's to finish not at all", async () => {
    const t = setup();
    await beginConnect(t.deps);
    t.service.approvedWith = credential();
    expect(await pollConnect({ ...t.deps, sessionId: 'session-b' })).toEqual({ state: 'none' });
    expect(await pollConnect({ ...t.deps, userId: '22222222-2222-4222-8222-222222222222' })).toEqual({ state: 'none' });
    expect(t.service.polls).toBe(0);
  });

  it('ends a flow whose time ran out, and one cancelled', async () => {
    const t = setup();
    await beginConnect(t.deps);
    t.memory.advance(601);
    expect(await pollConnect(t.deps)).toEqual({ state: 'none' });
    await beginConnect(t.deps);
    await cancelConnect(t.deps);
    expect(await pollConnect(t.deps)).toEqual({ state: 'none' });
  });

  it('stores nothing for an approval naming another server, and has the service forget that credential', async () => {
    const t = setup();
    t.service.server = 'https://elsewhere.example';
    expect(await connect(t)).toEqual({ state: 'failed', reason: 'foreign-server' });
    expect(t.memory.connections).toHaveLength(0);
    expect(t.memory.flows).toHaveLength(0);
    expect(t.service.revoked).toEqual([SECRET]);
  });

  it('stores nothing for a credential the service does not accept, and has it forgotten', async () => {
    const t = setup();
    t.service.verifies = 'unauthorized';
    expect(await connect(t)).toEqual({ state: 'failed', reason: 'unauthorized' });
    expect(t.memory.connections).toHaveLength(0);
    expect(t.service.revoked).toEqual([SECRET]);
  });

  it('replaces an older connection, and has the service forget its credential', async () => {
    const t = setup();
    await connect(t, 'first-secret');
    const [first] = t.memory.connections;
    t.memory.advance(5);
    await connect(t, 'second-secret');
    expect(t.memory.connections).toHaveLength(1);
    expect(t.memory.connections[0].id).not.toBe(first.id);
    expect(t.service.revoked).toEqual(['first-secret']);
    expect(t.events()).toContainEqual(expect.objectContaining({ event: 'integration.connection_created', replaced: true }));
    expect(t.events()).toContainEqual(expect.objectContaining({ event: 'integration.connection_removed', connectionId: first.id, reason: 'replaced', remoteRevoked: true }));
  });

  it("logs a plugin step that throws by its class only — never the parser message that quotes the credential", async () => {
    const t = setup();
    await beginConnect(t.deps);
    const body = `{"loginName":"alice","appPassword":${SECRET}}`;
    // V8's message for such a body quotes it near the fault: the credential's start.
    const quoted = SECRET.slice(0, 10);
    expect(() => JSON.parse(body)).toThrow(quoted);
    t.service.throwOnPoll = () => JSON.parse(body) as never;
    expect(await pollConnect(t.deps)).toMatchObject({ state: 'pending' });
    expect(t.events()).toContainEqual(expect.objectContaining({ event: 'error.unhandled', errorClass: 'SyntaxError', message: "connection flow of 'acme': poll failed" }));
    t.memory.advance(5);
    t.service.throwOnPoll = null;
    t.service.approvedWith = credential();
    expect(await pollConnect(t.deps)).toMatchObject({ state: 'connected' });
    await disconnect(t.deps);
    expect(t.lines.length).toBeGreaterThan(2);
    for (const line of t.lines) expect(line).not.toContain(quoted);
  });
});

describe('disconnecting and checking again', () => {
  it('disconnects here at once and has the service forget the credential — or says it could not', async () => {
    const t = setup();
    await connect(t);
    expect(await disconnect(t.deps)).toEqual({ removed: true, remoteRevoked: true });
    expect(t.memory.connections).toHaveLength(0);
    t.memory.advance(5);
    await connect(t, 'kept-secret');
    t.service.revokable = false;
    expect(await disconnect(t.deps)).toEqual({ removed: true, remoteRevoked: false });
    expect(t.memory.connections).toHaveLength(0);
    expect(t.events().filter((e) => e.event === 'integration.connection_removed').map((e) => [e.reason, e.remoteRevoked])).toEqual([
      ['disconnect', true],
      ['disconnect', false],
    ]);
    expect(await disconnect(t.deps)).toEqual({ removed: false, remoteRevoked: false });
  });

  it('never sends a credential to another address than the one it was made for', async () => {
    const t = setup();
    await connect(t);
    t.setOrigin('https://moved.example.org');
    expect(await recheck(t.deps)).toBe('renew');
    expect(await disconnect(t.deps)).toEqual({ removed: true, remoteRevoked: false });
    expect(t.service.revoked).toEqual([]);
  });

  it('checks again on request: refused → revoked, accepted again → active, each change logged once', async () => {
    const t = setup();
    await connect(t);
    t.service.verifies = 'unreachable';
    expect(await recheck(t.deps)).toBe('unreachable');
    expect(t.memory.connections[0].status).toBe('active');
    t.service.verifies = 'unauthorized';
    expect(await recheck(t.deps)).toBe('renew');
    expect(await recheck(t.deps)).toBe('renew');
    expect(t.memory.connections[0].status).toBe('revoked');
    t.service.verifies = 'ok';
    expect(await recheck(t.deps)).toBe('active');
    expect(t.memory.connections[0].status).toBe('active');
    expect(t.events().filter((e) => e.event === 'integration.connection_state').map((e) => [e.from, e.to])).toEqual([
      ['active', 'revoked'],
      ['revoked', 'active'],
    ]);
    t.setOrigin(null);
    expect(await recheck(t.deps)).toBe('disabled');
  });
});

describe('a connect that fails on the way', () => {
  it('refuses an approve address that is no address on the service, and keeps nothing', async () => {
    const t = setup();
    t.deps.flow = { ...t.deps.flow, begin: async () => ({ ok: true, approveUrl: '//evil.example/login', handle: 'H', ttlSeconds: 600 }) };
    expect(await beginConnect(t.deps)).toEqual({ ok: false, reason: 'refused' });
    expect(t.memory.flows).toHaveLength(0);
  });

  it("ends the flow when the integration's address changed while it waited, and asks the service nothing", async () => {
    const t = setup();
    expect(await beginConnect(t.deps)).toMatchObject({ ok: true });
    t.service.approvedWith = credential();
    t.setOrigin('https://elsewhere.example');
    expect(await pollConnect(t.deps)).toEqual({ state: 'failed', reason: 'disabled' });
    expect(t.service.polls).toBe(0);
    expect(t.memory.flows).toHaveLength(0);
  });

  it('has the service forget an approved credential it cannot seal, and stores nothing', async () => {
    const t = setup();
    t.deps.store = { ...t.memory.store, sealCredential: () => null };
    expect(await connect(t)).toEqual({ state: 'failed', reason: 'no-key' });
    expect(t.service.revoked).toEqual([SECRET]);
    expect(t.memory.connections).toHaveLength(0);
  });

  it('has the service forget an approved credential the store failed to keep, and passes the failure on', async () => {
    const t = setup();
    t.deps.store = {
      ...t.memory.store,
      connect: async () => {
        throw new Error('unique violation');
      },
    };
    await expect(connect(t)).rejects.toThrow('unique violation');
    expect(t.service.revoked).toEqual([SECRET]);
    expect(t.memory.connections).toHaveLength(0);
  });

  it("keeps a session's flow id when it starts a connect anew", async () => {
    const t = setup();
    await beginConnect(t.deps);
    const first = t.memory.flows[0].id;
    await beginConnect(t.deps);
    expect(t.memory.flows.map((f) => f.id)).toEqual([first]);
  });
});
