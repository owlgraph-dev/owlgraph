// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { imagePlacement, normalizePlacement, placementClass, placementProps, placementVars, resolvedAlign, setPlacementAlign } from './placement';

const EDGE = 'var(--placement-edge, 0px)';

describe('placement', () => {
  it('stores nothing and renders nothing for Auto', () => {
    expect(placementVars(undefined, 'box')).toEqual({});
    expect(placementVars({}, 'image')).toEqual({});
    expect(placementClass(null, 'box')).toBe('');
    // Stretch is what a box renders anyway: nothing goes out, no class.
    expect(placementVars({ desktop: { align: 'stretch' } }, 'box')).toEqual({});
    expect(placementClass({ desktop: { align: 'stretch' } }, 'box')).toBe('');
  });

  it('makes a box content-sized and moves it by its margins, against the column edge', () => {
    expect(placementVars({ desktop: { align: 'end' } }, 'box')).toEqual({ '--placement-w-d': 'fit-content', '--placement-ml-d': 'auto' });
    expect(placementVars({ desktop: { align: 'start' } }, 'box')).toEqual({ '--placement-w-d': 'fit-content', '--placement-mr-d': 'auto' });
    expect(placementVars({ desktop: { align: 'center' } }, 'box')).toEqual({ '--placement-w-d': 'fit-content', '--placement-ml-d': 'auto', '--placement-mr-d': 'auto' });
    expect(placementClass({ desktop: { align: 'center' } }, 'box')).toBe('cap-placement');
  });

  it('emits a smaller tier only where it differs from the tier above', () => {
    // End on a desktop, start on a phone: the width stays, both margins swap.
    expect(placementVars({ desktop: { align: 'end' }, phone: { align: 'start' } }, 'box')).toEqual({
      '--placement-w-d': 'fit-content',
      '--placement-ml-d': 'auto',
      '--placement-ml-p': EDGE,
      '--placement-mr-p': 'auto',
    });
    // Stretch back on a phone restores the column's width there.
    expect(placementVars({ desktop: { align: 'center' }, phone: { align: 'stretch' } }, 'box')).toEqual({
      '--placement-w-d': 'fit-content',
      '--placement-ml-d': 'auto',
      '--placement-mr-d': 'auto',
      '--placement-w-p': 'auto',
      '--placement-ml-p': EDGE,
      '--placement-mr-p': EDGE,
    });
    // A tablet repeating the desktop value adds nothing.
    expect(placementVars({ desktop: { align: 'end' }, tablet: { align: 'end' } }, 'box')).toEqual({ '--placement-w-d': 'fit-content', '--placement-ml-d': 'auto' });
  });

  it('fills a card only where it is stretched', () => {
    expect(placementVars({ tablet: { align: 'stretch' } }, 'card')).toEqual({ '--quick-link-fill-t': '100%' });
    expect(placementVars({ desktop: { align: 'stretch' }, phone: { align: 'end' } }, 'card')).toEqual({
      '--quick-link-fill-d': '100%',
      '--placement-w-p': 'fit-content',
      '--placement-ml-p': 'auto',
      '--quick-link-fill-p': 'auto',
    });
  });

  it('moves an image within its frame, centred by default and never stretched', () => {
    expect(placementVars({ desktop: { align: 'end' } }, 'image')).toEqual({ '--placement-mr-d': '0px' });
    expect(placementVars({ desktop: { align: 'center' } }, 'image')).toEqual({});
    expect(placementVars({ desktop: { align: 'stretch' } }, 'image')).toEqual({});
    expect(resolvedAlign({ desktop: { align: 'stretch' } }, 'desktop', 'image')).toBeNull();
  });

  it("reads an image's old one-value align as its desktop placement until it has one of its own", () => {
    expect(imagePlacement({ align: 'right' })).toEqual({ desktop: { align: 'end' } });
    expect(imagePlacement({ align: 'center' })).toEqual({});
    expect(imagePlacement({ align: 'left', placement: { phone: { align: 'center' } } })).toEqual({ phone: { align: 'center' } });
  });

  it('cascades desktop-first and sanitizes what it is given', () => {
    const data = setPlacementAlign(setPlacementAlign({}, 'desktop', 'end'), 'phone', 'start');
    expect(resolvedAlign(data, 'tablet', 'box')).toBe('end');
    expect(resolvedAlign(data, 'phone', 'box')).toBe('start');
    expect(setPlacementAlign(data, 'phone', null)).toEqual({ desktop: { align: 'end' } });
    expect(normalizePlacement({ desktop: { align: 'left' }, tablet: { align: 'end', x: 1 }, phone: 'nope' })).toEqual({ tablet: { align: 'end' } });
    expect(placementVars({ desktop: { align: 'url(x)' } } as never, 'box')).toEqual({});
  });

  it('owns exactly the properties it can emit', () => {
    expect(placementProps('image')).toEqual(['--placement-ml-d', '--placement-ml-t', '--placement-ml-p', '--placement-mr-d', '--placement-mr-t', '--placement-mr-p']);
    expect(placementProps('card')).toHaveLength(12);
  });
});
