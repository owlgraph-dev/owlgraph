// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';

// The mark stores the style's id and the class is looked up at render
// (docs/architecture/custom-styles.md). The renderer's half is ../content/render/render.test.ts.
const app = await startApp();

const TEXT = 'Styled text for the mark';

describe.skipIf(app.skipped)('custom style mark, served', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /** The page canvas the admin is served at /<slug>, its status checked. */
  async function canvasOf(slug: string) {
    const res = await call(served, `/${slug}`, { as: 'admin' });
    expect(res.status).toBe(200);
    const canvas = new JSDOM(await res.text()).window.document.querySelector('.page-canvas');
    expect(canvas, 'the page canvas').not.toBeNull();
    return canvas!;
  }
  /** Every class on the canvas that is a named style's. */
  const styleClasses = (canvas: Element) => [...canvas.querySelectorAll('[class]')].flatMap((el) => [...el.classList].filter((c) => c.startsWith('cs-')));

  it('a deleted style leaves the run unstyled, and the page still renders', async () => {
    const sheet = await formAction(served, '/settings/styles?/createSheet', { name: 'Mark sheet' }, { as: 'admin' });
    expect(sheet.type).toBe('success');
    const [{ id: sheetId }] = await db<{ id: string }[]>`select id from stylesheets where name = 'Mark sheet'`;
    const style = await formAction(served, `/settings/styles/${sheetId}?/createStyle`, { label: 'E2E lead', kind: 'inline', css: 'font-weight: 700;' }, { as: 'admin' });
    expect(style.type).toBe('success');
    const [{ id: styleId, slug: styleSlug }] = await db<{ id: string; slug: string }[]>`select id, slug from custom_styles where stylesheet_id = ${sheetId}`;
    expect(styleSlug).toBe('e2e-lead');

    // The first word styled, as the editor's text-style picker marks it.
    const { slug } = await createPage(served, 'admin', {
      visibility: 'restricted',
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Styled', marks: [{ type: 'customStyle', attrs: { styleId } }] }, { type: 'text', text: ' text for the mark' }] }],
      },
    });
    const styled = await canvasOf(slug);
    expect(styled.querySelectorAll('.cs-e2e-lead')).toHaveLength(1);

    const deleted = await formAction(served, `/settings/styles/${sheetId}?/deleteStyle`, { id: styleId }, { as: 'admin' });
    expect(deleted.type).toBe('success');
    const orphaned = await canvasOf(slug);
    expect(orphaned.textContent).toContain(TEXT);
    expect(styleClasses(orphaned)).toEqual([]);
  });
});
