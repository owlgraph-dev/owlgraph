// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { buildColorScheme, VIZ_COLORS, DOCUMENT_COLOR, OTHER_COLOR, PAGE_COLOR } from './nodeColor';
import type { GraphNode } from './types';

const labels = {
  page: 'Seite',
  document: 'Dokument',
  collection: 'Sammlung',
  other: 'Andere',
  classLabel: (id: string) => ({ c1: 'Artikel', c2: 'Bericht', c3: 'Zettel' })[id] ?? null,
  classKey: (id: string) => ({ c1: 'article', c2: 'report', c3: 'slip' })[id] ?? null,
  namespaceLabel: (id: string) => ({ ns1: 'Default', ns2: 'Team' })[id] ?? null,
};
const node = (id: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, title: id, type: 'page', classId: 'c1', namespaceId: 'ns1', ...over });

describe('buildColorScheme', () => {
  it('colors by type with the fixed page/document colors and a two-entry legend', () => {
    const scheme = buildColorScheme('type', [node('a'), node('d', { type: 'document' })], labels);
    expect(scheme.colorOf(node('a'))).toBe(PAGE_COLOR);
    expect(scheme.colorOf(node('d', { type: 'document' }))).toBe(DOCUMENT_COLOR);
    expect(scheme.legend([]).map((e) => [e.label, e.shape])).toEqual([['Seite', 'circle'], ['Dokument', 'square']]);
  });

  it('draws a collection in the neutral colour on a shape of its own, listed while one is on screen', () => {
    const collection = node('k', { type: 'collection' });
    const scheme = buildColorScheme('type', [node('a'), collection], labels);
    expect(scheme.colorOf(collection)).toBe(OTHER_COLOR);
    expect(scheme.legend([collection]).map((e) => [e.label, e.shape])).toEqual([['Seite', 'circle'], ['Dokument', 'square'], ['Sammlung', 'diamond']]);
  });

  it('assigns class colors by slug and lists only present classes in the legend, by label', () => {
    const all = [node('a', { classId: 'c3' }), node('b', { classId: 'c1' }), node('c', { classId: 'c2' })];
    const scheme = buildColorScheme('class', all, labels);
    expect(scheme.colorOf(node('b', { classId: 'c1' }))).toBe(VIZ_COLORS[0]); // article
    expect(scheme.colorOf(node('c', { classId: 'c2' }))).toBe(VIZ_COLORS[1]); // report
    expect(scheme.colorOf(node('a', { classId: 'c3' }))).toBe(VIZ_COLORS[2]); // slip
    const legend = scheme.legend([all[0], all[1]]);
    expect(legend.map((e) => e.label)).toEqual(['Artikel', 'Zettel']);
    expect(legend[1].color).toBe(VIZ_COLORS[2]); // its own slot, not its rank among the visible
  });

  it('keeps every class on its colour when the labels change with the locale', () => {
    const all = [node('a', { classId: 'c1' }), node('b', { classId: 'c2' }), node('c', { classId: 'c3' })];
    const german = buildColorScheme('class', all, labels);
    // These labels sort in a different order.
    const english = buildColorScheme('class', all, { ...labels, classLabel: (id: string) => ({ c1: 'Zebra article', c2: 'A report', c3: 'Memo' })[id] ?? null });
    expect(all.map((n) => english.colorOf(n))).toEqual(all.map((n) => german.colorOf(n)));
    expect(english.legend(all).map((e) => e.label)).toEqual(['A report', 'Memo', 'Zebra article']);
  });

  it('folds categories beyond the palette into "other"', () => {
    const many = Array.from({ length: 10 }, (_, i) => node(`n${i}`, { namespaceId: `ns${i}` }));
    const scheme = buildColorScheme('namespace', many, labels);
    const colors = many.map((n) => scheme.colorOf(n));
    expect(colors.filter((c) => c === OTHER_COLOR)).toHaveLength(2);
    const legend = scheme.legend(many);
    expect(legend).toHaveLength(VIZ_COLORS.length + 1);
    expect(legend.at(-1)).toMatchObject({ label: 'Andere', color: OTHER_COLOR });
  });

  it('treats a node without the dimension as "other"', () => {
    const scheme = buildColorScheme('class', [node('a', { classId: undefined })], labels);
    expect(scheme.colorOf(node('a', { classId: undefined }))).toBe(OTHER_COLOR);
    expect(scheme.legend([node('a', { classId: undefined })]).map((e) => e.label)).toEqual(['Andere']);
  });
});
