// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { classPropertySlots, mergeChainDefinitions } from './propertyGroups';

describe('mergeChainDefinitions — property accumulation down a class chain', () => {
  const invoice = { slug: 'invoice', definitions: [{ name: 'invoice:number', label: 'Number', datatype: 'text' }] };
  const documents = {
    slug: 'documents',
    definitions: [
      { name: 'documents:author', label: 'Author', datatype: 'text' },
      { name: 'documents:abstract', label: 'Abstract', datatype: 'longtext' },
    ],
  };

  it('concatenates the chain nearest-first: the own class\'s fields, then the inherited ones', () => {
    expect(mergeChainDefinitions([invoice, documents]).map((d) => d.name)).toEqual(['invoice:number', 'documents:author', 'documents:abstract']);
  });

  it('a group attached at two levels contributes once — the nearer occurrence wins', () => {
    const nearer = { slug: 'documents', definitions: [{ name: 'documents:author', label: 'Author (override)', datatype: 'text' }] };
    const merged = mergeChainDefinitions([nearer, documents]);
    expect(merged.map((d) => d.name)).toEqual(['documents:author', 'documents:abstract']);
    expect(merged[0].label).toBe('Author (override)');
  });

  it('an empty chain yields no fields', () => {
    expect(mergeChainDefinitions([])).toEqual([]);
  });
});

const defs = [
  { name: 'wp:descriptor', label: 'Descriptor', datatype: 'text' },
  { name: 'wp:abstract', label: 'Abstract', datatype: 'longtext' },
];

describe('classPropertySlots — class definitions as presets over the property mechanisms', () => {
  it('unclassified (no definitions): everything is a free page-wide property', () => {
    const r = classPropertySlots([], [{ name: 'core:status', value: 'active' }]);
    expect(r.slots).toEqual([]);
    expect(r.conflicts).toEqual([]);
    expect(r.free).toEqual([{ name: 'core:status', value: 'active' }]);
  });

  it('every definition becomes a slot, prefilled from the page-wide value or blank', () => {
    const r = classPropertySlots(defs, [
      { name: 'wp:descriptor', value: 'WP-1' },
      { name: 'core:status', value: 'active' },
    ]);
    expect(r.slots).toEqual([
      { name: 'wp:descriptor', label: 'Descriptor', datatype: 'text', value: 'WP-1' },
      { name: 'wp:abstract', label: 'Abstract', datatype: 'longtext', value: '' },
    ]);
    expect(r.free).toEqual([{ name: 'core:status', value: 'active' }]);
    expect(r.conflicts).toEqual([]);
  });

  it('a definition asserted inline in the content gets no slot (content wins)', () => {
    const r = classPropertySlots(defs, [], [{ name: 'wp:descriptor', value: 'from content' }]);
    expect(r.slots.map((s) => s.name)).toEqual(['wp:abstract']);
    expect(r.conflicts).toEqual([]);
  });

  it('inline + page-wide for the same definition is a conflict, never a slot', () => {
    const r = classPropertySlots(
      defs,
      [{ name: 'wp:descriptor', value: 'stale' }],
      [
        { name: 'wp:descriptor', value: 'a' },
        { name: 'wp:descriptor', value: 'b' },
      ]
    );
    expect(r.slots.map((s) => s.name)).toEqual(['wp:abstract']);
    expect(r.conflicts).toEqual([{ name: 'wp:descriptor', label: 'Descriptor', inlineValues: ['a', 'b'], manualValue: 'stale' }]);
    // The stale value is reported, not silently listed as a free property.
    expect(r.free).toEqual([]);
  });

  it('a page-wide value for a definition never leaks into the free list', () => {
    const r = classPropertySlots(defs, [{ name: 'wp:abstract', value: 'x' }]);
    expect(r.free).toEqual([]);
    expect(r.slots.find((s) => s.name === 'wp:abstract')?.value).toBe('x');
  });
});
