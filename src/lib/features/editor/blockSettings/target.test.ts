// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { SelectionChainEntry } from '$lib/features/content/editor';
import { blockSettingsTarget, embedTarget, type TargetSelection, type TargetWrites } from './target';

const entry = (type: string, id: string | null, pos: number, attrs: Record<string, unknown> = {}): SelectionChainEntry => ({ type, id, attrs, pos });
const PAGE = entry('page', null, -1, { spacing: { desktop: { pad: 'md' } } });

/** Every write, by the path it took. */
function recorder() {
  const writes: [string, unknown][] = [];
  const to: TargetWrites = {
    pageAttr: (attr, value) => writes.push(['page', { [attr]: value }]),
    selectedAttr: (attr, value) => writes.push(['selected', { [attr]: value }]),
    cell: (patch) => writes.push(['cell', patch]),
    tableCell: (patch) => writes.push(['tableCell', patch]),
    container: (patch) => writes.push(['container', patch]),
    list: (patch) => writes.push(['list', patch]),
  };
  return { writes, to };
}

function selection(chain: SelectionChainEntry[], selectedIndex: number, extra: Partial<TargetSelection> = {}): TargetSelection {
  const at = chain[selectedIndex];
  return {
    chain,
    index: selectedIndex,
    selected: at?.id ? { id: at.id, type: at.type, attrs: at.attrs } : null,
    cell: null,
    container: null,
    list: null,
    tableCell: null,
    ...extra,
  };
}

describe('what a settings section edits', () => {
  it('the page, its attrs written one by one on the doc', () => {
    const { writes, to } = recorder();
    const t = blockSettingsTarget(selection([PAGE, entry('paragraph', 'p-1', 0)], 0), to)!;
    expect(t).toMatchObject({ type: 'page', id: null, attrs: PAGE.attrs });
    t.update({ spacing: null, surface: { background: 'accent' } });
    expect(writes).toEqual([['page', { spacing: null }], ['page', { surface: { background: 'accent' } }]]);
  });

  it('an id-less cell, written by its position in one patch', () => {
    const { writes, to } = recorder();
    const chain = [PAGE, entry('grid', 'g-1', 0), entry('gridCell', null, 1), entry('paragraph', 'p-1', 2)];
    const t = blockSettingsTarget(selection(chain, 2, { cell: { attrs: { surface: null } } }), to)!;
    expect(t).toMatchObject({ type: 'gridCell', id: null, attrs: { surface: null } });
    t.update({ surface: { background: 'muted' }, spacing: null });
    expect(writes).toEqual([['cell', { surface: { background: 'muted' }, spacing: null }]]);
  });

  it('a table cell', () => {
    const { writes, to } = recorder();
    const chain = [PAGE, entry('table', 't-1', 0), entry('tableCell', null, 3), entry('paragraph', 'p-1', 4)];
    const t = blockSettingsTarget(selection(chain, 2, { tableCell: { attrs: { align: null } } }), to)!;
    expect(t).toMatchObject({ type: 'tableCell', id: null });
    t.update({ align: 'center' });
    expect(writes).toEqual([['tableCell', { align: 'center' }]]);
  });

  it('a grid or a flex row, with its id, written by position', () => {
    const { writes, to } = recorder();
    const chain = [PAGE, entry('flexContainer', 'f-1', 0, { layout: {} }), entry('flexCell', null, 1)];
    const t = blockSettingsTarget(selection(chain, 1, { container: { attrs: { layout: { desktop: {} } } } }), to)!;
    expect(t).toMatchObject({ type: 'flexContainer', id: 'f-1', attrs: { layout: { desktop: {} } } });
    t.update({ width: 'wide' });
    expect(writes).toEqual([['container', { width: 'wide' }]]);
  });

  it('a list, with its id', () => {
    const { writes, to } = recorder();
    const chain = [PAGE, entry('bulletList', 'l-1', 0), entry('listItem', 'li-1', 1)];
    const t = blockSettingsTarget(selection(chain, 1, { list: { attrs: { marker: 'disc' } } }), to)!;
    expect(t).toMatchObject({ type: 'bulletList', id: 'l-1' });
    t.update({ marker: 'square' });
    expect(writes).toEqual([['list', { marker: 'square' }]]);
  });

  it('any other block, its attrs written one by one by its id', () => {
    const { writes, to } = recorder();
    const t = blockSettingsTarget(selection([PAGE, entry('callout', 'c-1', 0, { variant: 'info' })], 1), to)!;
    expect(t).toMatchObject({ type: 'callout', id: 'c-1', attrs: { variant: 'info' } });
    t.update({ variant: 'warning', icon: null });
    expect(writes).toEqual([['selected', { variant: 'warning' }], ['selected', { icon: null }]]);
  });

  it('nothing, for a cell without its context or an empty selection', () => {
    const { to } = recorder();
    expect(blockSettingsTarget(selection([PAGE, entry('gridCell', null, 1)], 1), to)).toBeNull();
    expect(blockSettingsTarget(selection([], -1), to)).toBeNull();
  });
});

describe("the phone's settings sheet", () => {
  it('edits the selected block when it shows a node, and nothing else', () => {
    const writes: [string, unknown][] = [];
    const write = (attr: string, value: unknown) => writes.push([attr, value]);
    const t = embedTarget({ id: 'b-1', type: 'collectionBlock', attrs: { nodeId: null } }, write)!;
    expect(t).toMatchObject({ type: 'collectionBlock', id: 'b-1' });
    t.update({ nodeId: 'n-1', layout: 'list' });
    expect(writes).toEqual([['nodeId', 'n-1'], ['layout', 'list']]);

    expect(embedTarget({ id: 'p-1', type: 'paragraph', attrs: {} }, write)).toBeNull();
    expect(embedTarget(null, write)).toBeNull();
  });
});
