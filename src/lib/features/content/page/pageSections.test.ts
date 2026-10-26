// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { JsonNode } from '../doc/doc';
import {
  normalizePageColumns,
  normalizeTemplate,
  pageColumnsVars,
  sectionDefaultWidth,
  setTierColumnCount,
  setTierColumnRatio,
  strictTemplate,
  type PageColumns,
} from './pageColumns';
import {
  moveInSections,
  normalizeStrays,
  reconcileSections,
  sectionMovesFor,
  setSectionColumns,
  unwrapSections,
  wrapIntoSection,
  type SectionEdit,
  type SectionMove,
} from './pageSections';
import { normalizePageLayout, setPageColumns, setPageWidth } from './pageAttrs';

const p = (text: string): JsonNode => ({ type: 'paragraph', attrs: { blockId: text }, content: [{ type: 'text', text }] });
const cell = (...blocks: JsonNode[]): JsonNode => ({ type: 'gridCell', content: blocks });
const section = (...cells: JsonNode[]): JsonNode => ({ type: 'pageSection', attrs: { blockId: 's' }, content: cells });
const doc = (...content: JsonNode[]): JsonNode => ({ type: 'doc', content });
const texts = (node: JsonNode): string[] =>
  node.type === 'text' ? [node.text ?? ''] : (node.content ?? []).flatMap(texts);

// A page's copies of the seeded presets (pages/pageLayoutPresets.ts presetSnapshot).
const MAIN_ASIDE: PageColumns = { mode: 'columns', template: { desktop: [2, 1], tablet: [2, 1], phone: [1] }, preset: 'main-aside', presetLabel: 'Main and side column', sectionDefaults: { width: 'wide' } };
const SECTIONS: PageColumns = { mode: 'columns', template: { desktop: [1], tablet: [1], phone: [1] }, preset: 'sections', presetLabel: 'Sections', sectionDefaults: { width: 'full' } };
const TWO_COLUMNS: PageColumns = { mode: 'columns', template: { desktop: [1, 1], tablet: [1, 1], phone: [1] }, preset: 'two-columns', presetLabel: 'Two columns', sectionDefaults: { width: 'wide' } };

describe('the column template', () => {
  it('keeps phone ≤ tablet ≤ desktop, filling a missing tier from the one above', () => {
    expect(normalizeTemplate({ desktop: [3, 2], tablet: [1, 1, 1], phone: [1, 1, 1] })).toEqual({ desktop: [3, 2], tablet: [1, 1], phone: [1, 1] });
    expect(normalizeTemplate({ desktop: [2, 1] })).toEqual({ desktop: [2, 1], tablet: [2, 1], phone: [2, 1] });
    expect(normalizeTemplate({ desktop: [1, 1, 1, 1, 1] })).toBeNull();
    expect(normalizeTemplate({ desktop: [0, 2] })).toBeNull();
    expect(normalizeTemplate({ desktop: [13] })).toBeNull();
  });

  it('sets counts within the order: a lower tier cannot outgrow the one above; lowering desktop cuts below', () => {
    const t = MAIN_ASIDE.template;
    expect(setTierColumnCount(t, 'phone', 3).phone).toEqual([1, 1]);
    expect(setTierColumnCount(t, 'desktop', 1)).toEqual({ desktop: [2], tablet: [2], phone: [1] });
    expect(setTierColumnCount(t, 'desktop', 3).desktop).toEqual([2, 1, 1]);
    expect(setTierColumnRatio(t, 'desktop', 1, 20).desktop).toEqual([2, 12]);
  });

  it('is a page layout only with a template that holds up; anything else is a flow page', () => {
    expect(normalizePageColumns({ mode: 'columns', template: { desktop: [2, 1] }, preset: 'main-aside' })?.preset).toBe('main-aside');
    expect(normalizePageColumns({ mode: 'columns', template: { desktop: 'x' } })).toBeNull();
    expect(normalizePageColumns({ mode: 'flow' })).toBeNull();
    expect(normalizePageLayout({ mode: 'columns' })).toEqual({});
    // What can't be a preset's id is a custom template; Standard is no columns layout.
    expect(normalizePageColumns({ mode: 'columns', template: { desktop: [1, 1] }, preset: 'Nope!' })?.preset).toBe('custom');
    expect(normalizePageColumns({ mode: 'columns', template: { desktop: [1, 1] }, preset: 'standard' })?.preset).toBe('custom');
  });

  it('lives beside the widths and gutters, which survive a mode change', () => {
    const withWidth = setPageWidth(setPageColumns({}, MAIN_ASIDE), 'read', '700px');
    expect(withWidth).toMatchObject({ mode: 'columns', preset: 'main-aside', presetLabel: 'Main and side column', sectionDefaults: { width: 'wide' }, widths: { desktop: { read: '700px' } } });
    expect(setPageColumns(withWidth, null)).toEqual({ widths: { desktop: { read: '700px' } } });
  });

  it('publishes its tracks per tier and only the gaps it sets; a flow page publishes nothing', () => {
    expect(pageColumnsVars(null)).toEqual({});
    expect(pageColumnsVars({ ...MAIN_ASIDE, gap: { phone: 'lg' } })).toEqual({
      '--page-columns-flow': 'row',
      '--page-columns-cols-d': 'minmax(0, 2fr) minmax(0, 1fr)',
      '--page-columns-cols-t': 'minmax(0, 2fr) minmax(0, 1fr)',
      '--page-columns-cols-p': 'minmax(0, 1fr)',
      '--page-columns-gap-p': '1.5rem',
    });
  });
});

