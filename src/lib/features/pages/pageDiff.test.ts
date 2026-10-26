// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { diffDocs, applyPicks } from './pageDiff';

const blk = (id: string, text: string, type = 'paragraph') => ({
  type,
  attrs: { blockId: id },
  content: [{ type: 'text', text }],
});
const doc = (...blocks: unknown[]) => ({ type: 'doc', content: blocks });
const byId = (d: ReturnType<typeof diffDocs>, id: string) => d.entries.find((e) => e.blockId === id)!;

describe('diffDocs', () => {
  it('reports all unchanged for identical docs', () => {
    const a = doc(blk('1', 'a'), blk('2', 'b'), blk('3', 'c'));
    const d = diffDocs(a, structuredClone(a));
    expect(d.summary).toEqual({ added: 0, removed: 0, modified: 0, moved: 0, unchanged: 3 });
    expect(d.entries.every((e) => e.status === 'unchanged' && !e.moved)).toBe(true);
  });

  it('detects an added block', () => {
    const a = doc(blk('1', 'a'), blk('2', 'b'));
    const b = doc(blk('1', 'a'), blk('2', 'b'), blk('3', 'c'));
    const d = diffDocs(a, b);
    expect(d.summary.added).toBe(1);
    expect(byId(d, '3').status).toBe('added');
    expect(byId(d, '3').oldIndex).toBeNull();
    expect(byId(d, '3').newIndex).toBe(2);
  });

  it('detects a removed block and anchors it in place', () => {
    const a = doc(blk('1', 'a'), blk('2', 'b'), blk('3', 'c'));
    const b = doc(blk('1', 'a'), blk('3', 'c'));
    const d = diffDocs(a, b);
    expect(d.summary.removed).toBe(1);
    expect(byId(d, '2').status).toBe('removed');
    const ids = d.entries.map((e) => e.blockId);
    expect(ids).toEqual(['1', '2', '3']);
  });

  it('detects a modified block', () => {
    const a = doc(blk('1', 'hello'), blk('2', 'world'));
    const b = doc(blk('1', 'hello'), blk('2', 'WORLD'));
    const d = diffDocs(a, b);
    expect(d.summary.modified).toBe(1);
    expect(byId(d, '2').status).toBe('modified');
    expect(byId(d, '1').status).toBe('unchanged');
  });

  it('flags only the genuinely moved block (minimal move set)', () => {
    const a = doc(blk('1', 'a'), blk('2', 'b'), blk('3', 'c'));
    const b = doc(blk('3', 'c'), blk('1', 'a'), blk('2', 'b'));
    const d = diffDocs(a, b);
    expect(d.summary.moved).toBe(1);
    expect(byId(d, '3').moved).toBe(true);
    expect(byId(d, '1').moved).toBe(false);
    expect(byId(d, '2').moved).toBe(false);
  });

  it('treats attribute key-order differences as unchanged', () => {
    const a = doc({ type: 'quickLink', attrs: { blockId: '1', variant: 'info', label: 'x' }, content: [] });
    const b = doc({ type: 'quickLink', attrs: { label: 'x', variant: 'info', blockId: '1' }, content: [] });
    const d = diffDocs(a, b);
    expect(d.summary.unchanged).toBe(1);
    expect(byId(d, '1').status).toBe('unchanged');
  });

  it('handles a mix and carries the side nodes for cherry-pick', () => {
    const a = doc(blk('1', 'keep'), blk('2', 'old'), blk('3', 'gone'));
    const b = doc(blk('1', 'keep'), blk('2', 'new'), blk('4', 'fresh'));
    const d = diffDocs(a, b);
    expect(d.summary).toEqual({ added: 1, removed: 1, modified: 1, moved: 0, unchanged: 1 });
    const mod = byId(d, '2');
    expect(mod.oldBlock).toBeDefined();
    expect(mod.newBlock).toBeDefined();
    expect(byId(d, '4').newBlock).toBeDefined();
    expect(byId(d, '3').oldBlock).toBeDefined();
  });

  it('compares both sides without the editor’s placeholders, whatever ids they carry', () => {
    const placeholder = (id: string) => ({ type: 'placeholder', attrs: { blockId: id } });
    const row = (...second: unknown[]) => ({
      type: 'flexContainer',
      attrs: { blockId: 'f' },
      content: [{ type: 'flexCell', content: [blk('1', 'a')] }, { type: 'flexCell', content: second }],
    });
    expect(diffDocs(doc(row(placeholder('x'))), doc(row(placeholder('y')))).summary).toMatchObject({ modified: 0, unchanged: 1 });
    expect(diffDocs(doc(placeholder('x')), doc(placeholder('y'))).entries).toEqual([]);
    // An emptied cell is still a change, and the picked block holds no placeholder.
    const emptied = byId(diffDocs(doc(row(blk('2', 'b'))), doc(row(placeholder('y')))), 'f');
    expect(emptied.status).toBe('modified');
    expect(JSON.stringify(emptied.newBlock)).not.toContain('placeholder');
  });
});

describe('applyPicks', () => {
  const ids = (d: { content: { attrs?: { blockId?: string } }[] }) => d.content.map((b) => b.attrs?.blockId);

  it('replaces a block by id in place', () => {
    const cur = doc(blk('1', 'a'), blk('2', 'old'));
    const out = applyPicks(cur, [{ blockId: '2', op: 'replace', block: blk('2', 'new') }]);
    expect(ids(out)).toEqual(['1', '2']);
    expect(out.content[1]!.content![0]!.text).toBe('new');
  });

  it('removes a block by id', () => {
    const cur = doc(blk('1', 'a'), blk('2', 'b'), blk('3', 'c'));
    const out = applyPicks(cur, [{ blockId: '2', op: 'remove' }]);
    expect(ids(out)).toEqual(['1', '3']);
  });

  it('adds a block after its anchor', () => {
    const cur = doc(blk('1', 'a'), blk('3', 'c'));
    const out = applyPicks(cur, [{ blockId: '2', op: 'add', block: blk('2', 'b'), afterBlockId: '1' }]);
    expect(ids(out)).toEqual(['1', '2', '3']);
  });

  it('prepends when afterBlockId is null and appends when the anchor is missing', () => {
    const cur = doc(blk('1', 'a'));
    expect(ids(applyPicks(cur, [{ blockId: '0', op: 'add', block: blk('0', 'z'), afterBlockId: null }]))).toEqual(['0', '1']);
    expect(ids(applyPicks(cur, [{ blockId: '9', op: 'add', block: blk('9', 'q'), afterBlockId: 'gone' }]))).toEqual(['1', '9']);
  });

  it('applies a mixed pick set (replace + remove + chained adds)', () => {
    const cur = doc(blk('1', 'keep'), blk('2', 'old'), blk('3', 'gone'));
    const out = applyPicks(cur, [
      { blockId: '2', op: 'replace', block: blk('2', 'new') },
      { blockId: '3', op: 'remove' },
      { blockId: '4', op: 'add', block: blk('4', 'x'), afterBlockId: '2' },
      { blockId: '5', op: 'add', block: blk('5', 'y'), afterBlockId: '4' },
    ]);
    expect(ids(out)).toEqual(['1', '2', '4', '5']);
    expect(out.content[1]!.content![0]!.text).toBe('new');
  });

  it('does not duplicate a block that is already present', () => {
    const cur = doc(blk('1', 'a'));
    const out = applyPicks(cur, [{ blockId: '1', op: 'add', block: blk('1', 'a'), afterBlockId: null }]);
    expect(ids(out)).toEqual(['1']);
  });
});
