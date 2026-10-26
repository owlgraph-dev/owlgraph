// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { SessionUser } from '$lib/features/auth/server';
import { timed } from '$lib/platform/logger.server';
import { db } from '$lib/platform/db.server';
import { readableNodes, namespaceJoin, namespaceSlugColumn, type NodeType } from '$lib/features/nodes/server';
import { DOCUMENT_COLUMNS, DOCUMENT_FROM, type DocumentRow } from '$lib/features/documents/server';
import { COLLECTION_COLUMNS, COLLECTION_FROM, type CollectionRow } from '$lib/features/collections/server';
import { collectionHeadline, documentHeadline, ftsMatches, ftsRank, memberTitleHeadline, memberTitleMatches, pageHeadline } from './ftsSql.server';
import { containsSnippet } from './containsSnippet.server';
import { clampFirst, clampOffset } from '$lib/platform/pagination';
import { nodePath } from '$lib/features/nodes';

export interface SearchHit {
  id: string;
  type: NodeType;
  title: string;
  /** Relative URL at which the item can be viewed. */
  url: string;
  /** A short highlighted excerpt (ts_headline), or '' when there's no body text. */
  snippet: string;
}

export interface SearchArgs {
  text: string;
  types?: NodeType[] | null;
  first?: number | null;
  offset?: number | null;
}

/**
 * Search across pages, documents and collections. Visibility is enforced inside
 * each source's query (readableNodes), so no row the user may not read leaves
 * here. The sources share the ts_rank scale, so results merge by relevance.
 */
export async function searchContent(user: SessionUser | null, args: SearchArgs): Promise<SearchHit[]> {
  const text = (args.text ?? '').trim();
  if (!text) return [];

  const first = clampFirst(args.first);
  const offset = clampOffset(args.offset);
  const want = (t: NodeType) => !args.types || args.types.length === 0 || args.types.includes(t);

  // Overfetch enough from each source to cover the requested window after merge.
  const fetchN = first + offset;
  const scored: { hit: SearchHit; rank: number }[] = [];

  if (want('page')) {
    for (const p of await searchPagesFts(user, text, fetchN)) {
      scored.push({ hit: { id: p.id, type: 'page', title: p.title, url: nodePath(p.namespace_slug, p.slug), snippet: p.snippet }, rank: p.rank });
    }
  }
  if (want('document')) {
    for (const d of await searchDocumentsFts(user, text, fetchN)) {
      scored.push({ hit: { id: d.id, type: 'document', title: d.title, url: nodePath(d.namespace_slug, d.slug), snippet: d.snippet }, rank: d.rank });
    }
  }
  if (want('collection')) {
    for (const c of await searchCollectionsFts(user, text, fetchN)) {
      const snippet = c.snippet || containsSnippet(c.member_snippet);
      scored.push({ hit: { id: c.id, type: 'collection', title: c.title, url: nodePath(c.namespace_slug, c.slug), snippet }, rank: c.rank });
    }
  }

  scored.sort((a, b) => b.rank - a.rank);
  return scored.slice(offset, offset + first).map((s) => s.hit);
}

// Matching, ranking and the excerpt are ftsSql.server.ts's, shared with the
// /search page. Each source is timed under a label, never SQL text or
// parameters (docs/architecture/logging.md, "Performance and limits").
function searchPagesFts(...args: Parameters<typeof searchPagesFtsImpl>): ReturnType<typeof searchPagesFtsImpl> {
  return timed('search.pages_fts', () => searchPagesFtsImpl(...args)) as ReturnType<typeof searchPagesFtsImpl>;
}

async function searchPagesFtsImpl(
  user: SessionUser | null,
  q: string,
  limit = 12
): Promise<{ id: string; slug: string; namespace_slug: string | null; title: string; rank: number; snippet: string }[]> {
  const term = q.trim();
  if (!term) return [];
  return db`
    select p.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title,
           ${ftsRank('p', term)} as rank,
           ${pageHeadline('p', term)} as snippet
    from pages p join nodes n on n.id = p.id ${db.unsafe(namespaceJoin('n'))}
    where ${ftsMatches('p', term)} and ${readableNodes(user, 'n')}
    order by rank desc, n.updated_at desc limit ${limit}`;
}

// A link document has no file text: title and metadata are all it is found by.
function searchDocumentsFts(...args: Parameters<typeof searchDocumentsFtsImpl>): ReturnType<typeof searchDocumentsFtsImpl> {
  return timed('search.documents_fts', () => searchDocumentsFtsImpl(...args)) as ReturnType<typeof searchDocumentsFtsImpl>;
}

async function searchDocumentsFtsImpl(
  user: SessionUser | null,
  q: string,
  limit = 6
): Promise<(DocumentRow & { rank: number; snippet: string })[]> {
  const term = q.trim();
  if (!term) return [];
  return db`
    select ${db.unsafe(DOCUMENT_COLUMNS)},
           ${ftsRank('d', term)} as rank,
           ${documentHeadline('d', term)} as snippet
    ${db.unsafe(DOCUMENT_FROM)}
    where ${ftsMatches('d', term)} and ${readableNodes(user, 'n')}
    order by rank desc, n.created_at desc limit ${limit}`;
}

// A collection has no text of its own; one that doesn't match itself is found
// by a readable member's title, which is then its excerpt ("Contains: …").
function searchCollectionsFts(...args: Parameters<typeof searchCollectionsFtsImpl>): ReturnType<typeof searchCollectionsFtsImpl> {
  return timed('search.collections_fts', () => searchCollectionsFtsImpl(...args)) as ReturnType<typeof searchCollectionsFtsImpl>;
}

async function searchCollectionsFtsImpl(
  user: SessionUser | null,
  q: string,
  limit = 6
): Promise<(CollectionRow & { rank: number; snippet: string; member_snippet: string })[]> {
  const term = q.trim();
  if (!term) return [];
  return db`
    select ${db.unsafe(COLLECTION_COLUMNS)},
           ${ftsRank('c', term)} as rank,
           case when ${ftsMatches('c', term)} then ${collectionHeadline('c', term)} else '' end as snippet,
           case when ${ftsMatches('c', term)} then '' else ${memberTitleHeadline('c', user, term)} end as member_snippet
    ${db.unsafe(COLLECTION_FROM)}
    where (${ftsMatches('c', term)} or c.id in ${memberTitleMatches(user, term)}) and ${readableNodes(user, 'n')}
    order by rank desc, n.updated_at desc limit ${limit}`;
}
