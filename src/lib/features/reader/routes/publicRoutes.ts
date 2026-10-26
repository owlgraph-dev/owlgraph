// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids viewable without a session, composed into the sign-in gate by
// src/lib/shell/publicRoutes.ts. Each route still enforces its own visibility.
export const publicRoutes = [
  '/[[namespace=namespace]]/[slug]',
  // The unguessable token is the access check (nodes/shareLinks.server.ts).
  '/share/[id]',
  '/share/[id]/content',
] as const;
