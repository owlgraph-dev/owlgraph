// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { call, createNamespace, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';

// Namespaces are made through the settings, where the served app's route
// matcher learns of them.

const app = await startApp();

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const pathOf = (res: Response, origin: string) => new URL(res.headers.get('location')!, origin);
const storedVisibility = async (id: string) => (await db<{ visibility: string | null }[]>`select visibility from nodes where id = ${id}`)[0].visibility;

describe.skipIf(app.skipped)('namespace addresses', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const setAccess = async (id: string, name: string, accessLevel: 'public' | 'internal' | 'restricted') =>
    expect((await formAction(served, '/settings/namespaces?/update', { id, name, accessLevel }, { as: 'admin' })).type, `→ ${accessLevel}`).toBe('success');

  describe('routing', () => {
    it('a page made in a namespace is told its namespace’s slug and resolves at /<namespace>/<slug> and its editor', async () => {
      const namespaceId = await createNamespace(served, { name: 'Routing', slug: 'routing-ns' });
      const res = await call(served, '/api/pages', { as: 'admin', json: { namespaceId } });
      const page = (await res.json()) as { slug: string; namespaceSlug: string };
      expect(page.namespaceSlug).toBe('routing-ns');
      expect((await call(served, `/routing-ns/${page.slug}`, { as: 'admin' })).status).toBe(200);
      expect((await call(served, `/routing-ns/${page.slug}/edit`, { as: 'admin' })).status).toBe(200);
    });

    it('a namespace an anonymous visitor cannot see keeps routing after that visitor’s page render', async () => {
      // An anonymous render sees fewer namespaces; it must not narrow the
      // server's matcher for everyone else.
      const namespaceId = await createNamespace(served, { name: 'Unseen', slug: 'unseen-ns' });
      const page = await createPage(served, 'admin', { namespaceId });
      expect((await call(served, '/')).status).toBe(200);
      expect((await call(served, `/unseen-ns/${page.slug}`, { as: 'admin' })).status).toBe(200);
    });

    it('a page made with no namespace has no namespace slug and resolves at /<slug>', async () => {
      const page = (await (await call(served, '/api/pages', { as: 'admin', json: {} })).json()) as { slug: string; namespaceSlug?: string | null };
      expect(page.namespaceSlug ?? null).toBeNull();
      expect((await call(served, `/${page.slug}`, { as: 'admin' })).status).toBe(200);
    });

    it('a page with the slug edit inside a namespace is that namespace’s read view at /<namespace>/edit, and its editor at /<namespace>/edit/edit', async () => {
      const namespaceId = await createNamespace(served, { name: 'Edit slug', slug: 'edit-slug-ns' });
      const page = await createPage(served, 'admin', { namespaceId });
      expect((await call(served, `/api/pages/${page.id}`, { as: 'admin', method: 'PATCH', json: { slug: 'edit' } })).ok).toBe(true);
      // Without the matcher the static [slug]/edit route would take it and 404.
      expect((await call(served, '/edit-slug-ns/edit', { as: 'admin' })).status).toBe(200);
      expect((await call(served, '/edit-slug-ns/edit/edit', { as: 'admin' })).status).toBe(200);
    });

    it('renaming a namespace’s prefix moves its pages to /<new>/<slug> at once, and the old prefix no longer resolves', async () => {
      const namespaceId = await createNamespace(served, { name: 'Before', slug: 'before-ns' });
      const page = await createPage(served, 'admin', { namespaceId });
      expect((await call(served, `/before-ns/${page.slug}`, { as: 'admin' })).status).toBe(200);
      const renamed = await formAction(served, '/settings/namespaces?/update', { id: namespaceId, name: 'After', slug: 'after-ns', accessLevel: 'internal' }, { as: 'admin' });
      expect(renamed.type).toBe('success');
      expect((await call(served, `/after-ns/${page.slug}`, { as: 'admin' })).status).toBe(200);
      expect((await call(served, `/before-ns/${page.slug}`, { as: 'admin' })).status).toBe(404);
    });
  });

  describe('the access a namespace gives its content', () => {
    it('a create post that names no access level stores the namespace as internal', async () => {
      const res = await formAction(served, '/settings/namespaces?/create', { name: 'No level', slug: 'no-level-ns' }, { as: 'admin' });
      expect(res.type).toBe('success');
      expect((await db<{ access_level: string }[]>`select access_level from namespaces where slug = 'no-level-ns'`)[0].access_level).toBe('internal');
    });

    it('a PATCH making a page public inside an internal namespace answers 409 widening_not_allowed, and the page stays as it was', async () => {
      const namespaceId = await createNamespace(served, { name: 'Widening', slug: 'widening-ns', accessLevel: 'internal' });
      const page = await createPage(served, 'admin', { namespaceId, visibility: 'restricted' });
      const res = await call(served, `/api/pages/${page.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'public' } });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('widening_not_allowed');
      expect(await storedVisibility(page.id)).toBe('restricted');
      expect((await call(served, `/widening-ns/${page.slug}`)).status).toBe(404);
    });

    it('a public namespace opens its inheriting pages and a share link to a signed-out visitor; narrowed, it asks for sign-in again while the share link still opens, and narrowing further narrows a wider override', async () => {
      const ns = { name: 'Public anon', slug: 'public-anon-ns' };
      const namespaceId = await createNamespace(served, { ...ns, accessLevel: 'public' });
      // One page as made, one closed and then reopened, one restricted with a share link.
      const fresh = await createPage(served, 'editorA', { namespaceId, title: 'Fresh', doc: doc('fresh-body') });
      const reopened = await createPage(served, 'editorA', { namespaceId, title: 'Reopened', doc: doc('reopened-body'), visibility: 'restricted' });
      const shared = await createPage(served, 'editorA', { namespaceId, title: 'Shared', doc: doc('shared-body'), visibility: 'restricted' });
      expect(await storedVisibility(fresh.id)).toBeNull();
      expect((await call(served, `/api/pages/${reopened.id}`, { as: 'editorA', method: 'PATCH', json: { visibility: null } })).ok).toBe(true);
      expect(await storedVisibility(reopened.id)).toBeNull();
      const { token } = (await (await call(served, `/api/pages/${shared.id}/share-links`, { as: 'editorA', json: {} })).json()) as { token: string };

      for (const [page, body] of [[fresh, 'fresh-body'], [reopened, 'reopened-body']] as const) {
        const res = await call(served, `/${ns.slug}/${page.slug}`);
        expect(res.status, page.slug).toBe(200);
        expect(await res.text()).toContain(body);
      }
      const viaLink = await call(served, `/share/${token}`);
      expect(viaLink.status).toBe(200);
      expect(await viaLink.text()).toContain('shared-body');
      expect((await call(served, `/${ns.slug}/${shared.slug}`)).status).toBe(404);

      await setAccess(namespaceId, ns.name, 'internal');
      for (const page of [fresh, reopened]) {
        const res = await call(served, `/${ns.slug}/${page.slug}`);
        expect(res.status).toBe(303);
        const to = pathOf(res, served.origin);
        expect(to.pathname).toBe('/login');
        expect(to.searchParams.get('redirect')).toBe(`/${ns.slug}/${page.slug}`);
      }
      expect((await call(served, `/share/${token}`)).status).toBe(200);

      await setAccess(namespaceId, ns.name, 'public');
      expect((await call(served, `/api/pages/${fresh.id}`, { as: 'admin', method: 'PATCH', json: { visibility: 'internal' } })).ok).toBe(true);
      await setAccess(namespaceId, ns.name, 'restricted');
      expect(await storedVisibility(fresh.id)).toBe('restricted');
      expect(await storedVisibility(reopened.id)).toBeNull();
    });
  });
});
