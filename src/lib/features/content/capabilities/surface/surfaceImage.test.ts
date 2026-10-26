// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { surfaceImageVars, resolvedImageLayer, imageLayerCss } from './surfaceImage';
import { normalizeSurfaceData, pruneSurface, setSurfaceField, clearSurfaceImage, hasSurfaceImage, NO_SURFACE_DEFAULTS, type SurfaceData } from './surface';
import { surfaceVars } from './surface';
import { mergeOverrides } from '../overrides';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
/** A tier's copies of an image (docs/architecture/media.md): about the tier's width, at 1× and 2×. */
const copies = (id: string, x1: number, x2: number) => `image-set(url(/api/media/${id}?w=${x1}) 1x, url(/api/media/${id}?w=${x2}) 2x)`;

describe('the image layer', () => {
  it('emits one layer stack at desktop: the overlay over the image, with its fit and focus', () => {
    const vars = surfaceImageVars({ desktop: { image: A, overlay: '#000000', overlayOpacity: 60 } });
    expect(vars['--surface-img-d']).toBe(
      `linear-gradient(color-mix(in srgb, #000000 60%, transparent), color-mix(in srgb, #000000 60%, transparent)), ${copies(A, 1920, 2560)}`
    );
    expect(vars['--surface-img-size-d']).toBe('cover');
    expect(vars['--surface-img-repeat-d']).toBe('no-repeat');
    expect(vars['--surface-img-pos-d']).toBe('center');
    expect(vars['--surface-fg-d']).toBe('var(--content-fg)');
  });

  it("every tier that shows the image asks for its own copies, and only those", () => {
    const vars = surfaceImageVars({ desktop: { image: A } });
    expect(vars['--surface-img-t']).toBe(copies(A, 960, 1920));
    expect(vars['--surface-img-p']).toBe(copies(A, 640, 1280));
    expect(Object.keys(vars).filter((k) => k.endsWith('-t') || k.endsWith('-p')).sort()).toEqual(['--surface-img-p', '--surface-img-t']);
  });

  it('art direction: a phone image of its own is the phone layer', () => {
    const vars = surfaceImageVars({ desktop: { image: A }, phone: { image: B } });
    expect(vars['--surface-img-p']).toBe(copies(B, 640, 1280));
    expect(vars['--surface-img-size-p']).toBeUndefined();
  });

  it('a tier that only moves the focus point emits the position beside its copies', () => {
    const vars = surfaceImageVars({ desktop: { image: A }, tablet: { imageFocus: 'top' } });
    expect(Object.keys(vars).filter((k) => k.endsWith('-t')).sort()).toEqual(['--surface-img-pos-t', '--surface-img-t']);
    expect(vars['--surface-img-pos-t']).toBe('center top');
  });

  it("a tiled image is the image itself at every tier: its own pixels set the tile's size", () => {
    const vars = surfaceImageVars({ desktop: { image: A, imageFit: 'repeat' } });
    expect(vars['--surface-img-d']).toBe(`url(/api/media/${A})`);
    expect(vars['--surface-img-t']).toBeUndefined();
    expect(vars['--surface-img-p']).toBeUndefined();
  });

  it("tiles at the properties' initial values (nothing to emit), contains with no-repeat", () => {
    const tiled = surfaceImageVars({ desktop: { image: A, imageFit: 'repeat' } });
    expect(tiled['--surface-img-repeat-d']).toBeUndefined();
    expect(tiled['--surface-img-size-d']).toBeUndefined();
    expect(surfaceImageVars({ desktop: { image: A }, phone: { imageFit: 'repeat' } })['--surface-img-repeat-p']).toBe('repeat');
    expect(surfaceImageVars({ desktop: { image: A, imageFit: 'contain' } })['--surface-img-size-d']).toBe('contain');
  });

  it('a theme-colour overlay renders through its custom property; full opacity needs no mix', () => {
    const layer = resolvedImageLayer({ desktop: { image: A, overlay: 'token:inverse', overlayOpacity: 100 } }, 'desktop')!;
    expect(imageLayerCss(layer)).toBe(`linear-gradient(var(--content-theme-inverse), var(--content-theme-inverse)), ${copies(A, 1920, 2560)}`);
  });

  it("a theme-colour overlay's text is its readable partner — unless the author pins a scheme", () => {
    expect(surfaceImageVars({ desktop: { image: A, overlay: 'token:inverse' } })['--surface-fg-d']).toBe('var(--content-theme-on-inverse)');
    const pinned = surfaceImageVars({ desktop: { image: A, overlay: 'token:inverse' }, phone: { imageScheme: 'dark' } });
    expect(pinned['--surface-fg-p']).toBe('var(--content-fg)');
  });

  it('overlay and scheme without an image emit nothing', () => {
    expect(surfaceImageVars({ desktop: { overlay: '#000', imageScheme: 'dark' } })).toEqual({});
  });

  it("its default text wins over a colour fallback's readable partner", () => {
    const data: SurfaceData = { desktop: { bg: 'token:accent', image: A } };
    const merged = mergeOverrides(surfaceVars(data, NO_SURFACE_DEFAULTS), surfaceImageVars(data));
    expect(merged['--surface-bg-d']).toBe('var(--content-theme-accent)');
    expect(merged['--surface-fg-d']).toBe('var(--content-fg)');
  });
});

describe('image fields in the surface data', () => {
  it('normalizes: keeps valid fields, drops anything that is not an asset id or in range', () => {
    const out = normalizeSurfaceData({
      desktop: { image: A, imageFit: 'stretch', imageFocus: 'top-left', overlay: 'red; x', overlayOpacity: 140, imageScheme: 'dark' },
      phone: { image: 'url(x)' },
    });
    expect(out).toEqual({ desktop: { image: A, imageFocus: 'top-left', overlayOpacity: 100, imageScheme: 'dark' } });
  });

  it('sets and clears a field per tier', () => {
    let data = setSurfaceField({}, 'desktop', 'image', A);
    data = setSurfaceField(data, 'desktop', 'overlayOpacity', 30);
    expect(data).toEqual({ desktop: { image: A, overlayOpacity: 30 } });
    expect(setSurfaceField(data, 'desktop', 'image', 'nope')).toEqual({ desktop: { overlayOpacity: 30 } });
  });

  it('switching back to colour drops the whole layer and keeps the colour', () => {
    const data: SurfaceData = { desktop: { bg: '#123456', image: A, overlay: '#000' }, phone: { image: B } };
    expect(hasSurfaceImage(data)).toBe(true);
    expect(clearSurfaceImage(data)).toEqual({ desktop: { bg: '#123456' } });
  });

  it('prunes image fields that restate what the chain gives — only for hosts that carry the layer', () => {
    const data: SurfaceData = { desktop: { image: A, imageFit: 'cover', overlayOpacity: 50 }, tablet: { image: A, imageFocus: 'top' } };
    expect(pruneSurface(data, NO_SURFACE_DEFAULTS, { image: true })).toEqual({ desktop: { image: A }, tablet: { imageFocus: 'top' } });
    expect(pruneSurface(data, NO_SURFACE_DEFAULTS)).toEqual({});
  });
});
