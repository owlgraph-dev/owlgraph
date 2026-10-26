// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { connectAs, jsonOf } from '$tests/integration/mcp';
import { userOf, type Role } from '$tests/integration/users';
import { createCollection } from './server';

const app = await startApp();

type Member = { id: string; title: string; position: number; label: string | null };
type Members = { members: Member[]; basis: string };

describe.skipIf(app.skipped)('a curated collection', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  let n = 0;
  const curated = async (as: Role = 'admin', title = `Curated ${++n}`) => {
    const res = await call(served, '/api/collections', { as, json: { title } });
    expect(res.status, await res.clone().text()).toBe(201);
    return { ...((await res.json()) as { id: string; slug: string }), title };
  };
  /** It inherits the public default namespace. */
  const publicPage = async (title = `Page ${++n}`) => ({ ...(await createPage(served, 'admin', { title })), title });
  const members = (id: string, as: Role = 'admin') => call(served, `/api/collections/${id}/members`, { as });
  const add = (id: string, nodeId: string, as: Role = 'admin') => call(served, `/api/collections/${id}/members`, { as, json: { nodeId } });
  const reorder = (id: string, order: string[], basis: string, as: Role = 'admin') => call(served, `/api/collections/${id}/members`, { as, method: 'PUT', json: { order, basis } });
  const label = (id: string, nodeId: string, value: unknown, as: Role = 'admin') =>
    call(served, `/api/collections/${id}/members/${nodeId}`, { as, method: 'PATCH', json: { label: value } });
  const remove = (id: string, nodeId: string, as: Role = 'admin') => call(served, `/api/collections/${id}/members/${nodeId}`, { as, method: 'DELETE' });
  const body = async (res: Response) => (await res.json()) as Members;
  const order = async (id: string) => (await body(await members(id))).members.map((m) => m.id);
  const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  it('is made empty by whoever may write pages, its page saying so; a viewer’s POST answers 403', async () => {
    const c = await curated();
    expect((await body(await members(c.id))).members).toEqual([]);
    const page = new JSDOM(await (await call(served, `/${c.slug}`, { as: 'admin' })).text()).window.document;
    expect(page.querySelector('h1')?.textContent?.trim()).toBe(c.title);
    expect(page.querySelector('main')?.textContent).toContain('Nothing in this collection yet.');
    expect((await call(served, '/api/collections', { as: 'viewer', json: { title: 'no' } })).status).toBe(403);
  });

  it('takes members of any type the editor may read, at the end, each once — a node the editor may not read is not there for them', async () => {
    const c = await curated();
    const file = new File(['member document'], 'member.txt', { type: 'text/plain' });
    const form = new FormData();
    form.append('title', 'Member document');
    form.append('file', file);
    const doc = (await (await call(served, '/api/documents', { as: 'admin', body: form })).json()) as { id: string };
    const page = await publicPage();
    const nested = await curated();

    for (const nodeId of [doc.id, page.id, nested.id]) expect((await add(c.id, nodeId)).status).toBe(201);
    const again = await add(c.id, doc.id);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { existed: boolean }).existed).toBe(true);
    const listed = await body(await members(c.id));
    expect(listed.members.map((m) => m.id)).toEqual([doc.id, page.id, nested.id]);
    expect(listed.members.map((m) => m.position)).toEqual([1, 2, 3]);

    const hidden = await createPage(served, 'admin', { visibility: 'restricted' });
    expect((await add(c.id, hidden.id, 'editorA')).status).toBe(404);
    expect((await add(c.id, 'not-a-node', 'editorA')).status).toBe(400);
  });

  it('is rearranged against the order its editor read, never over a newer one', async () => {
    const c = await curated();
    const [a, b, d] = [await publicPage(), await publicPage(), await publicPage()];
    for (const p of [a, b, d]) await add(c.id, p.id);
    const { basis } = await body(await members(c.id));

    const moved = await reorder(c.id, [d.id, a.id, b.id], basis);
    expect(moved.status).toBe(200);
    const after = await body(moved);
    expect(after.members.map((m) => [m.id, m.position])).toEqual([[d.id, 1], [a.id, 2], [b.id, 3]]);

    const stale = await reorder(c.id, [a.id, b.id, d.id], basis);
    expect(stale.status).toBe(409);
    expect(await codeOf(stale)).toBe('stale_order');
    expect((await reorder(c.id, [a.id, a.id, b.id], after.basis)).status).toBe(400);
    expect(await order(c.id)).toEqual([d.id, a.id, b.id]);
  });

  it('labels a member in each language, and the members API, get_collection and get_relationships read it in the reader’s', async () => {
    const c = await curated();
    const p = await publicPage();
    await add(c.id, p.id);
    const labelled = await label(c.id, p.id, { en: 'Introduction', de: 'Einführung' });
    expect(labelled.status).toBe(200);
    expect((await body(labelled)).members[0].label).toBe('Introduction');

    const agent = await connectAs('viewer');
    const got = jsonOf<{ members: unknown[] }>(await agent.callTool({ name: 'get_collection', arguments: { collectionId: c.id } }));
    expect(got.members[0]).toMatchObject({ id: p.id, label: 'Introduction', plugin: null, position: 1 });
    const edges = jsonOf<{ node: { id: string }; properties: unknown[] }[]>(await agent.callTool({ name: 'get_relationships', arguments: { nodeId: c.id, direction: 'outgoing' } }));
    expect(edges.find((e) => e.node.id === p.id)?.properties).toContainEqual(expect.objectContaining({ name: 'collection:label', value: 'Introduction' }));

    expect((await label(c.id, p.id, { xx: 'no' })).status).toBe(400);
    expect((await body(await label(c.id, p.id, null))).members[0].label).toBeNull();
  });

  it('lets a member go, the rest closing up behind it; the node stays', async () => {
    const c = await curated();
    const [a, b, d] = [await publicPage(), await publicPage(), await publicPage()];
    for (const p of [a, b, d]) await add(c.id, p.id);
    const removed = await remove(c.id, b.id);
    expect(removed.status).toBe(200);
    expect((await body(removed)).members.map((m) => [m.id, m.position])).toEqual([[a.id, 1], [d.id, 2]]);
    expect((await call(served, `/${b.slug}`, { as: 'admin' })).status).toBe(200);
    expect((await remove(c.id, b.id)).status).toBe(404);
  });

  it('nests collections, never in a loop — not even two added into each other at once', async () => {
    const [x, y, z] = [await curated(), await curated(), await curated()];
    expect((await add(x.id, y.id)).status).toBe(201);
    expect((await add(y.id, z.id)).status).toBe(201);
    const loop = await add(z.id, x.id);
    expect(loop.status).toBe(409);
    expect(await codeOf(loop)).toBe('cycle');
    const self = await add(x.id, x.id);
    expect(self.status).toBe(409);
    expect(await codeOf(self)).toBe('self_member');

    const [p, q] = [await curated(), await curated()];
    const both = await Promise.all([add(p.id, q.id), add(q.id, p.id)]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('counts and numbers only what each reader may read, and a rearrangement keeps a hidden member in its place', async () => {
    const c = await curated();
    const first = await publicPage();
    const hidden = await createPage(served, 'admin', { visibility: 'restricted' });
    const second = await publicPage();
    const third = await publicPage();
    for (const p of [first, hidden, second, third]) await add(c.id, p.id);

    const seen = await body(await members(c.id, 'editorA'));
    expect(seen.members.map((m) => [m.id, m.position])).toEqual([[first.id, 1], [second.id, 2], [third.id, 3]]);
    expect((await reorder(c.id, [third.id, first.id, second.id], seen.basis, 'editorA')).status).toBe(200);

    // The hidden member kept its slot, second of four.
    expect(await order(c.id)).toEqual([third.id, hidden.id, first.id, second.id]);
    const got = jsonOf<{ members: Member[] }>(await (await connectAs('viewer')).callTool({ name: 'get_collection', arguments: { collectionId: c.id } }));
    expect(got.members.map((m) => [m.id, m.position])).toEqual([[third.id, 1], [first.id, 2], [second.id, 3]]);
    const page = new JSDOM(await (await call(served, `/${c.slug}`, { as: 'viewer' })).text()).window.document;
    expect(page.querySelectorAll('main .el-row')).toHaveLength(3);
    expect(page.querySelector('header.node-head')?.textContent).toContain('3 entries');
  });

  it('keeps its membership’s properties: an admin words them, but neither changes what they hold nor defines another', async () => {
    const resaved = await formAction(served, '/settings/schema/properties?/save', { localName: 'label', groupSlug: 'collection', datatype: 'text', 'label.en': 'Label' }, { as: 'admin' });
    expect(resaved.type).toBe('success');
    expect((await db<{ datatype: string }[]>`select datatype from property_definitions where name = 'collection:label'`)[0].datatype).toBe('localizedText');
    const defined = await formAction(served, '/settings/schema/properties?/save', { localName: 'extra', groupSlug: 'collection', datatype: 'text', 'label.en': 'Extra' }, { as: 'admin' });
    expect(defined.type).toBe('failure');
    expect(await db`select 1 from property_definitions where name = 'collection:extra'`).toHaveLength(0);
  });

  it('refuses a change to a mirrored collection’s members with 409 mirrored, a viewer’s with 403, and is not there for an editor once restricted by its owner', async () => {
    const admin = await userOf('admin');
    const mirrored = await createCollection({ title: 'Mirrored', createdBy: admin.id, user: admin, plugin: 'test-source', sourceRef: { name: 'test' } });
    const p = await publicPage();
    const refused = await add(mirrored.id, p.id);
    expect(refused.status).toBe(409);
    expect(await codeOf(refused)).toBe('mirrored');
    expect((await remove(mirrored.id, p.id)).status).toBe(409);
    // Nor rearranged or relabelled: what it holds is its source's.
    const rearranged = await reorder(mirrored.id, [], 'any');
    expect(rearranged.status).toBe(409);
    expect(await codeOf(rearranged)).toBe('mirrored');
    const relabelled = await label(mirrored.id, p.id, { en: 'No' });
    expect(relabelled.status).toBe(409);
    expect(await codeOf(relabelled)).toBe('mirrored');

    const c = await curated();
    expect((await add(c.id, p.id, 'viewer')).status).toBe(403);
    expect((await call(served, `/api/collections/${c.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
    expect((await members(c.id, 'editorA')).status).toBe(404);
    expect((await add(c.id, p.id, 'editorA')).status).toBe(404);
    expect((await add(c.id, p.id)).status).toBe(201);
  });

  it('lets no viewer, nor an editor who may not write it, rearrange, relabel or remove its members, and they stay as they were', async () => {
    const c = await curated();
    const [a, b] = [await publicPage(), await publicPage()];
    for (const p of [a, b]) await add(c.id, p.id);
    const before = await body(await members(c.id));

    expect((await reorder(c.id, [b.id, a.id], before.basis, 'viewer')).status).toBe(403);
    expect((await label(c.id, a.id, { en: 'Nope' }, 'viewer')).status).toBe(403);
    expect((await remove(c.id, a.id, 'viewer')).status).toBe(403);

    expect((await call(served, `/api/collections/${c.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
    expect((await reorder(c.id, [b.id, a.id], before.basis, 'editorC')).status).toBe(404);
    expect((await label(c.id, a.id, { en: 'Nope' }, 'editorC')).status).toBe(404);
    expect((await remove(c.id, a.id, 'editorC')).status).toBe(404);

    const after = await body(await members(c.id));
    expect(after.members.map((m) => [m.id, m.label])).toEqual(before.members.map((m) => [m.id, m.label]));
  });

  it('is found by a member’s title — by a reader who may read that member, never by one who may not', async () => {
    const c = await curated();
    const shown = await publicPage('Kalibrierung quarzuhr');
    const hidden = await createPage(served, 'admin', { title: 'Notizen geheimnis', visibility: 'restricted' });
    await add(c.id, shown.id);
    await add(c.id, hidden.id);

    const searchAs = async (role: Role, query: string) => jsonOf<{ id: string; snippet?: string }[]>(await (await connectAs(role)).callTool({ name: 'search', arguments: { query } }));
    expect((await searchAs('viewer', 'quarzuhr')).find((h) => h.id === c.id)?.snippet).toBe('Contains: Kalibrierung quarzuhr');
    expect((await searchAs('viewer', 'geheimnis')).map((h) => h.id)).not.toContain(c.id);
    expect((await searchAs('admin', 'geheimnis')).map((h) => h.id)).toContain(c.id);

    // The search page lists it too, with the member it was found by.
    const mainText = async (path: string) => new JSDOM(await (await call(served, path, { as: 'viewer' })).text()).window.document.querySelector('main')?.textContent ?? '';
    const found = await mainText('/search?q=quarzuhr');
    expect(found).toContain(c.title);
    expect(found).toContain('Contains: Kalibrierung quarzuhr');
    expect(await mainText('/search?q=geheimnis')).not.toContain(c.title);
  });

  it('answers every change, however many arrive together — more at once than the database pool has connections', async () => {
    const c = await curated();
    const p = await publicPage();
    await add(c.id, p.id);
    const answers = await Promise.all(Array.from({ length: 16 }, (_, i) => label(c.id, p.id, { en: `Label ${i}` })));
    expect(answers.map((r) => r.status)).toEqual(Array(16).fill(200));
  });
});
