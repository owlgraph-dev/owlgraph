// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { contrastRatio, parseColor } from './color';
import { accentShortfalls, compileTheme, generateAccent, resolveTheme, schemeAccent } from './siteTheme';
import { DEFAULT_SCHEMES } from './tokens';

describe('the site theme', () => {
  it('the built-in accents meet the accent bars', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const set = DEFAULT_SCHEMES[scheme];
      expect(accentShortfalls(scheme, set['--ds-color-accent'], set['--ds-color-accent-soft'])).toEqual([]);
    }
  });

  it('keeps a brand colour that already meets a scheme\'s bars exactly', () => {
    expect(generateAccent('light', '#2563eb')?.accent).toBe('#2563eb');
  });

  it('steps a brand colour to the nearest lightness that reads, per scheme', () => {
    for (const brand of ['#ffd400', '#0a7d3b', '#e11d48', '#111827']) {
      for (const scheme of ['light', 'dark'] as const) {
        const generated = generateAccent(scheme, brand);
        expect(generated, `${brand} ${scheme}`).not.toBeNull();
        expect(accentShortfalls(scheme, generated!.accent, generated!.soft), `${brand} ${scheme}`).toEqual([]);
      }
    }
    // Yellow can't be light text-on-white: the light accent is a darker step of it.
    const yellow = parseColor(generateAccent('light', '#ffd400')!.accent)!;
    expect(contrastRatio(yellow, parseColor('#fbfbfa')!)).toBeGreaterThanOrEqual(4.5);
  });

  it('prefers a scheme\'s hand-set accent over the generated one, and reports what it misses', () => {
    const theme = { version: 1 as const, accent: '#e11d48', schemes: { dark: { accent: '#ffd400' } } };
    expect(schemeAccent(theme, 'dark')).toMatchObject({ accent: '#ffd400', source: 'override' });
    expect(schemeAccent(theme, 'light').source).toBe('generated');
    expect(accentShortfalls('light', '#ffd400', '#fffbea').map((s) => s.pair)).toContain('accent on bg');
  });

  it('gives each brand colour a value and a readable text per scheme', () => {
    const sets = resolveTheme({ version: 1, brand: [{ id: 'ocean', name: 'Ocean', light: '#0b3d91', dark: '#8fb8ff' }] });
    expect(sets.light['--content-brand-ocean']).toBe('#0b3d91');
    expect(sets.light['--content-brand-ocean-fg']).toBe('#ffffff');
    expect(sets.dark['--content-brand-ocean']).toBe('#8fb8ff');
    expect(sets.dark['--content-brand-ocean-fg']).toBe('#1c1c1b');
    expect(sets.light['--ds-color-link']).toBe(sets.light['--ds-color-accent']);
  });

  it('skips a brand colour whose id could not be a property name', () => {
    const sets = resolveTheme({ version: 1, brand: [{ id: 'bad;id', name: 'x', light: '#000000', dark: '#ffffff' }] });
    expect(Object.keys(sets.light).some((k) => k.includes('bad'))).toBe(false);
  });

  describe('a branded app bar', () => {
    // A light ground and a dark one, so both text choices and both logos show.
    const sets = resolveTheme({ version: 1, appbar: { light: '#e8e2d4', dark: '#0a2455' } });

    it('takes its ground per scheme, with text that reads on it carrying every text role', () => {
      for (const [scheme, ground] of [['light', '#e8e2d4'], ['dark', '#0a2455']] as const) {
        const set = sets[scheme];
        expect(set['--ds-appbar-bg'], scheme).toBe(ground);
        const fg = parseColor(set['--ds-appbar-fg'])!;
        expect(contrastRatio(fg, parseColor(ground)!), scheme).toBeGreaterThanOrEqual(4.5);
        expect(set['--ds-appbar-muted'], scheme).toBe(set['--ds-appbar-fg']);
        expect(set['--ds-appbar-accent'], scheme).toBe(set['--ds-appbar-fg']);
        // A filled control carries the bar's own ground as its text.
        expect(set['--ds-appbar-on-accent'], scheme).toBe(ground);
      }
    });

    it('steps hover below pressed, both between the text and the ground', () => {
      const set = sets.dark;
      const ground = parseColor('#0a2455')!;
      const distance = (hex: string) => contrastRatio(parseColor(hex)!, ground);
      expect(distance(set['--ds-appbar-fill-hover'])).toBeGreaterThan(1);
      expect(distance(set['--ds-appbar-fill-pressed'])).toBeGreaterThan(distance(set['--ds-appbar-fill-hover']));
      expect(distance(set['--ds-appbar-fill-pressed'])).toBeLessThan(distance(set['--ds-appbar-fg']));
    });

    it('shows the logo that reads on the bar, whatever the scheme around it', () => {
      expect(sets.light['--ds-appbar-logo-light-display']).toBe('block');
      expect(sets.light['--ds-appbar-logo-dark-display']).toBe('none');
      expect(sets.dark['--ds-appbar-logo-light-display']).toBe('none');
      expect(sets.dark['--ds-appbar-logo-dark-display']).toBe('block');
    });

    it('keeps the plain bar in a scheme it sets no ground for', () => {
      const half = resolveTheme({ version: 1, appbar: { light: '#0b3d91' } });
      expect(half.light['--ds-appbar-bg']).toBe('#0b3d91');
      expect(half.dark['--ds-appbar-bg']).toBe(DEFAULT_SCHEMES.dark['--ds-appbar-bg']);
      expect(half.dark['--ds-appbar-logo-dark-display']).toBe(DEFAULT_SCHEMES.dark['--ds-appbar-logo-dark-display']);
    });
  });

  describe('a branded footer', () => {
    it('takes its ground per scheme, with text that reads on it and a divider a step into it', () => {
      const sets = resolveTheme({ version: 1, footer: { light: '#e8e2d4', dark: '#1d2433' } });
      for (const [scheme, ground] of [['light', '#e8e2d4'], ['dark', '#1d2433']] as const) {
        const set = sets[scheme];
        expect(set['--ds-footer-bg'], scheme).toBe(ground);
        const fg = parseColor(set['--ds-footer-fg'])!;
        expect(contrastRatio(fg, parseColor(ground)!), scheme).toBeGreaterThanOrEqual(4.5);
        expect(set['--ds-footer-muted'], scheme).toBe(set['--ds-footer-fg']);
        expect(set['--ds-footer-accent'], scheme).toBe(set['--ds-footer-fg']);
        const border = contrastRatio(parseColor(set['--ds-footer-border'])!, parseColor(ground)!);
        expect(border, scheme).toBeGreaterThan(1);
        expect(border, scheme).toBeLessThan(contrastRatio(fg, parseColor(ground)!));
      }
    });

    it('keeps the plain footer in a scheme it sets no ground for, and ignores what is not a colour', () => {
      const sets = resolveTheme({ version: 1, footer: { light: 'not a colour', dark: '#1d2433' } });
      expect(sets.light['--ds-footer-bg']).toBe(DEFAULT_SCHEMES.light['--ds-footer-bg']);
      expect(sets.dark['--ds-footer-bg']).toBe('#1d2433');
    });
  });

  it('compiles once per version', () => {
    const theme = { version: 1 as const, accent: '#0a7d3b' };
    const first = compileTheme(theme, 'v-test');
    expect(compileTheme({ version: 1, accent: '#e11d48' }, 'v-test')).toBe(first);
    expect(first.css).toContain(`--ds-color-accent:${first.sets.light['--ds-color-accent']};`);
  });
});
