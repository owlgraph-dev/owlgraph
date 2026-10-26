// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids viewable without a session, composed into the sign-in gate by
// src/lib/shell/publicRoutes.ts; each route still enforces its own rules.
export const publicRoutes = [
  // Public pages' blocks call these for anonymous readers too; the dispatcher
  // enforces each plugin route's declared access (docs/architecture/plugins.md, "Routes").
  '/api/plugins/[plugin]/[...path]',
] as const;
