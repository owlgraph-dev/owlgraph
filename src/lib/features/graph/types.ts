// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { NodeType } from '$lib/features/nodes';

export interface GraphNode {
  id: string;
  type?: NodeType;
  slug?: string;
  namespaceSlug?: string | null;
  title: string;
  // Optional, so a consumer can hand the view bare {id, title} nodes.
  classId?: string;
  namespaceId?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  edgeId: string;
  // Only on a typed edge.
  relationshipType?: string;
  relationshipLabel?: string;
  properties?: { name: string; label: string; value: string }[];
}
