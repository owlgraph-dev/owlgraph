// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { JsonDoc, JsonNode } from './doc';
import { droppedUnits, isOpaqueNode, isStandInOriginal, isUnknownNode, isUnknownType, lostKeys, slotTakesBlock, unknownKeys, unknownSummary, unwrapUnknown, wrapUnknown, UNKNOWN_BLOCK } from './unknownBlocks';

const ASSET = '0b2b6e5c-6b0e-4c3a-9a2f-1f0e2a9c1111';
const p = (text: string, attrs: Record<string, unknown> = {}): JsonNode => ({ type: 'paragraph', attrs: { blockId: `p-${text}`, ...attrs }, content: [{ type: 'text', text }] });
// A removed plugin's block: an id, its own attrs (null among them), capability overrides, an asset.
const widget: JsonNode = {
  type: 'retiredWidget',
  attrs: { blockId: 'w-1', zeta: 1, alpha: null, surface: { desktop: { bg: '#123456' } }, spacing: { desktop: { spaceAbove: 48 } }, image: ASSET },
};
const bare: JsonNode = { type: 'retiredLeaf', attrs: { setting: 'x' } };
const container: JsonNode = { type: 'retiredTabs', attrs: { blockId: 'tabs-1' }, content: [p('inside tabs')] };
const markedText: JsonNode = { type: 'paragraph', attrs: { blockId: 'p-mark' }, content: [{ type: 'text', text: 'shiny', marks: [{ type: 'retiredHighlight', attrs: { tone: 'gold' } }] }] };
const grid: JsonNode = {
  type: 'grid',
  attrs: { blockId: 'grid-1', columnWidths: [1, 1] },
  content: [
    { type: 'gridCell', content: [p('left'), { type: 'retiredWidget', attrs: { blockId: 'w-cell' } }] },
    { type: 'gridCell', content: [p('right')] },
  ],
};
const list: JsonNode = {
  type: 'bulletList',
  attrs: { blockId: 'list-1' },
  content: [{ type: 'listItem', attrs: { blockId: 'li-1' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item', marks: [{ type: 'retiredHighlight' }] }] }] }],
};
const section: JsonNode = { type: 'pageSection', attrs: { blockId: 'sec-1' }, content: [{ type: 'gridCell', content: [p('in section')] }, { type: 'retiredCell', attrs: {} }] };

const doc = (...content: JsonNode[]): JsonDoc => ({ type: 'doc', attrs: { spacing: {}, layout: {}, surface: {} }, content });
const mixed = doc(p('first'), widget, bare, container, markedText, grid, list, { ...p('linked'), content: [{ type: 'text', text: 'a link', marks: [{ type: 'link', attrs: { href: 'https://example.org' } }] }] });

describe('unknown units', () => {
  it('are nodes of a type no kind defines, or marked with a mark no extension defines', () => {
    expect(isUnknownNode(widget)).toBe(true);
    expect(isUnknownNode(p('known'))).toBe(false);
    expect(isUnknownNode({ type: 'text', text: 'x', marks: [{ type: 'retiredHighlight' }] })).toBe(true);
    expect(isUnknownNode({ type: 'text', text: 'x', marks: [{ type: 'link' }, { type: 'italic' }] })).toBe(false);
    expect(isOpaqueNode(widget)).toBe(true);
    expect(isOpaqueNode({ type: UNKNOWN_BLOCK })).toBe(true);
    expect(isOpaqueNode(p('known'))).toBe(false);
  });

  it('are keyed by their block id, else by a fingerprint of the node as stored — a multiset', () => {
    const keys = unknownKeys(doc(widget, bare, { ...bare }, container));
    expect(keys.get('w-1')).toEqual({ key: 'w-1', type: 'retiredWidget', count: 1 });
    expect(keys.get('tabs-1')?.type).toBe('retiredTabs');
    const fingerprints = [...keys.values()].filter((u) => u.key.startsWith('fp:'));
    expect(fingerprints).toEqual([{ key: expect.stringMatching(/^fp:[0-9a-f]+$/), type: 'retiredLeaf', count: 2 }]);
    // Key order in the stored JSON does not change the fingerprint.
    const reordered = { attrs: { setting: 'x' }, type: 'retiredLeaf' } as JsonNode;
    expect([...unknownKeys(doc(reordered)).keys()]).toEqual([fingerprints[0].key]);
    // A text unit is named by its unknown mark.
    expect([...unknownKeys(doc(markedText)).values()][0].type).toBe('retiredHighlight');
  });

  it('are counted through an editor’s stand-ins as through the nodes themselves', () => {
    expect(unknownKeys(wrapUnknown(mixed))).toEqual(unknownKeys(mixed));
  });

  it('dropped are the stored units an incoming document lacks, beyond the acknowledged', () => {
    const stored = doc(widget, bare, bare);
    const fp = [...unknownKeys(doc(bare)).keys()][0];
    const droppedUnknown = (a: JsonNode, b: JsonNode, acks?: string[]) => droppedUnits(unknownKeys(a), unknownKeys(b), acks);
    expect(droppedUnknown(stored, stored)).toEqual([]);
    expect(droppedUnknown(stored, doc(bare))).toEqual([
      { key: 'w-1', type: 'retiredWidget', count: 1 },
      { key: fp, type: 'retiredLeaf', count: 1 },
    ]);
    expect(droppedUnknown(stored, doc(bare), ['w-1', fp])).toEqual([]);
    // An acknowledgement covers one occurrence.
    expect(droppedUnknown(stored, doc(), ['w-1', fp])).toEqual([{ key: fp, type: 'retiredLeaf', count: 1 }]);
    // Moving a unit is no loss; nothing stored unknown, nothing to drop.
    expect(droppedUnknown(stored, doc({ type: 'blockquote', content: [widget] }, bare, bare))).toEqual([]);
    expect(droppedUnknown(doc(p('a')), doc())).toEqual([]);
    expect(lostKeys(unknownKeys(stored), unknownKeys(doc(bare)))).toEqual(['w-1', fp]);
  });

  it('name themselves to an agent', () => {
    expect(unknownSummary(widget)).toBe('unknown block (retiredWidget)');
    expect(unknownSummary(markedText.content![0])).toBe('unknown block (retiredHighlight)');
    expect(unknownSummary(wrapUnknown(doc(widget)).content![0])).toBe('unknown block (retiredWidget)');
    expect(unknownSummary(p('known'))).toBeNull();
  });
});

describe('wrapping and unwrapping', () => {
  it('comes back deep-equal, whatever was unknown and wherever it sat', () => {
    const before = structuredClone(mixed);
    const wrapped = wrapUnknown(mixed);
    expect(mixed).toEqual(before); // the input is never touched
    expect(unwrapUnknown(wrapped)).toEqual(before);
  });

  it('wraps an unknown node where it stands when its slot takes a block, else its nearest ancestor that stands in one', () => {
    const wrapped = wrapUnknown(doc(widget, markedText, grid, list, { type: 'blockquote', content: [p('q'), bare] }));
    const types = (nodes: JsonNode[] = []) => nodes.map((n) => (n.type === UNKNOWN_BLOCK ? `[${n.attrs?.originalType}]` : n.type));
    expect(types(wrapped.content)).toEqual(['[retiredWidget]', '[paragraph]', 'grid', '[bulletList]', 'blockquote']);
    // In a grid cell, in place; in a quote, in place.
    expect(types(wrapped.content![2].content![0].content)).toEqual(['paragraph', '[retiredWidget]']);
    expect(types(wrapped.content![4].content)).toEqual(['paragraph', '[retiredLeaf]']);
  });

  it('wraps a section whose child is unknown as a whole, at the top level', () => {
    const wrapped = wrapUnknown(doc(section));
    expect(wrapped.content![0]).toMatchObject({ type: UNKNOWN_BLOCK, attrs: { originalType: 'pageSection', blockId: 'sec-1' } });
    expect(isOpaqueNode(wrapped.content![0])).toBe(true);
  });

  it('carries the original’s id, no plugin for a kind no retired plugin claims, and a deep copy of the node', () => {
    const wrapper = wrapUnknown(doc(widget)).content![0];
    expect(wrapper.attrs).toEqual({ blockId: 'w-1', originalType: 'retiredWidget', original: widget, plugin: null });
    expect(wrapper.attrs?.original).not.toBe(widget);
    expect(wrapUnknown(doc(bare)).content![0].attrs?.blockId).toBeNull();
  });

  it('leaves a document with nothing unknown as it is', () => {
    const plain = doc(p('a'), grid.content ? { ...grid, content: [{ type: 'gridCell', content: [p('b')] }] } : grid);
    expect(wrapUnknown(plain)).toBe(plain);
    expect(unwrapUnknown(plain)).toBe(plain);
  });

  it('writes a pasted copy with the live id the editor gave it, and keeps an id-less original id-less', () => {
    const [original] = wrapUnknown(doc(widget)).content!;
    const copy = { ...original, attrs: { ...original.attrs, blockId: 'w-copy' } };
    const [first, second] = unwrapUnknown(doc(original, copy)).content!;
    expect(first.attrs?.blockId).toBe('w-1');
    expect(second.attrs?.blockId).toBe('w-copy');
    expect(second).toEqual({ ...widget, attrs: { ...widget.attrs, blockId: 'w-copy' } });
    const [idless] = wrapUnknown(doc(bare)).content!;
    expect(unwrapUnknown(doc({ ...idless, attrs: { ...idless.attrs, blockId: 'live-id' } })).content![0]).toEqual(bare);
  });

  it('knows which slots take a block', () => {
    expect(slotTakesBlock('doc', 0)).toBe(true);
    expect(slotTakesBlock('gridCell', 3)).toBe(true);
    expect(slotTakesBlock('listItem', 0)).toBe(false);
    expect(slotTakesBlock('listItem', 1)).toBe(true);
    expect(slotTakesBlock('pageSection', 0)).toBe(false);
    expect(slotTakesBlock('paragraph', 0)).toBe(false);
  });
});

describe('a stand-in that holds nothing unknown', () => {
  const standIn = (original: unknown, originalType: string) => ({ type: 'unknownBlock', attrs: { blockId: 'u-1', originalType, original, plugin: null } });
  const kept = { type: 'paragraph', content: [{ type: 'text', text: 'kept' }] };

  it('is dropped on the way back — pasted from elsewhere, it would put any node in the page unseen', () => {
    const smuggled = { type: 'paragraph', content: [{ type: 'text', text: 'Smuggled', marks: [{ type: 'link', attrs: { href: 'https://evil.example' } }] }] };
    const doc = { type: 'doc', content: [kept, standIn(smuggled, 'paragraph'), standIn({ type: 'retiredWidget' }, 'Image'), standIn('nonsense', 'x')] };
    expect(unwrapUnknown(doc as never)).toEqual({ type: 'doc', content: [kept] });
  });

  it('is kept when what it holds is unknown, whatever lies inside a known node', () => {
    const marked = { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'retiredHighlight' }] }] };
    expect(isStandInOriginal({ type: 'retiredWidget' }, 'retiredWidget')).toBe(true);
    expect(isStandInOriginal(marked, 'paragraph')).toBe(true);
    expect(isStandInOriginal(kept, 'paragraph')).toBe(false);
    expect(isStandInOriginal({ type: 'retiredWidget' }, 'Image')).toBe(false);
    expect(isStandInOriginal(null, 'x')).toBe(false);
  });

  it('tells a type it does not know from a mark it does not know', () => {
    expect(isUnknownType({ type: 'retiredWidget' })).toBe(true);
    expect(isUnknownType({ type: 'text', text: 'x', marks: [{ type: 'bold' }] })).toBe(false);
    expect(isUnknownNode({ type: 'text', text: 'x', marks: [{ type: 'bold' }] })).toBe(true);
  });
});
