// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { NodeSearchResult } from '$lib/features/search';
import { appendPage, createRowTypes, pickerNamespace, scopeTypes } from './nodePicker';
import { NODE_TYPES, type NodeType } from '$lib/features/nodes';

const ALL: NodeType[] = [...NODE_TYPES];
const base = { query: 'Roadmap', scope: 'all' as const, types: ALL, create: ['page', 'collection', 'document'] as NodeType[], exact: [] as NodeType[], canCreate: true };

describe('createRowTypes — the create-row decision table', () => {
  it('offers nothing before a term is typed', () => {
    expect(createRowTypes({ ...base, query: '' })).toEqual([]);
    expect(createRowTypes({ ...base, query: '   ' })).toEqual([]);
  });

  it('under "All", one row per creatable type, in the create order', () => {
    expect(createRowTypes(base)).toEqual(['page', 'collection', 'document']);
  });

  it('under a type\'s chip, that type only — and nothing when it is not creatable', () => {
    expect(createRowTypes({ ...base, scope: 'collection' })).toEqual(['collection']);
    expect(createRowTypes({ ...base, scope: 'document', create: ['page'] })).toEqual([]);
  });

  it('never for a type the picker does not offer', () => {
    expect(createRowTypes({ ...base, types: ['collection'] })).toEqual(['collection']);
  });

  it('no row for a type that has a node titled exactly as typed', () => {
    expect(createRowTypes({ ...base, exact: ['page'] })).toEqual(['collection', 'document']);
    expect(createRowTypes({ ...base, scope: 'page', exact: ['page'] })).toEqual([]);
  });

  it('nothing for a viewer who may not make nodes, or a picker that makes none', () => {
    expect(createRowTypes({ ...base, canCreate: false })).toEqual([]);
    expect(createRowTypes({ ...base, create: null })).toEqual([]);
  });

  it('a type named twice is offered once', () => {
    expect(createRowTypes({ ...base, create: ['page', 'page'] })).toEqual(['page']);
  });
});

describe('scopeTypes', () => {
  it('asks for every type under "All", one under its chip', () => {
    expect(scopeTypes('all', ALL)).toEqual(ALL);
    expect(scopeTypes('document', ALL)).toEqual(['document']);
    expect(scopeTypes('document', ['page'])).toEqual([]);
  });
});

describe('pickerNamespace', () => {
  const namespaces = [
    { id: 'n1', name: 'Default', slug: 'default', isDefault: true },
    { id: 'n2', name: 'Research', slug: 'research', isDefault: false },
  ];
  it('names the namespace asked for; the default one has no address part', () => {
    expect(pickerNamespace(namespaces, 'n2')).toEqual({ id: 'n2', name: 'Research', slug: 'research' });
    expect(pickerNamespace(namespaces, 'n1')).toEqual({ id: 'n1', name: 'Default', slug: null });
  });
  it('is null for none, or one not among them', () => {
    expect(pickerNamespace(namespaces, null)).toBeNull();
    expect(pickerNamespace(namespaces, 'n9')).toBeNull();
  });
});

describe('appendPage', () => {
  const node = (id: string): NodeSearchResult => ({ type: 'page', id, title: id, slug: id, href: `/${id}`, namespace: null, plugin: null, pluginLabel: null });
  it('keeps the order and shows each node once', () => {
    expect(appendPage([node('a'), node('b')], [node('b'), node('c')]).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});
