// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { typographyShape, leafBlockShape } from './blockInputSchema.server';

describe('text blocks take a paragraph style', () => {
  it('accepts an optional style id on a heading and a paragraph, nothing else changes', () => {
    expect(leafBlockShape.safeParse({ kind: 'heading', level: 2, text: 'T', style: 'abc' }).success).toBe(true);
    expect(leafBlockShape.safeParse({ kind: 'paragraph', text: 'T', style: 'abc' }).success).toBe(true);
    expect(leafBlockShape.safeParse({ kind: 'paragraph', text: 'T' }).success).toBe(true);
    expect(leafBlockShape.safeParse({ kind: 'heading', level: 2, text: 'T', style: 7 }).success).toBe(false);
  });
});

describe('typographyShape size', () => {
  it('accepts a type-scale step and a px literal in range', () => {
    expect(typographyShape.safeParse({ desktop: { size: 'scale:4xl' } }).success).toBe(true);
    expect(typographyShape.safeParse({ phone: { size: 20 } }).success).toBe(true);
  });

  it('rejects an unknown step, a bare step and an out-of-range px', () => {
    expect(typographyShape.safeParse({ desktop: { size: 'scale:7xl' } }).success).toBe(false);
    expect(typographyShape.safeParse({ desktop: { size: '4xl' } }).success).toBe(false);
    expect(typographyShape.safeParse({ desktop: { size: 200 } }).success).toBe(false);
  });
});

describe('a grid from an agent takes its columns per tier', () => {
  it('maps columnsByTier and gapByTier onto the grid, valid and sparse', async () => {
    const { blockInputToNode, withGridTiers } = await import('./blockInput.server');
    const node = blockInputToNode({
      kind: 'grid',
      columnWidths: [1, 1, 1, 1],
      columnsByTier: { tablet: [1, 1, 1, 1], phone: [1, 1] },
      gapByTier: { phone: 'sm' },
      cells: [[], [], [], []],
    } as never) as { attrs: Record<string, unknown> };
    // The tablet equals the desktop, so only the phone is stored.
    expect(node.attrs.columnsByTier).toEqual({ phone: [1, 1] });
    expect(node.attrs.gapByTier).toEqual({ phone: 'sm' });
    // style_grid merges over what the grid has; 'auto' takes a tier back.
    const styled = withGridTiers(node.attrs, { columnsByTier: { tablet: [1, 1], phone: null } });
    expect(styled.columnsByTier).toEqual({ tablet: [1, 1] });
    expect(styled.gapByTier).toEqual({ phone: 'sm' });
  });
});

describe('a flex row from an agent', () => {
  const button = (label: string) => ({ kind: 'quickLink', url: 'https://example.com/', label, variant: 'button' });
  const row = {
    kind: 'flex',
    width: 'normal',
    placement: { desktop: { align: 'center' } },
    layout: { desktop: { gap: 12, flexWrap: 'wrap' }, phone: { flexDirection: 'column' } },
    minHeight: { desktop: '240px' },
    cells: [[button('Start')], [button('More')], []],
    cellStyles: [{ flexItem: { desktop: { size: 'fixed', basis: '10rem' } } }, { flexItem: { desktop: { size: 'fill', weight: 2 } }, surface: { desktop: { bg: 'token:subtle' } } }],
  };

  it('is one of the block kinds; its cells hold leaf blocks only, its values stay in the editor\'s ranges', async () => {
    const { blockShape } = await import('./blockInputSchema.server');
    expect(blockShape.safeParse(row).success).toBe(true);
    expect(blockShape.safeParse({ ...row, cells: [[{ kind: 'grid', cells: [[]] }]] }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, cells: [[{ ...row }]] }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, cells: [] }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, layout: { desktop: { flexDirection: 'row-reverse' } } }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, layout: { desktop: { gap: 400 } } }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, cellStyles: [{ flexItem: { desktop: { size: 'fixed', basis: '5px' } } }] }).success).toBe(false);
    expect(blockShape.safeParse({ ...row, cellStyles: [{ flexItem: { desktop: { weight: 4 } } }] }).success).toBe(false);
  });

  it('maps onto a sparse row: what the agent set, its cells styled in order, an empty cell left empty', async () => {
    const { blockShape } = await import('./blockInputSchema.server');
    const { blockInputToNode, summarizeBlocks } = await import('./blockInput.server');
    const node = blockInputToNode(blockShape.parse(row)) as { type: string; attrs: Record<string, unknown>; content: { type: string; attrs: Record<string, unknown>; content: { type: string }[] }[] };
    expect(node.type).toBe('flexContainer');
    const { blockId, ...attrs } = node.attrs;
    expect(blockId).toEqual(expect.any(String));
    // 'normal' is the default band: nothing stored.
    expect(attrs).toEqual({ placement: row.placement, layout: row.layout, height: { desktop: { min: '240px' } } });
    expect(node.content.map((c) => c.attrs)).toEqual([row.cellStyles[0], row.cellStyles[1], {}]);
    expect(node.content.map((c) => c.content.map((b) => b.type))).toEqual([['quickLink'], ['quickLink'], []]);
    const [summary] = summarizeBlocks({ type: 'doc', content: [node] });
    expect(summary).toMatchObject({ type: 'flexContainer', kind: 'flex', cells: 3, cellContents: [{ index: 0, blocks: 1, preview: '→ Start' }, { index: 1, blocks: 1 }, { index: 2, blocks: 0 }] });
  });
});

describe('get_page names each block by the kind append_block takes', () => {
  it('gives the agent kind beside the stored type, and null for a block an agent cannot write', async () => {
    const { agentKindOf } = await import('./blockInput.server');
    const kinds = ['paragraph', 'heading', 'callout', 'codeBlock', 'bulletList', 'orderedList', 'htmlBlock', 'quickLink', 'table', 'diagram', 'collectionBlock', 'documentBlock', 'grid', 'flexContainer', 'pageSection', 'image', 'queryBlock', 'blockquote'].map(agentKindOf);
    expect(kinds).toEqual(['paragraph', 'heading', 'callout', 'code', 'list', 'list', 'html', 'quickLink', 'table', 'diagram', 'collection', 'document', 'grid', 'flex', 'section', null, null, null]);
  });
});
