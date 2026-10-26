// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The async half of ./access.ts: looks up the one fact a restricted node needs,
// namespace membership when it inherits, its share list when it overrides.
import { db } from '$lib/platform/db.server';
import type { SessionUser } from '$lib/features/auth/server';
import { canReadNode, canWriteNode, type NodeAccess, type Visibility } from './access';
import { isNamespaceMember } from './nodes.server';
import type { NodeType } from './types';

export interface NodeAccessRow extends NodeAccess {
  namespace_id: string;
  namespace_access_level: Visibility;
}

// A collection has no share list: a restricted override is its owner's and an
// admin's alone.
export async function isNodeSharedWith(kind: NodeType, nodeId: string, userId: string): Promise<boolean> {
  switch (kind) {
    case 'page':
      return (await db`select 1 from page_shares where page_id = ${nodeId} and user_id = ${userId}`).length > 0;
    case 'document':
      return (await db`select 1 from document_shares where document_id = ${nodeId} and user_id = ${userId}`).length > 0;
    case 'collection':
      return false;
  }
}

async function accessSubjects(user: SessionUser | null, node: NodeAccessRow, kind: NodeType): Promise<[boolean, boolean]> {
  const effective = node.visibility ?? node.namespace_access_level;
  const needsShareCheck = node.visibility !== null && effective === 'restricted';
  const needsMemberCheck = node.visibility === null && effective === 'restricted';
  return Promise.all([
    needsShareCheck && user ? isNodeSharedWith(kind, node.id, user.id) : Promise.resolve(false),
    needsMemberCheck && user ? isNamespaceMember(db, node.namespace_id, user.id) : Promise.resolve(false),
  ]);
}

export async function userCanReadNode(user: SessionUser | null, node: NodeAccessRow, kind: NodeType): Promise<boolean> {
  const [shared, isMember] = await accessSubjects(user, node, kind);
  return canReadNode(user, node, shared, isMember);
}

export async function userCanWriteNode(user: SessionUser | null, node: NodeAccessRow, kind: NodeType): Promise<boolean> {
  const [shared, isMember] = await accessSubjects(user, node, kind);
  return canWriteNode(user, node, kind, shared, isMember);
}
