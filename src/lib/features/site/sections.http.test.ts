// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type CallOptions, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';

// Set up through the sections' own form actions: the served build caches the
// site-wide settings, and only its own save refreshes them. The tests share the
// database in order, so each sets what it needs.

const app = await startApp();
const seed = inject('seed');

afterAll(async () => {
  if (!app.skipped) await app.close();
});

// A real 1×1 PNG: an upload is decoded and measured (docs/architecture/media.md).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const png = (name = 'logo.png') => new File([new Uint8Array(PNG)], name, { type: 'image/png' });
const MALICIOUS_SVG = '<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1"><script>window.__xss=2</script><circle r="5"/></svg>';

const LOGO_ROUTE = /^\/api\/media\/branding\/logo\/[0-9a-f-]+$/;

describe.skipIf(app.skipped)('the site settings sections, served', () => {
  const served = app as ServedApp;

  const dom = async (res: Response) => new JSDOM(await res.text()).window.document;
  const pageAs = async (path: string, options: CallOptions = {}) => {
    const res = await call(served, path, options);
    expect(res.status, `GET ${path}`).toBe(200);
    return dom(res);
  };
  const text = (el: Element | null | undefined) => el?.textContent?.trim() ?? null;
  const linksNamed = (root: ParentNode | null, name: string) => [...(root?.querySelectorAll('a') ?? [])].filter((a) => text(a) === name);
  /** A form posted as a browser without JavaScript posts it, multipart. */
  const post = (path: string, fields: Record<string, string>, as: Role, files: Record<string, File> = {}) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    for (const [k, f] of Object.entries(files)) form.append(k, f);
    return call(served, path, { as, body: form });
  };
  const admin = async (path: string, fields: Record<string, string>, files?: Record<string, File>) => {
    const result = await formAction(served, path, fields, { as: 'admin', files });
    expect(result.type, `${path}: ${JSON.stringify(result.data)}`).toBe('success');
  };

  // "/" redirects while a home page is set: the sections that render there start without one.
  const clearHome = () => admin('/settings/home?/clearHome', {});

  const currentLogo = async () => (await pageAs('/settings/branding', { as: 'admin' })).querySelector('.current img.preview')?.getAttribute('src') ?? null;
  const uploadLogo = async (file: File) => {
    await admin('/settings/branding?/upload', {}, { file });
    const src = await currentLogo();
    expect(src).toMatch(LOGO_ROUTE);
    return src!;
  };

  describe('who may change the site settings', () => {
    it("answers an editor's posts to the branding section's upload and remove with 403, changing nothing", async () => {
      const logo = await uploadLogo(png());
      try {
        expect((await post('/settings/branding?/upload', {}, 'editorA', { file: png() })).status).toBe(403);
        expect((await post('/settings/branding?/remove', {}, 'editorA')).status).toBe(403);
        expect(await currentLogo()).toBe(logo);
        expect((await call(served, logo)).status).toBe(200);
        expect(await db`select 1 from assets where kind = 'logo'`).toHaveLength(1);
      } finally {
        await admin('/settings/branding?/remove', {});
      }
    });

    it("answers an editor's posts to the footer's column, legal text and branding actions with 403, storing nothing", async () => {
      expect((await post('/settings/footer?/createColumnEntry', { kind: 'group', label: 'nope' }, 'editorA')).status).toBe(403);
      expect((await post('/settings/footer?/saveLegalText', { legalText: 'nope' }, 'editorA')).status).toBe(403);
      expect((await post('/settings/footer?/saveBranding', { title: 'nope' }, 'editorA')).status).toBe(403);
      expect(await db`select 1 from nav_tree_entries where label = 'nope'`).toHaveLength(0);
      expect(await db`select 1 from site_settings where value = 'nope'`).toHaveLength(0);
    });

    it("answers an editor's GET of the languages section with 403", async () => {
      expect((await call(served, '/settings/languages', { as: 'editorA' })).status).toBe(403);
    });
  });

  describe('the logo', () => {
    beforeEach(() => admin('/settings/branding?/remove', {}));

    it("shows an admin's PNG upload as the section's preview and serves it publicly, with a cacheable header", async () => {
      const src = await uploadLogo(png());
      // Anonymous: the app bar shows the logo on /login and public pages too.
      const res = await call(served, src);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/png');
      expect(res.headers.get('cache-control')).toContain('public');
    });

    it('serves an SVG logo uploaded with a script element and an onload handler back with neither', async () => {
      const src = await uploadLogo(new File([MALICIOUS_SVG], 'logo.svg', { type: 'image/svg+xml' }));
      const res = await call(served, src);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain('<script');
      expect(body).not.toContain('onload');
      expect(body).toContain('<circle');
    });

    it('retires the previous logo when it is replaced: the new one has another id, and the old URL answers 404', async () => {
      const first = await uploadLogo(png('logo1.png'));
      const second = await uploadLogo(png('logo2.png'));
      expect(second).not.toBe(first);
      expect((await call(served, first)).status).toBe(404);
      expect((await call(served, second)).status).toBe(200);
      expect(await db`select 1 from assets where kind = 'logo' and scope = 'global'`).toHaveLength(1);
    });

    it('answers the removed logo with 404, the section then showing that none is set', async () => {
      const src = await uploadLogo(png());
      await admin('/settings/branding?/remove', {});
      expect((await call(served, src)).status).toBe(404);
      const section = await pageAs('/settings/branding', { as: 'admin' });
      expect(section.querySelector('.current img.preview')).toBeNull();
      expect(section.body.textContent).toContain('No custom logo set');
    });

    it("answers 404 for an asset that is not the global logo (a page image's id)", async () => {
      expect((await call(served, `/api/media/branding/logo/${seed.publicAssetId}`)).status).toBe(404);
    });
  });

  describe('the navigation in the app bar', () => {
    beforeEach(clearHome);

    const entryId = async (label: string) => (await db<{ id: string }[]>`select id from nav_tree_entries where consumer = 'nav' and label = ${label}`)[0].id;
    const primary = async (as?: Role) => (await pageAs('/', { as })).querySelector('nav[aria-label="Primary"]');

    it("renders a page-type entry an admin created in the server-rendered app bar of /, as a link to the page's path", async () => {
      await admin('/settings/navigation?/create', { kind: 'link', label: 'Nav Page', targetType: 'page', targetPageId: seed.publicId });
      try {
        const links = linksNamed(await primary('admin'), 'Nav Page');
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect(link.getAttribute('href')).toBe(`/${seed.publicSlug}`);
      } finally {
        await admin('/settings/navigation?/delete', { id: await entryId('Nav Page') });
      }
    });

    it('renders a url-type entry as a link out, with target=_blank and rel=noopener', async () => {
      await admin('/settings/navigation?/create', { kind: 'link', label: 'Nav External', targetType: 'url', url: 'https://example.com' });
      try {
        const links = linksNamed(await primary('admin'), 'Nav External');
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
          expect(link.getAttribute('href')).toBe('https://example.com');
          expect(link.getAttribute('target')).toBe('_blank');
          expect(link.getAttribute('rel')).toBe('noopener');
        }
      } finally {
        await admin('/settings/navigation?/delete', { id: await entryId('Nav External') });
      }
    });
  });

  describe('the footer', () => {
    beforeEach(clearHome);

    const footerOf = async (as?: Role) => (await pageAs('/', { as })).querySelector('footer.site-footer');
    const columnId = async (label: string) => (await db<{ id: string }[]>`select id from nav_tree_entries where consumer = 'footer' and label = ${label}`)[0].id;
    const saveBranding = (fields: Record<string, string>) => admin('/settings/footer?/saveBranding', { title: '', tagline: '', ...fields });

    it("renders a column with a page link an admin configured in the public footer of /, titled, the link to the page's path", async () => {
      await admin('/settings/footer?/createColumnEntry', { kind: 'group', label: 'Footer Column' });
      const group = await columnId('Footer Column');
      try {
        await admin('/settings/footer?/createColumnEntry', { kind: 'link', label: 'Footer Page Link', targetType: 'page', targetPageId: seed.publicId, parentId: group });
        for (const as of ['admin', undefined] as const) {
          const footer = await footerOf(as);
          expect([...(footer?.querySelectorAll('.column h2') ?? [])].map(text), as ?? 'anonymous').toEqual(['Footer Column']);
          const links = linksNamed(footer, 'Footer Page Link');
          expect(links.map((a) => a.getAttribute('href')), as ?? 'anonymous').toEqual([`/${seed.publicSlug}`]);
        }
      } finally {
        await admin('/settings/footer?/deleteColumnEntry', { id: group });
      }
    });

    it("renders saved legal text and a url legal link in the footer's legal strip, the link with target=_blank and rel=noopener", async () => {
      await admin('/settings/footer?/saveLegalText', { legalText: '© 2026 Test Org' });
      await admin('/settings/footer?/createLegalLink', { label: 'Footer Legal', targetType: 'url', url: 'https://example.com/privacy' });
      try {
        const legal = (await footerOf('admin'))?.querySelector('.legal') ?? null;
        expect(text(legal?.querySelector('.legal-text'))).toBe('© 2026 Test Org');
        const [link, ...more] = linksNamed(legal, 'Footer Legal');
        expect(more).toEqual([]);
        expect(link.getAttribute('href')).toBe('https://example.com/privacy');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener');
      } finally {
        await admin('/settings/footer?/saveLegalText', { legalText: '' });
        const [row] = await db<{ id: string }[]>`select id from footer_links where label = 'Footer Legal'`;
        await admin('/settings/footer?/deleteLegalLink', { id: row.id });
      }
    });

    it('renders a saved title and tagline without a logo image while no global logo is set, even with Show logo posted on', async () => {
      await admin('/settings/branding?/remove', {});
      // The section offers no Show logo while there is no logo to show.
      const section = (await pageAs('/settings/footer', { as: 'admin' })).querySelector('section.branding-section');
      expect(section?.querySelector('[role="switch"]')?.hasAttribute('disabled')).toBe(true);
      try {
        await saveBranding({ title: 'Test Org', tagline: 'Building better docs' });
        let branding = (await footerOf('admin'))?.querySelector('.branding');
        expect(text(branding?.querySelector('.brand-title'))).toBe('Test Org');
        expect(text(branding?.querySelector('.brand-tagline'))).toBe('Building better docs');
        expect(branding?.querySelector('img.brand-logo')).toBeNull();

        // A direct post asking for the logo gets none either: there is none to show.
        await saveBranding({ title: 'Test Org', tagline: 'Building better docs', showLogo: 'on' });
        branding = (await footerOf('admin'))?.querySelector('.branding');
        expect(text(branding?.querySelector('.brand-title'))).toBe('Test Org');
        expect(branding?.querySelector('img.brand-logo')).toBeNull();
      } finally {
        await saveBranding({});
      }
    });

    it('renders the global logo in the public footer once Show logo is saved on', async () => {
      await admin('/settings/branding?/remove', {});
      const logo = await uploadLogo(png());
      try {
        const section = (await pageAs('/settings/footer', { as: 'admin' })).querySelector('section.branding-section');
        expect(section?.querySelector('.logo-preview img')?.getAttribute('src')).toBe(logo);
        expect(section?.querySelector('[role="switch"]')?.hasAttribute('disabled')).toBe(false);

        await saveBranding({ showLogo: 'on' });
        const img = (await footerOf('admin'))?.querySelector('.branding img.brand-logo');
        expect(img?.getAttribute('src')).toBe(logo);
      } finally {
        await saveBranding({});
        await admin('/settings/branding?/remove', {});
      }
    });
  });

  describe('the editor', () => {
    it("renders no site footer: an admin's GET of a page's editor carries none, where the page itself does", async () => {
      const { slug } = await createPage(served, 'admin', { visibility: 'restricted' });
      expect((await pageAs(`/${slug}`, { as: 'admin' })).querySelector('footer.site-footer')).not.toBeNull();
      expect((await pageAs(`/${slug}/edit`, { as: 'admin' })).querySelector('footer.site-footer')).toBeNull();
    });
  });

  describe('/ without a home page', () => {
    beforeEach(clearHome);

    const heading = (doc: Document, level: number) => text(doc.querySelector(`main h${level}`));
    const buttonsNamed = (doc: Document, name: string) => [...doc.querySelectorAll('main button')].filter((b) => text(b) === name);

    it('greets an anonymous visitor with a welcome and a way to sign in, not a redirect, and no page list', async () => {
      const res = await call(served, '/');
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
      const doc = await dom(res);
      expect(heading(doc, 1)).toBe('Welcome');
      expect(linksNamed(doc.querySelector('main'), 'Sign in').map((a) => a.getAttribute('href'))).toEqual(['/login']);
      expect([...doc.querySelectorAll('main h2')].map(text)).not.toContain('Pages');
      expect(doc.querySelector('main ul.index')).toBeNull();
    });

    it('offers an editor Create page but no Choose home page link', async () => {
      const doc = await pageAs('/', { as: 'editorA' });
      expect(heading(doc, 1)).toBe('No home page yet');
      expect(buttonsNamed(doc, 'Create page')).toHaveLength(1);
      expect(linksNamed(doc.querySelector('main'), 'Choose home page')).toEqual([]);
      expect(doc.querySelector('main a[href="/settings/home"]')).toBeNull();
      const forAdmin = await pageAs('/', { as: 'admin' });
      expect(linksNamed(forAdmin.querySelector('main'), 'Choose home page').map((a) => a.getAttribute('href'))).toEqual(['/settings/home']);
    });

    it('shows a viewer the Knowledge base list, without a Create page action', async () => {
      const doc = await pageAs('/', { as: 'viewer' });
      expect(heading(doc, 1)).toBe('Knowledge base');
      expect(buttonsNamed(doc, 'Create page')).toEqual([]);
      expect(linksNamed(doc.querySelector('main ul.index'), seed.publicTitle)).toHaveLength(1);
    });
  });

  describe('/ with a home page', () => {
    beforeEach(clearHome);

    it("answers a temporary redirect to the page's path once the home section's setHome names it", async () => {
      const { id, slug } = await createPage(served, 'admin', { title: 'Home choice', visibility: 'restricted' });
      try {
        await admin('/settings/home?/setHome', { id });
        const res = await call(served, '/', { as: 'admin' });
        expect(res.status).toBe(307);
        expect(res.headers.get('location')).toBe(`/${slug}`);
      } finally {
        await clearHome();
      }
    });

    it('answers a visitor who cannot read the home page (an internal one, anonymous) with the welcome, neither redirecting nor naming it', async () => {
      try {
        await admin('/settings/home?/setHome', { id: seed.internalId });
        const viewer = await call(served, '/', { as: 'viewer' });
        expect(viewer.status).toBe(307);
        expect(viewer.headers.get('location')).toBe(`/${seed.internalSlug}`);

        const res = await call(served, '/');
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        const html = await res.text();
        const doc = new JSDOM(html).window.document;
        expect(text(doc.querySelector('main h1'))).toBe('Welcome');
        expect(html).not.toContain(seed.internalTitle);
        expect(html).not.toContain(seed.internalSlug);
        expect(html).not.toContain(seed.internalId);
      } finally {
        await clearHome();
      }
    });
  });

  describe('the interface language a visitor gets', () => {
    const langOf = async (options: CallOptions) => (await pageAs('/login', options)).documentElement.getAttribute('lang');

    it('negotiates Accept-Language among the enabled languages: a German browser gets /login in German', async () => {
      const doc = await pageAs('/login', { headers: { 'accept-language': 'de-DE' } });
      expect(doc.documentElement.getAttribute('lang')).toBe('de');
      expect(text(doc.querySelector('h1'))).toBe('Anmelden');
    });

    it('gives a browser asking only for a language that is not enabled the site default', async () => {
      expect(await langOf({ headers: { 'accept-language': 'fr-FR' } })).toBe('en');
    });

    it('lets an explicit choice win over the browser, which the picker makes, and accepts only an enabled language', async () => {
      expect(await langOf({ headers: { 'accept-language': 'de-DE', cookie: 'ui_locale=en' } })).toBe('en');

      // The anonymous picker (the account menu) writes the choice.
      const chosen = await call(served, '/api/locale', { json: { locale: 'de' }, headers: { 'accept-language': 'de-DE', cookie: 'ui_locale=en' } });
      expect(chosen.status).toBe(204);
      const cookie = chosen.headers.getSetCookie().find((c) => c.startsWith('ui_locale='));
      expect(cookie?.split(';')[0]).toBe('ui_locale=de');
      expect(await langOf({ headers: { 'accept-language': 'en-US', cookie: 'ui_locale=de' } })).toBe('de');

      const refused = await call(served, '/api/locale', { json: { locale: 'fr' } });
      expect(refused.status).toBe(400);
      expect(refused.headers.getSetCookie().filter((c) => c.startsWith('ui_locale='))).toEqual([]);
    });

    it('speaks German to an English browser on a German-only site, refuses English, and stores a page created then in German', async () => {
      const section = await pageAs('/settings/languages', { as: 'admin' });
      expect(text(section.querySelector('h1'))).toBe('Languages');
      try {
        await admin('/settings/languages?/save', { enabled: 'de', defaultLocale: 'de' });

        expect(await langOf({ headers: { 'accept-language': 'en-US' } })).toBe('de');
        expect((await call(served, '/api/locale', { json: { locale: 'en' }, headers: { 'accept-language': 'en-US' } })).status).toBe(400);

        const { id } = await createPage(served, 'admin', { visibility: 'restricted' });
        const [node] = await db<{ locale: string }[]>`select locale from nodes where id = ${id}`;
        expect(node.locale).toBe('de');
      } finally {
        // The default is always enabled, so both come back with English the default.
        await admin('/settings/languages?/save', { enabled: 'de', defaultLocale: 'en' });
      }
      expect(await langOf({ headers: { 'accept-language': 'en-US' } })).toBe('en');
    });
  });
});
