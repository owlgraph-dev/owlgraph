// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the /search page's load hands its components.
import type { DocumentKind } from './searchCards';
import type { NodeType } from '$lib/features/nodes';

/** One result as its card shows it, the same shape for every node type. */
export interface SearchResultCard {
  id: string;
  type: NodeType;
  title: string;
  url: string;
  /** The content language: `lang` on the title and the excerpt. */
  locale: string;
  /** The class's name in the interface language. Null on a document of the
   * plain document type, whose kind says more than "Document" would. */
  className: string | null;
  documentKind: DocumentKind | null;
  /** A link document's host, shown with its kind. */
  linkHost: string;
  /** The excerpt: around the term's match (with HL_START/HL_STOP marks) when
   * `highlighted`, otherwise a description-like property or the lead text. */
  excerpt: string;
  highlighted: boolean;
  /** ISO timestamp. */
  updatedAt: string;
  /** '' in the default namespace, the site's root. */
  namespaceName: string;
  tags: string[];
}

/** A namespace the viewer may see, by its URL value. */
export interface SearchNamespaceOption {
  value: string;
  name: string;
}


/** A node a picker offers. */
export interface NodeSearchResult {
  type: NodeType;
  id: string;
  title: string;
  /** Its slug within its namespace (a page link keeps it beside the id). */
  slug: string;
  href: string;
  namespace: string | null;
  /** The integration a document or collection comes from (its plugin's id), or null for the core's own. */
  plugin: string | null;
  /** That integration's name. */
  pluginLabel: string | null;
}

/** A page of a node search: the matches, whether more follow, and the types that have a node titled exactly as searched. */
export interface NodeSearchPage {
  results: NodeSearchResult[];
  more: boolean;
  exact: NodeSearchResult['type'][];
}
