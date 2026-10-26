// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The node check of authorization, after the role check's can()
// (docs/architecture/authorization.md, "Two checks"). Pure: the caller looks up shares and
// membership (./access.server.ts). canReadNode's SQL twin is readableNodes().
import type { SessionUser } from '$lib/features/auth';
import type { NodeType } from './types';

export type Visibility = 'public' | 'internal' | 'restricted';

// A null visibility inherits the namespace's access_level, live; a value is an
// override. namespace_access_level is optional only for fixtures with a concrete
// visibility; real callers always supply it.
export interface NodeAccess {
  id: string;
  visibility: string | null;
  created_by: string | null;
  namespace_access_level?: Visibility;
}

// Falls back to 'restricted': a caller that forgot to join
// namespace_access_level must fail closed.
export function effectiveVisibility(node: NodeAccess): Visibility {
  return (node.visibility as Visibility | null) ?? node.namespace_access_level ?? 'restricted';
}

export function canReadNode(
  user: SessionUser | null | undefined,
  node: NodeAccess,
  isShared = false,
  isNamespaceMember = false
): boolean {
  const effective = effectiveVisibility(node);
  if (effective === 'public') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (effective === 'internal') return true;
  if (node.created_by === user.id) return true;
  // Restricted: an inheriting node's readers are its namespace's members, an
  // overriding node's its share list.
  return node.visibility === null ? isNamespaceMember : isShared;
}

export function canWriteNode(
  user: SessionUser | null | undefined,
  node: NodeAccess,
  // Selects the write policy: a document is owner/admin only; a collection is
  // written like a page, since its members are curated together.
  kind: NodeType,
  isShared = false,
  isNamespaceMember = false
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Before ownership: an owner lowered to viewer keeps no write access.
  if (user.role === 'viewer') return false;
  if (kind === 'document') {
    // Only the owner, even for a public or internal document.
    return node.created_by === user.id;
  }
  // A page or collection: restricted ones take the same effective visibility and
  // readers as canReadNode, who may write as well as read.
  if (effectiveVisibility(node) === 'restricted') {
    if (node.created_by === user.id) return true;
    return node.visibility === null ? isNamespaceMember : isShared;
  }
  return true;
}
