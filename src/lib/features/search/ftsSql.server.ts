// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How a term matches, ranks and is excerpted, shared by the overlay and the
// /search page. Each row's search_tsv uses its content language's configuration,
// so the term is parsed once per configuration and OR-ed into one tsquery; a
// `-term` exclusion holds within each language's branch only (docs/architecture/languages.md).
// The term is always a parameter; aliases are callers' literals, never input.
import type postgres from 'postgres';
import { db } from '$lib/platform/db.server';
import type { SessionUser } from '$lib/features/auth/server';
import { readableNodes } from '$lib/features/nodes/server';
import { CONTAINS } from '$lib/features/collections/server';
import { HEADLINE_OPTS } from './searchSnippet';
import { regconfigCaseSql, searchRegconfigs } from './contentRegconfig';

// websearch_to_tsquery(cfg₁, q) || websearch_to_tsquery(cfg₂, q) || …
function contentTsquery(term: string): postgres.Fragment {
  return searchRegconfigs()
    .map((config) => db`websearch_to_tsquery(${config}::regconfig, ${term})`)
    .reduce((a, b) => db`${a} || ${b}`);
}

/** Ids whose text matches, by each table's own GIN probe, for an `id in (…)`. */
export function ftsMatchingIds(term: string): postgres.Fragment {
  return db`(select id from pages where search_tsv @@ (${contentTsquery(term)})
    union all select id from documents where search_tsv @@ (${contentTsquery(term)})
    union all select id from collections where search_tsv @@ (${contentTsquery(term)}))`;
}

/** Ids whose title, the vector's A-weighted part, matches. */
function ftsTitleMatchingIds(term: string): postgres.Fragment {
  const titled = (table: string) =>
    db`select id from ${db.unsafe(table)} where search_tsv @@ (${contentTsquery(term)}) and ts_filter(search_tsv, '{a}'::"char"[]) @@ (${contentTsquery(term)})`;
  return db`(${titled('pages')} union all ${titled('documents')} union all ${titled('collections')})`;
}

/**
 * Collections holding a readable member whose title matches. Asked at query time
 * for this viewer, so nothing of a member is stored with its collection: an
 * unreadable member never finds it.
 */
export function memberTitleMatches(user: SessionUser | null, term: string): postgres.Fragment {
  return db`(select l.source_id from edges l join nodes m on m.id = l.target_id
    where l.relationship_type = ${CONTAINS} and l.target_id in ${ftsTitleMatchingIds(term)} and ${readableNodes(user, 'm')})`;
}

/** The highlighted title of the first readable member whose title matches; '' for none. */
export function memberTitleHeadline(alias: string, user: SessionUser | null, term: string): postgres.Fragment {
  return db`coalesce((select ts_headline(${db.unsafe(regconfigCaseSql('m.locale'))}, m.title, ${contentTsquery(term)}, ${HEADLINE_OPTS})
    from edges l join nodes m on m.id = l.target_id
    where l.source_id = ${db.unsafe(alias)}.id and l.relationship_type = ${CONTAINS}
      and l.target_id in ${ftsTitleMatchingIds(term)} and ${readableNodes(user, 'm')}
    order by m.title limit 1), '')`;
}

export function ftsMatches(alias: string, term: string): postgres.Fragment {
  return db`${db.unsafe(alias)}.search_tsv @@ (${contentTsquery(term)})`;
}

/** Title outranks headings or metadata, which outrank body text (A/B/C weights);
 * the three tables share the scale, so their results order together. */
export function ftsRank(alias: string, term: string): postgres.Fragment {
  return db`ts_rank(${db.unsafe(alias)}.search_tsv, ${contentTsquery(term)})`;
}

/** Headings and body, HL_START/HL_STOP-highlighted for parseSnippet; '' without body text. */
export function pageHeadline(alias: string, term: string): postgres.Fragment {
  return db`ts_headline(${db.unsafe(regconfigCaseSql(`${alias}.search_locale`))}, concat_ws(' ', ${db.unsafe(alias)}.search_headings, ${db.unsafe(alias)}.search_body), ${contentTsquery(term)}, ${HEADLINE_OPTS})`;
}

/** Extracted text and metadata; a link document has only metadata. */
export function documentHeadline(alias: string, term: string): postgres.Fragment {
  return db`ts_headline(${db.unsafe(regconfigCaseSql(`${alias}.search_locale`))}, concat_ws(' ', ${db.unsafe(alias)}.search_text, ${db.unsafe(alias)}.search_meta), ${contentTsquery(term)}, ${HEADLINE_OPTS})`;
}

/** Metadata only: a collection has no text of its own. */
export function collectionHeadline(alias: string, term: string): postgres.Fragment {
  return db`ts_headline(${db.unsafe(regconfigCaseSql(`${alias}.search_locale`))}, coalesce(${db.unsafe(alias)}.search_meta, ''), ${contentTsquery(term)}, ${HEADLINE_OPTS})`;
}
