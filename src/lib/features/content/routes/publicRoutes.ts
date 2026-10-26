// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route ids reachable without a session, composed into the sign-in gate by
// src/lib/shell/publicRoutes.ts. Each route still enforces its own visibility.
export const publicRoutes = [
  // The font engine fetches @font-face URLs on anonymous pages too.
  '/api/media/fonts/[id]',
  // The Mermaid render frame (blocks/diagram/mermaidFrame.ts), for anonymous readers too.
  '/api/embed/mermaid',
] as const;
