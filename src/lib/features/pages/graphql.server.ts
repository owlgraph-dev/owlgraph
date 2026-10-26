// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Page-only fields on the shared ContentNode type; the host schema calls
// registerPageNodeFields() with its ContentNode ref.
import type { ObjectRef } from '@pothos/core';
import { builder } from '$lib/features/query/graphql/builder.server';
import { getContentSchemeDefault } from '$lib/features/content/server';
import { resolveContentScheme } from '$lib/features/content';
import { getPageContentScheme } from '$lib/features/pages/server';

export function registerPageNodeFields(ContentNode: ObjectRef<any, { id: string; type: string }>): void {
  builder.objectField(ContentNode, 'contentScheme', (t) =>
    t.string({
      nullable: true,
      description:
        "The colour scheme the page's content renders in: 'light' or 'dark' (pinned), or 'adaptive' (follows each reader's own light/dark scheme) — the page's own choice, else the site default. Null for a node that is not a page.",
      resolve: async (node) => {
        if (node.type !== 'page') return null;
        const [own, site] = await Promise.all([getPageContentScheme(node.id), getContentSchemeDefault()]);
        return resolveContentScheme({ page: own, site });
      },
    })
  );
}
