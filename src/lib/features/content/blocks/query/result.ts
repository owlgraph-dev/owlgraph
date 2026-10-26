// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the page render expects per query block id, produced by
// features/query/queryBlockExec.server.ts. Defined here so the content feature
// never depends on query execution.

export interface QueryBlockResultItem {
  id: string;
  title: string;
  url: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  // Display labels, never raw ids; mirrors ResultProperties for bindTemplate().
  namespaceLabel: string;
  creatorLabel: string;
  classLabel: string;
  // A link document's external URL, '' for every other node.
  externalUrl: string;
  // The language the node's content is in (a code: de, en).
  locale: string;
  // All of them: the binding doesn't know ahead which keys a template uses.
  properties: { name: string; value: string }[];
}

export type QueryBlockResult =
  | { state: 'unconfigured' }
  | { state: 'empty' }
  | { state: 'ok'; items: QueryBlockResultItem[] }
  | { state: 'error' }
  | { state: 'timeout' };
