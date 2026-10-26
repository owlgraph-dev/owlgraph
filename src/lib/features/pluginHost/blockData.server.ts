// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Block data (docs/architecture/plugins.md, "Block data"): what a page's plugin blocks need
// from outside the document, resolved for the viewer before the synchronous
// render. Only routes that render for a viewer ask; a resolver that throws
// costs its blocks their data, never the page.
import { pluginFailed } from './pluginFailure.server';
import { collectBlocks } from '$lib/features/content';
import { pluginOfBlockKind } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import type { PluginBlockDataResolver, PluginBlockRef, PluginHost } from '$lib/plugins/api';
import { createPluginHost, type HostContext } from './host.server';

/** By kind, each block id once however often it occurs (a query template's copies share one). */
export function collectPluginBlocks(doc: unknown, isPluginKind: (type: string) => boolean): Map<string, PluginBlockRef[]> {
  return collectBlocks(doc, isPluginKind);
}

export interface BlockDataDeps {
  /** Null for a kind without a resolver. */
  resolverOf(kind: string): { pluginId: string; resolve: PluginBlockDataResolver } | null;
  host(pluginId: string): PluginHost;
  failed(kind: string, error: unknown): void;
}

/** Keeps only the entries for block ids each resolver was asked about. */
export async function resolveBlockData(byKind: ReadonlyMap<string, readonly PluginBlockRef[]>, deps: BlockDataDeps): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  await Promise.all(
    [...byKind].map(async ([kind, blocks]) => {
      const resolver = deps.resolverOf(kind);
      if (!resolver) return;
      try {
        const data = await resolver.resolve(blocks, deps.host(resolver.pluginId));
        const asked = new Set(blocks.map((b) => b.blockId));
        for (const [blockId, value] of Object.entries(data ?? {})) if (asked.has(blockId)) out[blockId] = value;
      } catch (error) {
        deps.failed(kind, error);
      }
    })
  );
  return out;
}

export async function resolvePluginBlockData(doc: unknown, ctx: HostContext): Promise<Record<string, unknown>> {
  const byKind = collectPluginBlocks(doc, (type) => pluginOfBlockKind(type) !== null);
  if (byKind.size === 0) return {};
  const hosts = new Map<string, PluginHost>();
  return resolveBlockData(byKind, {
    resolverOf(kind) {
      const pluginId = pluginOfBlockKind(kind);
      const resolvers = pluginId ? (pluginServer(pluginId)?.blockData as Readonly<Record<string, PluginBlockDataResolver | undefined>> | undefined) : undefined;
      const resolve = resolvers?.[kind];
      return pluginId && resolve ? { pluginId, resolve } : null;
    },
    host(pluginId) {
      let host = hosts.get(pluginId);
      if (!host) hosts.set(pluginId, (host = createPluginHost(pluginId, ctx)));
      return host;
    },
    failed(kind, error) {
      pluginFailed(ctx.log, `block data for '${kind}'`, error);
    },
  });
}
