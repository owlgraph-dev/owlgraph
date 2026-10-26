// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { assembleFooter } from './footer.server';
import type { FooterBrandingSettings, ResolvedTreeNode } from './types';

const NO_BRANDING: FooterBrandingSettings = { showLogo: false, title: null, tagline: null, logoHeight: 32 };

function footer(over: Partial<Parameters<typeof assembleFooter>[0]> = {}) {
  return assembleFooter({ tree: [], legalLinkRows: [], legalText: null, branding: NO_BRANDING, logoId: null, readable: new Set(), ...over });
}

const legalLink = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  label: id,
  target_type: 'url' as const,
  target_page_id: null,
  url: 'https://example.com/privacy',
  page_slug: null,
  namespace_slug: null,
  ...over,
});

describe('assembleFooter()', () => {
  it('resolves the legal line\'s links for the viewer, leaving out a page they cannot read', () => {
    const { legalLinks } = footer({
      legalLinkRows: [
        legalLink('privacy'),
        legalLink('imprint', { target_type: 'page', target_page_id: 'p1', url: null, page_slug: 'imprint' }),
        legalLink('internal', { target_type: 'page', target_page_id: 'p2', url: null, page_slug: 'internal' }),
      ],
      readable: new Set(['p1']),
    });
    expect(legalLinks).toEqual([
      { id: 'privacy', label: 'privacy', href: 'https://example.com/privacy', external: true },
      { id: 'imprint', label: 'imprint', href: '/imprint', external: false },
    ]);
  });

  it('keeps legal text as written, and none when it is only whitespace', () => {
    expect(footer({ legalText: '© 2026 Org' }).legalText).toBe('© 2026 Org');
    expect(footer({ legalText: '   ' }).legalText).toBeNull();
  });

  it('has no branding block when nothing is set', () => {
    expect(footer().branding).toBeNull();
  });

  it('shows the logo only while one exists, whatever the setting says', () => {
    const wants = { ...NO_BRANDING, showLogo: true };
    expect(footer({ branding: wants, logoId: null }).branding).toBeNull();
    expect(footer({ branding: { ...wants, title: 'Org' }, logoId: null }).branding).toMatchObject({ showLogo: false, logoUrl: null, title: 'Org' });
    expect(footer({ branding: wants, logoId: 'a1' }).branding).toMatchObject({ showLogo: true, logoUrl: '/api/media/branding/logo/a1' });
    expect(footer({ branding: { ...NO_BRANDING, tagline: 'Docs' }, logoId: 'a1' }).branding).toMatchObject({ showLogo: false, logoUrl: null, tagline: 'Docs' });
  });

  it('takes only groups as columns, whatever links sit at the top of the tree', () => {
    const tree: ResolvedTreeNode[] = [
      { id: 'stray', kind: 'link', label: 'Stray', href: '/x', external: false },
      { id: 'col', kind: 'group', label: 'Column', children: [{ id: 'l', kind: 'link', label: 'L', href: '/l', external: false }] },
    ];
    expect(footer({ tree }).columns.map((c) => c.id)).toEqual(['col']);
  });
});
