// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The stored document as JSON. Structural, since a block kind is just a `type`
// string; a walker takes a typed view of a node's attrs through attrsOf(). That
// cast is the trust boundary: the editor's schema and the persist-time
// sanitizer guarantee the shapes, and walkers don't re-validate them.

export type Attrs = Record<string, unknown>;

export interface JsonMark {
  type: string;
  attrs?: Attrs;
}

export interface JsonNode {
  type: string;
  attrs?: Attrs;
  content?: JsonNode[];
  marks?: JsonMark[];
  text?: string;
}

export interface JsonDoc extends JsonNode {
  type: 'doc';
}

/** `{}` when the node carries none; stored documents may predate an attribute. */
export function attrsOf<T extends object>(node: { attrs?: Attrs } | null | undefined): T {
  return (node?.attrs ?? {}) as unknown as T;
}
