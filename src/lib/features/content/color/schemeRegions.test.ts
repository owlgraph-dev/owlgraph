// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { contrastRatio, parseColor } from '$lib/design-system/theme/color';
import { fillOver, fillText, groundStep, groundsAlong, schemeAttributeHtml, schemeAttributes, PAGE_GROUNDS, pageGrounds, schemeForGround, TEXT_MINIMUM } from './schemeRegions';
import { schemeRegionDecorations } from './schemeRegionDecorations';
import { renderDoc } from '../render/render.server';

const cell = (bg: Record<string, string> | string, content: unknown[] = []) => ({
  type: 'gridCell',
  attrs: { surface: typeof bg === 'string' ? { desktop: { bg } } : Object.fromEntries(Object.entries(bg).map(([bp, c]) => [bp, { bg: c }])) },
  content,
});
const rgb = (hex: string) => parseColor(hex)!;

describe('the scheme-region decision', () => {
  it('pins dark on an opaque dark literal and light on an opaque light one', () => {
    expect(fillOver('#0f172a', PAGE_GROUNDS.desktop).regionScheme).toBe('dark');
    expect(fillOver('#f8fafc', PAGE_GROUNDS.desktop).regionScheme).toBe('light');
  });

  it('decides a saturated colour by which text reads better, not by a luminance cut', () => {
    // #3b82f6 sits near the middle: the light scheme's dark text reads better on it.
    const pick = schemeForGround(rgb('#3b82f6'));
    expect(pick.scheme).toBe('light');
    expect(pick.ratio).toBeGreaterThan(contrastRatio(rgb('#ecebe8'), rgb('#3b82f6')));
    expect(fillOver('#3b82f6', PAGE_GROUNDS.desktop).regionScheme).toBe('light');
  });

  it('still pins a mid grey, and reports that neither text colour reaches 4.5:1 on it', () => {
    expect(fillOver('#808080', PAGE_GROUNDS.desktop).regionScheme).toBe('light');
    expect(schemeForGround(rgb('#808080')).ratio).toBeLessThan(TEXT_MINIMUM);
  });

  it('makes no scheme region of a translucent ground whose composites over the two page grounds disagree', () => {
    const fill = fillOver('rgba(0, 0, 0, 0.2)', PAGE_GROUNDS.desktop);
    expect(fill.regionScheme).toBeNull();
    // Each page scheme keeps its own scheme, on its own composite.
    expect(fill.inner.light.scheme).toBe('light');
    expect(fill.inner.dark.scheme).toBe('dark');
    expect(fill.inner.light.color).toMatchObject({ r: 204, g: 204, b: 204 });
  });

  it('composites a translucent ground over the nearest ancestor background, not the page', () => {
    const grounds = groundsAlong([cell('#0f172a')]);
    const fill = fillOver('rgba(255, 255, 255, 0.1)', grounds.desktop);
    expect(fill.regionScheme).toBe('dark');
    expect(fill.inner.light.color).toEqual(fill.inner.dark.color);
  });

  it('makes no scheme region of a theme colour, and gives its default text the readable partner', () => {
    const node = cell('token:inverse');
    const fill = groundStep(node, PAGE_GROUNDS).fills.desktop!;
    expect(fill.regionScheme).toBeNull();
    for (const page of ['light', 'dark'] as const) {
      expect(contrastRatio(fillText(node, fill, page), fill.inner[page].color)).toBeGreaterThanOrEqual(TEXT_MINIMUM);
    }
  });

  it("does not treat a table's own background as a ground (it shows only between cells)", () => {
    const table = { type: 'table', attrs: { surface: { desktop: { bg: '#0f172a' } } } };
    expect(groundStep(table, PAGE_GROUNDS).fills.desktop).toBeNull();
  });
});

