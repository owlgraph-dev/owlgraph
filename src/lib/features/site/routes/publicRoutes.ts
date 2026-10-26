// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids viewable without a session, composed into the sign-in gate by
// src/lib/shell/publicRoutes.ts; each route still enforces its own visibility.
export const publicRoutes = [
  '/',
  '/api/media/branding/logo/[id]',
  // The compiled custom stylesheet: anonymous viewers render page content too.
  '/api/styles/site/[hash]',
] as const;
