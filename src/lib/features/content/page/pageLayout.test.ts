// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { pageCanvasOverrides, pageCanvasVars, pageGroundOverrides, computeFirstBlockBleeds } from './pageLayout';

describe('pageCanvasVars', () => {
  // The cascade bottoms out at the page: the theme's .page-canvas rule when
  // the document sets no rhythm, the page's own complete triple when it does.
  it('emits no rhythm when the page sets none — the theme default carries it', () => {
    const css = pageCanvasVars();
    expect(css).not.toContain('--block-space');
    expect(css).not.toContain('--flow-space');
  });

  it('emits nothing either for a rhythm equal to the theme default', () => {
    expect(pageCanvasVars({ spacing: { desktop: { blockSpace: 24 } } }, 24)).not.toContain('--block-space');
    expect(pageCanvasVars({ spacing: { desktop: { blockSpace: 24 } } }, 40)).toContain('--block-space-d:24px');
  });

  it("emits the page's own rhythm, each tier resolved desktop-first, under both names", () => {
    const css = pageCanvasVars({ spacing: { desktop: { blockSpace: 40 }, phone: { blockSpace: 8 } } });
    expect(css).toContain('--block-space-d:40px');
    expect(css).toContain('--block-space-t:40px');
    expect(css).toContain('--block-space-p:8px');
    expect(css).toContain('--flow-space-p:8px');
  });

  it('emits nothing at all for a page that sets nothing', () => {
    expect(pageCanvasOverrides({}, 24)).toEqual({});
    expect(pageCanvasOverrides(null, 24)).toEqual({});
  });

  it("emits the page's own widths, the gutter tiers it sets, and its ground", () => {
    expect(
      pageCanvasOverrides(
        { layout: { widths: { desktop: { read: '880px', wide: '90rem' } }, gutters: { phone: '12px' } }, surface: { desktop: { bg: 'token:subtle' } } },
        24
      )
    ).toEqual({ '--canvas-read': '880px', '--canvas-wide': '90rem', '--canvas-gutter-p': '12px', '--page-bg': 'var(--content-theme-subtle)' });
  });

  it('publishes the column template on a columns page only', () => {
    const artikel = { layout: { mode: 'columns' as const, template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside' } };
    expect(pageCanvasOverrides(artikel, 24)).toMatchObject({ '--page-columns-flow': 'row', '--page-columns-cols-d': 'minmax(0, 3fr) minmax(0, 2fr)', '--page-columns-cols-p': 'minmax(0, 1fr)' });
    expect(Object.keys(pageCanvasOverrides({ layout: { widths: { desktop: { read: '880px' } } } }, 24)).some((k) => k.startsWith('--page-columns-'))).toBe(false);
  });

  it('drops a width or ground it would not store', () => {
    expect(pageCanvasOverrides({ layout: { widths: { desktop: { read: '10px' } } }, surface: { desktop: { bg: 'token:accent' } } }, 24)).toEqual({});
  });
});

describe('pageGroundOverrides', () => {
  it('is the ground alone, for the reading area around the canvas', () => {
    expect(pageGroundOverrides({ surface: { desktop: { bg: 'token:accent-soft' } } })).toEqual({ '--page-bg': 'var(--content-theme-accent-soft)' });
    expect(pageGroundOverrides({ layout: { widths: { desktop: { read: '880px' } } } })).toEqual({});
  });
});

describe('computeFirstBlockBleeds', () => {
  it('is true only for a bleed-flagged container kind', () => {
    expect(computeFirstBlockBleeds('grid', { bleedToTop: true })).toBe(true);
    expect(computeFirstBlockBleeds('flexContainer', { bleedToTop: true })).toBe(true);
    expect(computeFirstBlockBleeds('queryBlock', { bleedToTop: true })).toBe(true);
    expect(computeFirstBlockBleeds('paragraph', { bleedToTop: true })).toBe(false);
    expect(computeFirstBlockBleeds('grid', {})).toBe(false);
    expect(computeFirstBlockBleeds(null, null)).toBe(false);
  });
});
