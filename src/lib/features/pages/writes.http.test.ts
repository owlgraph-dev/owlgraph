// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createSession } from '$lib/features/auth/server';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { userOf, type Role } from '$tests/integration/users';

// What is stored is read back from the database, not from the app. The agents'
// half is src/mcp/mcp.int.test.ts; the lock's own rules are locks.int.test.ts.

const app = await startApp();

afterAll(async () => {
  if (!app.skipped) await app.close();
});

const para = (text: string) => ({ type: 'paragraph', attrs: { blockId: `b-${text.replace(/\W+/g, '-')}` }, content: [{ type: 'text', text }] });
const docOf = (text: string) => ({ type: 'doc', content: [para(text)] });

/** Everything a page write could change, as stored. */
async function stored(id: string) {
  const [row] = await db<Record<string, unknown>[]>`
    select n.title, n.slug, n.visibility, n.namespace_id, n.class_id, n.locale, n.updated_at, p.doc, p.content_scheme,
      (select coalesce(array_agg(user_id order by user_id), '{}') from page_shares where page_id = n.id) as shares,
      (select coalesce(array_agg(tag order by tag), '{}') from node_tags where node_id = n.id) as tags,
      (select count(*)::int from node_versions where node_id = n.id) as versions
    from nodes n join pages p on p.id = n.id where n.id = ${id}`;
  return row;
}

const textOf = (doc: unknown) => JSON.stringify(doc).match(/"text":"[^"]*"/g);

describe.skipIf(app.skipped)('a page write by someone who may not write the page', () => {
  const served = app as ServedApp;

  /** A PUT of a new document and a PATCH of every kind of metadata. */
  async function attempt(id: string, as: Role) {
    const put = await call(served, `/api/pages/${id}`, { as, method: 'PUT', json: docOf('overwritten') });
    const patch = await call(served, `/api/pages/${id}`, {
      as,
      method: 'PATCH',
      json: { title: 'Taken over', slug: 'taken-over', visibility: 'public', shares: [(await userOf(as)).id], tags: ['taken'], contentScheme: 'dark' },
    });
    return { put, patch };
  }

  it('answers a viewer’s PUT and PATCH of a public page with 403 and stores nothing', async () => {
    const page = await createPage(served, 'editorA', { title: 'Viewer write probe', doc: docOf('as the owner wrote it') });
    const before = await stored(page.id);
    expect(textOf(before.doc)).toEqual(['"text":"as the owner wrote it"']);

    const { put, patch } = await attempt(page.id, 'viewer');
    expect(put.status).toBe(403);
    expect(await put.json()).toEqual({ error: { code: 'forbidden', message: expect.any(String) } });
    expect(patch.status).toBe(403);
    expect(await patch.json()).toEqual({ error: { code: 'forbidden', message: expect.any(String) } });
    expect(await stored(page.id)).toEqual(before);
  });

  it('answers the PUT and PATCH of an editor neither owning nor shared on a restricted page with 403 and stores nothing', async () => {
    const editorB = await userOf('editorB');
    const page = await createPage(served, 'editorA', { title: 'Restricted write probe', doc: docOf('kept private'), visibility: 'restricted', shares: [editorB.id] });
    const before = await stored(page.id);
    expect(before).toMatchObject({ visibility: 'restricted', shares: [editorB.id] });

    const { put, patch } = await attempt(page.id, 'editorC');
    expect(put.status).toBe(403);
    expect(await put.json()).toEqual({ error: { code: 'forbidden', message: expect.any(String) } });
    expect(patch.status).toBe(403);
    expect(await patch.json()).toEqual({ error: { code: 'forbidden', message: expect.any(String) } });
    expect(await stored(page.id)).toEqual(before);

    // The share writes it: the refusal is the page's, not the route's.
    expect((await call(served, `/api/pages/${page.id}`, { as: 'editorB', method: 'PUT', json: docOf('by the share') })).status).toBe(200);
    expect(textOf((await stored(page.id)).doc)).toEqual(['"text":"by the share"']);
  });
});

describe.skipIf(app.skipped)('a save while another session holds the page’s edit lock', () => {
  const served = app as ServedApp;

  it('answers a PUT without the current lock token with 423 lock_lost and stores nothing; the holder’s token saves', async () => {
    const editorA = await userOf('editorA');
    const page = await createPage(served, 'editorA', { title: 'Lock save probe', doc: docOf('before the lock') });
    const lock = await call(served, `/api/pages/${page.id}/lock`, { as: 'editorA', method: 'POST', json: {} });
    expect(lock.status).toBe(200);
    const { token } = (await lock.json()) as { token: string };
    expect((await db<{ token: string }[]>`select token from page_locks where page_id = ${page.id}`)[0].token).toBe(token);
    const before = await stored(page.id);

    // Another editor, the holder's second session, and a wrong token.
    const secondTab = `session=${(await createSession(editorA.id)).token}`;
    const saves = [
      { as: 'editorB' as Role },
      { cookie: secondTab },
      { as: 'editorA' as Role, headers: { 'x-edit-lock': crypto.randomUUID() } },
    ];
    for (const who of saves) {
      const res = await call(served, `/api/pages/${page.id}`, { ...who, method: 'PUT', json: docOf('without the lock') });
      expect(res.status, JSON.stringify(who)).toBe(423);
      expect(await res.json(), JSON.stringify(who)).toMatchObject({ error: { code: 'lock_lost', status: { locked: true, lockedById: editorA.id, stale: false } } });
    }
    expect(await stored(page.id)).toEqual(before);

    const saved = await call(served, `/api/pages/${page.id}`, { as: 'editorA', method: 'PUT', json: docOf('with the lock'), headers: { 'x-edit-lock': token } });
    expect(saved.status).toBe(200);
    expect(textOf((await stored(page.id)).doc)).toEqual(['"text":"with the lock"']);
  });
});
