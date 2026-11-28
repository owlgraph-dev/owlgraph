// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The async half of ./access.ts: looks up the one fact a restricted node needs,
// space membership when it inherits, its share list when it overrides. Every
// node has a share list, whatever it holds
// (docs/adr/0027-one-rule-says-who-may-change-a-node.md).
import { db } from '#lib/platform/db.server.ts';
import type { SessionUser } from '#lib/features/auth/server.ts';
import { canReadNode, canWriteNode, type NodeAccess, type Visibility } from './access';
import { isSpaceMember } from './nodes.server';

export interface NodeAccessRow extends NodeAccess {
  space_id: string;
  space_access_level: Visibility;
}

export async function isNodeSharedWith(nodeId: string, userId: string): Promise<boolean> {
  return (await db`select 1 from node_shares where node_id = ${nodeId} and user_id = ${userId}`).length > 0;
}

/** The users a node is shared with. */
export async function getNodeShares(nodeId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`select user_id from node_shares where node_id = ${nodeId} order by user_id`;
  return rows.map((r) => r.user_id);
}

export interface SharesChange {
  /** The stored list. */
  shares: string[];
  added: string[];
  removed: string[];
}

/** Replaces the node's share list wholesale; says what it now is and what changed, for the log. */
export async function setNodeShares(nodeId: string, userIds: unknown): Promise<SharesChange> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map((u) => String(u)))] : [];
  return db.begin(async (sql) => {
    const before = (await sql<{ user_id: string }[]>`select user_id from node_shares where node_id = ${nodeId}`).map((r) => r.user_id);
    await sql`delete from node_shares where node_id = ${nodeId}`;
    for (const uid of ids) {
      await sql`insert into node_shares (node_id, user_id) values (${nodeId}, ${uid}) on conflict do nothing`;
    }
    return { shares: ids, added: ids.filter((id) => !before.includes(id)), removed: before.filter((id) => !ids.includes(id)) };
  });
}

async function accessSubjects(user: SessionUser | null, node: NodeAccessRow): Promise<[boolean, boolean]> {
  const effective = node.visibility ?? node.space_access_level;
  const needsShareCheck = node.visibility !== null && effective === 'restricted';
  const needsMemberCheck = node.visibility === null && effective === 'restricted';
  return Promise.all([
    needsShareCheck && user ? isNodeSharedWith(node.id, user.id) : Promise.resolve(false),
    needsMemberCheck && user ? isSpaceMember(db, node.space_id, user.id) : Promise.resolve(false),
  ]);
}

export async function userCanReadNode(user: SessionUser | null, node: NodeAccessRow): Promise<boolean> {
  const [shared, isMember] = await accessSubjects(user, node);
  return canReadNode(user, node, shared, isMember);
}

export async function userCanWriteNode(user: SessionUser | null, node: NodeAccessRow): Promise<boolean> {
  const [shared, isMember] = await accessSubjects(user, node);
  return canWriteNode(user, node, shared, isMember);
}
