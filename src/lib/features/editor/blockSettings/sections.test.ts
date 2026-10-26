// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { capabilitySectionsFor, capabilitySupport, emptyKindFor, placementRowsFor, spacingRowsFor, splitCrumbs } from './sections';

const none = () => false;
const supports = (caps: string[]) => (cap: string) => caps.includes(cap);

describe('capabilitySectionsFor', () => {
  it('gives a paragraph the Abstand section and nothing else', () => {
    expect(capabilitySectionsFor(supports(['typography']), 'paragraph', {})).toEqual(['spacing']);
  });

  it('gives the page its widths, its rhythm and its ground', () => {
    expect(capabilitySectionsFor(none, 'page', {})).toEqual(['layout', 'spacing', 'surface']);
  });

  it('orders container sections layout → spacing → surface', () => {
    expect(capabilitySectionsFor(supports(['spacing', 'surface']), 'grid', {})).toEqual(['layout', 'spacing', 'surface']);
    expect(capabilitySectionsFor(supports(['spacing', 'surface', 'layout']), 'flexContainer', {})).toEqual(['layout', 'spacing', 'surface']);
  });

  it('gives the grid cell an alignment section and no layout section', () => {
    expect(capabilitySectionsFor(supports(['typography', 'spacing', 'surface']), 'gridCell', {})).toEqual(['spacing', 'surface', 'alignment']);
    expect(capabilitySectionsFor(supports(['typography', 'spacing', 'surface']), 'flexCell', {})).toEqual(['spacing', 'surface']);
    expect(capabilitySectionsFor(supports(['typography', 'spacing', 'surface', 'flexItem']), 'flexCell', {})).toEqual(['spacing', 'surface', 'flexItem']);
    expect(capabilitySectionsFor(supports(['typography', 'spacing', 'surface', 'flexItem']), 'gridCell', {})).toEqual(['spacing', 'surface', 'alignment']);
  });

  it('gives a page section its spacing and surface, and no container layout section', () => {
    expect(capabilitySectionsFor(supports(['spacing', 'surface']), 'pageSection', {})).toEqual(['spacing', 'surface']);
    expect(spacingRowsFor(supports(['spacing', 'surface']), 'pageSection')).toEqual({ blockSpace: true, spaceAbove: true, pad: true });
  });

  it('gates the query block on its result format, not on node capabilities — except its placement, a node concern', () => {
    expect(capabilitySectionsFor(none, 'queryBlock', { format: 'template' })).toEqual(['layout', 'placement', 'spacing', 'surface']);
    expect(capabilitySectionsFor(none, 'queryBlock', {})).toEqual(['layout', 'placement', 'spacing', 'surface']);
  });

  it('gives a boxed block its Platzierung (the alignment), a block in a section its moves, a full band neither', () => {
    expect(capabilitySectionsFor(supports(['placement']), 'image', {})).toEqual(['placement', 'spacing']);
    expect(placementRowsFor(supports(['placement']), 'image', {}, false)).toEqual({ moves: false, align: true });
    expect(capabilitySectionsFor(supports(['spacing', 'surface', 'placement']), 'grid', {})).toEqual(['layout', 'placement', 'spacing', 'surface']);
    expect(capabilitySectionsFor(supports(['spacing', 'surface', 'placement']), 'grid', { width: 'full' })).toEqual(['layout', 'spacing', 'surface']);
    // A text block's alignment is typography's, but in a section it moves.
    expect(capabilitySectionsFor(supports(['typography']), 'paragraph', {}, true)).toEqual(['placement', 'spacing']);
    expect(placementRowsFor(supports(['typography']), 'paragraph', {}, true)).toEqual({ moves: true, align: false });
    // A section's place is its span.
    expect(capabilitySectionsFor(supports(['spacing', 'surface']), 'pageSection', {})).toEqual(['spacing', 'surface']);
  });

  it('gives the quick link its space above, and its surface for the variants that carry one', () => {
    expect(capabilitySectionsFor(supports(['typography', 'surface']), 'quickLink', {})).toEqual(['spacing']);
    expect(capabilitySectionsFor(supports(['typography', 'surface']), 'quickLink', { variant: 'outlined' })).toEqual(['spacing', 'surface']);
    expect(capabilitySectionsFor(supports(['typography', 'surface']), 'quickLink', { surface: { desktop: { bg: '#2563eb' } } })).toEqual(['spacing', 'surface']);
  });
});

