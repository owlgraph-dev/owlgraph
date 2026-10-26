// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import * as m from '$lib/paraglide/messages';

/** "Contains: …", the excerpt of a collection found by a member's title; '' for none. */
export function containsSnippet(memberTitle: string | null | undefined): string {
  return memberTitle ? m.search_contains_member({ title: memberTitle }) : '';
}
