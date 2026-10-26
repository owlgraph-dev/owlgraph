// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { EMBED_KINDS, embedKindFor, embedKindOf } from './embeds';

// The plugins' kinds come from the registry, whatever plugins there are.
describe('the embedding kinds', () => {
  it('are the core’s two first, each the kind of the nodes no integration keeps', () => {
    expect(EMBED_KINDS.slice(0, 2)).toEqual([
      { kind: 'collectionBlock', family: 'collection', nodeAttr: 'nodeId', source: null },
      { kind: 'documentBlock', family: 'document', nodeAttr: 'nodeId', source: null },
    ]);
    expect(embedKindOf('collectionBlock')?.family).toBe('collection');
    expect(embedKindOf('paragraph')).toBeNull();
  });

  it('show one source’s nodes of a family with one kind each', () => {
    const pairs = EMBED_KINDS.map((k) => `${k.family}:${k.source ?? ''}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('dispatch a node of no integration to the core’s kind, whatever is turned on', () => {
    expect(embedKindFor('collection', null, new Set())).toEqual({ ok: true, kind: embedKindOf('collectionBlock') });
    expect(embedKindFor('document', null, new Set())).toEqual({ ok: true, kind: embedKindOf('documentBlock') });
  });

  it('dispatch a plugin’s node to the plugin’s kind while the plugin is on, and say so while it is off', () => {
    for (const kind of EMBED_KINDS.filter((k) => k.source !== null)) {
      const source = kind.source!;
      expect(embedKindFor(kind.family, source, new Set([source]))).toEqual({ ok: true, kind });
      expect(embedKindFor(kind.family, source, new Set())).toEqual({ ok: false, reason: 'off' });
    }
  });

  it('have nothing for a source no kind shows', () => {
    expect(embedKindFor('collection', 'no-such-plugin', new Set(['no-such-plugin']))).toEqual({ ok: false, reason: 'none' });
  });
});
