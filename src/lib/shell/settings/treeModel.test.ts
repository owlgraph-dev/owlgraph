// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { activeItemId, leavesSettings, requiredActions, searchItems, visibleTree, type SettingsGroup } from './treeModel';

const s = (v: string) => () => v;

const TREE: SettingsGroup[] = [
  {
    id: 'personal',
    label: s('Persönlich'),
    items: [
      { id: 'profile', href: '/settings/profile', action: null, label: s('Profil'), description: s(''), keywords: s('Name, Avatar') },
      { id: 'api-tokens', href: '/settings/api-tokens', action: null, label: s('API-Tokens'), description: s(''), keywords: s('MCP') },
    ],
  },
  {
    id: 'appearance',
    label: s('Erscheinungsbild'),
    items: [
      { id: 'branding', href: '/settings/branding', action: 'branding:manage', label: s('Branding'), description: s(''), keywords: s('Logo, Typografie') },
      { id: 'fonts', href: '/settings/fonts', action: 'font:manage', label: s('Schriften'), description: s(''), keywords: s('woff2') },
    ],
  },
  {
    id: 'schema',
    label: s('Semantisches Schema'),
    items: [
      { id: 'schema-properties', href: '/settings/schema/properties', action: 'property:manage', label: s('Eigenschaften'), description: s(''), keywords: s('') },
      { id: 'schema-groups', href: '/settings/schema/groups', action: 'property-group:manage', label: s('Eigenschaftsgruppen'), description: s(''), keywords: s('') },
    ],
  },
];

describe('requiredActions', () => {
  it('lists each gating action once and skips ungated items', () => {
    expect(requiredActions(TREE)).toEqual(['branding:manage', 'font:manage', 'property:manage', 'property-group:manage']);
  });
});

describe('visibleTree', () => {
  it('keeps ungated items for everyone and drops groups left empty', () => {
    const v = visibleTree(TREE, new Set());
    expect(v.map((g) => g.id)).toEqual(['personal']);
    expect(v[0].items.map((i) => i.id)).toEqual(['profile', 'api-tokens']);
  });

  it('shows exactly the granted sections, keeping tree order', () => {
    const v = visibleTree(TREE, new Set(['font:manage', 'property-group:manage']));
    expect(v.map((g) => g.id)).toEqual(['personal', 'appearance', 'schema']);
    expect(v[1].items.map((i) => i.id)).toEqual(['fonts']);
    expect(v[2].items.map((i) => i.id)).toEqual(['schema-groups']);
  });
});

describe('activeItemId', () => {
  it('resolves the overview only for the root and unknown paths', () => {
    expect(activeItemId(TREE, '/settings')).toBe('overview');
    expect(activeItemId(TREE, '/settings/')).toBe('overview');
    expect(activeItemId(TREE, '/settings/nope')).toBe('overview');
  });

  it('matches an item exactly or as a /-bounded prefix, never by bare prefix', () => {
    expect(activeItemId(TREE, '/settings/profile')).toBe('profile');
    expect(activeItemId(TREE, '/settings/profile/')).toBe('profile');
    expect(activeItemId(TREE, '/settings/profile/sub')).toBe('profile');
    expect(activeItemId(TREE, '/settings/profiles')).toBe('overview');
  });

  it('prefers the longest matching href for nested sections', () => {
    expect(activeItemId(TREE, '/settings/schema/groups')).toBe('schema-groups');
    expect(activeItemId(TREE, '/settings/schema/groupsx')).toBe('overview');
  });
});

describe('leavesSettings', () => {
  it('is false for the overview and every section under /settings', () => {
    expect(leavesSettings('/settings')).toBe(false);
    expect(leavesSettings('/settings/profile')).toBe(false);
    expect(leavesSettings('/settings/schema/groups')).toBe(false);
  });

  it('is true for a page outside Settings, a look-alike prefix included', () => {
    expect(leavesSettings('/-/about')).toBe(true);
    expect(leavesSettings('/settingsx')).toBe(true);
  });
});

describe('searchItems', () => {
  it('returns nothing for an empty query', () => {
    expect(searchItems(TREE, '')).toEqual([]);
    expect(searchItems(TREE, '   ')).toEqual([]);
  });

  it('matches labels, keywords and group labels case-insensitively, in tree order', () => {
    expect(searchItems(TREE, 'logo').map((h) => h.item.id)).toEqual(['branding']);
    expect(searchItems(TREE, 'SCHEMA').map((h) => h.item.id)).toEqual(['schema-properties', 'schema-groups']);
    expect(searchItems(TREE, 'eigenschaft').map((h) => h.item.id)).toEqual(['schema-properties', 'schema-groups']);
  });

  it('ranks a label hit before a keyword-only hit, each in tree order', () => {
    const tree: SettingsGroup[] = [
      { id: 'a', label: s('A'), items: [{ id: 'kw', href: '/settings/kw', action: null, label: s('Zed'), description: s(''), keywords: s('token') }] },
      { id: 'b', label: s('B'), items: [{ id: 'lbl', href: '/settings/lbl', action: null, label: s('Token'), description: s(''), keywords: s('') }] },
    ];
    expect(searchItems(tree, 'token').map((h) => h.item.id)).toEqual(['lbl', 'kw']);
  });

  it('requires every term to match', () => {
    expect(searchItems(TREE, 'eigenschaft gruppen').map((h) => h.item.id)).toEqual(['schema-groups']);
    expect(searchItems(TREE, 'logo mcp')).toEqual([]);
  });

  it('only ever searches the tree it is given, so a filtered tree cannot leak', () => {
    const editorTree = visibleTree(TREE, new Set());
    expect(searchItems(editorTree, 'logo')).toEqual([]);
  });
});
