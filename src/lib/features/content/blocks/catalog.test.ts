// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import {
  ADDRESSABLE_BLOCK_TYPES,
  PERSISTED_ADDRESSABLE_BLOCK_TYPES,
  GLOBAL_BLOCK_ID_TYPES,
  STRUCTURAL_BLOCK_TYPES,
  BLOCK_KINDS
} from './catalog';
import { PLUGIN_BLOCK_KIND_NAMES } from '$lib/plugins';

// A change to these lists changes which blocks are addressable, persisted or
// structural, so it must be deliberate. The plugins' kinds are left out:
// src/lib/plugins/contract.test.ts holds those.
const sorted = (s: ReadonlySet<string>) => [...s].filter((name) => !PLUGIN_BLOCK_KIND_NAMES.has(name)).sort();

describe('block catalogue', () => {
  it('derives the live (editor) blockId set', () => {
    expect(sorted(ADDRESSABLE_BLOCK_TYPES)).toEqual(
      ['paragraph', 'heading', 'codeBlock', 'callout', 'blockquote', 'horizontalRule', 'bulletList', 'orderedList', 'image', 'htmlBlock', 'quickLink', 'collectionBlock', 'documentBlock', 'table', 'diagram', 'grid', 'pageSection', 'flexContainer', 'listItem', 'queryBlock', 'placeholder', 'unknownBlock'].sort()
    );
  });

  it('derives the persisted (server backfill) blockId set — the live set minus transient types', () => {
    expect(sorted(PERSISTED_ADDRESSABLE_BLOCK_TYPES)).toEqual(
      ['paragraph', 'heading', 'codeBlock', 'callout', 'blockquote', 'horizontalRule', 'bulletList', 'orderedList', 'image', 'htmlBlock', 'quickLink', 'collectionBlock', 'documentBlock', 'table', 'diagram', 'grid', 'pageSection', 'flexContainer', 'listItem', 'queryBlock'].sort()
    );
  });

  it("derives the BlockId extension's global-attribute type list", () => {
    expect(sorted(GLOBAL_BLOCK_ID_TYPES)).toEqual(
      ['paragraph', 'heading', 'codeBlock', 'callout', 'blockquote', 'horizontalRule', 'bulletList', 'orderedList', 'image', 'grid', 'pageSection', 'flexContainer', 'listItem', 'placeholder'].sort()
    );
  });

  it('derives the structural set', () => {
    expect(sorted(STRUCTURAL_BLOCK_TYPES)).toEqual(['grid', 'pageSection', 'gridCell', 'flexContainer', 'flexCell', 'table', 'queryBlock'].sort());
  });

  it('has no duplicate kinds', () => {
    const all = BLOCK_KINDS.map((k) => k.name);
    expect(new Set(all).size).toBe(all.length);
  });
});