describe('flow ↔ columns', () => {
  it('wraps every block into one section, first cell, and unwraps them back in order', () => {
    const flow = doc(p('a'), p('b'), p('c'));
    const cols = wrapIntoSection(flow, MAIN_ASIDE, 'placeholder');
    expect(cols.content).toHaveLength(1);
    expect(cols.content![0]).toMatchObject({ type: 'pageSection', attrs: { width: 'wide' } });
    expect(texts(cols.content![0].content![0])).toEqual(['a', 'b', 'c']);
    expect(cols.content![0].content![1].content).toEqual([{ type: 'placeholder' }]);
    expect(texts(unwrapSections(cols, 'placeholder'))).toEqual(['a', 'b', 'c']);
  });

  it('unwraps every cell of every section, in document order, dropping placeholders', () => {
    const cols = doc(section(cell(p('a')), cell(p('b'))), section(cell({ type: 'placeholder' }), cell(p('c'))));
    const flow = unwrapSections(cols, 'empty');
    expect(flow.content!.map((n) => n.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(texts(flow)).toEqual(['a', 'b', 'c']);
  });
});

describe('reconciling the sections with a new column count', () => {
  const three = doc(section(cell(p('a1')), cell(p('a2')), cell(p('a3'))), section(cell(p('b1')), cell(p('b2')), cell(p('b3'))));

  it('never loses content: fewer columns merge the trailing cells into the last that stays, and say so', () => {
    const { doc: two, merges } = reconcileSections(three, 2, 'placeholder');
    expect(two.content!.map((s) => s.content!.length)).toEqual([2, 2]);
    expect(texts(two)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
    expect(texts(two.content![0].content![1])).toEqual(['a2', 'a3']);
    expect(merges).toEqual([
      { section: 0, from: [3], into: 2 },
      { section: 1, from: [3], into: 2 },
    ]);
    const { doc: one } = reconcileSections(three, 1, 'empty');
    expect(texts(one.content![0])).toEqual(['a1', 'a2', 'a3']);
  });

  it('reports nothing when the cells that go were empty', () => {
    const { merges } = reconcileSections(doc(section(cell(p('a')), cell({ type: 'placeholder' }))), 1, 'placeholder');
    expect(merges).toEqual([]);
  });

  it('appends empty cells for more columns and leaves single-column sections alone', () => {
    const single = { ...section(cell(p('x'))), attrs: { columns: 'single' } };
    const { doc: more } = reconcileSections(doc(section(cell(p('a')), cell(p('b'))), single), 3, 'empty');
    expect(more.content![0].content).toHaveLength(3);
    expect(more.content![0].content![2]).toEqual({ type: 'gridCell', content: [] });
    expect(more.content![1].content).toHaveLength(1);
  });

  it('keeps the settings of the cell merged into, drops those of the cells merged', () => {
    const styled = doc(section({ ...cell(p('a')), attrs: { alignX: 'center' } }, { ...cell(p('b')), attrs: { alignX: 'end' } }));
    const { doc: one } = reconcileSections(styled, 1, 'empty');
    expect(one.content![0].content![0].attrs).toEqual({ alignX: 'center' });
  });
});

describe('a section set to a single column and back', () => {
  it('merges into one cell and expands again with empty cells, content kept', () => {
    const s = section(cell(p('a')), cell(p('b')));
    const single = setSectionColumns(s, true, MAIN_ASIDE, 'placeholder');
    expect(single.attrs).toMatchObject({ columns: 'single' });
    expect(single.content).toHaveLength(1);
    expect(texts(single)).toEqual(['a', 'b']);
    const back = setSectionColumns(single, false, MAIN_ASIDE, 'placeholder');
    expect(back.attrs?.columns).toBeUndefined();
    expect(back.content).toHaveLength(2);
    expect(texts(back.content![0])).toEqual(['a', 'b']);
  });
});

describe('stray blocks on a columns page', () => {
  it('go into a section of their own, consecutive ones together, in the main cell', () => {
    const d = doc(p('a'), p('b'), section(cell(p('c')), cell(p('d'))), p('e'));
    const out = normalizeStrays(d, MAIN_ASIDE, 'empty', (first) => `implicit-${first.attrs?.blockId}`);
    expect(out.content!.map((n) => n.type)).toEqual(['pageSection', 'pageSection', 'pageSection']);
    expect(out.content![0].attrs).toMatchObject({ blockId: 'implicit-a', width: 'wide' });
    expect(texts(out.content![0].content![0])).toEqual(['a', 'b']);
    expect(out.content![0].content![1].content).toEqual([]);
    expect(texts(out.content![2])).toEqual(['e']);
  });

  it('leave a flow page and an all-section page untouched', () => {
    const flow = doc(p('a'));
    expect(normalizeStrays(flow, null, 'empty')).toBe(flow);
    const cols = doc(section(cell(p('a'))));
    expect(normalizeStrays(cols, SECTIONS, 'empty')).toBe(cols);
  });

  it('turn a page of nothing but a placeholder into one empty section, and drop stray placeholders elsewhere', () => {
    expect(normalizeStrays(doc({ type: 'placeholder' }), SECTIONS, 'placeholder').content).toEqual([
      { type: 'pageSection', attrs: { width: 'full' }, content: [{ type: 'gridCell', content: [{ type: 'placeholder' }] }] },
    ]);
    const out = normalizeStrays(doc(section(cell(p('a'))), { type: 'placeholder' }), SECTIONS, 'placeholder');
    expect(out.content).toHaveLength(1);
  });
});

describe('moving a block between cells and sections', () => {
  const ph = { type: 'placeholder' };
  const img = (id: string): JsonNode => ({ type: 'image', attrs: { blockId: id, assetId: 'x' } });
  // Content in every cell, so a move that lands in the wrong one shows.
  const article = () =>
    doc(
      { type: 'pageSection', attrs: { blockId: 's1', width: 'wide' }, content: [cell(p('p1'), img('i1')), cell(p('n1'))] },
      { type: 'pageSection', attrs: { blockId: 's2', width: 'wide' }, content: [cell(p('p2')), cell(p('n2'))] },
      { type: 'pageSection', attrs: { blockId: 's3', columns: 'single' }, content: [cell(p('t3'))] }
    );
  // The edit applied to the JSON, as the editor applies it to its document.
  const applySectionEdit = (d: JsonNode, edit: SectionEdit): JsonNode => {
    const content = [...(d.content ?? [])];
    content.splice(edit.from, edit.to - edit.from, ...edit.nodes);
    return { ...d, content };
  };
  const moved = (d: JsonNode, id: string, move: SectionMove) => applySectionEdit(d, moveInSections(d, id, move, 'placeholder')!);
  const cellTexts = (d: JsonNode) => (d.content ?? []).map((s) => (s.content ?? []).map((c) => (c.content ?? []).map((n) => n.attrs?.blockId ?? n.type)));

  it('knows which moves a block has: only where a cell or a section is on that side', () => {
    expect(sectionMovesFor(article(), 'i1')).toEqual({ 'cell-prev': false, 'cell-next': true, 'section-prev': false, 'section-next': true, extract: true });
    expect(sectionMovesFor(article(), 'n2')).toMatchObject({ 'cell-prev': true, 'cell-next': false, 'section-prev': true, 'section-next': true });
    // A single-cell section has no column moves.
    expect(sectionMovesFor(article(), 't3')).toMatchObject({ 'cell-prev': false, 'cell-next': false, 'section-prev': true, 'section-next': false });
    // Not in a section's cell: a flow page, or nested deeper.
    expect(sectionMovesFor(doc(p('a')), 'a')).toBeNull();
    expect(moveInSections(article(), 'i1', 'cell-prev', 'placeholder')).toBeNull();
  });

  it('moves to the end of the next cell, and leaves a placeholder in a cell it empties', () => {
    expect(cellTexts(moved(article(), 'i1', 'cell-next'))).toEqual([[['p1'], ['n1', 'i1']], [['p2'], ['n2']], [['t3']]]);
    expect(cellTexts(moved(article(), 'n1', 'cell-prev'))[0]).toEqual([['p1', 'i1', 'n1'], ['placeholder']]);
  });

  it("drops the target cell's placeholder", () => {
    const d = doc({ type: 'pageSection', attrs: {}, content: [cell(p('a')), cell(ph)] });
    expect(cellTexts(moved(d, 'a', 'cell-next'))).toEqual([[['placeholder'], ['a']]]);
  });

  it('moves into the same cell of the next or previous section, at its end, touching only those two', () => {
    const edit = moveInSections(article(), 'i1', 'section-next', 'placeholder')!;
    expect([edit.from, edit.to]).toEqual([0, 2]);
    expect(cellTexts(applySectionEdit(article(), edit))).toEqual([[['p1'], ['n1']], [['p2', 'i1'], ['n2']], [['t3']]]);
    expect(cellTexts(moved(article(), 'n2', 'section-prev'))).toEqual([[['p1', 'i1'], ['n1', 'n2']], [['p2'], ['placeholder']], [['t3']]]);
  });

  it('falls back to the last cell of a section with fewer (an Einspaltig one)', () => {
    expect(cellTexts(moved(article(), 'n2', 'section-next'))[2]).toEqual([['t3', 'n2']]);
  });

  it('extracts exactly the one block into a new single-column section after its own, spanning what it did', () => {
    const edit = moveInSections(article(), 'i1', 'extract', 'placeholder')!;
    expect([edit.from, edit.to]).toEqual([0, 1]);
    const out = applySectionEdit(article(), edit);
    expect(cellTexts(out)).toEqual([[['p1'], ['n1']], [['i1']], [['p2'], ['n2']], [['t3']]]);
    expect(out.content![1].attrs).toEqual({ columns: 'single', width: 'wide' });
    // Its last block gone, the cell keeps a placeholder; the emptied section stays.
    const alone = doc({ type: 'pageSection', attrs: {}, content: [cell(p('a')), cell(p('b'))] });
    expect(cellTexts(moved(alone, 'a', 'extract'))).toEqual([[['placeholder'], ['b']], [['a']]]);
  });

  it('keeps the settings of the cells it touches', () => {
    const d = doc({ type: 'pageSection', attrs: {}, content: [{ ...cell(p('a')), attrs: { alignY: 'center' } }, { ...cell(p('b')), attrs: { alignX: 'end' } }] });
    const out = moved(d, 'a', 'cell-next');
    expect(out.content![0].content!.map((c) => c.attrs)).toEqual([{ alignY: 'center' }, { alignX: 'end' }]);
  });

  it('fills an emptied cell with nothing for storage', () => {
    const d = doc({ type: 'pageSection', attrs: {}, content: [cell(p('a')), cell(p('b'))] });
    expect(applySectionEdit(d, moveInSections(d, 'a', 'cell-next', 'empty')!).content![0].content![0].content).toEqual([]);
  });
});

describe("a page's copy of its layout", () => {
  it("gives new sections the page's own copy of their defaults, never the registry's", () => {
    expect(sectionDefaultWidth(SECTIONS)).toBe('full');
    expect(sectionDefaultWidth({ ...SECTIONS, sectionDefaults: undefined })).toBeNull();
    // Bleed-to-top is the first section's only.
    const bleeding: PageColumns = { ...TWO_COLUMNS, sectionDefaults: { bleedToTop: true } };
    const wrapped = wrapIntoSection(doc(p('a')), bleeding, 'empty');
    expect(wrapped.content![0].attrs).toMatchObject({ bleedToTop: true });
    const strays = normalizeStrays(doc(p('a'), section(cell(p('b')), cell()), p('c')), bleeding, 'empty');
    expect(strays.content!.map((n) => n.attrs?.bleedToTop ?? false)).toEqual([true, false, false]);
  });

  it('takes a template exactly as given, refusing rather than repairing', () => {
    expect(strictTemplate({ desktop: [2, 1], tablet: [2, 1], phone: [1] })).toEqual({ desktop: [2, 1], tablet: [2, 1], phone: [1] });
    expect(strictTemplate({ desktop: [2, 1], tablet: [1, 1, 1], phone: [1] })).toBeNull();
    expect(strictTemplate({ desktop: [2, 1] })).toBeNull();
  });
});