describe('scheme attributes', () => {
  it('uses data-scheme when the scheme region is the same at every tier', () => {
    expect(schemeAttributes(groundStep(cell('#0f172a'), PAGE_GROUNDS))).toEqual({ 'data-scheme': 'dark' });
    expect(schemeAttributes(groundStep(cell('token:accent'), PAGE_GROUNDS))).toEqual({});
  });

  it('pins per tier when the ground differs between them', () => {
    const step = groundStep(cell({ desktop: '#0f172a', phone: '#f8fafc' }), PAGE_GROUNDS);
    expect(schemeAttributes(step)).toEqual({ 'data-scheme-d': 'dark', 'data-scheme-t': 'dark', 'data-scheme-p': 'light' });
    expect(schemeAttributeHtml(step)).toBe(' data-scheme-d="dark" data-scheme-t="dark" data-scheme-p="light"');
  });

  it('pins only the tiers that are scheme regions', () => {
    const step = groundStep(cell({ tablet: '#0f172a' }), PAGE_GROUNDS);
    expect(schemeAttributes(step)).toEqual({ 'data-scheme-t': 'dark', 'data-scheme-p': 'dark' });
  });
});

describe('the page ground', () => {
  it('is the content ground unless the page sets a background of its own', () => {
    expect(pageGrounds(undefined)).toEqual(PAGE_GROUNDS);
    expect(pageGrounds({ surface: { desktop: { bg: 'token:accent' } } })).toEqual(PAGE_GROUNDS);
  });

  it("follows the page's theme colour in each scheme, at every tier, and pins nothing", () => {
    const grounds = pageGrounds({ surface: { desktop: { bg: 'token:subtle' } } });
    for (const bp of ['desktop', 'tablet', 'phone'] as const) {
      expect(grounds[bp].light.scheme).toBe('light');
      expect(grounds[bp].dark.scheme).toBe('dark');
      expect(grounds[bp].light.color).not.toEqual(PAGE_GROUNDS[bp].light.color);
    }
  });

  it('heads a selection chain as the page node', () => {
    const page = { type: 'page', attrs: { surface: { desktop: { bg: 'token:subtle' } } } };
    expect(groundsAlong([page])).toEqual(pageGrounds(page.attrs));
  });
});

describe('editor and public page agree', () => {
  // A minimal schema with the real type names and the one attribute scheme regions read.
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: { group: 'block', content: 'inline*' },
      grid: { group: 'block', content: 'gridCell+', attrs: { surface: { default: {} } } },
      gridCell: { content: 'block+', attrs: { surface: { default: {} } } },
    },
  });
  const json = {
    type: 'doc',
    content: [
      {
        type: 'grid',
        attrs: { surface: {} },
        content: [
          cell('#0f172a', [cell('rgba(255, 255, 255, 0.1)', [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }])]),
          cell('rgba(0, 0, 0, 0.2)', [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }]),
          cell({ desktop: '#f8fafc', phone: '#0f172a' }, [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }]),
        ],
      },
    ],
  };
  // gridCell may hold cells in this test schema only through block content; widen it for the nested case.
  const nestedSchema = new Schema({
    nodes: schema.spec.nodes.update('gridCell', { ...schema.spec.nodes.get('gridCell')!, group: 'block' }),
  });

  it('puts the same scheme attributes on the same blocks, in document order', () => {
    const doc = nestedSchema.nodeFromJSON(json);
    const editor = schemeRegionDecorations(doc)
      .find()
      .sort((a, b) => a.from - b.from)
      .map((d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs);
    const { html } = renderDoc(json as never);
    // Every cell here has a background, so each carries its rule id (data-b)
    // right after the scheme attributes.
    const publicAttrs = [...html.matchAll(/<div class="grid-cell[^"]*"([^>]*?) data-b=/g)].map((m) =>
      Object.fromEntries([...m[1].matchAll(/ (data-scheme[\w-]*)="(\w+)"/g)].map((a) => [a[1], a[2]]))
    );
    expect(editor).toEqual(publicAttrs.filter((a) => Object.keys(a).length));
    expect(editor).toEqual([
      { 'data-scheme': 'dark' },
      { 'data-scheme': 'dark' },
      { 'data-scheme-d': 'light', 'data-scheme-t': 'light', 'data-scheme-p': 'dark' },
    ]);
  });
});

