// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { setManualProperties, upsertPropertyDefinition } from '$lib/features/semantic/server';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';
import type { Role } from '$tests/integration/users';

const app = await startApp();
const seed = inject('seed');

const instances = (html: string) => [...new JSDOM(html).window.document.querySelectorAll('.query-block-instance')].map((el) => el.textContent ?? '');

afterAll(() => (app.skipped ? undefined : app.close()));

describe.skipIf(app.skipped)('a query block, served', () => {
  const served = app as ServedApp;

  // The seeded query page is public; its template matches status active or
  // secret: the public and internal pages (active) and the restricted one (secret).
  const stampedFor = async (as?: Role) => {
    const res = await call(served, `/${seed.queryTestSlug}`, { as });
    expect(res.status).toBe(200);
    return instances(await res.text());
  };

  it('stamps one instance for an anonymous visitor, bound to the public page’s real status in the marked paragraph and in the HTML block, with its class Page and no placeholder', async () => {
    const res = await call(served, `/${seed.queryTestSlug}`);
    const html = await res.text();
    const texts = instances(html);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('Status: active');
    expect(texts[0]).not.toContain('placeholder');
    expect(new JSDOM(html).window.document.querySelector('.query-block-instance .qb-class')?.textContent).toBe('Page');
  });

  it('stamps two instances for a signed-in viewer, both active, none secret', async () => {
    const texts = await stampedFor('viewer');
    expect(texts).toHaveLength(2);
    for (const t of texts) {
      expect(t).toContain('active');
      expect(t).not.toContain('secret');
    }
  });

  it('stamps three instances for the shared editor, one with the restricted page’s real status in its HTML block, and no unsubstituted {{{ token', async () => {
    const texts = await stampedFor('editorB');
    expect(texts).toHaveLength(3);
    expect(texts.filter((t) => t.includes('secret'))).toHaveLength(1);
    expect(texts.filter((t) => t.includes('active'))).toHaveLength(2);
    expect(texts.some((t) => t.includes('Status: secret'))).toBe(true);
    expect(texts.join('\n')).not.toContain('{{{');
  });

  it('on a page whose content language is German renders its dates, yes/no words, {{{class}}} and empty state in German for a reader with an English interface', async () => {
    // A yes/no value on the public page, beside its seeded status and priority.
    await upsertPropertyDefinition({ localName: 'flag', groupSlug: 'core', datatype: 'boolean' });
    await setManualProperties(seed.publicId, [
      { name: seed.propStatus, value: 'active' },
      { name: seed.propPriority, value: '1' },
      { name: 'core:flag', value: 'true' },
    ]);
    const marked = (key: string) => ({ type: 'text', text: key, marks: [{ type: 'semanticProperty', attrs: { propName: key } }] });
    const block = (blockId: string, slug: string) => ({
      type: 'queryBlock',
      attrs: {
        blockId,
        filter: { intrinsic: { field: 'SLUG', operator: 'EQ', value: slug } },
        first: 5,
        mapping: { when: { source: 'createdAt', transform: { id: 'dateMonthYear' } }, flag: { source: 'core:flag', transform: { id: 'yesNo' } } },
      },
      content: [
        {
          type: 'grid',
          attrs: { columnWidths: [1] },
          content: [
            {
              type: 'gridCell',
              content: [
                { type: 'paragraph', content: [marked('when'), { type: 'text', text: ' / ' }, marked('flag')] },
                { type: 'htmlBlock', attrs: { html: '<span class="qb-class">{{{class}}}</span>' } },
              ],
            },
          ],
        },
      ],
    });
    const page = await createPage(served, 'editorA', {
      locale: 'de',
      doc: { type: 'doc', content: [block('qb-de', seed.publicSlug), block('qb-de-empty', 'no-such-slug-anywhere')] },
    });

    const res = await call(served, `/${page.slug}`, { headers: { 'accept-language': 'en-US,en;q=0.9' } });
    expect(res.status).toBe(200);
    const html = await res.text();
    const document = new JSDOM(html).window.document;
    expect(document.documentElement.lang).toBe('en'); // the reader's interface
    const [text] = instances(html);
    expect(text).toMatch(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4} \/ Ja/);
    const pageTypeDe = (await db<{ de: string }[]>`select label->>'de' as de from node_classes where slug = 'page'`)[0].de;
    expect(document.querySelector('.query-block-instance .qb-class')?.textContent).toBe(pageTypeDe);
    expect(document.querySelector('.query-block--empty .query-block-state')?.textContent).toBe('Keine Ergebnisse.');
  });
});

describe.skipIf(app.skipped)('the GraphQL endpoint', () => {
  const served = app as ServedApp;

  it('answers 429 with Retry-After to one client past 60 requests a minute', async () => {
    const ask = () => call(served, '/api/graphql', { from: '203.0.113.60', json: { query: '{ __typename }' } });
    for (let i = 0; i < 60; i++) expect((await ask()).status).toBe(200);
    const limited = await ask();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
