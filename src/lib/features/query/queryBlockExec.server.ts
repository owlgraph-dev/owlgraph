// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Runs each embedded queryBlock under the viewer's permissions. renderDoc is
// synchronous, so the page loader runs this first and hands it the results.
import type { SessionUser } from '$lib/features/auth/server';
import { logEvent, logger, errorClass } from '$lib/platform/logger.server';
import { resolveUserLabels } from '$lib/features/auth/server';
import { getNodes, type ContentNodeHit } from './graphql/nodes.server';
import { attrsOf, type QueryBlockResult, type QueryBlockResultItem, type JsonNode } from '$lib/features/content';
import { getNodeProperties } from '$lib/features/semantic/server';
import { fromWireFilter, fromWireOrderBy, type WireNodeFilter, type WireOrderByInput } from './nodeFilter';
import { fromWireTraversalQuery, type WireTraversalQuery } from './traversal';
import { traverse } from './graphql/traverse.server';
import { resolveNamespaceLabels } from '$lib/features/namespaces/server';


export interface QueryBlockAttrs {
  // In the GraphQL wire format (nodeFilter.ts); mutually exclusive.
  filter: WireNodeFilter | null;
  traversal: WireTraversalQuery | null;
  // Resolved here to {nodeIds:[pageId]}, so no magic id reaches the GraphQL schema.
  fromCurrentPage?: boolean;
  first?: number | null;
  orderBy?: WireOrderByInput | null;
}

// A page's render-time query cost, on top of each query's own caps.
const MAX_QUERY_BLOCKS_PER_PAGE = 10;
const QUERY_BLOCK_TIMEOUT_MS = 3000;

const QUERY_NODE_TYPES = new Set(['queryBlock']);

export function collectQueryBlocks(doc: JsonNode): { blockId: string; attrs: QueryBlockAttrs }[] {
  const out: { blockId: string; attrs: QueryBlockAttrs }[] = [];
  function walk(node: JsonNode) {
    if (!node) return;
    const a = attrsOf<{ blockId?: string } & Partial<QueryBlockAttrs>>(node);
    if (QUERY_NODE_TYPES.has(node.type) && a.blockId) {
      out.push({
        blockId: a.blockId,
        attrs: {
          filter: a.filter ?? null,
          traversal: a.traversal ?? null,
          fromCurrentPage: a.fromCurrentPage ?? false,
          first: a.first,
          orderBy: a.orderBy ?? null
        }
      });
    }
    for (const child of node.content ?? []) walk(child);
  }
  walk(doc);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function runTraversalBlock(user: SessionUser | null, attrs: QueryBlockAttrs, pageId: string) {
  const query = fromWireTraversalQuery(attrs.traversal!);
  if (attrs.fromCurrentPage) query.start = { nodeIds: [pageId], filter: null };
  return traverse(user, { query, first: attrs.first ?? 20, offset: 0 });
}

async function runOne(user: SessionUser | null, attrs: QueryBlockAttrs, pageId: string): Promise<QueryBlockResult> {
  if (!attrs.filter && !attrs.traversal) return { state: 'unconfigured' };
  try {
    const nodes = attrs.traversal
      ? await withTimeout(runTraversalBlock(user, attrs, pageId), QUERY_BLOCK_TIMEOUT_MS)
      : await withTimeout(
          getNodes(user, { filter: fromWireFilter(attrs.filter!), first: attrs.first ?? 20, orderBy: fromWireOrderBy(attrs.orderBy) }),
          QUERY_BLOCK_TIMEOUT_MS
        );
    if (nodes.length === 0) return { state: 'empty' };
    // One lookup each for the whole result, not one per item.
    const namespaceIds = [...new Set(nodes.map((n: ContentNodeHit) => n.namespaceId))];
    const creatorIds = [...new Set(nodes.map((n: ContentNodeHit) => n.createdBy).filter((id): id is string => id != null))];
    const [namespaceLabels, creatorLabels] = await Promise.all([resolveNamespaceLabels(namespaceIds), resolveUserLabels(creatorIds)]);
    const items = await Promise.all(
      nodes.map(async (n: ContentNodeHit): Promise<QueryBlockResultItem> => {
        const pageProps = await getNodeProperties(n.id);
        const properties = pageProps.map((a) => ({ name: a.name, value: a.value }));
        return {
          id: n.id,
          title: n.title,
          url: n.url,
          slug: n.slug,
          createdAt: n.createdAt,
          updatedAt: n.updatedAt,
          type: n.type,
          namespaceLabel: namespaceLabels.get(n.namespaceId) ?? '',
          creatorLabel: n.createdBy ? (creatorLabels.get(n.createdBy) ?? '') : '',
          classLabel: n.className,
          externalUrl: n.externalUrl ?? '',
          locale: n.locale,
          properties
        };
      })
    );
    return { state: 'ok', items };
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') {
      logEvent(logger, 'query.limit_hit', {
        limit: 'query_block_timeout',
        value: QUERY_BLOCK_TIMEOUT_MS,
        cap: QUERY_BLOCK_TIMEOUT_MS,
        via: 'page',
      });
      return { state: 'timeout' };
    }
    // The cause stays out of the result, which public pages render; only the log has it.
    logEvent(logger, 'error.unhandled', {
      errorClass: errorClass(err),
      message: 'Query block execution failed',
      stack: err instanceof Error ? err.stack : undefined,
    });
    return { state: 'error' };
  }
}

// Never throws: every failure degrades to that block's own state. Error states
// carry no message: this backs public render paths (the public page, MCP's
// get_page_html), so no schema or validation detail reaches an anonymous viewer.
export async function resolveQueryBlocks(doc: JsonNode, user: SessionUser | null, pageId: string): Promise<Record<string, QueryBlockResult>> {
  const blocks = collectQueryBlocks(doc);
  const within = blocks.slice(0, MAX_QUERY_BLOCKS_PER_PAGE);
  const over = blocks.slice(MAX_QUERY_BLOCKS_PER_PAGE);

  const result: Record<string, QueryBlockResult> = {};
  if (over.length > 0) {
    logEvent(logger, 'query.limit_hit', {
      limit: 'query_blocks_per_page',
      value: blocks.length,
      cap: MAX_QUERY_BLOCKS_PER_PAGE,
      via: 'page',
    });
  }
  for (const b of over) result[b.blockId] = { state: 'error' };

  const resolved = await Promise.all(within.map((b) => runOne(user, b.attrs, pageId)));
  within.forEach((b, i) => {
    result[b.blockId] = resolved[i];
  });
  return result;
}