describe('emptyKindFor', () => {
  it('points text blocks to the toolbar and everything else to a plain empty line', () => {
    expect(emptyKindFor('paragraph')).toBe('toolbar');
    expect(emptyKindFor('heading')).toBe('toolbar');
    expect(emptyKindFor('listItem')).toBe('toolbar');
    expect(emptyKindFor('htmlBlock')).toBe('no-settings');
  });
});

describe('splitCrumbs', () => {
  it('keeps short paths whole', () => {
    expect(splitCrumbs([])).toEqual({ hidden: [], visible: [] });
    expect(splitCrumbs(['a'])).toEqual({ hidden: [], visible: ['a'] });
    expect(splitCrumbs(['a', 'b'])).toEqual({ hidden: [], visible: ['a', 'b'] });
  });

  it('collapses everything above the last two levels', () => {
    expect(splitCrumbs(['a', 'b', 'c'])).toEqual({ hidden: ['a'], visible: ['b', 'c'] });
    expect(splitCrumbs(['a', 'b', 'c', 'd', 'e'])).toEqual({ hidden: ['a', 'b', 'c'], visible: ['d', 'e'] });
  });
});

describe('spacingRowsFor', () => {
  it('the page is a flow and nothing else — no space above it, no authorable padding', () => {
    expect(spacingRowsFor(none, 'page')).toEqual({ blockSpace: true, spaceAbove: false, pad: false });
  });

  it('a container is both a flow and a block', () => {
    expect(spacingRowsFor(supports(['spacing']), 'grid')).toEqual({ blockSpace: true, spaceAbove: true, pad: true });
  });

  it('a cell is a flow but never a spacing target — the container gap governs between cells', () => {
    expect(spacingRowsFor(supports(['spacing']), 'gridCell')).toEqual({ blockSpace: true, spaceAbove: false, pad: true });
    expect(spacingRowsFor(supports(['spacing']), 'flexCell')).toEqual({ blockSpace: true, spaceAbove: false, pad: true });
    expect(spacingRowsFor(supports(['spacing']), 'tableCell')).toEqual({ blockSpace: true, spaceAbove: false, pad: true });
  });

  it('a leaf block gets a space above with no padding of its own', () => {
    expect(spacingRowsFor(supports(['typography']), 'paragraph')).toEqual({ blockSpace: false, spaceAbove: true, pad: false });
    expect(spacingRowsFor(supports(['typography']), 'heading')).toEqual({ blockSpace: false, spaceAbove: true, pad: false });
  });

  it('list items and the placeholder are never spacing targets', () => {
    expect(spacingRowsFor(none, 'listItem').spaceAbove).toBe(false);
    expect(spacingRowsFor(none, 'placeholder').spaceAbove).toBe(false);
  });
});

describe('capabilitySupport', () => {
  it('reads the query block from its format, everything else from the node', () => {
    expect(capabilitySupport(none, 'queryBlock', { format: 'template' })('spacing')).toBe(true);
    expect(capabilitySupport(none, 'queryBlock', {})('surface')).toBe(true);
    expect(capabilitySupport(none, 'paragraph', {})('spacing')).toBe(false);
    expect(capabilitySupport(supports(['spacing']), 'gridCell', {})('spacing')).toBe(true);
  });

  it('keeps the query block its padding row', () => {
    expect(spacingRowsFor(capabilitySupport(none, 'queryBlock', {}), 'queryBlock')).toEqual({
      blockSpace: true,
      spaceAbove: true,
      pad: true,
    });
  });
});
