// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { backgroundContrast, markContrast, pageSchemes, textContrast } from './contrastGuidance';

const cell = (surface: unknown, typography?: unknown) => ({ type: 'gridCell', attrs: { surface, ...(typography ? { typography } : {}) } });
const grid = { type: 'grid', attrs: {} };

describe('contrast guidance', () => {
  it('measures in the schemes the page renders in', () => {
    expect(pageSchemes('adaptive')).toEqual(['light', 'dark']);
    expect(pageSchemes('dark')).toEqual(['dark']);
  });

  it('warns about a text colour on the page ground only in the scheme where it fails', () => {
    const para = { type: 'paragraph', attrs: { typography: { desktop: { color: '#1e293b' } } } };
    expect(textContrast([para], 'desktop', 'light')).toBeNull();
    expect(textContrast([para], 'desktop', 'adaptive')).toMatchObject({ kind: 'text', scheme: 'dark' });
    expect(textContrast([para], 'desktop', 'dark')).toMatchObject({ kind: 'text', scheme: null });
  });

  it("measures a block's own colour on its own background", () => {
    expect(textContrast([grid, cell({ desktop: { bg: '#0f172a' } }, { desktop: { color: '#1e293b' } })], 'desktop', 'light')).toMatchObject({ kind: 'text' });
    expect(textContrast([grid, cell({ desktop: { bg: '#0f172a' } }, { desktop: { color: '#f8fafc' } })], 'desktop', 'adaptive')).toBeNull();
  });

  it('warns when neither default text colour reads on a background that pins its scheme', () => {
    const warning = backgroundContrast([grid, cell({ desktop: { bg: '#808080' } })], 'desktop', 'adaptive');
    expect(warning).toMatchObject({ kind: 'no-default-text', scheme: null });
    expect(warning!.ratio).toBeLessThan(4.5);
  });

  it('is quiet for a readable background, a theme colour, or a block that sets its own text colour', () => {
    expect(backgroundContrast([grid, cell({ desktop: { bg: '#0f172a' } })], 'desktop', 'adaptive')).toBeNull();
    expect(backgroundContrast([grid, cell({ desktop: { bg: 'token:inverse' } })], 'desktop', 'adaptive')).toBeNull();
    expect(backgroundContrast([grid, cell({ desktop: { bg: '#808080' } }, { desktop: { color: '#000000' } })], 'desktop', 'adaptive')).toBeNull();
  });

  it('follows the tier the editor previews', () => {
    const chain = [grid, cell({ phone: { bg: '#808080' } })];
    expect(backgroundContrast(chain, 'desktop', 'light')).toBeNull();
    expect(backgroundContrast(chain, 'phone', 'light')).toMatchObject({ kind: 'no-default-text' });
  });

  it('measures an inline colour on the ground of the block holding the text', () => {
    const chain = [grid, cell({ desktop: { bg: '#0f172a' } }), { type: 'paragraph', attrs: {} }];
    expect(markContrast(chain, '#1e293b', 'desktop', 'adaptive')).toMatchObject({ kind: 'text', scheme: null });
    expect(markContrast(chain, null, 'desktop', 'adaptive')).toBeNull();
  });
});

describe('contrast guidance on background images', () => {
  const IMG = '11111111-1111-4111-8111-111111111111';
  const imageCell = (extra: Record<string, unknown>) => cell({ desktop: { image: IMG, ...extra } });

  it('names an unknown ground when the image has neither an overlay nor a scheme', () => {
    expect(backgroundContrast([grid, imageCell({})], 'desktop', 'light')).toEqual({ kind: 'unknown-ground', ratio: 0, scheme: null });
  });

  it('is quiet once the author picks a scheme, and measures nothing on that unknown ground', () => {
    expect(backgroundContrast([grid, imageCell({ imageScheme: 'dark' })], 'desktop', 'light')).toBeNull();
    const para = { type: 'paragraph', attrs: { typography: { desktop: { color: '#777777' } } } };
    expect(textContrast([grid, imageCell({ imageScheme: 'dark' }), para], 'desktop', 'light')).toBeNull();
  });

  it('measures the default text against the worst ground a thin overlay leaves', () => {
    expect(backgroundContrast([grid, imageCell({ overlay: '#000000', overlayOpacity: 30 })], 'desktop', 'light')).toMatchObject({ kind: 'no-default-text' });
    expect(backgroundContrast([grid, imageCell({ overlay: '#000000', overlayOpacity: 80 })], 'desktop', 'light')).toBeNull();
  });
});
