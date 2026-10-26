// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { db } from '$lib/platform/db.server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';

// The site's defaults are saved through the branding section's form action:
// the served build caches them, and only its own save refreshes them.

const app = await startApp();

afterAll(async () => {
  if (!app.skipped) await app.close();
});

/** A form post as a browser without JavaScript makes it, as `as`. */
const post = (served: ServedApp, path: string, fields: Record<string, string>, as: 'editorA') => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return call(served, path, { as, body: form });
};
const count = async (rows: Promise<{ n: number }[]>) => (await rows)[0].n;

describe.skipIf(app.skipped)('typography in the branding section', () => {
  const served = app as ServedApp;

  it('answers an editor’s posts to create a token, set a style’s token and create a style with 403, and nothing changes', async () => {
    const before = await db<{ id: string; token_id: string | null }[]>`select id, token_id from paragraph_styles order by id`;
    const tokens = await count(db<{ n: number }[]>`select count(*)::int as n from typography_tokens`);

    expect((await post(served, '/settings/branding?/createTypographyToken', { name: 'Nope' }, 'editorA')).status).toBe(403);
    expect((await post(served, '/settings/branding?/setParagraphStyleToken', { id: before[0].id, tokenId: '' }, 'editorA')).status).toBe(403);
    expect((await post(served, '/settings/branding?/createParagraphStyle', { 'label.en': 'Nope', renderAs: 'p', tokenId: '' }, 'editorA')).status).toBe(403);

    expect(await count(db<{ n: number }[]>`select count(*)::int as n from typography_tokens`)).toBe(tokens);
    expect(await db`select id, token_id from paragraph_styles order by id`).toEqual(before);
  });
});

describe.skipIf(app.skipped)('a capability value pinned equal to the built-in default', () => {
  const served = app as ServedApp;
  const saveDefaults = async (defaults: unknown) => {
    const result = await formAction(served, '/settings/branding?/saveBlockDefaults', { blockDefaults: JSON.stringify(defaults) }, { as: 'admin' });
    expect(result.type, JSON.stringify(result.data)).toBe('success');
  };
  afterAll(async () => {
    expect((await formAction(served, '/settings/branding?/resetBlockDefaults', {}, { as: 'admin' })).type).toBe('success');
  });

  // A one-column grid whose cell pins padding 8, the containers group's built-in default.
  const pinned = {
    type: 'doc',
    content: [
      {
        type: 'grid',
        attrs: { blockId: 'grid', columnWidths: [1] },
        content: [{ type: 'gridCell', attrs: { spacing: { desktop: { pad: 8 } } }, content: [{ type: 'paragraph', attrs: { blockId: 'inside' }, content: [{ type: 'text', text: 'inside' }] }] }],
      },
    ],
  };

  /** The declarations the served page's own stylesheet holds for its cell. */
  async function cellDeclarations(slug: string): Promise<string[]> {
    const res = await call(served, `/${slug}`, { as: 'admin' });
    expect(res.status).toBe(200);
    const document = new JSDOM(await res.text()).window.document;
    const cell = document.querySelector('.grid-cell');
    expect(cell?.querySelector('[data-block-id="inside"]')?.textContent).toBe('inside');
    const id = cell!.getAttribute('data-b');
    if (!id) return [];
    const css = [...document.head.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n');
    const rule = css.split(`[data-b="${id}"]{`)[1];
    expect(rule, `the rule data-b="${id}" names`).toBeDefined();
    return rule.slice(0, rule.indexOf('}')).split(';').filter(Boolean);
  }

  it('is served with no padding of its own, and declares --pad-d:8px in the page’s stylesheet once the containers default moves', async () => {
    const { id, slug } = await createPage(served, 'admin', { visibility: 'restricted', doc: pinned });
    // Pinned in the data, emitted nothing while it equals the default.
    const [{ doc }] = await db<{ doc: typeof pinned }[]>`select doc from pages where id = ${id}`;
    expect(doc.content[0].content[0].attrs).toMatchObject({ spacing: { desktop: { pad: 8 } } });
    expect((await cellDeclarations(slug)).filter((d) => d.startsWith('--pad'))).toEqual([]);

    await saveDefaults({ groups: { containers: { pad: 'lg' } } });
    expect(await cellDeclarations(slug)).toContain('--pad-d:8px');
  });
});

describe.skipIf(app.skipped)('the page layouts section', () => {
  const served = app as ServedApp;

  it('refuses to switch Standard off or delete it, even by a request, and keeps it on and protected', async () => {
    expect((await formAction(served, '/settings/page-layouts?/togglePreset', { id: 'standard', enabled: 'false' }, { as: 'admin' })).type).toBe('failure');
    expect((await formAction(served, '/settings/page-layouts?/deletePreset', { id: 'standard' }, { as: 'admin' })).type).toBe('failure');
    expect(await db`select enabled from page_layout_presets where id = 'standard'`).toEqual([{ enabled: true }]);

    const res = await call(served, '/settings/page-layouts', { as: 'admin' });
    expect(res.status).toBe(200);
    const document = new JSDOM(await res.text()).window.document;
    const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('.label')?.textContent?.trim() === 'Standard');
    const toggle = row?.querySelector('[role="switch"]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(toggle?.hasAttribute('disabled')).toBe(true);
    expect(row?.querySelector('button[aria-label="Delete page layout"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('answers an editor’s GET and an editor’s post to create a layout with 403, and none is made', async () => {
    const before = await count(db<{ n: number }[]>`select count(*)::int as n from page_layout_presets`);
    expect((await call(served, '/settings/page-layouts', { as: 'editorA' })).status).toBe(403);
    expect((await call(served, '/settings/page-layouts?/createPreset', { as: 'editorA', body: new URLSearchParams({ 'label.en': 'sneaky' }) })).status).toBe(403);
    expect(await count(db<{ n: number }[]>`select count(*)::int as n from page_layout_presets`)).toBe(before);
  });
});
