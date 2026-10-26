// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { countLine } from './countLine';

const none = { q: '', type: null, exact: false, tags: [] as string[] };

describe('countLine', () => {
  it('counts results, singular and plural', () => {
    expect(countLine({ total: 1, applied: none, classLabel: null, namespaceName: null }, 'en')).toBe('1 result');
    expect(countLine({ total: 0, applied: none, classLabel: null, namespaceName: null }, 'en')).toBe('0 results');
    expect(countLine({ total: 24, applied: none, classLabel: null, namespaceName: null }, 'de')).toBe('24 Ergebnisse');
    expect(countLine({ total: 1, applied: none, classLabel: null, namespaceName: null }, 'de')).toBe('1 Ergebnis');
  });

  it('names pages or documents when the type filter does', () => {
    expect(countLine({ total: 18, applied: { ...none, type: 'page' }, classLabel: null, namespaceName: null }, 'de')).toBe('18 Seiten');
    expect(countLine({ total: 1, applied: { ...none, type: 'document' }, classLabel: null, namespaceName: null }, 'en')).toBe('1 document');
  });

  it('restates every applied filter in prose', () => {
    const applied = { q: 'graph', type: 'page' as const, exact: false, tags: ['ai', 'ml'] };
    expect(countLine({ total: 24, applied, classLabel: 'Konzept', namespaceName: 'Wiki' }, 'de')).toBe(
      '24 Seiten für „graph“ · Klasse Konzept (inkl. Unterklassen) · mit Tag ai oder ml · im Namensraum Wiki'
    );
    expect(countLine({ total: 2, applied: { ...applied, exact: true, tags: ['ai', 'ml', 'kg'] }, classLabel: 'Concept', namespaceName: null }, 'en')).toBe(
      '2 pages for “graph” · exactly class Concept · tagged ai, ml, or kg'
    );
  });
});
