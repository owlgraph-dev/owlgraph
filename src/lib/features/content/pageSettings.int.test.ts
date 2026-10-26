// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createPage, saveDoc } from '$lib/features/pages/server';
import { userOf } from '$tests/integration/users';

// Saved through saveDoc, which the page API's PUT and a version restore run.

type Doc = { type: string; attrs?: Record<string, unknown>; content?: unknown[] };

const para = (text: string) => ({ type: 'paragraph', attrs: { blockId: text }, content: [{ type: 'text', text }] });

/** The page's stored doc. */
async function stored(pageId: string): Promise<Doc> {
  const [row] = await db<{ doc: Doc }[]>`select doc from pages where id = ${pageId}`;
  return row.doc;
}

describe('page settings', () => {
  it('a content rewrite from a block list keeps the page settings', async () => {
    const page = await createPage('Settings kept', await userOf('admin'));
    // Every kind of page setting: widths and a gutter (layout), the ground (surface), the rhythm (spacing).
    const settings = {
      layout: { widths: { desktop: { read: '600px', wide: '900px' } }, gutters: { phone: '8px' } },
      surface: { desktop: { bg: 'token:subtle' } },
      spacing: { desktop: { blockSpace: 24 } },
    };
    await saveDoc(page.id, { type: 'doc', attrs: settings, content: [para('lead')] });
    const before = await stored(page.id);
    expect(before.attrs).toEqual(settings);

    // A doc with no root attrs, as an agent's block list arrives.
    await saveDoc(page.id, { type: 'doc', content: [para('rewritten')] });
    const after = await stored(page.id);
    expect(after.attrs).toEqual(settings);
    // The content is the new one.
    expect(JSON.stringify(after.content)).toContain('rewritten');
    expect(JSON.stringify(after.content)).not.toContain('lead');
  });
});
