// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { setNodeTags } from '$lib/features/semantic/server';
import { call, createNamespace, createPage, startApp, type ServedApp } from '$tests/integration/http';

const app = await startApp();
const seed = inject('seed');

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const listedTitles = (html: string) =>
  [...new JSDOM(html).window.document.querySelectorAll('[data-testid="search-result"]')].map((card) => card.querySelector('h2, h3, [role="heading"]')?.textContent?.trim() ?? '');

describe.skipIf(app.skipped)('search, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  it('an anonymous GET of /search answers the page, not a sign-in, lists only public content, and drops a namespace parameter naming an internal namespace', async () => {
    await createNamespace(served, { name: 'Intern', slug: 'intern-search', accessLevel: 'internal' });
    const open = await createPage(served, 'admin', { title: 'Open to all', visibility: null });
    const signedIn = await createPage(served, 'admin', { title: 'Signed in only', visibility: 'internal' });
    await setNodeTags(open.id, ['anon']);
    await setNodeTags(signedIn.id, ['anon']);

    const res = await call(served, '/search?tag=anon');
    expect(res.status).toBe(200);
    expect(listedTitles(await res.text())).toEqual(['Open to all']);
    const withNamespace = await call(served, '/search?namespace=intern-search&tag=anon');
    expect(withNamespace.status).toBe(200);
    expect(listedTitles(await withNamespace.text())).toEqual(['Open to all']);
  });

  it('/api/search-count never counts a node the viewer cannot read, and answers no-store', async () => {
    // A term only the restricted page carries: its body.
    const term = encodeURIComponent(seed.restrictedBody);
    const countFor = async (as: 'editorB' | 'editorC') => {
      const res = await call(served, `/api/search-count?q=${term}`, { as });
      expect(res.headers.get('cache-control')).toBe('no-store');
      return ((await res.json()) as { total: number }).total;
    };
    expect(await countFor('editorC')).toBe(0);
    expect(await countFor('editorB')).toBeGreaterThan(0);
  });

  it('a German-interface GET of an English page renders html lang de and the article lang en', async () => {
    const page = await createPage(served, 'editorA', { title: 'Lang page', locale: 'en', doc: doc('An English paragraph') });
    const res = await call(served, `/${page.slug}`, { as: 'editorA', headers: { 'accept-language': 'de-DE,de;q=0.9' } });
    expect(res.status).toBe(200);
    const document = new JSDOM(await res.text()).window.document;
    expect(document.documentElement.lang).toBe('de');
    expect(document.querySelector('article.prose')?.getAttribute('lang')).toBe('en');
  });

  it('a page PATCH setting a content language that is not enabled answers 400', async () => {
    const page = await createPage(served, 'editorA');
    expect((await call(served, `/api/pages/${page.id}`, { as: 'editorA', method: 'PATCH', json: { locale: 'fr' } })).status).toBe(400);
  });
});
