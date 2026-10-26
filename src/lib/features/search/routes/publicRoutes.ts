// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids viewable without a session, composed into the sign-in gate by
// src/lib/shell/publicRoutes.ts. Each route still enforces its own visibility.
export const publicRoutes = [
  // The list query applies the visibility predicate itself, and the filters'
  // options come from readable content (docs/architecture/search.md).
  '/search',
  // The same state, counted the same way.
  '/api/search-count',
] as const;
