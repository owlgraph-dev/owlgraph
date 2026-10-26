// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { unknownKeys, type JsonDoc, type JsonNode } from '$lib/features/content';
import { assertNoUnknownDropped, describeDropped, isUnknownDropped, parseAcknowledged } from './unknownGuard';

const widget = (blockId?: string): JsonNode => ({ type: 'retiredWidget', attrs: blockId ? { blockId } : { setting: 'no id' } });
const para = (text: string): JsonNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc = (...content: JsonNode[]): JsonDoc => ({ type: 'doc', content });

/** null when the write is let through. */
function refusal(stored: JsonDoc, incoming: JsonDoc, acks: string[] = []) {
  try {
    assertNoUnknownDropped(unknownKeys(stored), unknownKeys(incoming), acks);
    return null;
  } catch (e) {
    if (!isUnknownDropped(e)) throw e;
    return e.details.dropped;
  }
}

describe('the unknown-block guard', () => {
  it('lets through a write that keeps every unknown block, wherever it moved', () => {
    const stored = doc(para('a'), widget('w-1'), widget());
    expect(refusal(stored, doc(widget(), widget('w-1'), para('b')))).toBeNull();
    const cell: JsonNode = { type: 'grid', content: [{ type: 'gridCell', content: [widget('w-1'), widget()] }] };
    expect(refusal(stored, doc(cell))).toBeNull();
  });

  it('refuses one that loses an unknown block, naming its key and type', () => {
    const dropped = refusal(doc(para('a'), widget('w-1')), doc(para('a')));
    expect(dropped).toEqual([{ key: 'w-1', type: 'retiredWidget', count: 1 }]);
    expect(describeDropped(dropped!)).toBe('w-1 (retiredWidget)');
  });

  it('names an id-less one by a fingerprint of it as stored, and lets it go once that is acknowledged', () => {
    const stored = doc(widget(), para('a'));
    const [unit] = refusal(stored, doc(para('a')))!;
    expect(unit.key).toMatch(/^fp:[0-9a-f]+$/);
    expect(refusal(stored, doc(para('a')), [unit.key])).toBeNull();
  });

  it('counts two identical ones twice: one acknowledgement lets one go', () => {
    const stored = doc(widget(), widget());
    const [unit] = refusal(stored, doc())!;
    expect(unit.count).toBe(2);
    expect(refusal(stored, doc(), [unit.key])).toEqual([{ ...unit, count: 1 }]);
    expect(refusal(stored, doc(widget()), [unit.key])).toBeNull();
  });

  it('refuses losing what an unknown block stands for once it is written as itself', () => {
    const wrapped = doc({ type: 'unknownBlock', attrs: { blockId: 'w-1', originalType: 'retiredWidget', original: widget('w-1'), plugin: null } });
    expect(refusal(doc(widget('w-1')), wrapped)).toBeNull();
    expect(refusal(doc(widget('w-1')), doc())).toHaveLength(1);
  });

  it('has nothing to guard on a page that holds nothing unknown', () => {
    expect(refusal(doc(para('a')), doc())).toBeNull();
  });

  it('reads the keys a header names, one per occurrence, and nothing else', () => {
    expect(parseAcknowledged('w-1, fp:1a2b ,w-1')).toEqual(['w-1', 'fp:1a2b', 'w-1']);
    expect(parseAcknowledged('w-1,<script>,, ;x')).toEqual(['w-1']);
    expect(parseAcknowledged(null)).toEqual([]);
  });
});
