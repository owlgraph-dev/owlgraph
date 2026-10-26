// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { newQuickLink, quickLinkFacets, quickLinkEdges, quickLinkTarget, quickLinkTargetAttrs } from './model';
import { BUILTIN_BLOCK_DEFAULTS } from '../../capabilities/defaults/blockDefaults';

const nodeHref = (id: string) => `/node-${id}`;

describe('quickLinkTarget', () => {
  it('opens a path on this site in the same tab', () => {
    expect(quickLinkTarget({ refType: 'url', url: '/search' }, nodeHref)).toEqual({ href: '/search', external: false });
    expect(quickLinkTarget({ refType: 'url', url: '/search?class=concept&view=grid' }, nodeHref)).toEqual({ href: '/search?class=concept&view=grid', external: false });
  });

  it('opens an external address in a new tab, and an unsafe one goes nowhere', () => {
    expect(quickLinkTarget({ refType: 'url', url: 'https://example.org' }, nodeHref)).toEqual({ href: 'https://example.org', external: true });
    expect(quickLinkTarget({ refType: 'url', url: '//evil.example/x' }, nodeHref)).toEqual({ href: '#', external: true });
    expect(quickLinkTarget({ refType: 'url', url: 'javascript:alert(1)' }, nodeHref)).toEqual({ href: '#', external: true });
  });

  it('links a page or a document through the slug map', () => {
    expect(quickLinkTarget({ refType: 'page', targetPageId: 'p1' }, nodeHref)).toEqual({ href: '/node-p1', external: false });
    expect(quickLinkTarget({ refType: 'document', targetDocId: 'd1' }, nodeHref)).toEqual({ href: '/node-d1', external: false });
  });
});

describe('quickLinkTargetAttrs', () => {
  it('clears the other kinds of target, so a retarget leaves nothing behind', () => {
    expect(quickLinkTargetAttrs({ refType: 'url', url: '/search', label: 'Search' })).toEqual({ refType: 'url', targetPageId: null, targetDocId: null, url: '/search', targetSlug: '' });
    expect(quickLinkTargetAttrs({ refType: 'page', targetPageId: 'p1', targetSlug: 'home', label: 'Home' })).toEqual({ refType: 'page', targetPageId: 'p1', targetDocId: null, url: '', targetSlug: 'home' });
  });
});

describe('a new quick link', () => {
  it('is a blank page card with the given id', () => {
    expect(newQuickLink('b1')).toMatchObject({ type: 'quickLink', attrs: { refType: 'page', targetPageId: null, label: 'Untitled link', blockId: 'b1' } });
  });
});

describe("the quick link's facets", () => {
  it('declares one edge per node target, typed and with properties only when typed', () => {
    expect(quickLinkEdges({ targetPageId: 'p1', properties: { year: '2020' } })).toEqual([{ targetId: 'p1', relationshipType: null, properties: [] }]);
    expect(quickLinkEdges({ targetDocId: 'd1', relationshipType: 'cites', properties: { year: '2020', '': 'x' } })).toEqual([
      { targetId: 'd1', relationshipType: 'cites', properties: [{ name: 'year', value: '2020' }] },
    ]);
    expect(quickLinkEdges({ refType: 'url', url: 'https://example.org' })).toEqual([]);
  });

  it('is searchable by its label and previews its target', () => {
    expect(quickLinkFacets.text!({ label: '  Read more ' })).toBe('Read more');
    expect(quickLinkFacets.summary!({ url: 'https://example.org' })).toBe('→ https://example.org');
  });

  it('is a ground only as a button', () => {
    const ground = quickLinkFacets.ground!;
    expect(ground.defaultBg({ variant: 'button' }, BUILTIN_BLOCK_DEFAULTS)).toBe('token:accent');
    expect(ground.defaultBg({ variant: 'link' }, BUILTIN_BLOCK_DEFAULTS)).toBeNull();
    expect(ground.surface({ variant: 'link', surface: { desktop: { border: '#000', radius: 4 } } })).toEqual({ desktop: { radius: 4 } });
  });
});
