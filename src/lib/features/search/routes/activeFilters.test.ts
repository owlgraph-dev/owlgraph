// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { activeFilters } from './activeFilters';

const none = { class: null, exact: false, tags: [] as string[], type: null, namespace: null };
const labels = { classLabel: 'Concept', namespaceName: 'Wiki' };

describe('activeFilters', () => {
  it('has nothing for an unfiltered search', () => {
    expect(activeFilters(none, labels)).toEqual([]);
  });

  it('names a class with its subclasses, and alone with exact', () => {
    expect(activeFilters({ ...none, class: 'concept' }, labels)).toEqual([{ key: 'class', label: 'Concept + subclasses', remove: { class: null, exact: false } }]);
    expect(activeFilters({ ...none, class: 'concept', exact: true }, labels)[0].label).toBe('Concept');
  });

  it('has one chip per tag, each removing itself alone', () => {
    const chips = activeFilters({ ...none, tags: ['ai', 'ml'] }, labels);
    expect(chips.map((c) => c.label)).toEqual(['ai', 'ml']);
    expect(chips[0].remove).toEqual({ tags: ['ml'] });
    expect(chips[1].remove).toEqual({ tags: ['ai'] });
  });

  it('names the type and the namespace, and counts every filter', () => {
    const chips = activeFilters({ class: 'concept', exact: false, tags: ['ai'], type: 'page', namespace: 'wiki' }, labels);
    expect(chips.map((c) => c.key)).toEqual(['class', 'tag:ai', 'type', 'namespace']);
    expect(chips.find((c) => c.key === 'type')?.label).toBe('Page');
    expect(chips.find((c) => c.key === 'namespace')).toEqual({ key: 'namespace', label: 'Wiki', remove: { namespace: null } });
    expect(chips).toHaveLength(4);
  });
});
