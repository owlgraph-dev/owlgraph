// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Identifiers say nodeClass, clear of the `class` keyword; "class" is the
// user-facing term.

// 'type' is a node type, 'domain' a class below one (docs/architecture/semantic-layer.md).
// The abstract 'root' never reaches a picker.
export type NodeClassKind = 'root' | 'type' | 'domain';

export interface NodeClassOption {
  id: string;
  slug: string;
  label: string;
  description: string;
  kind: NodeClassKind;
  parentId: string | null;
  // Which nodes this class can be assigned to; null only for the root.
  nodeType: string | null;
  // Root 0, a node type 1, its subclasses 2, …
  depth: number;
}

// A group giving a node fields, and the class on its chain that carries it.
export interface ClassFieldGroup {
  slug: string;
  label: string;
  fromClass: { id: string; slug: string; label: string };
}

// The class, its chain's groups nearest first, and their definitions, the
// nearest winning a collision (mergeChainDefinitions).
export interface ClassFields {
  nodeClass: NodeClassOption & { overviewPath: string | null };
  groups: ClassFieldGroup[];
  definitions: { name: string; label: string; datatype: string; description: string; group: string }[];
}
