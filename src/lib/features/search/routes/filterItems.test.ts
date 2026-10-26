// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { NodeClassOption } from '$lib/features/semantic';
import { ALL, classPickerItems, namespacePickerItems, orNull, sortItems, typePickerItems } from './filterItems';

const option = (slug: string, label: string, depth: number): NodeClassOption =>
  ({ id: `id-${slug}`, slug, label, description: '', kind: 'domain', parentId: null, nodeType: 'page', depth }) as NodeClassOption;

describe('filterItems', () => {
  it('keys classes by their key, after the no-filter item', () => {
    const items = classPickerItems([option('page', 'Page', 1), option('concept', 'Concept', 2)]);
    expect(items[0].value).toBe(ALL);
    expect(items.slice(1).map((i) => i.value)).toEqual(['page', 'concept']);
    expect(items[2].label.endsWith('Concept')).toBe(true);
  });

  it('offers relevance only with a term', () => {
    expect(sortItems(false).map((s) => s.value)).toEqual(['updated', 'created', 'title']);
    expect(sortItems(true).map((s) => s.value)).toEqual(['relevance', 'updated', 'created', 'title']);
  });

  it('starts type and namespace with the no-filter item, namespaces by their URL value', () => {
    expect(typePickerItems().map((t) => t.value)).toEqual([ALL, 'page', 'document', 'collection']);
    expect(namespacePickerItems([{ value: '_default', name: 'Default' }, { value: 'wiki', name: 'Wiki' }]).map((n) => n.value)).toEqual([ALL, '_default', 'wiki']);
  });

  it('reads the no-filter item as null', () => {
    expect(orNull(ALL)).toBeNull();
    expect(orNull('page')).toBe('page');
  });
});
