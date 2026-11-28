// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A class is global vocabulary; a space resolves only among those the viewer
// may see, so a hidden one is dropped like an unknown one, never applied or named.
// No value import from the query feature's server half, which imports this
// feature's full-text fragments: the route adapter joins the two.
import type { SessionUser } from '#lib/features/auth/server.ts';
import { getNodeClassBySlug } from '#lib/features/semantic/server.ts';
import { listSpacesForUser } from '#lib/features/spaces/server.ts';
import { localize } from '#lib/platform/i18n/localizedText.ts';
import { DEFAULT_SPACE_PARAM, type SearchParams } from './searchUrl';
import { toListQuery, type SearchListQuery } from './searchQuery';
import type { SearchSpaceOption } from './types';

export interface ResolvedSearch {
  /** The state that took effect: the parsed URL less what was dropped. */
  applied: SearchParams;
  query: SearchListQuery;
  /** The applied class's name, in the interface language. */
  classLabel: string | null;
  spaceName: string | null;
  /** The spaces the viewer may see, by their URL value. */
  spaces: SearchSpaceOption[];
}

export async function resolveSearchParams(user: SessionUser | null, parsed: SearchParams): Promise<ResolvedSearch> {
  const [classRow, spaceRows] = await Promise.all([parsed.class ? getNodeClassBySlug(parsed.class) : null, listSpacesForUser(user)]);
  // The root class is abstract — no picker offers it, so neither does the URL.
  const cls = classRow && classRow.kind !== 'root' ? classRow : null;
  const spaces = spaceRows.map((n) => ({ id: n.id, value: n.is_default ? DEFAULT_SPACE_PARAM : (n.slug ?? DEFAULT_SPACE_PARAM), name: n.name }));
  const ns = parsed.space ? (spaces.find((n) => n.value === parsed.space) ?? null) : null;
  const applied: SearchParams = {
    ...parsed,
    class: cls?.slug ?? null,
    exact: cls ? parsed.exact : false,
    space: ns?.value ?? null,
  };
  return {
    applied,
    query: toListQuery(applied, { classId: cls?.id ?? null, spaceId: ns?.id ?? null }),
    classLabel: cls ? localize(cls.label, cls.slug) : null,
    spaceName: ns?.name ?? null,
    spaces: spaces.map(({ value, name }) => ({ value, name })),
  };
}
