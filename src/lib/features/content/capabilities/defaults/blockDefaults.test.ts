// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BLOCK_KINDS, BLOCK_GROUPS, blockGroupOf, groupClass } from '../../blocks/catalog';
import { contentGutterTokensCss, contentStepTokensCss, contentWidthTokensCss, stepProperty, stepPx } from './tokens';
import {
  BUILTIN_BLOCK_DEFAULTS,
  NO_DEFAULTS,
  defaultValuesOf,
  defaultsFor,
  normalizeBlockDefaults,
  pageRhythmPx,
  resolveBlockDefaults,
} from './blockDefaults';
import { emitBlockDefaultsCss } from './emitDefaults';

describe('block groups', () => {
  it('every block kind declares a group', () => {
    for (const kind of BLOCK_KINDS) expect(BLOCK_GROUPS).toContain(kind.group);
  });

  it('maps a type to its group and class; the page is no block kind', () => {
    expect(blockGroupOf('gridCell')).toBe('containers');
    expect(blockGroupOf('quickLink')).toBe('cards');
    expect(blockGroupOf('image')).toBe('media');
    expect(blockGroupOf('paragraph')).toBe('text');
    expect(blockGroupOf('page')).toBeNull();
    expect(groupClass('flexContainer')).toBe('grp-containers');
    expect(groupClass('page')).toBe('');
  });
});

describe('step tokens', () => {
  it('name a step of each ladder as a content property', () => {
    expect(stepProperty('pad', 'sm')).toBe('--content-pad-sm');
    expect(stepPx('pad', 'sm')).toBe(8);
    expect(stepPx('radius', 'md')).toBe(8);
    expect(stepPx('rhythm', 'md')).toBe(24);
  });

  it('are declared in app.css with exactly the ladder values', () => {
    const css = readFileSync(new URL('../../../../../app.css', import.meta.url), 'utf8');
    for (const line of contentStepTokensCss()) expect(css).toContain(line);
  });

  it('declare the canvas widths in app.css at their built-in values', () => {
    const css = readFileSync(new URL('../../../../../app.css', import.meta.url), 'utf8');
    for (const line of contentWidthTokensCss()) expect(css).toContain(line);
  });

  it('declare the page gutters in app.css at their built-in steps', () => {
    const css = readFileSync(new URL('../../../../../app.css', import.meta.url), 'utf8');
    for (const line of contentGutterTokensCss()) expect(css).toContain(line);
    expect(stepPx('gutter', 'lg')).toBe(40);
  });
});

describe('resolveBlockDefaults', () => {
  it('fills every group and field from the built-ins when nothing is stored', () => {
    const r = resolveBlockDefaults(null);
    expect(r).toEqual(BUILTIN_BLOCK_DEFAULTS);
    expect(defaultValuesOf(r.groups.containers)).toEqual({ ...NO_DEFAULTS, pad: 8, radius: 4 });
    expect(defaultValuesOf(r.groups.cards)).toEqual({ ...NO_DEFAULTS, radius: 8 });
    expect(defaultValuesOf(r.groups.text)).toEqual(NO_DEFAULTS);
    expect(pageRhythmPx(r)).toBe(24);
  });

  it('lays explicit picks over the built-ins and keeps the rest', () => {
    const r = resolveBlockDefaults({ page: { blockSpace: 'lg' }, groups: { containers: { pad: 'md', bg: 'token:subtle' } } });
    expect(r.groups.containers).toMatchObject({ pad: 'md', radius: 'sm', bg: 'token:subtle' });
    expect(pageRhythmPx(r)).toBe(40);
    expect(defaultsFor('gridCell', r)).toEqual({ ...NO_DEFAULTS, pad: 16, radius: 4, bg: 'token:subtle' });
    expect(defaultsFor('page', r)).toEqual(NO_DEFAULTS);
  });

  it('normalizes: drops unknown groups, steps off the ladder and literal colours', () => {
    expect(
      normalizeBlockDefaults({
        page: { blockSpace: 'huge' },
        groups: { containers: { pad: 'xl', radius: 'lg', bg: '#ffffff', border: 'token:border' }, widgets: { pad: 'sm' } },
      })
    ).toEqual({ groups: { containers: { radius: 'lg', border: 'token:border' } } });
    expect(normalizeBlockDefaults('nope')).toEqual({});
  });

  it('keeps page widths only as whole px within their bounds', () => {
    expect(normalizeBlockDefaults({ page: { widths: { read: 880, wide: 100, max: 1900.5 } } })).toEqual({ page: { widths: { read: 880 } } });
    const r = resolveBlockDefaults({ page: { widths: { read: 880 } } });
    expect(r.page.widths).toEqual({ read: 880, wide: 1200, max: 1800 });
  });
});

describe('emitBlockDefaultsCss', () => {
  it('emits the page rhythm and one token-only rule per group with defaults', () => {
    const css = emitBlockDefaultsCss(resolveBlockDefaults(null));
    expect(css).toContain('.page-canvas{--flow-space-d:var(--content-rhythm-md);--block-space-d:var(--content-rhythm-md);}');
    expect(css).toContain('.canvas-blocks .grp-containers{--default-pad:var(--content-pad-sm);--default-radius:var(--content-radius-sm);}');
    expect(css).toContain('.canvas-blocks .grp-cards{--default-radius:var(--content-radius-md);}');
    expect(css).not.toContain('.grp-text');
    expect(css).not.toContain('.grp-media');
    expect(css).not.toMatch(/\d+px/);
    expect(css).not.toContain('--content-width');
  });

  it('re-declares only the canvas widths the admin moved', () => {
    const css = emitBlockDefaultsCss(resolveBlockDefaults({ page: { widths: { read: 880, wide: 1200 } } }));
    expect(css).toContain(':root{--content-width-read:880px;}');
  });

  it('re-declares only the gutters the admin moved, as a step', () => {
    const css = emitBlockDefaultsCss(resolveBlockDefaults({ page: { gutters: { phone: 'md', desktop: 'lg' } } }));
    expect(css).toContain(':root{--content-gutter-p:var(--content-gutter-md);}');
    expect(normalizeBlockDefaults({ page: { gutters: { tablet: 'xl', phone: 'none' } } })).toEqual({ page: { gutters: { phone: 'none' } } });
  });

  it('emits a fill with its readable text, a border as a hairline, and a group rhythm on the blocks only', () => {
    const css = emitBlockDefaultsCss(
      resolveBlockDefaults({ groups: { cards: { bg: 'token:accent', border: 'token:border-strong', shadow: 'sm', blockSpace: 'sm' } } })
    );
    expect(css).toContain(
      '.canvas-blocks .grp-cards{--default-radius:var(--content-radius-md);--default-shadow:var(--content-shadow-sm);--default-border:1px solid var(--content-theme-border-strong);--default-bg:var(--content-theme-accent);--default-fg:var(--content-theme-on-accent);}'
    );
    expect(css).toContain('.canvas-blocks .grp-cards[data-block-id]{--flow-space-d:var(--content-rhythm-sm);--flow-space-t:initial;--flow-space-p:initial;}');
  });
});
