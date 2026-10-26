// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Resolved for each reader before the page renders, never from the author's view:
// a document the reader may not read, or a gone one, is `hidden` and the block
// renders nothing (docs/architecture/blocks/node-embeds.md, "Collection and document blocks").
import { db } from '$lib/platform/db.server';
import { errorClass, logEvent, type Logger } from '$lib/platform/logger.server';
import type { SessionUser } from '$lib/features/auth/server';
import { nodePath } from '$lib/features/nodes';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { collectBlocks, documentConfig, DOCUMENT_BLOCK, type DocumentBlockData } from '$lib/features/content';
import { documentContentPath } from './client';
import { externalHost, safeExternalHref } from './externalUrl';

const HIDDEN: DocumentBlockData = { state: 'hidden' };

const iso = (value: string | Date | null) => (value ? new Date(value).toISOString() : null);

/** Each document as a block shows it to the viewer; hidden when it is not theirs to read. */
async function documentEmbeds(ids: readonly string[], user: SessionUser | null): Promise<Map<string, DocumentBlockData>> {
  const out = new Map<string, DocumentBlockData>(ids.map((id) => [id, HIDDEN]));
  if (ids.length === 0) return out;
  const rows = await db<
    {
      id: string;
      title: string;
      slug: string;
      namespace_slug: string | null;
      source: 'upload' | 'link' | 'plugin';
      filename: string | null;
      mime: string | null;
      size: number | null;
      external_url: string | null;
      updated_at: string | Date | null;
    }[]
  >`
    select n.id, n.title, n.slug, ${db.unsafe(namespaceSlugColumn())}, d.source, d.filename, d.mime, d.size, d.external_url, n.updated_at
    from documents d join nodes n on n.id = d.id ${db.unsafe(namespaceJoin('n'))}
    where d.id = any(${[...ids]}::uuid[]) and ${readableNodes(user, 'n')}`;
  for (const r of rows) {
    const node = { id: r.id, title: r.title, href: nodePath(r.namespace_slug, r.slug) };
    if (r.source === 'plugin') {
      out.set(r.id, { state: 'unavailable', node });
    } else if (r.source === 'link') {
      // The host alone: the page never carries the address itself.
      const href = safeExternalHref(r.external_url);
      out.set(r.id, { state: 'file', node, source: 'link', file: null, linkHost: href ? externalHost(href) || null : null, content: { view: documentContentPath(r.id), download: null }, modified: iso(r.updated_at) });
    } else {
      out.set(r.id, {
        state: 'file',
        node,
        source: 'upload',
        file: { filename: r.filename ?? r.title, mime: r.mime, size: r.size },
        linkHost: null,
        content: { view: documentContentPath(r.id), download: documentContentPath(r.id, { download: true }) },
        modified: iso(r.updated_at),
      });
    }
  }
  return out;
}

/** One document as a block shows it to the viewer, for the editor. */
export async function documentEmbed(id: string, user: SessionUser | null): Promise<DocumentBlockData> {
  return (await documentEmbeds([id], user)).get(id) ?? HIDDEN;
}

/** By block id. A failed lookup hides every block and is logged; it never fails the page. */
export async function resolveDocumentBlocks(doc: unknown, user: SessionUser | null, log?: Logger): Promise<Record<string, DocumentBlockData>> {
  const blocks = (collectBlocks(doc, (type) => type === DOCUMENT_BLOCK).get(DOCUMENT_BLOCK) ?? [])
    .map((block) => ({ blockId: block.blockId, nodeId: documentConfig(block.attrs).nodeId }))
    .filter((block): block is { blockId: string; nodeId: string } => block.nodeId !== null);
  if (blocks.length === 0) return {};
  try {
    const embeds = await documentEmbeds([...new Set(blocks.map((b) => b.nodeId))], user);
    return Object.fromEntries(blocks.map((b) => [b.blockId, embeds.get(b.nodeId) ?? HIDDEN]));
  } catch (error) {
    if (log) {
      logEvent(log, 'error.unhandled', {
        errorClass: errorClass(error),
        message: `document blocks: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return Object.fromEntries(blocks.map((b) => [b.blockId, HIDDEN]));
  }
}
