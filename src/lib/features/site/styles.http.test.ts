// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';

const app = await startApp();
const seed = inject('seed');

afterAll(async () => {
  if (!app.skipped) await app.close();
});

const SHEET = 'Test stylesheet';
const ARTIFACT = 'link[rel="stylesheet"][href^="/api/styles/site/"]';

describe.skipIf(app.skipped)('custom styles, served', () => {
  const served = app as ServedApp;

  const admin = async (path: string, fields: Record<string, string>) => {
    const result = await formAction(served, path, fields, { as: 'admin' });
    expect(result.type, `${path}: ${JSON.stringify(result.data)}`).toBe('success');
  };
  const dom = async (res: Response) => new JSDOM(await res.text()).window.document;

  const artifactsOf = async (path: string, as?: Role) => {
    const res = await call(served, path, { as });
    expect(res.status, `GET ${path}`).toBe(200);
    return [...(await dom(res)).querySelectorAll(ARTIFACT)].map((link) => link.getAttribute('href')!);
  };
  const artifactOf = async (path: string, as?: Role) => {
    const hrefs = await artifactsOf(path, as);
    expect(hrefs, path).toHaveLength(1);
    return hrefs[0];
  };

  /** Posted to the section's own actions, so it is stored and compiled the same way. */
  const seedSheet = async (css?: string) => {
    await admin('/settings/styles?/createSheet', { name: SHEET });
    const [row] = await db<{ id: string }[]>`select id from stylesheets where name = ${SHEET}`;
    if (css !== undefined) await admin(`/settings/styles/${row.id}?/saveFreeCss`, { css });
    return row.id;
  };

  beforeEach(async () => {
    for (const { id } of await db<{ id: string }[]>`select id from stylesheets`) await admin('/settings/styles?/deleteSheet', { id });
  });

  describe('the section', () => {
    it("answers an editor's GET and same-origin POST with 403", async () => {
      expect((await call(served, '/settings/styles', { as: 'editorA' })).status).toBe(403);
      // call sends the app's Origin, so the permission check refuses it, not SvelteKit's cross-site guard.
      expect((await call(served, '/settings/styles?/createSheet', { as: 'editorA', body: new URLSearchParams({ name: 'sneaky' }) })).status).toBe(403);
      expect(await db`select 1 from stylesheets where name = 'sneaky'`).toHaveLength(0);
    });
  });

  describe('the artifact', () => {
    it("carries a named style an admin created, in the stylesheet a public page links: text/css, immutable", async () => {
      const id = await seedSheet();
      await admin(`/settings/styles/${id}?/createStyle`, { label: 'Lead', kind: 'inline', css: 'font-weight: 700; color: var(--content-accent);' });
      const sheet = await dom(await call(served, `/settings/styles/${id}`, { as: 'admin' }));
      expect([...sheet.querySelectorAll('td')].some((td) => td.textContent?.trim() === 'cs-lead')).toBe(true);

      const href = await artifactOf(`/${seed.publicSlug}`);
      const css = await call(served, href);
      expect(css.status).toBe(200);
      expect(css.headers.get('content-type')).toContain('text/css');
      expect(css.headers.get('cache-control')).toContain('immutable');
      expect(await css.text()).toContain('.page-canvas .cs-lead{font-weight:700;color:var(--content-accent)}');
    });

    it("is the one a page's editor links too, so both render paths see one stylesheet", async () => {
      await seedSheet('.lead { font-size: 1.2rem }');
      const { slug } = await createPage(served, 'admin', { visibility: 'restricted' });
      const reader = await artifactOf(`/${slug}`, 'admin');
      expect(await artifactOf(`/${slug}/edit`, 'admin')).toBe(reader);
    });

    it('leaves out a stylesheet switched off: stored disabled, a public page links no site artifact', async () => {
      const id = await seedSheet('.lead { color: var(--content-danger) }');
      await artifactOf(`/${seed.publicSlug}`);

      await admin('/settings/styles?/toggleSheet', { id, enabled: 'false' });
      const [row] = await db<{ enabled: boolean }[]>`select enabled from stylesheets where id = ${id}`;
      expect(row.enabled).toBe(false);
      expect(await artifactsOf(`/${seed.publicSlug}`)).toEqual([]);
    });

    it('answers a stale hash with the current CSS and a revalidating Cache-Control, and 404 once no stylesheet is enabled', async () => {
      const id = await seedSheet('.lead { font-size: 1.1rem }');
      const stale = await artifactOf(`/${seed.publicSlug}`);
      await admin(`/settings/styles/${id}?/saveFreeCss`, { css: '.lead { font-size: 1.3rem }' });
      const current = await artifactOf(`/${seed.publicSlug}`);
      expect(current).not.toBe(stale);

      const fresh = await call(served, current);
      expect(fresh.headers.get('cache-control')).toContain('immutable');
      const freshCss = await fresh.text();
      expect(freshCss).toContain('font-size:1.3rem');

      const old = await call(served, stale);
      expect(old.status).toBe(200);
      expect(old.headers.get('content-type')).toContain('text/css');
      expect(old.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
      expect(await old.text()).toBe(freshCss);

      await admin('/settings/styles?/toggleSheet', { id, enabled: 'false' });
      for (const href of [current, stale]) expect((await call(served, href)).status, href).toBe(404);
    });
  });
});
