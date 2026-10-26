// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { leafBlockShape } from './blockInputSchema.server';
import { buildNode, blockInputToNode, type BlockInput, type BlockRefResolvers } from './blockInput.server';

const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const DOCUMENT = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';
const MIRRORED = '0d4e8b3c-2a1f-4c6d-8e9b-1a2b3c4d5e6f';

const refs = (readable: Record<string, { type: 'collection' | 'document'; plugin: string | null }>): BlockRefResolvers => ({
  resolvePage: async () => null,
  resolveDocument: async () => null,
  resolveEmbedTarget: async (id) => (readable[id] ? { id, ...readable[id] } : null),
  embedKindOf: (plugin) => `${plugin}-thing`,
});

const parse = (value: unknown) => leafBlockShape.parse(value) as BlockInput;

describe('an embedding block from an agent', () => {
  it('takes a collection and a document by id, with the display settings each block has', () => {
    expect(leafBlockShape.safeParse({ kind: 'collection', nodeId: COLLECTION, limit: 5, density: 'compact', showLabels: false, columns: [] }).success).toBe(true);
    expect(leafBlockShape.safeParse({ kind: 'document', nodeId: DOCUMENT, variant: 'card', titleMode: 'node', showNodeLink: true }).success).toBe(true);
    expect(leafBlockShape.safeParse({ kind: 'collection', nodeId: 'not-an-id' }).success).toBe(false);
    expect(leafBlockShape.safeParse({ kind: 'collection', nodeId: COLLECTION, limit: 201 }).success).toBe(false);
  });

  it('becomes a sparse node: what the agent leaves out stays the block’s default', () => {
    const node = blockInputToNode(parse({ kind: 'collection', nodeId: COLLECTION, limit: 5 }));
    expect(node.type).toBe('collectionBlock');
    expect(node.attrs).toEqual({ blockId: expect.any(String), nodeId: COLLECTION, limit: 5 });
    expect(blockInputToNode(parse({ kind: 'document', nodeId: DOCUMENT })).attrs).toEqual({ blockId: expect.any(String), nodeId: DOCUMENT });
  });

  it('embeds only what the agent writing may read', async () => {
    await expect(buildNode(parse({ kind: 'collection', nodeId: COLLECTION }), refs({}))).rejects.toThrow(`collection ${COLLECTION} not found`);
    await expect(buildNode(parse({ kind: 'document', nodeId: DOCUMENT }), refs({ [DOCUMENT]: { type: 'collection', plugin: null } }))).rejects.toThrow('not found');
    const built = await buildNode(parse({ kind: 'collection', nodeId: COLLECTION }), refs({ [COLLECTION]: { type: 'collection', plugin: null } }));
    expect(built).toMatchObject({ type: 'collectionBlock', attrs: { nodeId: COLLECTION } });
  });

  it('points an integration’s node to the kind that shows it', async () => {
    await expect(buildNode(parse({ kind: 'collection', nodeId: MIRRORED }), refs({ [MIRRORED]: { type: 'collection', plugin: 'acme' } }))).rejects.toThrow("embed it with kind 'acme-thing'");
  });

  it('refuses where no reader of the writer’s was given', async () => {
    await expect(buildNode(parse({ kind: 'document', nodeId: DOCUMENT }), { resolvePage: async () => null, resolveDocument: async () => null })).rejects.toThrow('not found');
  });
});
