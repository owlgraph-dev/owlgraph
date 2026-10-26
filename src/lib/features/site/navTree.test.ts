// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { buildAdminTree, resolveTree, type TreeNodeAdminRow } from './navTree.server';

function row(overrides: Partial<TreeNodeAdminRow>): TreeNodeAdminRow {
  return {
    id: 'id',
    consumer: 'nav',
    parent_id: null,
    kind: 'link',
    position: 0,
    label: 'Label',
    target_type: 'url',
    target_page_id: null,
    url: 'https://example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    page_title: null,
    page_slug: null,
    namespace_slug: null,
    ...overrides
  };
}

describe('buildAdminTree() — assembles the flat admin row list into a one-level tree', () => {
  it('nests children under their parent group, in position order', () => {
    const rows: TreeNodeAdminRow[] = [
      row({ id: 'link-a', label: 'A', position: 0 }),
      row({ id: 'group-1', kind: 'group', label: 'Group', position: 1, target_type: null, url: null }),
      row({ id: 'child-2', parent_id: 'group-1', label: 'Child 2', position: 1 }),
      row({ id: 'child-1', parent_id: 'group-1', label: 'Child 1', position: 0 })
    ];

    const tree = buildAdminTree(rows);

    expect(tree.map((n) => n.id)).toEqual(['link-a', 'group-1']);
    const group = tree.find((n) => n.id === 'group-1')!;
    expect(group.children.map((c) => c.id)).toEqual(['child-2', 'child-1']);
  });

  it('gives a top-level link an empty children array and a top-level group with no rows an empty one too', () => {
    const rows: TreeNodeAdminRow[] = [row({ id: 'link-a' }), row({ id: 'group-1', kind: 'group', label: 'Empty group', target_type: null, url: null })];

    const tree = buildAdminTree(rows);

    expect(tree.find((n) => n.id === 'link-a')!.children).toEqual([]);
    expect(tree.find((n) => n.id === 'group-1')!.children).toEqual([]);
  });

  it('drops orphaned rows (parent_id pointing at nothing) from the top level — they only ever show up nested', () => {
    const rows: TreeNodeAdminRow[] = [row({ id: 'orphan', parent_id: 'missing-group' })];

    const tree = buildAdminTree(rows);

    expect(tree).toEqual([]);
  });

  it('returns an empty tree for an empty row list', () => {
    expect(buildAdminTree([])).toEqual([]);
  });
});

describe('resolveTree() — the tree a viewer sees', () => {
  const READABLE = new Set(['page-public']);
  const pageLink = (id: string, pageId: string, parent: string | null = null) =>
    row({ id, parent_id: parent, target_type: 'page', target_page_id: pageId, url: null, page_slug: `${pageId}-slug`, label: id });
  const urlLink = (id: string, url: string, parent: string | null = null) => row({ id, parent_id: parent, url, label: id });
  const group = (id: string) => row({ id, kind: 'group', target_type: null, url: null, label: id });

  it('links a readable page at its current path, under its namespace when it has one', () => {
    const tree = resolveTree([pageLink('home', 'page-public'), { ...pageLink('docs', 'page-public'), namespace_slug: 'handbook' }], READABLE);
    expect(tree).toEqual([
      { id: 'home', kind: 'link', label: 'home', href: '/page-public-slug', external: false },
      { id: 'docs', kind: 'link', label: 'docs', href: '/handbook/page-public-slug', external: false },
    ]);
  });

  it('leaves out a link to a page the viewer cannot read, or one whose page is gone', () => {
    const gone = { ...pageLink('gone', 'page-public'), page_slug: null };
    expect(resolveTree([pageLink('secret', 'page-restricted'), gone], READABLE)).toEqual([]);
  });

  it('keeps a link to a page of the site itself in the tab', () => {
    const tree = resolveTree([urlLink('search', '/search?class=concept'), urlLink('protocol-relative', '//evil.example/x')], READABLE);
    expect(tree).toEqual([
      { id: 'search', kind: 'link', label: 'search', href: '/search?class=concept', external: false },
      { id: 'protocol-relative', kind: 'link', label: 'protocol-relative', href: '#', external: true },
    ]);
  });

  it('marks a url link external and lets only safe targets through', () => {
    const tree = resolveTree([urlLink('site', 'https://example.com'), urlLink('bad', 'javascript:alert(1)')], READABLE);
    expect(tree).toEqual([
      { id: 'site', kind: 'link', label: 'site', href: 'https://example.com', external: true },
      { id: 'bad', kind: 'link', label: 'bad', href: '#', external: true },
    ]);
  });

  it('nests a group\'s links and drops a group left with none the viewer can follow', () => {
    const tree = resolveTree(
      [group('kept'), group('emptied'), urlLink('a', 'https://a.example', 'kept'), pageLink('b', 'page-restricted', 'emptied')],
      READABLE
    );
    expect(tree).toEqual([{ id: 'kept', kind: 'group', label: 'kept', children: [{ id: 'a', kind: 'link', label: 'a', href: 'https://a.example', external: true }] }]);
  });
});
