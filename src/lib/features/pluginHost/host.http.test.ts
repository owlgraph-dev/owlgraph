// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { createPluginDocument } from '$lib/features/documents/server';
import { createCollection } from '$lib/features/collections/server';
import { call, startApp, type ServedApp } from '$tests/integration/http';
import { userOf } from '$tests/integration/users';

// Nodes of a made-up integration are seeded in-process.

const app = await startApp();

const GONE = 'retired-integration';

afterAll(async () => {
  if (!app.skipped) await app.close();
});

describe.skipIf(app.skipped)('the integrations host, served', () => {
  const served = app as ServedApp;

  it('answers a plugin that is not registered with a 404, without a session too', async () => {
    for (const path of ['/api/plugins/no-such-plugin/listing', '/api/plugins/no-such-plugin/a/b']) {
      const res = await call(served, path);
      expect(res.status, path).toBe(404);
      expect(res.headers.get('cache-control'), path).toBe('private, no-store');
    }
    expect((await call(served, '/api/plugins/no-such-plugin/documents', { json: {} })).status).toBe(404);
  });

  describe('signed in', () => {
    it("serves a plugin document's content only through its integration", async () => {
      const owner = await userOf('admin');
      const { id } = await db.begin((sql) =>
        createPluginDocument(
          {
            plugin: GONE,
            ref: { path: 'Reports/one.pdf' },
            title: 'Retired file',
            file: { filename: 'one.pdf', mime: 'application/pdf', size: 12 },
            createdBy: owner.id,
            user: owner,
          },
          sql
        )
      );
      // No integration answers for it: nothing to serve, and its file is not the editor's to change.
      expect((await call(served, `/api/documents/${id}/content`, { as: 'admin' })).status).toBe(404);
      expect((await call(served, `/api/documents/${id}/content`, { as: 'admin', method: 'PUT', json: { externalUrl: 'https://example.org' } })).status).toBe(409);
    });

    it("connects a collection's source only through its integration, for its writers, as JSON", async () => {
      const owner = await userOf('admin');
      const curated = await createCollection({ title: 'Curated', createdBy: owner.id, user: owner });
      const mirrored = await createCollection({ title: 'Mirrored', createdBy: owner.id, user: owner, plugin: GONE, sourceRef: { path: '' } });
      const put = (id: string, json: unknown) => call(served, `/api/collections/${id}/source`, { as: 'admin', method: 'PUT', json });

      // A curated collection has no source; one whose integration is gone, none to connect.
      expect((await put(curated.id, { values: {} })).status).toBe(409);
      expect((await put(mirrored.id, { values: { url: 'https://example.org/s/x' } })).status).toBe(409);
      // JSON only (a form type is refused before, by SvelteKit's own origin check); a malformed id is a 404.
      expect((await call(served, `/api/collections/${mirrored.id}/source`, { as: 'admin', method: 'PUT', headers: { 'content-type': 'application/xml' }, body: '<values/>' })).status).toBe(415);
      expect((await put('not-an-id', { values: {} })).status).toBe(404);

      // Not a session: the route is not public. A reader is no writer.
      expect((await call(served, `/api/collections/${mirrored.id}/source`, { method: 'PUT', json: { values: {} } })).status).toBe(401);
      expect((await call(served, `/api/collections/${mirrored.id}/source`, { as: 'viewer', method: 'PUT', json: { values: {} } })).status).toBe(403);
    });
  });
});

describe.skipIf(app.skipped)("a person's connections page", () => {
  const served = app as ServedApp;

  /** The page's "Back to the page" links, and every address anything on it points at. */
  async function page(returnTo: string) {
    const res = await call(served, `/settings/connections?return=${encodeURIComponent(returnTo)}`, { as: 'editorA' });
    expect(res.status, returnTo).toBe(200);
    const document = new JSDOM(await res.text()).window.document;
    const back = [...document.querySelectorAll('a')].filter((a) => a.textContent?.trim() === 'Back to the page').map((a) => a.getAttribute('href'));
    const addresses = [...document.querySelectorAll('[href], [src], [action], [formaction]')].flatMap((el) =>
      ['href', 'src', 'action', 'formaction'].map((name) => el.getAttribute(name)).filter((v): v is string => v !== null)
    );
    return { back, addresses };
  }

  const FOREIGN = ['//evil.example/phish', 'https://evil.example/phish', '/\\evil.example/phish', 'javascript:alert(1)'];

  it("offers 'Back to the page' for a return= that is a path on this app, and that path alone", async () => {
    expect((await page('/docs/intro?tab=2')).back).toEqual(['/docs/intro?tab=2']);
  });

  it('renders no link to a return= that is no path on this app — protocol-relative, absolute, backslashed or a script', async () => {
    for (const returnTo of FOREIGN) {
      const { addresses } = await page(returnTo);
      expect(addresses.filter((a) => a.includes('evil.example') || a.startsWith('javascript:')), returnTo).toEqual([]);
    }
  });

  it("offers no 'Back to the page' at all for a return= that is no path on this app", async () => {
    for (const returnTo of FOREIGN) expect((await page(returnTo)).back, returnTo).toEqual([]);
  });
});
