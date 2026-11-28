// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { call, createPage, startApp, type ServedApp } from '#tests/integration/http.ts';
import { userOf } from '#tests/integration/users.ts';

// What a visitor, a sharee and an editor on no list are answered at a
// restricted page's address is spec 002's (tests/acceptance/002-visibility-and-spaces/).

const app = await startApp();
const seed = inject('seed');

describe.skipIf(app.skipped)('a page’s address', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  describe('read by its visibility', () => {
    it('sends an anonymous visitor asking for an internal page to sign in, and back to it afterwards', async () => {
      const res = await call(served, `/${seed.internalSlug}`);
      expect(res.status).toBe(303);
      const to = new URL(res.headers.get('location')!, served.origin);
      expect(to.pathname).toBe('/login');
      expect(to.searchParams.get('redirect')).toBe(`/${seed.internalSlug}`);
    });

    it('says a page does not exist in the request’s language', async () => {
      const res = await call(served, `/${seed.restrictedSlug}`, { headers: { 'accept-language': 'de' } });
      expect(res.status).toBe(404);
      const html = await res.text();
      expect(html).toContain('Seite nicht gefunden');
    });

    it('answers an admin the restricted page, with its body', async () => {
      const res = await call(served, `/${seed.restrictedSlug}`, { as: 'admin' });
      expect(res.status).toBe(200);
      expect(await res.text()).toContain(seed.restrictedBody);
    });
  });

  // Pages of the tests' own: opening the editor takes the page's edit lock.
  describe('its editor', () => {
    it('opens for the editor a restricted page is shared with — a share grants writing', async () => {
      const editorB = await userOf('editorB');
      const { slug } = await createPage(served, 'editorA', { visibility: 'restricted', shares: [editorB.id] });
      expect((await call(served, `/${slug}/edit`, { as: 'editorB' })).status).toBe(200);
    });

    it('opens for the owner of a restricted page', async () => {
      const { slug } = await createPage(served, 'editorA', { visibility: 'restricted' });
      expect((await call(served, `/${slug}/edit`, { as: 'editorA' })).status).toBe(200);
    });
  });
});
