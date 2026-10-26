// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db, type JsonArg } from '$lib/platform/db.server';
import { call, cookieFor, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf, type Role } from '$tests/integration/users';
import { retiredWidget, textPara, txt } from '$tests/e2e/doc';
import { storedDoc } from '$tests/support/storedDoc';

// Every page here is the test's own and restricted unless it says otherwise.

const app = await startApp();
const seed = inject('seed');

afterAll(async () => {
  if (!app.skipped) await app.close();
});

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; text?: string; marks?: unknown[] };

const doc = (...content: Node[]) => ({ type: 'doc', content });

const dom = async (res: Response) => new JSDOM(await res.text()).window.document;

const holds = (value: unknown, text: string) => JSON.stringify(value).includes(text);
const exists = async (id: string) => (await db`select 1 from nodes where id = ${id}`).length > 0;

describe.skipIf(app.skipped)('pages, served', () => {
  const served = app as ServedApp;

  /** Readable by its owner `as` and admins only. */
  const ownPage = (as: Role, fields: Record<string, unknown> = {}) => createPage(served, as, { visibility: 'restricted', ...fields });
  const patch = (id: string, json: unknown, as: Role = 'admin') => call(served, `/api/pages/${id}`, { as, method: 'PATCH', json });
  const remove = (id: string, as: Role) => call(served, `/api/pages/${id}`, { as, method: 'DELETE' });
  const editor = (slug: string, as: Role) => call(served, `/${slug}/edit`, { as });
  const codeOf = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code;

  describe('renaming a page', () => {
    let n = 0;

    it('answers a slug another node holds with 409, a reserved word with 400 and an empty title with 400, changing nothing', async () => {
      const page = await ownPage('admin', { title: `Rename source ${++n}` });
      const taken = await ownPage('admin');
      const [before] = await db<{ slug: string; title: string }[]>`select slug, title from nodes where id = ${page.id}`;

      // A page's and a document's: slugs are one space across node types.
      for (const slug of [taken.slug, seed.docSlug]) {
        const res = await patch(page.id, { slug });
        expect(res.status, slug).toBe(409);
        expect(await codeOf(res)).toBe('slug_taken');
      }
      const reserved = await patch(page.id, { slug: 'settings' });
      expect(reserved.status).toBe(400);
      expect(await codeOf(reserved)).toBe('slug_reserved');
      const empty = await patch(page.id, { title: '   ' });
      expect(empty.status).toBe(400);
      expect(await codeOf(empty)).toBe('title_required');

      const [after] = await db<{ slug: string; title: string }[]>`select slug, title from nodes where id = ${page.id}`;
      expect(after).toEqual(before);
    });

    it('keeps the page’s id on a slug change, so a page link to it resolves to its new address', async () => {
      const target = await ownPage('admin', { title: `Link target ${++n}` });
      const link = { type: 'pageLink', attrs: { targetPageId: target.id, targetSlug: target.slug } };
      const source = await ownPage('admin', { doc: doc({ type: 'paragraph', attrs: { blockId: 'p-link' }, content: [txt('the target', [link])] }) });
      const hrefIn = async (slug: string) => (await dom(await call(served, `/${slug}`, { as: 'admin' }))).querySelector('a.page-link')?.getAttribute('href');
      expect(await hrefIn(source.slug)).toBe(`/${target.slug}`);

      const slug = `moved-target-${n}`;
      const renamed = await patch(target.id, { slug });
      expect(renamed.status).toBe(200);
      expect(await renamed.json()).toMatchObject({ id: target.id, slug });

      expect(await hrefIn(source.slug)).toBe(`/${slug}`);
      expect((await call(served, `/${slug}`, { as: 'admin' })).status).toBe(200);
      expect(await db`select 1 from edges where source_id = ${source.id} and target_id = ${target.id}`).toHaveLength(1);
    });
  });

  describe('deleting a page', () => {
    it('answers a DELETE of the current home page with 409, its reason, and keeps the page', async () => {
      const { id, slug } = await ownPage('editorA');
      // Setting the home page is an admin's.
      expect((await formAction(served, '/settings/home?/setHome', { id }, { as: 'admin' })).type).toBe('success');
      try {
        const res = await remove(id, 'editorA');
        expect(res.status).toBe(409);
        expect(await codeOf(res)).toBe('home_page');
        expect(await exists(id)).toBe(true);
        expect((await editor(slug, 'editorA')).status).toBe(200);
      } finally {
        expect((await formAction(served, '/settings/home?/clearHome', {}, { as: 'admin' })).type).toBe('success');
      }
    });

    it('sends an editor neither owning nor shared on a restricted page from its editor to /, and answers their DELETE with 403 forbidden', async () => {
      const res = await editor(seed.restrictedSlug, 'editorC');
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/');

      const refused = await remove(seed.restrictedId, 'editorC');
      expect(refused.status).toBe(403);
      expect(await codeOf(refused)).toBe('forbidden');
      expect(await exists(seed.restrictedId)).toBe(true);
    });

    it('lets an editor a restricted page is shared with reach its editor and delete it; its editor then answers 404', async () => {
      // A share is trust, not a read-only grant (docs/architecture/authorization.md).
      const editorB = await userOf('editorB');
      const { id, slug } = await ownPage('editorA', { shares: [editorB.id] });
      expect((await editor(slug, 'editorB')).status).toBe(200);

      const res = await remove(id, 'editorB');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await editor(slug, 'editorB')).status).toBe(404);
    });

    it('sends a viewer from a page’s editor to /, and answers their DELETE with 403 forbidden', async () => {
      const res = await editor(seed.internalSlug, 'viewer');
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/');

      const refused = await remove(seed.internalId, 'viewer');
      expect(refused.status).toBe(403);
      expect(await codeOf(refused)).toBe('forbidden');
      expect(await exists(seed.internalId)).toBe(true);
    });

    it('lets an admin delete another user’s restricted page; its editor then answers 404', async () => {
      const { id, slug } = await ownPage('editorA');
      expect((await editor(slug, 'admin')).status).toBe(200);

      const res = await remove(id, 'admin');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect((await editor(slug, 'admin')).status).toBe(404);
    });
  });

  // docs/architecture/blocks/anatomy.md, "Unknown blocks". The kind is invented: a plugin merely
  // turned off keeps its kinds known.
  describe('the unknown-block guard', () => {
    /** An unknown block at the top level and one in the first cell of a grid. */
    const guardedPage = () =>
      ownPage('admin', {
        doc: doc(textPara('p-first', 'First paragraph'), retiredWidget('w-top'), {
          type: 'grid',
          attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
          content: [
            { type: 'gridCell', content: [textPara('p-left', 'Left column'), retiredWidget('w-cell')] },
            { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
          ],
        }),
      });

    it('refuses a PUT that leaves one out, naming it, and takes it once the PUT names it', async () => {
      const { id } = await guardedPage();
      const before = await storedDoc(id);
      const without = { ...before, content: before.content.filter((n) => n.attrs?.blockId !== 'w-top') };

      const refused = await call(served, `/api/pages/${id}`, { as: 'admin', method: 'PUT', json: without });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({ error: { code: 'unknown_blocks_dropped', dropped: [{ key: 'w-top', type: 'retiredWidget', count: 1 }] } });
      expect(await storedDoc(id)).toEqual(before);

      const taken = await call(served, `/api/pages/${id}`, { as: 'admin', method: 'PUT', json: without, headers: { 'x-acknowledge-dropped': 'w-top' } });
      expect(taken.status).toBe(200);
      const after = await storedDoc(id);
      expect(holds(after, '"w-top"')).toBe(false);
      expect(holds(after, '"w-cell"')).toBe(true);
    });

    it('under the edit lock, refuses a lost draft’s picked block that would lose one, and applies a pick that removes one', async () => {
      const { id } = await guardedPage();
      const lock = (await (await call(served, `/api/pages/${id}/lock`, { as: 'admin', json: {} })).json()) as { ok: boolean; token: string };
      expect(lock.ok).toBe(true);
      const picks = (json: unknown) => call(served, `/api/pages/${id}/apply-picks`, { as: 'admin', json });
      try {
        const before = await storedDoc(id);
        // The draft's grid lacks the unknown block in its first cell.
        const grid = before.content.find((n) => n.attrs?.blockId === 'grid-1')!;
        const draftGrid = { ...grid, content: [{ ...grid.content![0], content: [textPara('p-left', 'Left column')] }, grid.content![1]] };
        const replace = await picks({ lockToken: lock.token, picks: [{ blockId: 'grid-1', op: 'replace', block: draftGrid }] });
        expect(replace.status).toBe(409);
        expect(await replace.json()).toMatchObject({ error: { code: 'unknown_blocks_dropped', dropped: [{ key: 'w-cell', type: 'retiredWidget' }] } });
        expect(await storedDoc(id)).toEqual(before);

        const removed = await picks({ lockToken: lock.token, picks: [{ blockId: 'w-top', op: 'remove' }] });
        expect(removed.status).toBe(200);
        const after = await storedDoc(id);
        expect(holds(after, '"w-top"')).toBe(false);
        expect(holds(after, '"w-cell"')).toBe(true);
      } finally {
        await call(served, `/api/pages/${id}/lock`, { as: 'admin', method: 'DELETE', json: { token: lock.token } });
      }
    });
  });

  // docs/architecture/theming.md, "Content scheme". The colours those attributes give are
  // tested in design-system/theme/emit.test.ts.
  describe('a page’s colour scheme', () => {
    const BODY = doc(textPara('p-body', 'Scheme page body'));

    async function read(slug: string, pref?: 'light' | 'dark', as: Role = 'admin') {
      const session = await cookieFor(as);
      const res = await call(served, `/${slug}`, { cookie: pref ? `${session}; color_pref=${pref}` : session });
      expect(res.status, slug).toBe(200);
      const page = await dom(res);
      return {
        pref: page.documentElement.getAttribute('data-color-pref'),
        main: page.querySelector('main.canvas-route'),
        canvas: page.querySelector('.page-canvas'),
      };
    }
    const scheme = (el: Element | null) => {
      expect(el).not.toBeNull();
      return el!.getAttribute('data-scheme');
    };
    const storedScheme = async (id: string) => (await db<{ content_scheme: string | null }[]>`select content_scheme from pages where id = ${id}`)[0].content_scheme;

    it('renders a page that inherits the site default light, even for a reader who chose dark', async () => {
      const { slug } = await ownPage('admin', { doc: BODY });
      const page = await read(slug, 'dark');
      expect(page.pref).toBe('dark');
      expect(scheme(page.main)).toBe('light');
      expect(scheme(page.canvas)).toBe('light');
    });

    it('renders an adaptive page with no scheme of its own, so it takes the reader’s preference', async () => {
      const { slug } = await ownPage('admin', { doc: BODY, contentScheme: 'adaptive' });
      for (const [pref, rendered] of [
        [undefined, 'system'],
        ['dark', 'dark'],
      ] as const) {
        const page = await read(slug, pref);
        expect(page.pref).toBe(rendered);
        expect(scheme(page.main), rendered).toBeNull();
        expect(scheme(page.canvas), rendered).toBeNull();
      }
    });

    it('refuses an unknown scheme with 400; null after dark returns the page to the site default', async () => {
      const { id, slug } = await ownPage('admin', { doc: BODY });
      const bad = await patch(id, { contentScheme: 'blue' });
      expect(bad.status).toBe(400);
      expect(await codeOf(bad)).toBe('invalid_content_scheme');
      expect(await storedScheme(id)).toBeNull();

      expect((await patch(id, { contentScheme: 'dark' })).status).toBe(200);
      expect(scheme((await read(slug, 'light')).canvas)).toBe('dark');
      expect((await patch(id, { contentScheme: null })).status).toBe(200);
      expect(await storedScheme(id)).toBeNull();
      const page = await read(slug);
      expect(scheme(page.main)).toBe('light');
      expect(scheme(page.canvas)).toBe('light');
    });

    it('previews a page with ?scheme=dark as a dark reader sees it once it adapts', async () => {
      const { slug } = await ownPage('admin', { title: 'Preview', doc: doc(textPara('p-preview', 'Preview me')) });
      const page = await dom(await call(served, `/${slug}?scheme=dark`, { as: 'admin' }));
      expect(page.querySelector('article.page-canvas')?.getAttribute('data-scheme')).toBe('dark');
      expect(page.querySelector('main.canvas-route')?.getAttribute('data-scheme')).toBe('dark');
    });
  });

  // docs/architecture/theming.md, "Letting pages adapt".
  describe('the site’s default colour scheme', () => {
    const section = () => call(served, '/settings/color-scheme', { as: 'admin' });
    const setDefault = (scheme: string) => formAction(served, '/settings/color-scheme?/setDefault', { scheme }, { as: 'admin' });
    const storedDefault = async () => (await db<{ value: string }[]>`select value from site_settings where key = 'content_scheme_default'`)[0]?.value ?? null;
    const resetColors = async () => expect((await formAction(served, '/settings/branding?/resetColors', {}, { as: 'admin' })).type).toBe('success');

    // An accent that doesn't read on a light page. The branding section refuses
    // to save one, so it is written straight to the row, which every page load
    // reads (site/theme.server.ts getSiteTheme).
    const SHORT = { version: 1, schemes: { light: { accent: '#ffff00' } } };
    async function storeShortPalette() {
      await db`delete from themes where scope_kind = 'site'`;
      await db`insert into themes (scope_kind, tokens) values ('site', ${db.json(SHORT as unknown as JsonArg)})`;
    }

    it('is set in a section for admins only: an editor’s GET answers 403', async () => {
      expect((await call(served, '/settings/color-scheme', { as: 'editorA' })).status).toBe(403);
      expect((await section()).status).toBe(200);
    });

    it('is not set to adaptive while the theme’s palette falls short of the contrast minimums: 400, and the default stays', async () => {
      const refused = await formAction(served, '/settings/branding?/saveColors', { colors: JSON.stringify({ lightAccent: SHORT.schemes.light.accent }) }, { as: 'admin' });
      expect([refused.type, refused.status]).toEqual(['failure', 400]);
      expect(refused.data).toMatchObject({ colorErrors: { lightAccent: 'contrast' } });

      const before = await storedDefault();
      const { slug } = await ownPage('admin', { doc: doc(textPara('p-default', 'Follows the default')) });
      await storeShortPalette();
      try {
        expect((await section()).status).toBe(200);
        const res = await setDefault('adaptive');
        expect([res.type, res.status, res.data]).toEqual(['failure', 400, { error: { code: 'theme_colors_unreadable', message: "The theme's colours don't read on every ground in both schemes yet." } }]);
        expect(await storedDefault()).toBe(before);
        const page = await dom(await call(served, `/${slug}`, { as: 'admin' }));
        expect(page.querySelector('.page-canvas')?.getAttribute('data-scheme')).toBe('light');
      } finally {
        await resetColors();
      }

      expect((await section()).status).toBe(200);
      try {
        expect((await setDefault('adaptive')).type).toBe('success');
        expect(await storedDefault()).toBe('adaptive');
      } finally {
        expect((await setDefault('light')).type).toBe('success');
      }
    });

    // Otherwise the root layout's load makes a stored theme the active one
    // (design-system/theme/tokens.ts).
    it('is refused straight after the stored theme changes, before any page has been rendered', async () => {
      // The last page rendered had the built-in palette.
      expect((await section()).status).toBe(200);
      const before = await storedDefault();
      await storeShortPalette();
      try {
        const res = await setDefault('adaptive');
        expect([res.type, res.status, res.data]).toEqual(['failure', 400, { error: { code: 'theme_colors_unreadable', message: "The theme's colours don't read on every ground in both schemes yet." } }]);
        expect(await storedDefault()).toBe(before);
      } finally {
        await resetColors();
        expect((await setDefault('light')).type).toBe('success');
      }
    });
  });
});
