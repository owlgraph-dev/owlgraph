// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What the read route hands a node's header (docs/architecture/semantic-layer.md, "A node's
// page"): words resolved for the viewer's interface, lists pruned to what they may read.
import type { Visibility } from './access';

/** The node types (docs/architecture/overview.md, "The node model"). */
export type NodeType = 'page' | 'document' | 'collection';
export const NODE_TYPES: readonly NodeType[] = ['page', 'document', 'collection'];

/** A node another one is related to, as a header links it. */
export interface RelatedNodeView {
  id: string;
  type: NodeType;
  title: string;
  href: string;
}

/** One group of a node's relationships: one type, one direction — or the untyped links to it. */
export interface RelationshipGroupView {
  /** `<type>:<direction>`; the untyped links' is `:incoming`. */
  key: string;
  relationshipType: string | null;
  direction: 'outgoing' | 'incoming';
  /** From the node's side: a type's label going out, its inverse coming in; "Referenced by" for untyped links. */
  label: string;
  /** How many the viewer may read in all; `nodes` lists the first of them. */
  total: number;
  nodes: RelatedNodeView[];
}

/** The header of a node's own page. */
export interface NodeHeaderView {
  /** The namespace it sits in, by name — the breadcrumb's first step. */
  namespace: string;
  title: string;
  /** The language of its title and its field values (docs/architecture/languages.md). */
  locale: string;
  /** Its class, and the class's overview page when it has one. */
  nodeClass: { label: string; href: string | null } | null;
  /** The integration its source belongs to, and how the node can be read; null for a node of the core's own. */
  source: { label: string; readsVia: string | null } | null;
  /** Who may read it, as it holds now (an inherited visibility resolved). */
  visibility: Visibility;
  /** Its class's fields that are set, in definition order: the short ones as rows, the long ones as sections. */
  properties: { short: { name: string; label: string; value: string }[]; long: { name: string; label: string; value: string }[] };
  tags: string[];
  /** What it holds, in a few words ("5 entries · 2 linked"); null for nothing to say. */
  contains: string | null;
  relationships: RelationshipGroupView[];
  /** What its source offers to do with it. */
  actions: { id: string; label: string; href: string; external: boolean }[];
}
