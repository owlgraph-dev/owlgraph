// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids reachable without a session, for the sign-in gate
// (src/lib/shell/publicRoutes.ts). Each route still checks visibility itself.
export const publicRoutes = [
  // Asset bytes are access-checked per asset; avatars are public by design.
  '/api/media/[id]',
  '/api/media/avatar/[userId]',
] as const;
