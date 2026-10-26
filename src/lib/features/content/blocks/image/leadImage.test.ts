// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { leadImage, leadImagePreloads } from './leadImage';
import type { JsonNode } from '../../doc/doc';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const para = (text: string): JsonNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const image = (id: string): JsonNode => ({ type: 'image', attrs: { assetId: id } });
const cell = (...content: JsonNode[]): JsonNode => ({ type: 'gridCell', content });
const hero = (surface: Record<string, unknown>, ...cells: JsonNode[]): JsonNode => ({ type: 'grid', attrs: { surface }, content: cells });

describe('leadImage', () => {
  it('is the first image among the first two top-level blocks', () => {
    const second = image(A);
    expect(leadImage([para('Titel'), second, image(B)])).toEqual({ kind: 'image', node: second });
  });

  it('is nothing when the page opens without one', () => {
    expect(leadImage([para('a'), para('b'), image(A)])).toBeNull();
    expect(leadImage([])).toBeNull();
  });

  it("is a block's background before the images it holds", () => {
    const block = hero({ desktop: { image: A } }, cell(image(B)));
    expect(leadImage([block])).toEqual({ kind: 'background', node: block });
  });

  it('finds an image inside the opening blocks, a cell deep', () => {
    const inner = image(B);
    expect(leadImage([hero({}, cell(para('x')), cell(inner))])).toEqual({ kind: 'image', node: inner });
  });
});

describe('leadImagePreloads', () => {
  it("announces a background's copies for each tier, by the viewports of that tier", () => {
    const preloads = leadImagePreloads(leadImage([hero({ desktop: { image: A }, phone: { image: B } })]));
    expect(preloads).toEqual([
      { href: `/api/media/${A}?w=1920`, imagesrcset: `/api/media/${A}?w=1920 1x, /api/media/${A}?w=2560 2x`, media: '(min-width: 901px)' },
      { href: `/api/media/${A}?w=960`, imagesrcset: `/api/media/${A}?w=960 1x, /api/media/${A}?w=1920 2x`, media: '(min-width: 641px) and (max-width: 900px)' },
      { href: `/api/media/${B}?w=640`, imagesrcset: `/api/media/${B}?w=640 1x, /api/media/${B}?w=1280 2x`, media: '(max-width: 640px)' },
    ]);
  });

  it('announces a tiled background as the image itself, and nothing for an image block (its <img> is found in the markup)', () => {
    const tiled = leadImagePreloads(leadImage([hero({ desktop: { image: A, imageFit: 'repeat' } })]));
    expect(tiled.map((p) => [p.href, p.imagesrcset])).toEqual([[`/api/media/${A}`, undefined], [`/api/media/${A}`, undefined], [`/api/media/${A}`, undefined]]);
    expect(leadImagePreloads(leadImage([image(A)]))).toEqual([]);
    expect(leadImagePreloads(null)).toEqual([]);
  });
});
