// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import type { PluginBlockDataResolver, PluginBlockRef, PluginHost } from '$lib/plugins/api';
import { collectPluginBlocks, resolveBlockData, type BlockDataDeps } from './blockData.server';

// A fake plugin's two block kinds.
const isKind = (type: string) => type === 'acmeFolder' || type === 'acmeFile';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
    { type: 'acmeFolder', attrs: { blockId: 'b1', collectionId: 'c1' } },
    { type: 'section', content: [{ type: 'acmeFile', attrs: { blockId: 'b2', documentId: 'd2' } }, { type: 'acmeFolder', attrs: { blockId: 'b3' } }] },
    // A query block's template, stamped per result: its copies share one id.
    { type: 'query', attrs: { blockId: 'q1' }, content: [{ type: 'container', content: [{ type: 'acmeFile', attrs: { blockId: 'b4' } }] }] },
    { type: 'acmeFolder', attrs: { blockId: 'b1', collectionId: 'c1' } },
    // No id, nothing to key its data by.
    { type: 'acmeFolder', attrs: {} },
    { type: 'acmeFolder' },
  ],
};

const ids = (refs: PluginBlockRef[] | undefined) => (refs ?? []).map((r) => r.blockId);

describe('the block data walker', () => {
  it('finds a plugin block at any depth, each block id once, none without an id', () => {
    const byKind = collectPluginBlocks(doc, isKind);
    expect([...byKind.keys()].sort()).toEqual(['acmeFile', 'acmeFolder']);
    expect(ids(byKind.get('acmeFolder'))).toEqual(['b1', 'b3']);
    expect(ids(byKind.get('acmeFile'))).toEqual(['b2', 'b4']);
    expect(byKind.get('acmeFolder')![0].attrs).toEqual({ blockId: 'b1', collectionId: 'c1' });
  });

  it('finds nothing in a page without plugin blocks, or in what is not a document', () => {
    expect(collectPluginBlocks({ type: 'doc', content: [{ type: 'paragraph' }] }, isKind).size).toBe(0);
    for (const odd of [null, undefined, 'doc', 42, { content: 'nope' }, { type: 'doc', content: [null, 'x'] }]) {
      expect(collectPluginBlocks(odd, isKind).size).toBe(0);
    }
  });
});

describe('resolving block data', () => {
  const host = (pluginId: string) => ({ pluginId }) as PluginHost;

  function deps(resolvers: Record<string, PluginBlockDataResolver>, failures: string[] = []): BlockDataDeps {
    return {
      resolverOf: (kind) => (resolvers[kind] ? { pluginId: 'acme', resolve: resolvers[kind] } : null),
      host,
      failed: (kind) => failures.push(kind),
    };
  }

  it("asks each kind's resolver once, with its blocks and its plugin's host, and keeps only what it was asked about", async () => {
    const asked: [string[], string][] = [];
    const resolve: PluginBlockDataResolver = async (blocks, h) => {
      asked.push([blocks.map((b) => b.blockId), h.pluginId]);
      return Object.fromEntries([...blocks.map((b) => [b.blockId, { state: 'ready' }]), ['someone-else', { state: 'ready' }]]);
    };
    const data = await resolveBlockData(collectPluginBlocks(doc, isKind), deps({ acmeFolder: resolve, acmeFile: resolve }));
    expect(Object.keys(data).sort()).toEqual(['b1', 'b2', 'b3', 'b4']);
    expect(asked.map(([blocks]) => blocks.join()).sort()).toEqual(['b1,b3', 'b2,b4']);
    expect(asked.every(([, pluginId]) => pluginId === 'acme')).toBe(true);
  });

  it('leaves a kind without a resolver to render what it shows when nothing was resolved', async () => {
    const data = await resolveBlockData(collectPluginBlocks(doc, isKind), deps({ acmeFile: async (blocks) => Object.fromEntries(blocks.map((b) => [b.blockId, 1])) }));
    expect(Object.keys(data).sort()).toEqual(['b2', 'b4']);
  });

  it("costs a failing resolver its own blocks' data, never the others', and reports it", async () => {
    const failures: string[] = [];
    const data = await resolveBlockData(
      collectPluginBlocks(doc, isKind),
      deps(
        {
          acmeFolder: async () => {
            throw new Error('service down');
          },
          acmeFile: async (blocks) => Object.fromEntries(blocks.map((b) => [b.blockId, 'ok'])),
        },
        failures
      )
    );
    expect(data).toEqual({ b2: 'ok', b4: 'ok' });
    expect(failures).toEqual(['acmeFolder']);
  });
});
