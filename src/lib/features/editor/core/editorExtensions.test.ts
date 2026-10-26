// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { KNOWN_MARK_TYPES, KNOWN_NODE_TYPES, UNKNOWN_BLOCK, slotTakesBlock } from '$lib/features/content';
import { editorExtensions } from './editorExtensions';

// The server decides what the editor cannot read (content/doc/unknownBlocks.ts)
// without the editor's schema at hand; this holds that decision to the schema.
const schema = getSchema(
  editorExtensions({ pageId: null, interactive: true, resolvePageHref: () => '#', resolveDocHref: () => '#', propLabel: () => null })
);

describe("the editor's schema", () => {
  it('has exactly the node types the server knows', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual([...KNOWN_NODE_TYPES].sort());
  });

  it('has exactly the mark types the server knows', () => {
    expect(Object.keys(schema.marks).sort()).toEqual([...KNOWN_MARK_TYPES].sort());
  });

  it('takes an unknown block exactly where the wrap pass puts one', () => {
    const wrapper = schema.nodes[UNKNOWN_BLOCK];
    for (const type of Object.values(schema.nodes)) {
      const first = type.contentMatch.matchType(wrapper) !== null;
      const lead = type.contentMatch.defaultType;
      const afterLead = lead ? type.contentMatch.matchType(lead)?.matchType(wrapper) != null : false;
      expect({ type: type.name, first, second: afterLead }).toEqual({ type: type.name, first: slotTakesBlock(type.name, 0), second: slotTakesBlock(type.name, 1) });
    }
  });
});
