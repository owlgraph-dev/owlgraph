// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { resolveTree, type TreeNodeAdminRow } from './navTree.server';
import { assembleFooter } from './footer.server';
import type { FooterBrandingSettings } from './types';

const NO_BRANDING: FooterBrandingSettings = { showLogo: false, title: null, tagline: null, logoHeight: 32 };

function row(overrides: Partial<TreeNodeAdminRow>): TreeNodeAdminRow {
  return {
    id: 'id',
    consumer: 'footer',
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
    ...overrides,
  };
}

const column = (id: string, position = 0) => row({ id, kind: 'group', label: id, position, target_type: null, url: null });
const link = (id: string, parent: string) => row({ id, parent_id: parent, label: id, url: `https://example.com/${id}` });

const footerOf = (rows: TreeNodeAdminRow[]) =>
  assembleFooter({ tree: resolveTree(rows, new Set()), legalLinkRows: [], legalText: null, branding: NO_BRANDING, logoId: null, readable: new Set() });

describe("a footer column with no links", () => {
  it("is left out of the viewer's footer, not shown by its title alone", () => {
    expect(footerOf([column('Empty column')]).columns).toEqual([]);
  });

  it('is left out beside a column that has links, which stays as it is', () => {
    const { columns } = footerOf([column('Empty column', 0), column('Links', 1), link('Imprint', 'Links')]);
    expect(columns).toEqual([
      { id: 'Links', kind: 'group', label: 'Links', children: [{ id: 'Imprint', kind: 'link', label: 'Imprint', href: 'https://example.com/Imprint', external: true }] },
    ]);
  });
});
