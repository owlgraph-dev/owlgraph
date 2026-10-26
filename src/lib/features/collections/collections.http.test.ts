// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createNamespace, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { connectAs, textOf } from '$tests/integration/mcp';
import type { Role } from '$tests/integration/users';

const app = await startApp();

describe.skipIf(app.skipped)('collections, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  let n = 0;
  const curated = async (opts: { title?: string; restricted?: boolean; namespaceId?: string } = {}) => {
    const title = opts.title ?? `Reading list ${++n}`;
    const res = await call(served, '/api/collections', { as: 'admin', json: { title, ...(opts.namespaceId ? { namespaceId: opts.namespaceId } : {}) } });
    expect(res.status).toBe(201);
    const made = (await res.json()) as { id: string; slug: string };
    if (opts.restricted) expect((await call(served, `/api/collections/${made.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
    return { ...made, title };
  };
  const add = async (collectionId: string, nodeId: string) =>
    expect((await call(served, `/api/collections/${collectionId}/members`, { as: 'admin', json: { nodeId } })).status).toBe(201);
  const publicPage = async (title = `Member page ${++n}`, doc?: unknown) => ({ ...(await createPage(served, 'admin', { title, ...(doc ? { doc } : {}) })), title });
  const textDocument = async (title: string) => {
    const form = new FormData();
    form.append('title', title);
    form.append('file', new File([`text of ${title}`], `${title}.txt`, { type: 'text/plain' }));
    const res = await call(served, '/api/documents', { as: 'admin', body: form });
    expect(res.status).toBe(200);
    return (await res.json()) as { id: string; slug: string };
  };
  const block = (blockId: string, nodeId: string) => ({ type: 'collectionBlock', attrs: { blockId, nodeId } });
  const docOf = (...content: unknown[]) => ({ type: 'doc', content });
  const dom = async (path: string, as?: Role) => {
    const res = await call(served, path, { as });
    return { status: res.status, html: await res.clone().text(), document: new JSDOM(await res.text()).window.document };
  };
  const rows = (document: Document, blockId: string) => [...document.querySelectorAll(`[data-block-id="${blockId}"] .el-row .el-name-text`)].map((el) => el.textContent?.trim());

  /** A curated collection holding two text documents of its own, in order. */
  const seeded = async () => {
    const c = await curated();
    const first = await textDocument(`First member ${++n}`);
    const second = await textDocument(`Second member ${n}`);
    await add(c.id, first.id);
    await add(c.id, second.id);
    return { ...c, first, second, firstTitle: `First member ${n}`, secondTitle: `Second member ${n}` };
  };

  describe('a collection’s page and API', () => {
    it('lists its members in their order with their kind and "2 entries" in its header, no tabs; a member joins only once', async () => {
      const c = await seeded();
      expect((await call(served, `/api/collections/${c.id}/members`, { as: 'admin', json: { nodeId: c.first.id } })).status).toBe(200);

      const { document } = await dom(`/${c.slug}`, 'admin');
      expect(document.querySelector('h1')?.textContent?.trim()).toBe(c.title);
      const header = document.querySelector('header.node-head')!;
      expect(header.querySelector('nav[aria-label="Location"]')?.textContent).toContain(c.title);
      expect(header.textContent).toContain('2 entries');
      expect(document.querySelector('[role="tablist"]')).toBeNull();
      const members = [...document.querySelectorAll('main .el-row')];
      expect(members).toHaveLength(2);
      expect(members[0].textContent).toContain(c.firstTitle);
      expect(members[0].textContent).toContain('Document');
      expect(members[1].textContent).toContain(c.secondTitle);
      expect(members[0].querySelector('a')?.getAttribute('href')).toBe(`/${c.first.slug}`);
    });

    it('names its relationships in its header — by type, from its side, only those the viewer may follow — and leaves its members to its page', async () => {
      const c = await seeded();
      const outgoing = await publicPage('About subject');
      const incoming = await publicPage('A study');
      const referrer = await publicPage('A referrer');
      const hidden = await createPage(served, 'admin', { title: 'Hidden referrer', visibility: 'restricted' });
      const holder = await publicPage('Page holding it');
      const shelf = await curated({ title: 'The shelf' });
      await add(shelf.id, c.id);
      await db.begin(async (sql) => {
        await sql`insert into relationship_types (slug, label, inverse_label) values ('is-about-it', ${sql.json({ en: 'is about' })}, ${sql.json({ en: 'is the subject of' })})`;
        await sql`insert into edges (source_id, target_id, relationship_type) values
          (${c.id}, ${outgoing.id}, 'is-about-it'),
          (${incoming.id}, ${c.id}, 'is-about-it'),
          (${referrer.id}, ${c.id}, null),
          (${hidden.id}, ${c.id}, null),
          (${holder.id}, ${c.id}, 'contains')`;
      });

      const { document } = await dom(`/${c.slug}`, 'viewer');
      const region = document.querySelector('[aria-label="Relationships"]')!;
      expect([...region.querySelectorAll('dt')].map((dt) => dt.textContent?.trim())).toEqual(['is about', 'is in', 'is the subject of', 'Referenced by']);
      const group = (i: number) => [...region.querySelectorAll('dd')[i].querySelectorAll('a')].map((a) => a.textContent?.trim());
      expect(group(0)).toEqual(['About subject']);
      expect(group(1)).toEqual(['The shelf']);
      expect(group(2)).toEqual(['A study']);
      // A page it cannot read is not named, and a page that "contains" it is no collection.
      expect(group(3)).toEqual(['A referrer']);
      expect(region.textContent).not.toContain(c.firstTitle);
    });

    it('is edited like a page: an editor renames it; restricted, others get 404 for it, signed in or not; deleted, its members stay', async () => {
      const c = await seeded();
      expect((await call(served, `/api/collections/${c.id}`, { as: 'editorA', method: 'PATCH', json: { title: 'Renamed collection' } })).ok).toBe(true);
      const edit = await dom(`/${c.slug}/edit`, 'editorA');
      expect(edit.status).toBe(200);
      expect(edit.html).toContain(c.secondTitle);

      expect((await call(served, `/api/collections/${c.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'restricted' } })).ok).toBe(true);
      expect((await call(served, `/${c.slug}`, { as: 'editorA' })).status).toBe(404);
      // Changing it answers as reading it does: not found, not "forbidden".
      expect((await call(served, `/api/collections/${c.id}`, { as: 'editorA', method: 'PATCH', json: { title: 'no' } })).status).toBe(404);
      expect((await call(served, `/api/collections/${c.id}`, { as: 'editorA', method: 'DELETE' })).status).toBe(404);
      expect((await call(served, `/${c.slug}`)).status).toBe(404);

      expect((await call(served, `/api/collections/${c.id}`, { as: 'admin', method: 'DELETE' })).ok).toBe(true);
      expect((await call(served, `/${c.slug}`, { as: 'admin' })).status).toBe(404);
      expect((await call(served, `/${c.first.slug}`, { as: 'admin' })).status).toBe(200);
    });

    it('is found by search, and by its type on the search page without its members', async () => {
      const c = await seeded();
      expect((await dom(`/search?q=${encodeURIComponent(c.title)}`, 'admin')).document.querySelector('main')?.textContent).toContain(c.title);
      const byType = (await dom('/search?type=collection', 'admin')).document.querySelector('main')?.textContent ?? '';
      expect(byType).toContain(c.title);
      expect(byType).not.toContain(c.firstTitle);
    });

    it('answers a malformed id as a missing collection, and a malformed namespace as an unknown one', async () => {
      expect((await call(served, '/api/collections/not-a-uuid', { as: 'admin', method: 'PATCH', json: { title: 'x' } })).status).toBe(404);
      expect((await call(served, '/api/collections/not-a-uuid', { as: 'admin', method: 'DELETE' })).status).toBe(404);
      expect((await call(served, '/api/collections', { as: 'admin', json: { title: 'x', namespaceId: 'nope' } })).status).toBe(400);
    });
  });

  describe('the collection block', () => {
    it('renders nothing where the reader may not read the collection, and its empty line where nothing of it is theirs', async () => {
      const secret = await curated({ restricted: true });
      await add(secret.id, (await publicPage()).id);
      const open = await curated();
      const shown = await publicPage();
      const hidden = await createPage(served, 'admin', { title: 'Hidden member', visibility: 'restricted' });
      await add(open.id, shown.id);
      await add(open.id, hidden.id);
      const closed = await curated();
      await add(closed.id, hidden.id);
      const embeddingPage = await createPage(served, 'admin', { doc: docOf({ type: 'paragraph', content: [{ type: 'text', text: 'Above.' }] }, block('secret', secret.id), block('open', open.id), block('closed', closed.id)) });

      const anonymous = await dom(`/${embeddingPage.slug}`);
      expect(anonymous.html).not.toContain('data-block-id="secret"');
      expect(anonymous.html).not.toContain(secret.title);
      expect(anonymous.html).not.toContain(hidden.slug);
      expect(rows(anonymous.document, 'open')).toEqual([shown.title]);
      expect(anonymous.document.querySelector('[data-block-id="open"]')?.textContent).toContain('1 entry');
      expect(anonymous.document.querySelector('[data-block-id="closed"]')?.textContent).toContain('Nothing in this collection yet.');

      const owner = (await dom(`/${embeddingPage.slug}`, 'admin')).document;
      expect(rows(owner, 'secret')).toHaveLength(1);
      expect(rows(owner, 'open')).toHaveLength(2);
    });

    it('gives a share link’s visitor what anyone may read, and nothing of a collection they may not', async () => {
      const secret = await curated({ restricted: true });
      await add(secret.id, (await publicPage()).id);
      const open = await curated();
      const shown = await publicPage();
      await add(open.id, shown.id);
      // A restricted page: the link grants it, not what its blocks show.
      const embeddingPage = await createPage(served, 'admin', { visibility: 'restricted', doc: docOf(block('secret', secret.id), block('open', open.id)) });
      const { token } = (await (await call(served, `/api/pages/${embeddingPage.id}/share-links`, { as: 'admin', json: { label: 'collection block' } })).json()) as { token: string };

      const shared = await dom(`/share/${token}`);
      expect(shared.status).toBe(200);
      expect(shared.html).not.toContain('data-block-id="secret"');
      expect(shared.html).not.toContain(secret.title);
      expect(rows(shared.document, 'open')).toEqual([shown.title]);
    });

    it('shows nothing of a collection in a restricted namespace to whoever is not in it', async () => {
      const namespaceId = await createNamespace(served, { name: 'Embedded team', slug: 'embedded-team', accessLevel: 'restricted' });
      const team = await curated({ namespaceId });
      await add(team.id, (await publicPage()).id);
      const embeddingPage = await publicPage('Team host', docOf(block('team', team.id)));

      const viewer = await dom(`/${embeddingPage.slug}`, 'viewer');
      expect(viewer.html).not.toContain('data-block-id="team"');
      expect(viewer.html).not.toContain(team.title);
      expect(rows((await dom(`/${embeddingPage.slug}`, 'admin')).document, 'team')).toHaveLength(1);
    });

    it('is authored by an agent only for a collection it may read, pruned for each reader, and named in get_page as each agent may read it', async () => {
      const secret = await curated({ restricted: true });
      await add(secret.id, (await publicPage()).id);
      const embeddingPage = await publicPage();
      const admin = await connectAs('admin');
      const appended = textOf(await admin.callTool({ name: 'append_block', arguments: { pageId: embeddingPage.id, block: { kind: 'collection', nodeId: secret.id, limit: 5 } } }));
      const blockId = /Appended block (\S+)/.exec(appended)?.[1];
      expect(blockId, appended).toBeTruthy();

      expect((await dom(`/${embeddingPage.slug}`)).html).not.toContain(`data-block-id="${blockId}"`);
      expect(rows((await dom(`/${embeddingPage.slug}`, 'admin')).document, blockId!)).toHaveLength(1);

      expect(textOf(await admin.callTool({ name: 'get_page', arguments: { pageId: embeddingPage.id } }))).toContain(`collection \\"${secret.title}\\" · 1 entry`);
      const editor = await connectAs('editorB');
      expect(textOf(await editor.callTool({ name: 'get_page', arguments: { pageId: embeddingPage.id } }))).toContain('collection (not readable)');
      // An agent embeds only what it may read — on a page of its own, which it may write.
      const own = await createPage(served, 'editorB');
      const refused = await editor.callTool({ name: 'append_block', arguments: { pageId: own.id, block: { kind: 'collection', nodeId: secret.id } } });
      expect(textOf(refused)).toContain(`collection ${secret.id} not found`);
    });
  });
});
