// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import { textPara } from '$tests/e2e/doc';

// docs/architecture/blocks/anatomy.md, "Unknown blocks". The kinds are invented: a plugin that is
// merely turned off keeps its kinds known.
const app = await startApp();

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

/** What nothing a reader is served may hold: an unknown block's content, attributes, ids, types and the mark's. */
const HIDDEN = ['Text inside the tabs', 'w-top', 'w-cell', 'tabs-1', 'no id', '#123456', 'gold', 'retiredWidget', 'retiredLeaf', 'retiredTabs', 'retiredHighlight'];

describe.skipIf(app.skipped)('unknown blocks, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /** A page of the admin's, anyone may read it, holding every kind of unknown unit — and an asset only one of them uses. */
  async function unknownPage() {
    const { id, slug } = await createPage(served, 'admin', { visibility: null });
    const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 70, g: 100, b: 140 } } }).jpeg().toBuffer();
    const form = new FormData();
    form.append('pageId', id);
    form.append('file', new File([bytes], 'photo.jpg', { type: 'image/jpeg' }));
    const uploaded = await call(served, '/api/media', { as: 'admin', body: form });
    expect(uploaded.status, 'upload an image').toBe(200);
    const asset = ((await uploaded.json()) as { id: string }).id;
    const grid: Node = {
      type: 'grid',
      attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
      content: [
        { type: 'gridCell', content: [textPara('p-left', 'Left column'), { type: 'retiredWidget', attrs: { blockId: 'w-cell' } }] },
        { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
      ],
    };
    const doc = {
      type: 'doc',
      content: [
        textPara('p-first', 'First paragraph'),
        { type: 'retiredWidget', attrs: { blockId: 'w-top', zeta: 1, alpha: null, image: asset, surface: { desktop: { bg: '#123456' } }, spacing: { desktop: { spaceAbove: 48 } } } },
        { type: 'retiredLeaf', attrs: { setting: 'no id' } },
        { type: 'retiredTabs', attrs: { blockId: 'tabs-1' }, content: [textPara('in-tabs', 'Text inside the tabs')] },
        textPara('p-marked', 'Text under a retired mark', [{ type: 'retiredHighlight', attrs: { tone: 'gold' } }]),
        grid,
        textPara('p-link', 'A web link', [{ type: 'link', attrs: { href: 'https://example.org/' } }]),
      ],
    };
    const saved = await call(served, `/api/pages/${id}`, { as: 'admin', method: 'PUT', json: doc });
    expect(saved.ok, 'save the page').toBe(true);
    return { id, slug, asset };
  }

  /** What an anonymous reader is served at `path`. */
  async function readerGets(path: string): Promise<string> {
    const res = await call(served, path);
    expect(res.status, path).toBe(200);
    return res.text();
  }

  function expectReadableOnly(html: string, asset: string, where: string) {
    for (const text of ['First paragraph', 'Left column', 'Right column', 'A web link']) expect(html, `${where}: ${text}`).toContain(text);
    // Text under an unknown mark is still text, served without the mark.
    expect(html, where).toContain('Text under a retired mark');
    for (const hidden of [...HIDDEN, asset]) expect(html, `${where}: ${hidden}`).not.toContain(hidden);
    // The reader routes' strict style-src: no inline style attribute.
    expect(html, where).not.toMatch(/<[^>]+\sstyle="/);
  }

  it('shows a reader nothing of them, on the page and through a share link', async () => {
    const { id, slug, asset } = await unknownPage();
    expectReadableOnly(await readerGets(`/${slug}`), asset, 'the page');

    const link = await call(served, `/api/pages/${id}/share-links`, { as: 'admin', json: { label: 'unknown blocks' } });
    expect(link.ok, 'make a share link').toBe(true);
    const { token } = (await link.json()) as { token: string };
    expectReadableOnly(await readerGets(`/share/${token}`), asset, 'the share link');
  });
});
