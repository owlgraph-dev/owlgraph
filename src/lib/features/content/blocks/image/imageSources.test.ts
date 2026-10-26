// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { imageSources, imageSizes, imageSizeOverrides } from './imageSources';

const ID = '11111111-2222-3333-4444-555555555555';

describe('imageSources', () => {
  it("offers the ladder's copies narrower than the image, and the image itself as the widest", () => {
    const s = imageSources(ID, { width: 1600, height: 900, variants: true }, {}, true)!;
    expect(s.srcset).toBe(
      [320, 640, 960, 1280].map((w) => `/api/media/${ID}?w=${w} ${w}w`).join(', ') + `, /api/media/${ID} 1600w`
    );
    expect(s.width).toBe(1600);
    expect(s.height).toBe(900);
  });

  it('offers no srcset for an image no copy is made of, or one narrower than every copy', () => {
    expect(imageSources(ID, { width: 800, height: 600, variants: false }, {}, true)).toEqual({ width: 800, height: 600 });
    expect(imageSources(ID, { width: 300, height: 200, variants: true }, {}, true)).toEqual({ width: 300, height: 200 });
  });

  it('is null for an image whose size is unknown: it renders by its src alone', () => {
    expect(imageSources(ID, undefined, {}, true)).toBeNull();
  });
});

describe('imageSizes', () => {
  it("is the image's own width, never wider than the column, with no width set", () => {
    expect(imageSizes(1600, {}, false)).toBe('(max-width: 640px) min(1600px, 100vw), (max-width: 900px) min(1600px, 100vw), min(1600px, 760px)');
  });

  it("is its width % of the column per tier, inherited down the cascade, and leads with auto when lazy", () => {
    expect(imageSizes(1600, { width: 50, widthPhone: 100 }, true)).toBe('auto, (max-width: 640px) 100vw, (max-width: 900px) calc(100vw * 0.5), calc(760px * 0.5)');
  });
});

describe('imageSizeOverrides', () => {
  const photo = (box: Record<string, unknown> = {}) => imageSizeOverrides(imageSources(ID, { width: 1600, height: 900, variants: true }, {}, true), box);

  it("gives every image of known size its stored aspect ratio, and its own width only where a srcset is offered", () => {
    expect(photo()).toEqual({ 'aspect-ratio': 'auto 1600 / 900', '--img-w': '1600px' });
    expect(imageSizeOverrides(imageSources(ID, { width: 300, height: 200, variants: true }, {}, true), {})).toEqual({ 'aspect-ratio': 'auto 300 / 200' });
    expect(imageSizeOverrides(null, {})).toEqual({});
  });

  it("leaves a box of a set height its width from that height, and a fitted aspect ratio to the box", () => {
    expect(photo({ boxMode: 'height', boxHeight: 200 })).toEqual({ 'aspect-ratio': 'auto 1600 / 900' });
    expect(photo({ boxMode: 'aspect', boxAspect: '4/3' })).toEqual({ 'aspect-ratio': 'auto 1600 / 900', '--img-w': '1600px' });
  });
});
