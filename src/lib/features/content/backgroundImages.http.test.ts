// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';

// Through the routes the editor uses; which assets are stored is read from the database.

const app = await startApp();

// A real (decodable) 1×1 PNG, and a second one with different bytes.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const PNG_2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const cell = (text: string) => ({ type: 'gridCell', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const assetExists = async (id: string) => (await db`select 1 from assets where id = ${id}`).length > 0;

describe.skipIf(app.skipped)('background images', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /** The admin's upload of `bytes`, declared as `type`, to the page. */
  function upload(pageId: string, bytes: Buffer, type = 'image/png') {
    const form = new FormData();
    form.append('pageId', pageId);
    form.append('file', new File([new Uint8Array(bytes)], 'bg.png', { type }));
    return call(served, '/api/media', { as: 'admin', body: form });
  }
  async function uploaded(pageId: string, bytes = PNG): Promise<string> {
    const res = await upload(pageId, bytes);
    expect(res.status, 'upload an image').toBe(200);
    return ((await res.json()) as { id: string }).id;
  }
  async function save(pageId: string, doc: unknown) {
    const res = await call(served, `/api/pages/${pageId}`, { as: 'admin', method: 'PUT', json: doc });
    expect(res.ok, 'save the page').toBe(true);
  }

  it('assets: kept while referenced, collected when not, gone with the page; served by the page', async () => {
    const { id } = await createPage(served, 'admin', { visibility: 'internal' });
    const a = await uploaded(id);
    const b = await uploaded(id, PNG_2);
    await save(id, { type: 'doc', content: [{ type: 'grid', attrs: { surface: { desktop: { image: a }, phone: { image: b } } }, content: [cell('x')] }] });
    expect((await call(served, `/api/media/${a}`, { as: 'admin' })).status).toBe(200);
    expect((await call(served, `/api/media/${b}`, { as: 'admin' })).status).toBe(200);

    // The page is internal: a reader who is not signed in gets nothing.
    expect((await call(served, `/api/media/${a}`)).status).toBe(404);

    await save(id, { type: 'doc', content: [{ type: 'grid', attrs: { surface: { desktop: { image: a } } }, content: [cell('x')] }] });
    expect(await assetExists(a)).toBe(true);
    expect(await assetExists(b), 'the phone image is no longer referenced').toBe(false);

    expect((await call(served, `/api/pages/${id}`, { as: 'admin', method: 'DELETE' })).ok).toBe(true);
    expect(await assetExists(a), 'deleting the page takes its assets').toBe(false);
  });

  it('an upload must be the raster image it claims to be', async () => {
    const { id } = await createPage(served, 'admin', { visibility: 'restricted' });
    const res = await upload(id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/png');
    expect(res.status).toBe(415);
    expect(await db`select 1 from assets where owner_page_id = ${id}`, 'nothing is stored').toHaveLength(0);
  });
});
