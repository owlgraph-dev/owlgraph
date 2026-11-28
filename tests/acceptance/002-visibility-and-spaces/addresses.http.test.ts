// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, it } from 'vitest';
import { call, createSpace, createPage, startApp, type ServedApp } from '#tests/integration/http.ts';

// Where a node answers (docs/features/002-visibility-and-spaces.md,
// "Acceptance criteria"). Every page here inherits a public space — the
// default one, as the suite's seed makes it, or one of the test's own — so a
// visitor asks for each address.

const app = await startApp();

describe.skipIf(app.skipped)('a node’s address', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  let made = 0;
  /** A public space of the test's own. */
  const space = async (slug: string) => ({ slug, id: await createSpace(served, { name: `Space ${++made}`, slug, accessLevel: 'public' }) });
  const paragraph = (blockId: string, ...content: unknown[]) => ({ type: 'paragraph', attrs: { blockId }, content });
  const body = (text: string) => ({ type: 'doc', content: [paragraph('body', { type: 'text', text })] });
  /** A page whose one link, "the target", points to another page. */
  const linkingTo = (target: { id: string; slug: string }) =>
    createPage(served, 'admin', {
      doc: { type: 'doc', content: [paragraph('links', { type: 'text', text: 'the target', marks: [{ type: 'pageLink', attrs: { targetPageId: target.id, targetSlug: target.slug } }] })] },
    });
  const patch = (id: string, json: unknown) => call(served, `/api/pages/${id}`, { as: 'admin', method: 'PATCH', json });
  /** What a visitor is sent at an address: the status and the page. */
  const at = async (path: string) => {
    const res = await call(served, path);
    return { status: res.status, html: await res.text() };
  };
  /** Where the link "the target" on a page leads. */
  const linkOn = async (slug: string) => {
    const { status, html } = await at(`/${slug}`);
    expect(status).toBe(200);
    return [...new JSDOM(html).window.document.querySelectorAll('a')].find((a) => a.textContent === 'the target')?.getAttribute('href');
  };

  it('002.16 a node in the default space answers at /<slug>, another at /<space>/<slug>; two spaces hold the same slug, and one space refuses it a second time', async () => {
    const atlas = await space('atlas');
    const almanac = await space('almanac');
    const atRoot = await createPage(served, 'admin', { doc: body('The page at the root') });
    const inAtlas = await createPage(served, 'admin', { spaceId: atlas.id, doc: body('The page in the atlas') });
    const inAlmanac = await createPage(served, 'admin', { spaceId: almanac.id, doc: body('The page in the almanac') });

    expect((await at(`/${atRoot.slug}`)).html).toContain('The page at the root');
    expect((await at(`/atlas/${atRoot.slug}`)).status).toBe(404);
    expect((await at(`/atlas/${inAtlas.slug}`)).html).toContain('The page in the atlas');
    expect((await at(`/${inAtlas.slug}`)).status).toBe(404);

    for (const page of [atRoot, inAtlas, inAlmanac]) expect((await patch(page.id, { slug: 'one-name' })).status).toBe(200);
    expect((await at('/one-name')).html).toContain('The page at the root');
    expect((await at('/atlas/one-name')).html).toContain('The page in the atlas');
    expect((await at('/almanac/one-name')).html).toContain('The page in the almanac');

    const second = await createPage(served, 'admin', { spaceId: atlas.id, doc: body('A second page in the atlas') });
    const refused = await patch(second.id, { slug: 'one-name' });
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe('slug_taken');
    expect((await at(`/atlas/${second.slug}`)).html).toContain('A second page in the atlas');
    expect((await at('/atlas/one-name')).html).toContain('The page in the atlas');
  });

  it('002.17 after a rename, the old address is not found and another page’s link leads to the new one', async () => {
    const target = await createPage(served, 'admin', { doc: body('The page that is renamed') });
    const linking = await linkingTo(target);
    expect(await linkOn(linking.slug)).toBe(`/${target.slug}`);

    expect((await patch(target.id, { slug: 'renamed-target' })).status).toBe(200);
    expect((await at(`/${target.slug}`)).status).toBe(404);
    expect(await linkOn(linking.slug)).toBe('/renamed-target');
    expect((await at('/renamed-target')).html).toContain('The page that is renamed');
  });

  it('002.17 after a move to another space, the old address is not found and another page’s link leads to the new one', async () => {
    const shelf = await space('shelf');
    const target = await createPage(served, 'admin', { doc: body('The page that is moved') });
    const linking = await linkingTo(target);
    expect(await linkOn(linking.slug)).toBe(`/${target.slug}`);

    expect((await patch(target.id, { spaceId: shelf.id })).status).toBe(200);
    expect((await at(`/${target.slug}`)).status).toBe(404);
    expect(await linkOn(linking.slug)).toBe(`/shelf/${target.slug}`);
    expect((await at(`/shelf/${target.slug}`)).html).toContain('The page that is moved');
  });
});
