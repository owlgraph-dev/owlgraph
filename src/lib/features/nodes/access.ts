// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The node check of authorization, after the role check's can()
// (docs/architecture/authorization.md, "Two checks"). Pure: the caller looks up shares and
// membership (./access.server.ts). canReadNode's SQL twin is readableNodes().
import type { SessionUser } from '#lib/features/auth/index.ts';

export type Visibility = 'public' | 'internal' | 'restricted';

// A null visibility inherits the space's access_level, live; a value is an
// override. space_access_level is optional only for fixtures with a concrete
// visibility; real callers always supply it.
export interface NodeAccess {
  id: string;
  visibility: string | null;
  created_by: string | null;
  space_access_level?: Visibility;
}

// Falls back to 'restricted': a caller that forgot to join
// space_access_level must fail closed.
export function effectiveVisibility(node: NodeAccess): Visibility {
  return (node.visibility as Visibility | null) ?? node.space_access_level ?? 'restricted';
}

export function canReadNode(
  user: SessionUser | null | undefined,
  node: NodeAccess,
  isShared = false,
  isSpaceMember = false
): boolean {
  const effective = effectiveVisibility(node);
  if (effective === 'public') return true;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (effective === 'internal') return true;
  if (node.created_by === user.id) return true;
  // Restricted: an inheriting node's readers are its space's members, an
  // overriding node's its share list.
  return node.visibility === null ? isSpaceMember : isShared;
}

// One rule for every node, whatever it holds
// (docs/adr/0027-one-rule-says-who-may-change-a-node.md): an editor changes
// every node they may read, a viewer none.
export function canWriteNode(
  user: SessionUser | null | undefined,
  node: NodeAccess,
  isShared = false,
  isSpaceMember = false
): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // Before ownership: an owner lowered to viewer keeps no write access.
  if (user.role === 'viewer') return false;
  // A restricted node takes the same effective visibility and readers as
  // canReadNode, who may write as well as read.
  if (effectiveVisibility(node) === 'restricted') {
    if (node.created_by === user.id) return true;
    return node.visibility === null ? isSpaceMember : isShared;
  }
  return true;
}
