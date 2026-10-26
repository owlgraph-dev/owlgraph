// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Resolved for each reader before the page renders, never from the author's
// view (docs/architecture/blocks/node-embeds.md, "Collection and document blocks"). The page waits for
// it, so two queries serve all of a page's blocks, whatever their number.
import { db } from '$lib/platform/db.server';
import { errorClass, logEvent, type Logger } from '$lib/platform/logger.server';
import type { SessionUser } from '$lib/features/auth/server';
import { nodePath } from '$lib/features/nodes';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { collectBlocks, collectionConfig, COLLECTION_BLOCK, MAX_COLLECTION_LIMIT, type CollectionBlockData, type EmbedMember } from '$lib/features/content';
import { membersOfMany } from './members.server';
import type { CollectionMember } from './types';

const HIDDEN: CollectionBlockData = { state: 'hidden' };

const embedMember = (member: CollectionMember): EmbedMember => ({
  id: member.id,
  type: member.type,
  title: member.title,
  href: member.url,
  label: member.labelText,
  plugin: member.plugin,
  pluginLabel: member.pluginLabel,
});

/** `total` keeps the full count. */
function cut(data: CollectionBlockData, limit: number): CollectionBlockData {
  return data.state === 'members' ? { ...data, members: data.members.slice(0, limit) } : data;
}

/** Each collection as a block shows it to the viewer, every member they may read; hidden when it is not theirs to read. */
async function collectionEmbeds(ids: readonly string[], user: SessionUser | null): Promise<Map<string, CollectionBlockData>> {
  const out = new Map<string, CollectionBlockData>(ids.map((id) => [id, HIDDEN]));
  if (ids.length === 0) return out;
  const rows = await db<{ id: string; title: string; slug: string; namespace_slug: string | null; plugin: string | null }[]>`
    select n.id, n.title, n.slug, ${db.unsafe(namespaceSlugColumn())}, c.plugin
    from collections c join nodes n on n.id = c.id ${db.unsafe(namespaceJoin('n'))}
    where c.id = any(${[...ids]}::uuid[]) and ${readableNodes(user, 'n')}`;
  const members = await membersOfMany(
    rows.filter((r) => !r.plugin).map((r) => r.id),
    user
  );
  for (const r of rows) {
    const node = { id: r.id, title: r.title, href: nodePath(r.namespace_slug, r.slug) };
    if (r.plugin) {
      out.set(r.id, { state: 'unavailable', node });
      continue;
    }
    const list = (members.get(r.id) ?? []).map(embedMember);
    out.set(r.id, { state: 'members', node, members: list, total: list.length });
  }
  return out;
}

/** One collection as a block shows it to the viewer, for the editor: at most as many members as a block may show. */
export async function collectionEmbed(id: string, user: SessionUser | null): Promise<CollectionBlockData> {
  return cut((await collectionEmbeds([id], user)).get(id) ?? HIDDEN, MAX_COLLECTION_LIMIT);
}

/** By block id. A failed lookup hides every block and is logged; it never fails the page. */
export async function resolveCollectionBlocks(doc: unknown, user: SessionUser | null, log?: Logger): Promise<Record<string, CollectionBlockData>> {
  const blocks = (collectBlocks(doc, (type) => type === COLLECTION_BLOCK).get(COLLECTION_BLOCK) ?? [])
    .map((block) => ({ blockId: block.blockId, config: collectionConfig(block.attrs) }))
    .filter((block): block is { blockId: string; config: ReturnType<typeof collectionConfig> & { nodeId: string } } => block.config.nodeId !== null);
  if (blocks.length === 0) return {};
  try {
    const embeds = await collectionEmbeds([...new Set(blocks.map((b) => b.config.nodeId))], user);
    return Object.fromEntries(blocks.map((b) => [b.blockId, cut(embeds.get(b.config.nodeId) ?? HIDDEN, b.config.limit)]));
  } catch (error) {
    if (log) {
      logEvent(log, 'error.unhandled', {
        errorClass: errorClass(error),
        message: `collection blocks: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return Object.fromEntries(blocks.map((b) => [b.blockId, HIDDEN]));
  }
}
