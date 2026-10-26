// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { call, createNamespace, createPage, startApp, type ServedApp } from '$tests/integration/http';

// editorA owns the seeded restricted page and document; editorB is shared on both.

const app = await startApp();
const seed = inject('seed');

type Link = { id: string; token: string };

describe.skipIf(app.skipped)('share links', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const makeLink = async (kind: 'pages' | 'documents', id: string): Promise<Link> => {
    const res = await call(served, `/api/${kind}/${id}/share-links`, { as: 'editorA', json: { label: 'integration link' } });
    expect(res.status).toBe(200);
    const link = (await res.json()) as Link;
    expect(link.token).toBeTruthy();
    return link;
  };
  const linkCount = async (nodeId: string) => Number((await db<{ n: string }[]>`select count(*) as n from share_links where node_id = ${nodeId}`)[0].n);

  describe('on a page', () => {
    it('one the owner makes on a restricted page opens for an anonymous visitor, with the page’s body', async () => {
      const link = await makeLink('pages', seed.restrictedId);
      const res = await call(served, `/share/${link.token}`);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(seed.restrictedBody);
    });

    it('an unknown token answers 404', async () => {
      expect((await call(served, '/share/not-a-real-token-at-all')).status).toBe(404);
    });

    it('once revoked, the next anonymous request for it answers 404', async () => {
      const link = await makeLink('pages', seed.restrictedId);
      expect((await call(served, `/share/${link.token}`)).status).toBe(200);
      expect((await call(served, `/api/pages/${seed.restrictedId}/share-links/${link.id}`, { as: 'editorA', method: 'DELETE' })).ok).toBe(true);
      expect((await call(served, `/share/${link.token}`)).status).toBe(404);
    });

    it('an editor who neither owns the restricted page nor is on its share list is refused making one with 403', async () => {
      const before = await linkCount(seed.restrictedId);
      expect((await call(served, `/api/pages/${seed.restrictedId}/share-links`, { as: 'editorC', json: {} })).status).toBe(403);
      expect(await linkCount(seed.restrictedId)).toBe(before);
    });
  });

  describe('on a document', () => {
    it('serves the restricted document’s bytes anonymously at /share/<token>/content while its own content address answers 404, until revoked', async () => {
      const link = await makeLink('documents', seed.restrictedDocId);
      expect((await call(served, `/api/documents/${seed.restrictedDocId}/content`)).status).toBe(404);
      const shared = await call(served, `/share/${link.token}/content`);
      expect(shared.status).toBe(200);
      expect(await shared.text()).toContain('restricted document');

      expect((await call(served, `/api/documents/${seed.restrictedDocId}/share-links/${link.id}`, { as: 'editorA', method: 'DELETE' })).ok).toBe(true);
      expect((await call(served, `/share/${link.token}/content`)).status).toBe(404);
    });
  });

  // A revoked link must grant nothing, not even a page shown again on Back.
  describe('what a browser keeps', () => {
    it('the page a link opens — a page’s or a document’s — and its data are private, no-store for an anonymous visitor', async () => {
      const page = await makeLink('pages', seed.restrictedId);
      const document = await makeLink('documents', seed.restrictedDocId);
      for (const path of [`/share/${page.token}`, `/share/${page.token}/__data.json`, `/share/${document.token}`]) {
        const res = await call(served, path);
        expect(res.status, path).toBe(200);
        expect(res.headers.get('cache-control'), path).toBe('private, no-store');
      }
    });
  });

  describe('who may manage them', () => {
    it('only a writer of the node lists, makes or revokes its share links — every other caller gets 403 and nothing changes', async () => {
      const link = await makeLink('pages', seed.restrictedId);
      const before = await linkCount(seed.restrictedId);

      expect((await call(served, `/api/pages/${seed.publicId}/share-links`, { as: 'viewer' })).status).toBe(403);
      expect((await call(served, `/api/pages/${seed.restrictedId}/share-links/${link.id}`, { as: 'editorC', method: 'DELETE' })).status).toBe(403);
      expect(await linkCount(seed.restrictedId)).toBe(before);
      expect((await call(served, `/share/${link.token}`)).status).toBe(200);
      // A document is written by its owner only, so its sharee makes no link.
      const docBefore = await linkCount(seed.restrictedDocId);
      expect((await call(served, `/api/documents/${seed.restrictedDocId}/share-links`, { as: 'editorB', json: {} })).status).toBe(403);
      expect(await linkCount(seed.restrictedDocId)).toBe(docBefore);
    });
  });

  describe('what a shared page names', () => {
    it('its rendered link to a page in a hidden namespace keeps the link text and carries that namespace’s slug nowhere', async () => {
      const ns = { name: 'Share NS', slug: 'share-ns-hidden', accessLevel: 'restricted' as const };
      const namespaceId = await createNamespace(served, ns);
      // The link carries the slug cached when it was authored.
      const target = await createPage(served, 'admin', { namespaceId });
      const source = await createPage(served, 'admin', {
        visibility: 'restricted',
        doc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Secret Link Text', marks: [{ type: 'pageLink', attrs: { targetPageId: target.id, targetSlug: `${ns.slug}/${target.slug}` } }] }],
            },
          ],
        },
      });
      const res = await call(served, `/api/pages/${source.id}/share-links`, { as: 'admin', json: {} });
      const link = (await res.json()) as Link;

      const shared = await call(served, `/share/${link.token}`);
      expect(shared.status).toBe(200);
      const html = await shared.text();
      expect(html).toContain('Secret Link Text');
      expect(html).not.toContain(ns.slug);
    });

    it('its referenced-by list and local graph name the readable pages linking to it and never a restricted one', async () => {
      // The seeded graph page links to the public page already.
      await db`insert into edges (source_id, target_id) values (${seed.restrictedId}, ${seed.publicId})`;
      const link = await makeLink('pages', seed.publicId);
      const html = await (await call(served, `/share/${link.token}`)).text();
      expect(html).toContain('Graph Test Page');
      expect(html).not.toContain(seed.restrictedTitle);
      expect(html).not.toContain(seed.restrictedSlug);
    });
  });

  describe('which namespaces exist', () => {
    it('/api/namespaces/slugs lists a restricted namespace to an admin and omits it for an anonymous caller and a non-member editor', async () => {
      const ns = { name: 'Slugs NS', slug: 'slugs-ns-hidden', accessLevel: 'restricted' as const };
      await createNamespace(served, ns);
      const slugsFor = async (as?: 'admin' | 'editorC') => (await (await call(served, '/api/namespaces/slugs', { as })).json()) as string[];
      expect(await slugsFor('admin')).toContain(ns.slug);
      expect(await slugsFor()).not.toContain(ns.slug);
      expect(await slugsFor('editorC')).not.toContain(ns.slug);
    });
  });
});
