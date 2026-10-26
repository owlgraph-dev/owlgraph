// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { createSession, createUser } from '$lib/features/auth/server';
import { call, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { startMockNextcloud, type MockNextcloud } from './e2e/mockNextcloud';

// A person's own Nextcloud connection as served, against the mock's Login Flow
// v2 (docs/architecture/plugins.md, "Connections"). The poll endpoint asks Nextcloud at most
// every few seconds, so each connect is approved before its first poll.

const app = await startApp();

const API = '/api/connections/nextcloud';
const SETTINGS = '/settings/integrations/nextcloud';
const PASSWORD = 'http-test-password';

interface Person {
  userId: string;
  cookie: string;
}

describe.skipIf(app.skipped)('Nextcloud connections, served', () => {
  const served = app as ServedApp;
  let mock: MockNextcloud;

  beforeAll(async () => {
    mock = await startMockNextcloud({}, { alice: { loginName: 'alice@example.com', displayName: 'Alice Example', tree: { name: '', files: {} } } });
  });
  afterAll(async () => {
    await mock.close();
    await served.close();
  });
  beforeEach(() => {
    mock.mode = 'ok';
    mock.flowServer = null;
  });

  /** Through the form: the served build's own save refreshes its cache. */
  const save = (fields: Record<string, string>) => formAction(served, `${SETTINGS}?/save`, fields, { as: 'admin' });
  const configure = async () => {
    const result = await save({ enabled: 'on', origin: mock.origin, cacheSeconds: '0' });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  };

  const sessionOf = async (userId: string) => `session=${(await createSession(userId)).token}`;
  let people = 0;
  async function person(): Promise<Person> {
    const n = ++people;
    const user = await createUser({ email: `person${n}@connections.test`, name: `Person ${n}`, password: PASSWORD, role: 'editor' });
    return { userId: user.id, cookie: await sessionOf(user.id) };
  }

  const connectionsOf = (userId: string) =>
    db<{ id: string; status: string; account_id: string; account_label: string; sealed_credential: string }[]>`
      select id, status, account_id, account_label, sealed_credential from user_connections where user_id = ${userId} and plugin = 'nextcloud'`;
  const flowsOf = (userId: string) => db<{ id: string }[]>`select id from connection_flows where user_id = ${userId}`;

  /** From …/login/v2/flow/<token>. */
  const loginTokenOf = (approveUrl: string) => approveUrl.split('/').at(-1)!;

  const begin = (cookie: string) => call(served, API, { cookie, json: {} });
  const poll = async (cookie: string) => (await (await call(served, `${API}/poll`, { cookie, json: {} })).json()) as { state: string; reason?: string; accountLabel?: string };

  /** Connects as alice; returns the app password. */
  async function connect(who: Person): Promise<string> {
    const begun = await begin(who.cookie);
    expect(begun.status, await begun.clone().text()).toBe(200);
    const { approveUrl } = (await begun.json()) as { approveUrl: string };
    const appPassword = mock.approve(loginTokenOf(approveUrl), 'alice');
    expect(appPassword).toBeTruthy();
    expect(await poll(who.cookie)).toEqual({ state: 'connected', accountLabel: 'Alice Example' });
    return appPassword!;
  }

  const row = (document: Document, label: string) => {
    const found = [...document.querySelectorAll('[role="group"]')].find((g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() === label);
    expect(found, `the row ${label}`).toBeTruthy();
    return found!;
  };
  const peopleRow = async () => {
    const res = await call(served, SETTINGS, { as: 'admin' });
    expect(res.status).toBe(200);
    return row(new JSDOM(await res.text()).window.document, "People's connections").textContent ?? '';
  };
  const active = async () => (await db<{ count: number }[]>`select count(*)::int as count from user_connections where plugin = 'nextcloud' and status = 'active'`)[0].count;
  const stored = async () => (await db<{ count: number }[]>`select count(*)::int as count from user_connections where plugin = 'nextcloud'`)[0].count;

  describe("a person's Nextcloud connection", () => {
    it("is the session's own while it is made, and is made once", async () => {
      await configure();
      const alice = await person();
      const begun = await begin(alice.cookie);
      expect(begun.status).toBe(200);
      const answer = (await begun.json()) as Record<string, string>;
      // The browser learns where to approve, nothing of the handshake.
      expect(Object.keys(answer)).toEqual(['approveUrl']);
      expect(new URL(answer.approveUrl).origin).toBe(mock.origin);

      // Another session of the same person cannot finish it.
      const other = await sessionOf(alice.userId);
      expect((await poll(other)).state).toBe('none');

      mock.approve(loginTokenOf(answer.approveUrl), 'alice');
      expect((await poll(alice.cookie)).state).toBe('connected');
      expect((await poll(alice.cookie)).state).toBe('none');
      expect(await connectionsOf(alice.userId)).toHaveLength(1);
      expect(await flowsOf(alice.userId)).toHaveLength(0);

      // Signing out ends a connect in progress.
      expect((await begin(other)).status).toBe(200);
      expect(await flowsOf(alice.userId)).toHaveLength(1);
      expect((await call(served, '/logout', { cookie: other, body: new URLSearchParams() })).status).toBe(303);
      expect(await flowsOf(alice.userId)).toHaveLength(0);
    });

    it('a connect that took too long connects nothing', async () => {
      await configure();
      const alice = await person();
      const { approveUrl } = (await (await begin(alice.cookie)).json()) as { approveUrl: string };
      await db`update connection_flows set expires_at = now() - interval '1 minute' where user_id = ${alice.userId}`;
      expect(mock.approve(loginTokenOf(approveUrl), 'alice')).toBeTruthy();
      expect((await poll(alice.cookie)).state).toBe('none');
      expect(await connectionsOf(alice.userId)).toHaveLength(0);
    });

    it('connected anew replaces the connection, and the old app password is forgotten', async () => {
      await configure();
      const alice = await person();
      const first = await connect(alice);
      const [before] = await connectionsOf(alice.userId);
      const second = await connect(alice);
      const after = await connectionsOf(alice.userId);
      expect(after).toHaveLength(1);
      expect(after[0].id).not.toBe(before.id);
      expect(mock.appPasswords.has(first)).toBe(false);
      expect(mock.appPasswords.has(second)).toBe(true);
    });

    it('an approval naming another server stores nothing, and its app password is forgotten', async () => {
      await configure();
      const alice = await person();
      mock.flowServer = 'https://elsewhere.example';
      const { approveUrl } = (await (await begin(alice.cookie)).json()) as { approveUrl: string };
      const appPassword = mock.approve(loginTokenOf(approveUrl), 'alice')!;
      expect(await poll(alice.cookie)).toEqual({ state: 'failed', reason: 'foreign-server' });
      expect(await connectionsOf(alice.userId)).toHaveLength(0);
      expect(mock.appPasswords.has(appPassword)).toBe(false);
    });

    it('keeps the app password out of every page, answer and address', async () => {
      await configure();
      const alice = await person();
      const seen: string[] = [];
      const keep = async (url: string, res: Response) => {
        seen.push(url);
        for (const [name, value] of res.headers) seen.push(`${name}: ${value}`);
        const text = await res.text();
        seen.push(text);
        return text;
      };
      const connections = async () => {
        const text = await keep('/settings/connections', await call(served, '/settings/connections', { cookie: alice.cookie }));
        const document = new JSDOM(text).window.document;
        return row(document, 'Nextcloud').textContent ?? '';
      };

      expect(await connections()).toContain('Not connected');
      const begun = await call(served, API, { cookie: alice.cookie, json: {} });
      expect(begun.status).toBe(200);
      const { approveUrl } = JSON.parse(await keep(API, begun)) as { approveUrl: string };
      expect(await connections()).toContain('Waiting for you to approve');

      // The approval page, then its button, as the person's window goes through them.
      const approval = new JSDOM(await keep(approveUrl, await fetch(approveUrl))).window.document;
      const button = [...approval.querySelectorAll('button')].find((b) => b.textContent === 'Zugriff gewähren als Alice Example')!;
      const form = button.closest('form')!;
      const fields = new URLSearchParams([...form.querySelectorAll('input')].map((input) => [input.name, input.value]));
      const granted = await fetch(new URL(form.getAttribute('action')!, mock.origin), { method: 'POST', body: fields });
      expect(granted.status).toBe(200);
      await keep(granted.url, granted);

      const polled = await call(served, `${API}/poll`, { cookie: alice.cookie, json: {} });
      expect(JSON.parse(await keep(`${API}/poll`, polled))).toMatchObject({ state: 'connected' });
      expect(await connections()).toContain('Connected as Alice Example');

      const passwords = [...mock.appPasswords.keys()];
      expect(passwords.length).toBeGreaterThan(0);
      for (const password of passwords) for (const text of seen) expect(text).not.toContain(password);
      const [connection] = await connectionsOf(alice.userId);
      expect(connection).toMatchObject({ status: 'active', account_id: 'alice', account_label: 'Alice Example' });
      for (const password of passwords) expect(connection.sealed_credential).not.toContain(password);
    });

    it('an administrator sees how many are connected and disconnects everyone; a new address ends the connections made for the old', async () => {
      await configure();
      const alice = await person();
      const password = await connect(alice);

      const count = await active();
      expect(count).toBeGreaterThan(0);
      expect(await peopleRow()).toContain(`Active connections: ${count}`);
      const total = await stored();
      const cleared = await formAction(served, `${SETTINGS}?/disconnectAll`, {}, { as: 'admin' });
      expect(cleared.type, JSON.stringify(cleared.data)).toBe('success');
      // All were made for the current address, so Nextcloud is asked to forget each, in the background.
      expect(cleared.data).toEqual({ cleared: total, notAsked: 0 });
      expect(await peopleRow()).toContain('Active connections: 0');
      expect(await active()).toBe(0);
      await vi.waitFor(() => expect(mock.appPasswords.has(password)).toBe(false), { timeout: 5_000 });

      // A new address drops the old one's connections and sends none of them there.
      await connect(alice);
      expect(await connectionsOf(alice.userId)).toHaveLength(1);
      const other = await startMockNextcloud();
      try {
        const moved = await save({ enabled: 'on', origin: other.origin, cacheSeconds: '0' });
        expect(moved.type, JSON.stringify(moved.data)).toBe('success');
        expect(moved.data).toEqual({ saved: true, dropped: 1 });
        expect(await connectionsOf(alice.userId)).toHaveLength(0);
        expect(other.requests).toEqual([]);
      } finally {
        await other.close();
      }
    });
  });

  describe('disconnecting everyone while the integration is off', () => {
    it('clears revoked connections too, and says the service could not be asked to forget them', async () => {
      await configure();
      // Removes what earlier tests left, past the app, so alice's is the only one stored.
      await db`delete from user_connections where plugin = 'nextcloud'`;
      const alice = await person();
      const password = await connect(alice);
      await db`update user_connections set status = 'revoked' where user_id = ${alice.userId}`;
      const off = await save({ origin: mock.origin, cacheSeconds: '0' });
      expect(off.type, JSON.stringify(off.data)).toBe('success');

      // None active, one stored: there is still a credential to clear.
      expect(await peopleRow()).toContain('Active connections: 0');
      const basic = `Basic ${Buffer.from(`alice@example.com:${password}`).toString('base64')}`;
      const from = mock.requests.length;
      const cleared = await formAction(served, `${SETTINGS}?/disconnectAll`, {}, { as: 'admin' });
      expect(cleared.type, JSON.stringify(cleared.data)).toBe('success');
      expect(cleared.data).toEqual({ cleared: 1, notAsked: 1 });
      expect(await connectionsOf(alice.userId)).toHaveLength(0);
      // Nothing was sent: the access is still valid at the service.
      expect(mock.requests.slice(from).filter((r) => r.authorization === basic)).toEqual([]);
      expect(mock.appPasswords.has(password)).toBe(true);
    });
  });
});
