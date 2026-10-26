// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A class is global vocabulary; a namespace resolves only among those the viewer
// may see, so a hidden one is dropped like an unknown one, never applied or named.
// No value import from the query feature's server half, which imports this
// feature's full-text fragments: the route adapter joins the two.
import type { SessionUser } from '$lib/features/auth/server';
import { getNodeClassBySlug } from '$lib/features/semantic/server';
import { listNamespacesForUser } from '$lib/features/namespaces/server';
import { localize } from '$lib/platform/i18n/localizedText';
import { DEFAULT_NAMESPACE_PARAM, type SearchParams } from './searchUrl';
import { toListQuery, type SearchListQuery } from './searchQuery';
import type { SearchNamespaceOption } from './types';

export interface ResolvedSearch {
  /** The state that took effect: the parsed URL less what was dropped. */
  applied: SearchParams;
  query: SearchListQuery;
  /** The applied class's name, in the interface language. */
  classLabel: string | null;
  namespaceName: string | null;
  /** The namespaces the viewer may see, by their URL value. */
  namespaces: SearchNamespaceOption[];
}

export async function resolveSearchParams(user: SessionUser | null, parsed: SearchParams): Promise<ResolvedSearch> {
  const [classRow, namespaceRows] = await Promise.all([parsed.class ? getNodeClassBySlug(parsed.class) : null, listNamespacesForUser(user)]);
  // The root class is abstract — no picker offers it, so neither does the URL.
  const cls = classRow && classRow.kind !== 'root' ? classRow : null;
  const namespaces = namespaceRows.map((n) => ({ id: n.id, value: n.is_default ? DEFAULT_NAMESPACE_PARAM : (n.slug ?? DEFAULT_NAMESPACE_PARAM), name: n.name }));
  const ns = parsed.namespace ? (namespaces.find((n) => n.value === parsed.namespace) ?? null) : null;
  const applied: SearchParams = {
    ...parsed,
    class: cls?.slug ?? null,
    exact: cls ? parsed.exact : false,
    namespace: ns?.value ?? null,
  };
  return {
    applied,
    query: toListQuery(applied, { classId: cls?.id ?? null, namespaceId: ns?.id ?? null }),
    classLabel: cls ? localize(cls.label, cls.slug) : null,
    namespaceName: ns?.name ?? null,
    namespaces: namespaces.map(({ value, name }) => ({ value, name })),
  };
}
