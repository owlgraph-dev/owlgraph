// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /search, re-exported by src/routes/search/+page.server.ts.
// Everything the page offers to pick from comes from what the viewer may read
// (docs/architecture/search.md).
import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { listNodes } from '$lib/features/query/server';
import { getPropertyByLocalName, getTagsForNodes, listClassIdsInUse, listNodeClassOptions, listTagsForUser } from '$lib/features/semantic/server';
import { getDefaultNamespace, resolveNamespaceLabels } from '$lib/features/namespaces/server';
import { resolveSearchParams, searchCardExtras } from '$lib/features/search/server';
import { SEARCH_PAGE_SIZE, clipText, linkHost, parseSearchParams, searchHref, type SearchResultCard } from '$lib/features/search';

// A card's excerpt without a term: the first of these properties it has.
const DESCRIPTION_NAMES = ['description', 'abstract', 'summary'];

export const load = async ({ url, locals }: ServerLoadEvent) => {
  const resolved = await resolveSearchParams(locals.user, parseSearchParams(url.searchParams));
  const { applied } = resolved;
  const [{ items, total }, classOptions, classesInUse, tagOptions] = await Promise.all([
    listNodes(locals.user, resolved.query),
    listNodeClassOptions(),
    listClassIdsInUse(locals.user),
    listTagsForUser(locals.user),
  ]);

  // A page past the end goes to the last, so the address names the page shown.
  const pageCount = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));
  if (applied.page > pageCount) redirect(303, searchHref({ ...applied, page: pageCount }));

  const ids = items.map((i) => i.id);
  const [tags, descriptions, extras, namespaceNames, defaultNamespace] = await Promise.all([
    getTagsForNodes(ids),
    getPropertyByLocalName(ids, DESCRIPTION_NAMES),
    searchCardExtras(ids),
    resolveNamespaceLabels([...new Set(items.map((i) => i.namespaceId))]),
    getDefaultNamespace(),
  ]);
  const classKind = new Map(classOptions.map((c) => [c.id, c.kind]));

  const results: SearchResultCard[] = items.map((item) => {
    const extra = extras.get(item.id);
    const description = descriptions.get(item.id);
    // A title-only match has no snippet and falls back like a list without a term.
    const highlighted = !!item.snippet;
    const excerpt = highlighted ? item.snippet : description ? clipText(description) : (extra?.lead ?? '');
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      url: item.url,
      locale: item.locale,
      // Its kind says more than "Document"; a subclass ("Invoice") still shows.
      className: item.type === 'document' && classKind.get(item.classId) === 'type' ? null : item.className,
      documentKind: extra?.documentKind ?? null,
      linkHost: linkHost(item.externalUrl),
      excerpt,
      highlighted,
      updatedAt: item.updatedAt,
      // The default namespace is the site's root, not worth naming on every card.
      namespaceName: item.namespaceId === defaultNamespace.id ? '' : (namespaceNames.get(item.namespaceId) ?? ''),
      tags: tags.get(item.id) ?? [],
    };
  });

  return {
    applied,
    results,
    total,
    pageCount,
    classLabel: resolved.classLabel,
    namespaceName: resolved.namespaceName,
    // Those readable content carries, plus the applied one so the picker shows it.
    classOptions: classOptions.filter((c) => classesInUse.has(c.id) || c.slug === applied.class),
    tagOptions,
    namespaces: resolved.namespaces,
  };
};
