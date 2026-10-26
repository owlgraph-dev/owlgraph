// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  convertPageWidth,
  pageGutter,
  safePageGutter,
  setPageGutter,
  mentionsAllPageAttrs,
  normalizePageLayout,
  normalizePageSurface,
  pageAttrsForWrite,
  pageAttrsOf,
  pageGroundToken,
  safePageWidth,
  setPageGround,
  setPageWidth,
} from './pageAttrs';

describe('pageAttrsOf', () => {
  it('reads the settings off the doc root node, tolerating any older doc shape', () => {
    expect(pageAttrsOf(null)).toEqual({ spacing: {}, layout: {}, surface: {} });
    expect(pageAttrsOf({ attrs: { spacing: 'nope', layout: 3 } })).toEqual({ spacing: {}, layout: {}, surface: {} });
    expect(pageAttrsOf({ attrs: { spacing: { desktop: { blockSpace: 32 } } } }).spacing).toEqual({ desktop: { blockSpace: 32 } });
  });
});

describe('page widths', () => {
  it('accept px and rem within their bounds, canonically spelled', () => {
    expect(safePageWidth('read', '880px')).toBe('880px');
    expect(safePageWidth('read', ' 55.50rem ')).toBe('55.5rem');
    expect(safePageWidth('wide', '1400px')).toBe('1400px');
    expect(safePageWidth('read', '100px')).toBeNull();
    expect(safePageWidth('read', '151rem')).toBeNull();
    expect(safePageWidth('read', '880')).toBeNull();
    expect(safePageWidth('read', '880px;color:red')).toBeNull();
    expect(safePageWidth('read', 880)).toBeNull();
  });

  it('are stored on the desktop tier only; Auto stores nothing', () => {
    expect(setPageWidth({}, 'read', '880px')).toEqual({ widths: { desktop: { read: '880px' } } });
    expect(setPageWidth({ widths: { desktop: { read: '880px', wide: '1400px' } } }, 'read', null)).toEqual({ widths: { desktop: { wide: '1400px' } } });
    expect(setPageWidth({ widths: { desktop: { read: '880px' } } }, 'read', null)).toEqual({});
  });

  it('convert between units, clamped into the new bounds', () => {
    expect(convertPageWidth('read', { value: 880, unit: 'px' }, 'rem')).toBe('55rem');
    expect(convertPageWidth('read', { value: 55, unit: 'rem' }, 'px')).toBe('880px');
    expect(convertPageWidth('read', { value: 2400, unit: 'px' }, 'rem')).toBe('150rem');
  });

  it('convert a stored percentage to px against the canvas cap, clamped', () => {
    expect(safePageWidth('read', '50%')).toBe('900px');
    expect(safePageWidth('read', '10%')).toBe('320px');
    expect(normalizePageLayout({ widths: { desktop: { wide: '100%' } } })).toEqual({ widths: { desktop: { wide: '1800px' } } });
  });

  // `flow` is the default, never stored; `columns` without a template falls back to flow.
  it('never store the default mode or other tiers', () => {
    expect(normalizePageLayout({ mode: 'flow', widths: { tablet: { read: '600px' } } })).toEqual({});
    expect(normalizePageLayout({ mode: 'columns' })).toEqual({});
  });
});

describe('page gutters', () => {
  it('are px or rem within bounds, per tier, each tier on its own', () => {
    expect(safePageGutter('24px')).toBe('24px');
    expect(safePageGutter('1.5rem')).toBe('1.5rem');
    expect(safePageGutter('0px')).toBe('0px');
    expect(safePageGutter('200px')).toBeNull();
    expect(safePageGutter('10%')).toBeNull();
    const layout = setPageGutter({ widths: { desktop: { read: '880px' } } }, 'phone', '12px');
    expect(layout).toEqual({ widths: { desktop: { read: '880px' } }, gutters: { phone: '12px' } });
    expect(pageGutter(layout, 'phone')).toBe('12px');
    // An unset tier is Auto (the site's), never the page's larger one.
    expect(pageGutter(layout, 'tablet')).toBeNull();
    expect(setPageGutter(layout, 'phone', null)).toEqual({ widths: { desktop: { read: '880px' } } });
  });

  it('survive a width change, and a width survives a gutter change', () => {
    const layout = setPageWidth({ gutters: { desktop: '60px' } }, 'read', '700px');
    expect(layout).toEqual({ widths: { desktop: { read: '700px' } }, gutters: { desktop: '60px' } });
  });
});

describe('page ground', () => {
  it('is one of the page-strength theme colours, nothing else', () => {
    expect(setPageGround('token:subtle')).toEqual({ desktop: { bg: 'token:subtle' } });
    expect(setPageGround('token:accent')).toEqual({});
    expect(setPageGround('#ff0000')).toEqual({});
    expect(setPageGround(null)).toEqual({});
    expect(normalizePageSurface({ desktop: { bg: 'token:warning-soft', radius: 8 } })).toEqual({ desktop: { bg: 'token:warning-soft' } });
    expect(pageGroundToken({ desktop: { bg: 'token:info-soft' } })).toBe('info-soft');
  });
});

// An agent rewriting a page's content must not reset the author's page settings.
describe('pageAttrsForWrite', () => {
  const stored = {
    spacing: { desktop: { blockSpace: 40 } },
    layout: { widths: { desktop: { read: '880px' } } },
    surface: { desktop: { bg: 'token:subtle' } },
  };

  it('carries every stored setting when the incoming doc says nothing about it', () => {
    expect(pageAttrsForWrite({ attrs: {} }, stored)).toEqual(stored);
    expect(pageAttrsForWrite({}, stored)).toEqual(stored);
    expect(pageAttrsForWrite(null, stored)).toEqual(stored);
  });

  it('decides each key on its own', () => {
    expect(pageAttrsForWrite({ attrs: { spacing: { desktop: { blockSpace: 8 } } } }, stored)).toEqual({
      ...stored,
      spacing: { desktop: { blockSpace: 8 } },
    });
  });

  // The editor always serializes every key, so an empty bag is a real edit.
  it('honours an explicit clear', () => {
    expect(pageAttrsForWrite({ attrs: { spacing: {}, layout: {}, surface: {} } }, stored)).toEqual({});
  });

  it('normalizes whatever it ends up with', () => {
    expect(pageAttrsForWrite({ attrs: { spacing: { desktop: { blockSpace: 'x' } }, surface: { desktop: { bg: 'token:danger' } } } }, {})).toEqual({});
    expect(pageAttrsForWrite({}, { spacing: { desktop: { blockSpace: 9999 } } })).toEqual({ spacing: { desktop: { blockSpace: 200 } } });
  });

  it('knows when the stored doc is not needed', () => {
    expect(mentionsAllPageAttrs({ attrs: { spacing: {}, layout: {}, surface: {} } })).toBe(true);
    expect(mentionsAllPageAttrs({ attrs: { spacing: {} } })).toBe(false);
    expect(mentionsAllPageAttrs({})).toBe(false);
  });
});
