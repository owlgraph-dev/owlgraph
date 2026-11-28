// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, inject, it } from 'vitest';
import { call, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';

// 002.6, the ways in a request takes: each asks for the seeded restricted page
// (or its document, or its image) as a visitor, as an editor it is not shared
// with, and as the editor it is shared with. The first two get nothing of it.
// The graph and an agent's tool are ways-in.int.test.ts's.

const app = await startApp();
const seed = inject('seed');

describe.skipIf(app.skipped)('the restricted page, asked for each way a request can', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const VISITOR: CallOptions = {};
  const NOT_SHARED: CallOptions = { as: 'editorC' };
  const SHARED: CallOptions = { as: 'editorB' };
  const NOT_READERS = [VISITOR, NOT_SHARED];
  /** A term only the restricted page carries: its body. */
  const term = encodeURIComponent(seed.restrictedBody);

  it('002.6 its address answers the editor it is shared with, and neither a visitor nor an editor it is not shared with', async () => {
    for (const asker of NOT_READERS) {
      const res = await call(served, `/${seed.restrictedSlug}`, asker);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain(seed.restrictedBody);
    }
    const res = await call(served, `/${seed.restrictedSlug}`, SHARED);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(seed.restrictedBody);
  });

  it('002.6 the API lists it in a query’s answer to the editor it is shared with, and to neither a visitor nor an editor it is not shared with', async () => {
    const query = 'query($filter: NodeFilter!) { nodes(filter: $filter) { title } }';
    const filter = { property: { name: seed.propStatus, operator: 'EQ', value: 'secret' } };
    const titles = async (asker: CallOptions) => {
      const res = await call(served, '/api/graphql', { ...asker, json: { query, variables: { filter } } });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data?: { nodes: { title: string }[] }; errors?: unknown };
      expect(body.errors).toBeUndefined();
      return body.data!.nodes.map((n) => n.title);
    };
    for (const asker of NOT_READERS) expect(await titles(asker)).toEqual([]);
    expect(await titles(SHARED)).toEqual([seed.restrictedTitle]);
  });

  it('002.6 search finds it, and counts it, for the editor it is shared with, and for neither a visitor nor an editor it is not shared with', async () => {
    const found = async (asker: CallOptions) => {
      const page = await call(served, `/search?q=${term}`, asker);
      expect(page.status).toBe(200);
      const cards = [...new JSDOM(await page.text()).window.document.querySelectorAll('[data-testid="search-result"]')];
      const count = await call(served, `/api/search-count?q=${term}`, asker);
      expect(count.status).toBe(200);
      return { titles: cards.map((card) => card.querySelector('h2, h3, [role="heading"]')?.textContent?.trim()), total: ((await count.json()) as { total: number }).total };
    };
    for (const asker of NOT_READERS) expect(await found(asker)).toEqual({ titles: [], total: 0 });
    expect(await found(SHARED)).toEqual({ titles: [seed.restrictedTitle], total: 1 });
  });

  it('002.6 a query block on a public page shows its row to the editor it is shared with, and to neither a visitor nor an editor it is not shared with', async () => {
    // The seeded query page is public; its block matches the restricted page by its status, secret.
    const rows = async (asker: CallOptions) => {
      const res = await call(served, `/${seed.queryTestSlug}`, asker);
      expect(res.status).toBe(200);
      return [...new JSDOM(await res.text()).window.document.querySelectorAll('.query-block-instance')].map((el) => el.textContent ?? '');
    };
    const secret = (texts: string[]) => texts.filter((text) => text.includes('Status: secret')).length;
    for (const asker of NOT_READERS) {
      const shown = await rows(asker);
      expect(shown.length).toBeGreaterThan(0);
      expect(secret(shown)).toBe(0);
    }
    expect(secret(await rows(SHARED))).toBe(1);
  });

  it('002.6 its file is served to the editor its document is shared with, and to neither a visitor nor an editor it is not shared with', async () => {
    for (const asker of NOT_READERS) expect((await call(served, `/api/documents/${seed.restrictedDocId}/content`, asker)).status).toBe(404);
    const res = await call(served, `/api/documents/${seed.restrictedDocId}/content`, SHARED);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it('002.6 its image is served to the editor it is shared with, and to neither a visitor nor an editor it is not shared with', async () => {
    for (const asker of NOT_READERS) expect((await call(served, `/api/media/${seed.restrictedAssetId}`, asker)).status).toBe(404);
    const res = await call(served, `/api/media/${seed.restrictedAssetId}`, SHARED);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^image\//);
  });
});
