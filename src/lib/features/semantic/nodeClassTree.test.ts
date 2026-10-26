// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { orderClassTree } from './nodeClassTree';
import { localize, compareLabels, type LocalizedText } from '$lib/platform/i18n/localizedText';

type Row = { id: string; parent_id: string | null; slug: string; label: LocalizedText };

const rows: Row[] = [
  { id: 'doc', parent_id: 'root', slug: 'document', label: { en: 'Document', de: 'Dokument' } },
  { id: 'inv', parent_id: 'doc', slug: 'invoice', label: { en: 'Invoice', de: 'Rechnung' } },
  { id: 'page', parent_id: 'root', slug: 'page', label: { en: 'Page', de: 'Seite' } },
  { id: 'root', parent_id: null, slug: 'node', label: { en: 'Node', de: 'Knoten' } },
  { id: 'art', parent_id: 'page', slug: 'article', label: { en: 'Article', de: 'Zeitungsartikel' } },
  { id: 'note', parent_id: 'page', slug: 'note', label: { en: 'Note', de: 'Anmerkung' } },
];

const order = (locale: 'en' | 'de') =>
  orderClassTree(rows, (a, b) => compareLabels(localize(a.label, a.slug, locale), localize(b.label, b.slug, locale), locale) || a.slug.localeCompare(b.slug)).map((r) => r.slug);

describe('orderClassTree — the catalog order every picker reads as a tree', () => {
  it('walks depth-first: each class directly followed by its subtree', () => {
    expect(order('en')).toEqual(['node', 'document', 'invoice', 'page', 'article', 'note']);
  });

  it('sorts siblings by the label resolved for the locale', () => {
    // German: Anmerkung < Zeitungsartikel, so note now precedes article.
    expect(order('de')).toEqual(['node', 'document', 'invoice', 'page', 'note', 'article']);
  });

  it('starts a tree of its own for a row whose parent is not in the list', () => {
    const orphan = { id: 'x', parent_id: 'gone', slug: 'orphan', label: {} };
    expect(orderClassTree([...rows, orphan], (a, b) => a.slug.localeCompare(b.slug)).map((r) => r.slug)).toContain('orphan');
  });

  it('terminates on a cycle the constraints should make impossible', () => {
    const cyclic = [
      { id: 'a', parent_id: null, slug: 'a', label: {} },
      { id: 'b', parent_id: 'c', slug: 'b', label: {} },
      { id: 'c', parent_id: 'b', slug: 'c', label: {} },
    ];
    expect(orderClassTree(cyclic, (x, y) => x.slug.localeCompare(y.slug)).map((r) => r.slug)).toEqual(['a']);
  });
});
