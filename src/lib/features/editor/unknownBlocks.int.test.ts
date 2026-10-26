// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { createImageAsset } from '$lib/features/media/server';
import { createPage, saveDoc } from '$lib/features/pages/server';
import { connectAs, textOf, userOf } from '$tests/integration/mcp';
import { textPara } from '$tests/e2e/doc';
import { storedDoc } from '$tests/support/storedDoc';

// docs/architecture/blocks/anatomy.md, "Unknown blocks". The agent is the real MCP server
// in-process (tests/integration/mcp.ts). The kinds are invented: a plugin
// that is merely turned off keeps its kinds known.
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[]; marks?: { type: string; attrs?: Record<string, unknown> }[]; text?: string };

/** A page of the admin's holding every kind of unknown unit — and an asset only one of them uses. */
async function unknownPage() {
  const admin = await userOf('admin');
  const { id } = await createPage('Unknown blocks', admin);
  const bytes = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 70, g: 100, b: 140 } } }).jpeg().toBuffer();
  const asset = await createImageAsset({ bytes, mime: 'image/jpeg', ownerPageId: id, createdBy: admin.id });
  const grid: Node = {
    type: 'grid',
    attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
    content: [
      { type: 'gridCell', content: [textPara('p-left', 'Left column'), { type: 'retiredWidget', attrs: { blockId: 'w-cell' } }] },
      { type: 'gridCell', content: [textPara('p-right', 'Right column')] },
    ],
  };
  await saveDoc(id, {
    type: 'doc',
    content: [
      textPara('p-first', 'First paragraph'),
      { type: 'retiredWidget', attrs: { blockId: 'w-top', zeta: 1, alpha: null, image: asset.id, surface: { desktop: { bg: '#123456' } }, spacing: { desktop: { spaceAbove: 48 } } } },
      { type: 'retiredLeaf', attrs: { setting: 'no id' } },
      { type: 'retiredTabs', attrs: { blockId: 'tabs-1' }, content: [textPara('in-tabs', 'Text inside the tabs')] },
      textPara('p-marked', 'Text under a retired mark', [{ type: 'retiredHighlight', attrs: { tone: 'gold' } }]),
      grid,
      textPara('p-link', 'A web link', [{ type: 'link', attrs: { href: 'https://example.org/' } }]),
    ],
  });
  return { id };
}

describe('unknown blocks', () => {
  it('is named to an agent, and an agent deletes one by its id', async () => {
    const { id } = await unknownPage();
    const agent = await connectAs('admin');

    const read = await agent.callTool({ name: 'get_page', arguments: { pageId: id } });
    expect(read.isError).toBeFalsy();
    expect(textOf(read)).toContain('unknown block (retiredWidget)');
    expect(textOf(read)).toContain('unknown block (retiredTabs)');
    expect(textOf(read)).toContain('unknown block (retiredLeaf)');
    // Named, never read: nothing of what one holds.
    for (const held of ['Text inside the tabs', 'no id', '#123456']) expect(textOf(read)).not.toContain(held);

    const deleted = await agent.callTool({ name: 'delete_block', arguments: { pageId: id, blockId: 'w-top' } });
    expect(deleted.isError).toBeFalsy();
    expect(textOf(deleted)).not.toMatch(/error|not found/i);
    const after = JSON.stringify(await storedDoc(id));
    expect(after).not.toContain('"w-top"');
    // Only that one: the other unknown blocks stay as they were.
    expect(after).toContain('"w-cell"');
    expect(after).toContain('"tabs-1"');
  });
});
