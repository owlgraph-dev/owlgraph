// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A route's style-src class by route id (csp.ts assigns the same by path).
// Strict unless an authenticated tool on it writes inline style attributes. A
// policy belongs to the document, so a link from a strict route into a loose
// one is a full navigation (`data-sveltekit-reload`).
import type { StyleRouteKind } from './csp';

// Under /api/embed with the other asset namespaces: the app's machinery, not a
// page. A page route, not a +server.ts, so the frame's script gets bundled.
export const MERMAID_FRAME_ROUTE = '/api/embed/mermaid';

const LOOSE_ROUTE_IDS: ReadonlySet<string> = new Set(['/[[namespace=namespace]]/[slug]/edit', '/settings']);
const LOOSE_ROUTE_PREFIXES = ['/settings/', '/dev/'] as const;

export function styleRouteKind(routeId: string | null | undefined): StyleRouteKind {
  if (!routeId) return 'strict';
  if (routeId === MERMAID_FRAME_ROUTE) return 'frame';
  if (LOOSE_ROUTE_IDS.has(routeId)) return 'loose';
  if (LOOSE_ROUTE_PREFIXES.some((prefix) => routeId.startsWith(prefix))) return 'loose';
  return 'strict';
}