describe('image grounds', () => {
  const IMG = '11111111-1111-4111-8111-111111111111';
  const section = (surface: Record<string, unknown>) => ({ type: 'pageSection', attrs: { surface: { desktop: { image: IMG, ...surface } } } });

  it('a dark overlay pins dark, a light one light — decided by the worse of the overlay over black and over white', () => {
    expect(groundStep(section({ overlay: '#000000', overlayOpacity: 70 }), PAGE_GROUNDS).fills.desktop!.regionScheme).toBe('dark');
    expect(groundStep(section({ overlay: '#ffffff', overlayOpacity: 80 }), PAGE_GROUNDS).fills.desktop!.regionScheme).toBe('light');
  });

  it('measures text against the worst ground the overlay leaves', () => {
    const fill = groundStep(section({ overlay: '#000000', overlayOpacity: 50 }), PAGE_GROUNDS).fills.desktop!;
    // Half-black over white is the lightest such ground: light text reads worst there.
    expect(fill.inner.light.color).toMatchObject({ r: 127.5, g: 127.5, b: 127.5 });
    expect(fill.inner.light.unknown).toBeUndefined();
  });

  it("the author's scheme pins the scheme region, overlay or not", () => {
    expect(groundStep(section({ imageScheme: 'light', overlay: '#000000' }), PAGE_GROUNDS).fills.desktop!.regionScheme).toBe('light');
    expect(groundStep(section({ imageScheme: 'dark' }), PAGE_GROUNDS).fills.desktop!.regionScheme).toBe('dark');
  });

  it('with no overlay and Auto it keeps the scheme around it, on an unknown ground', () => {
    const fill = groundStep(section({}), PAGE_GROUNDS).fills.desktop!;
    expect(fill.regionScheme).toBeNull();
    expect(fill.inner.light).toMatchObject({ scheme: 'light', unknown: true });
    expect(fill.inner.dark).toMatchObject({ scheme: 'dark', unknown: true });
  });

  it('a theme-colour overlay pins nothing, like a theme-colour background: its text is the readable partner', () => {
    const fill = groundStep(section({ overlay: 'token:inverse', overlayOpacity: 90 }), PAGE_GROUNDS).fills.desktop!;
    expect(fill.regionScheme).toBeNull();
    expect(fill.inner.light.unknown).toBeUndefined();
    // on-inverse on a 90% inverse overlay reads in both page schemes.
    for (const page of ['light', 'dark'] as const) {
      expect(contrastRatio(fillText(section({}), fill, page), fill.inner[page].color)).toBeGreaterThan(TEXT_MINIMUM);
    }
  });

  it('replaces the colour fallback as the ground, and only on blocks that carry the layer', () => {
    const withFallback = { type: 'pageSection', attrs: { surface: { desktop: { bg: '#ffffff', image: IMG, overlay: '#000000', overlayOpacity: 80 } } } };
    expect(groundStep(withFallback, PAGE_GROUNDS).fills.desktop!.regionScheme).toBe('dark');
    const card = { type: 'quickLink', attrs: { variant: 'button', surface: { desktop: { bg: '#ffffff', image: IMG, overlay: '#000000' } } } };
    expect(groundStep(card, PAGE_GROUNDS).fills.desktop!.image).toBeUndefined();
  });

  it('the editor and the page put the same scheme attributes on an image section', () => {
    const doc = { type: 'doc', content: [section({ overlay: '#000000', overlayOpacity: 70 })] };
    expect(schemeAttributes(groundStep(doc.content[0], pageGrounds({})))).toEqual({ 'data-scheme': 'dark' });
  });
});
