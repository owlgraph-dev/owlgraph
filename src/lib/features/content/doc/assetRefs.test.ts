// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { JsonNode } from './doc';
import { collectAssetIds } from './assetRefs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('collectAssetIds', () => {
  it('finds image blocks and background images at every tier, at any depth', () => {
    const doc: JsonNode = {
      type: 'doc',
      content: [
        {
          type: 'pageSection',
          attrs: { surface: { desktop: { image: A, overlay: '#000000' }, phone: { image: B } } },
          content: [{ type: 'gridCell', attrs: { surface: { tablet: { image: C } } }, content: [{ type: 'image', attrs: { assetId: A } }] }],
        },
      ],
    };
    expect([...collectAssetIds(doc)].sort()).toEqual([A, B, C]);
  });

  it('ignores a surface without an image, and a value that is not an asset id', () => {
    const doc: JsonNode = {
      type: 'doc',
      content: [
        { type: 'grid', attrs: { surface: { desktop: { bg: '#fff' } } } },
        { type: 'flexContainer', attrs: { surface: { desktop: { image: 'url(evil)' } } } },
      ],
    };
    expect(collectAssetIds(doc).size).toBe(0);
  });
});

describe('collectAssetIds — unknown blocks', () => {
  it('keeps every asset id a node this build cannot read holds, wherever in it', () => {
    const a = '0b2b6e5c-6b0e-4c3a-9a2f-1f0e2a9c1111';
    const b = '0b2b6e5c-6b0e-4c3a-9a2f-1f0e2a9c2222';
    const doc: JsonNode = { type: 'doc', content: [{ type: 'retiredGallery', attrs: { cover: a, slides: [{ asset: b }] } }] };
    expect([...collectAssetIds(doc)].sort()).toEqual([a, b]);
  });
});
