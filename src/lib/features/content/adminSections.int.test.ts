// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createPage, createPageLayoutPreset, deletePageLayoutPreset, listEnabledPageLayoutPresets, saveDoc, setPageLayoutPresetEnabled } from '$lib/features/pages/server';
import { resolvePageLayoutPreset } from '$lib/features/pages';
import { createParagraphStyle, deleteParagraphStyle, getParagraphStyles, listParagraphStyles, setDefaultParagraphStyle } from './server';
import { pageColumnsOf } from './page/pageAttrs';
import { connectAs, jsonOf, userOf } from '$tests/integration/mcp';
import { baseLocale, overwriteGetLocale } from '$lib/paraglide/runtime';

// The rules behind the paragraph style and page layout sections, called as
// their form actions call them.

describe('paragraph styles', () => {
  const defaults = async () => (await listParagraphStyles()).filter((s) => s.isDefault);
  const h2Default = async () => (await defaults()).filter((s) => s.renderAs === 'h2').map((s) => s.label.en);

  it('let a new style take over as its element’s default, the previous default stepping down, and refuse to delete the default', async () => {
    const subtitle = (await listParagraphStyles()).find((s) => s.label.en === 'Subtitle' && s.renderAs === 'h2')!;
    const label = 'Int Interheading';
    const { id } = await createParagraphStyle({ label: { en: label }, renderAs: 'h2', tokenId: null });
    expect((await listParagraphStyles()).find((s) => s.id === id)?.isDefault).toBe(false);
    expect(await h2Default()).toEqual(['Subtitle']);
    await expect(deleteParagraphStyle(subtitle.id)).rejects.toThrow('This style is the default for its tag. Make another style the default first.');

    await setDefaultParagraphStyle(id);
    expect(await h2Default()).toEqual([label]);
    // What every render reads, too; and every element keeps exactly one default.
    expect((await getParagraphStyles()).filter((s) => s.renderAs === 'h2' && s.isDefault).map((s) => s.id)).toEqual([id]);
    const tags = (await defaults()).map((s) => s.renderAs);
    expect(new Set(tags).size).toBe(tags.length);
    await expect(deleteParagraphStyle(id)).rejects.toThrow('This style is the default for its tag.');
    expect((await listParagraphStyles()).some((s) => s.id === id)).toBe(true);

    // Subtitle takes it back; the extra style, no longer the default, can go.
    await setDefaultParagraphStyle(subtitle.id);
    expect(await h2Default()).toEqual(['Subtitle']);
    await deleteParagraphStyle(id);
    expect((await listParagraphStyles()).some((s) => s.id === id)).toBe(false);
  });

  it('are named in every language: seeded in English and German, resolved for the viewer where they render, and a name taken within its language', async () => {
    expect((await defaults()).find((s) => s.renderAs === 'p')?.label).toEqual({ en: 'Body text', de: 'Fließtext' });

    const { id } = await createParagraphStyle({ label: { en: 'Int Aside', de: 'Int Randnotiz' }, renderAs: 'p', tokenId: null });
    expect((await getParagraphStyles()).find((s) => s.id === id)?.label).toBe('Int Aside');
    overwriteGetLocale(() => 'de');
    try {
      expect((await getParagraphStyles()).find((s) => s.id === id)?.label).toBe('Int Randnotiz');
    } finally {
      overwriteGetLocale(() => baseLocale);
    }

    await expect(createParagraphStyle({ label: { de: 'int randnotiz' }, renderAs: 'p', tokenId: null })).rejects.toThrow('A style with this name already exists.');
    // The same words in another language are another name.
    const other = await createParagraphStyle({ label: { en: 'Int Randnotiz' }, renderAs: 'p', tokenId: null });
    await deleteParagraphStyle(other.id);
    await deleteParagraphStyle(id);
  });
});

