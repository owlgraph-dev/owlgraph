// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, formAction, startApp, type ServedApp } from '$tests/integration/http';

// Families and variants are made through the settings' form actions, as an admin does.

const app = await startApp();
const seed = inject('seed');

// Only the first four bytes (the wOF2 signature) are checked on upload; the rest is padding.
const WOFF2_BYTES = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]);
const NOT_WOFF2_BYTES = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0, 0, 0, 0]);

describe.skipIf(app.skipped)('the fonts settings, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const act = (action: string, fields: Record<string, string>, files?: Record<string, File>) => formAction(served, `/settings/fonts?/${action}`, fields, { as: 'admin', files });

  let n = 0;
  /** A family of the test's own, made through the settings; its id. */
  async function family(): Promise<{ id: string; name: string }> {
    const name = `HTTP Family ${++n} ${Date.now()}`;
    const created = await act('createFamily', { name });
    expect(created.type, JSON.stringify(created.data)).toBe('success');
    const [row] = await db<{ id: string }[]>`select id from font_families where name = ${name}`;
    return { id: row.id, name };
  }
  const upload = (familyId: string, bytes: Uint8Array<ArrayBuffer>, type: string) =>
    act('addVariant', { familyId, weight: '400', style: 'normal' }, { file: new File([bytes], 'variant.woff2', { type }) });
  const variantsOf = (familyId: string) => db<{ id: string; asset_id: string }[]>`select id, asset_id from font_variants where family_id = ${familyId}`;

  /** The settings page's card for a family, or undefined when it is not listed. */
  async function card(name: string) {
    const res = await call(served, '/settings/fonts', { as: 'admin' });
    expect(res.status).toBe(200);
    const document = new JSDOM(await res.text()).window.document;
    return [...document.querySelectorAll('.family')].find((el) => el.querySelector('h3')?.textContent?.trim() === name);
  }
  /** The CSS a page's head carries. */
  async function headCss(path: string, as?: 'admin') {
    const res = await call(served, path, { as });
    expect(res.status, path).toBe(200);
    return [...new JSDOM(await res.text()).window.document.head.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
  }

  it('makes a family, uploads a woff2 variant every page’s head declares a face for, and takes both away again', async () => {
    const { id, name } = await family();
    expect((await upload(id, WOFF2_BYTES, 'font/woff2')).type).toBe('success');
    const [variant] = await variantsOf(id);
    expect(variant).toBeTruthy();
    expect((await card(name))?.querySelector('.variant-label')?.textContent?.trim()).toBe('400 · Normal');

    // The settings page itself and a visitor's page: the root layout is every page's.
    const face = `src:url('/api/media/fonts/${variant.asset_id}') format('woff2')`;
    for (const [path, as] of [['/settings/fonts', 'admin'], [`/${seed.publicSlug}`, undefined]] as const) {
      const css = await headCss(path, as);
      expect(css, path).toContain(`@font-face{font-family:'${name}';font-weight:400;font-style:normal;`);
      expect(css, path).toContain(face);
    }
    expect((await call(served, `/api/media/fonts/${variant.asset_id}`)).status).toBe(200);

    // The variant goes, its face and its bytes with it; then the family.
    expect((await act('removeVariant', { variantId: variant.id })).type).toBe('success');
    expect((await card(name))?.textContent).toContain('No variants yet');
    expect(await headCss('/settings/fonts', 'admin')).not.toContain(name);
    expect((await call(served, `/api/media/fonts/${variant.asset_id}`)).status).toBe(404);
    expect((await act('removeFamily', { familyId: id })).type).toBe('success');
    expect(await card(name)).toBeUndefined();
  });

  it('refuses a variant posted as font/woff2 whose bytes lack the wOF2 signature, and the family keeps no variant', async () => {
    const { id, name } = await family();
    const refused = await upload(id, NOT_WOFF2_BYTES, 'font/woff2');
    expect(refused.type).toBe('failure');
    expect(refused.data).toEqual({ error: { code: 'invalid_font_file', message: "That file isn't a valid woff2 font." } });
    expect(await variantsOf(id)).toEqual([]);
    expect((await card(name))?.textContent).toContain('No variants yet');
  });

  it('serves an uploaded variant as font/woff2 with nosniff, whatever type the upload declared', async () => {
    const { id } = await family();
    expect((await upload(id, WOFF2_BYTES, 'text/html')).type).toBe('success');
    const [variant] = await variantsOf(id);
    const res = await call(served, `/api/media/fonts/${variant.asset_id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('font/woff2');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(WOFF2_BYTES);
  });

  it('serves nothing for an id that is no global font asset — none at all, or a page’s image', async () => {
    for (const id of ['00000000-0000-0000-0000-000000000000', seed.publicAssetId, seed.restrictedAssetId]) {
      expect((await call(served, `/api/media/fonts/${id}`)).status, id).toBe(404);
    }
  });

  it('answers an editor’s posts to create or remove a family with 403', async () => {
    const post = (action: string, fields: Record<string, string>) => {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.append(k, v);
      return call(served, `/settings/fonts?/${action}`, { as: 'editorA', body: form });
    };
    const before = (await db<{ n: number }[]>`select count(*)::int as n from font_families`)[0].n;
    expect((await post('createFamily', { name: 'Nope' })).status).toBe(403);
    expect((await post('removeFamily', { familyId: 'x' })).status).toBe(403);
    expect((await db<{ n: number }[]>`select count(*)::int as n from font_families`)[0].n).toBe(before);
  });
});
