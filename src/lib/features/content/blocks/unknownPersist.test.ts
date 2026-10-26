// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { JsonDoc } from '../doc/doc';
import { ensureBlockIds, summarizeBlocks } from './blockInput.server';
import { stripPlaceholders } from './placeholder/placeholderDoc';

// `retiredTabs` is a type this build cannot read (docs/architecture/blocks/anatomy.md, "Unknown blocks").
const stored = (): JsonDoc => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'known' }] },
    { type: 'retiredTabs', attrs: { mode: 'tabs' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }, { type: 'placeholder' }] },
  ],
});

describe('a save and an unknown node', () => {
  it('stamps no block id on it or inside it, and keeps the known blocks’ ids coming', () => {
    const doc = ensureBlockIds(stored());
    expect(doc.content![0].attrs?.blockId).toEqual(expect.any(String));
    expect(doc.content![1]).toEqual(stored().content![1]);
  });

  it('strips no placeholder from inside it', () => {
    const doc = stored();
    stripPlaceholders(doc);
    expect(doc.content![1]).toEqual(stored().content![1]);
  });

  it('names it to an agent, and nothing of what it holds', () => {
    const [, unknown] = summarizeBlocks({ type: 'doc', content: [stored().content![0], { ...stored().content![1], attrs: { blockId: 't-1' } }] });
    expect(unknown).toMatchObject({ blockId: 't-1', type: 'retiredTabs', kind: null, preview: 'unknown block (retiredTabs)', unknown: true });
  });
});