describe('a page layout switched off or deleted', () => {
  const TWO = { desktop: [1, 1], tablet: [1, 1], phone: [1] };
  const para = (text: string) => ({ type: 'paragraph', attrs: { blockId: text }, content: [{ type: 'text', text }] });
  /** A page already on a layout: its values copied, its id and label recorded, content in both columns. */
  const pageOn = (preset: string, presetLabel: string) => ({
    type: 'doc',
    attrs: { layout: { mode: 'columns', template: TWO, preset, presetLabel, sectionDefaults: { width: 'wide' } } },
    content: [{ type: 'pageSection', attrs: { blockId: 's1', width: 'wide' }, content: [{ type: 'gridCell', content: [para('left')] }, { type: 'gridCell', content: [para('right')] }] }],
  });

  let n = 0;
  /** A two-column layout of the test's own and a page of the admin's on it. */
  async function pageOnNewLayout() {
    const label = `Int Gone ${++n}`;
    const { id: presetId } = await createPageLayoutPreset({ label: { en: label }, description: {}, template: TWO, gap: {}, sectionDefaults: { width: 'wide' } });
    const page = await createPage(`On ${label}`, await userOf('admin'), { visibility: 'restricted' });
    await saveDoc(page.id, pageOn(presetId, label));
    return { presetId, label, pageId: page.id };
  }

  type Stored = { attrs: { layout: Record<string, unknown> }; content: { content: unknown[] }[] };
  const stored = async (pageId: string) => (await db<{ doc: Stored }[]>`select doc from pages where id = ${pageId}`)[0].doc;
  type Settings = { layout: string; layoutLabel: string | null; layoutCustomized: boolean; columns?: unknown };
  const agentSettings = async (pageId: string) => jsonOf<{ settings: Settings }>(await (await connectAs('admin')).callTool({ name: 'get_page', arguments: { pageId } })).settings;

  /** What the editor's block settings panel and an agent read of the page, and whether the editor is still offered the layout. */
  async function provenance(pageId: string, presetId: string) {
    const offered = await listEnabledPageLayoutPresets();
    const layout = (await stored(pageId)).attrs.layout;
    return {
      offered: offered.some((p) => p.id === presetId),
      editor: resolvePageLayoutPreset(pageColumnsOf(layout as Parameters<typeof pageColumnsOf>[0]), offered).preset?.id ?? null,
      agent: await agentSettings(pageId),
    };
  }

  it('leaves its page’s values intact, the page reading as custom and the layout no longer offered — switched off, and then deleted', async () => {
    const { presetId, label, pageId } = await pageOnNewLayout();
    const before = await stored(pageId);
    expect(await provenance(pageId, presetId)).toEqual({
      offered: true,
      editor: presetId,
      agent: expect.objectContaining({ layout: presetId, layoutLabel: label, layoutCustomized: false, columns: TWO }),
    });

    const custom = { offered: false, editor: null, agent: expect.objectContaining({ layout: 'custom', layoutLabel: null, columns: TWO }) };
    await setPageLayoutPresetEnabled(presetId, false);
    expect(await provenance(pageId, presetId)).toEqual(custom);
    expect(await stored(pageId)).toEqual(before);

    await deletePageLayoutPreset(presetId);
    expect(await db`select 1 from page_layout_presets where id = ${presetId}`).toHaveLength(0);
    expect(await provenance(pageId, presetId)).toEqual(custom);
    const after = await stored(pageId);
    expect(after).toEqual(before);
    expect(after.content[0].content).toHaveLength(2);
  });

  it('leaves its page’s values intact and reading as custom when deleted while still switched on', async () => {
    const { presetId, pageId } = await pageOnNewLayout();
    const before = await stored(pageId);
    await deletePageLayoutPreset(presetId);
    expect(await provenance(pageId, presetId)).toEqual({ offered: false, editor: null, agent: expect.objectContaining({ layout: 'custom', layoutLabel: null, columns: TWO }) });
    expect(await stored(pageId)).toEqual(before);
  });
});
