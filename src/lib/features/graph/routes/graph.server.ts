// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /graph, re-exported by src/routes/graph/+page.server.ts.
import { getGraph } from '$lib/features/graph/server';
import { listNodeClassOptions } from '$lib/features/semantic/server';
import type { ServerLoadEvent } from '@sveltejs/kit';

export const load = async ({ locals }: ServerLoadEvent) => {
  // The viewer's namespaces come from the root layout's data.
  const [graph, classOptions] = await Promise.all([getGraph(locals.user), listNodeClassOptions()]);
  return { ...graph, classOptions };
};
