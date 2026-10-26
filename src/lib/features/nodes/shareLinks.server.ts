// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Share links: capability tokens granting anonymous read access to exactly one
// node, past its visibility and namespace. Stored hashed; free of SvelteKit-only imports.
import { randomBytes } from 'node:crypto';
import { db } from '$lib/platform/db.server';
import { logEvent, logger, type Logger } from '$lib/platform/logger.server';
import { hashToken } from '$lib/features/auth/server';

/**
 * A share link's name in the log. Never the token: it is the whole
 * authorization. Twelve characters of its hash tie lines together (docs/architecture/logging.md).
 */
const tokenHashPrefix = (token: string) => hashToken(token).slice(0, 12);

export interface ShareLinkRow {
  id: string;
  node_id: string;
  label: string;
  created_by: string | null;
  created_at: string;
}

// Returns the raw token once; only its hash is kept. base64url so it is a
// route segment as it stands.
export async function createShareLink(
  nodeId: string,
  userId: string | null,
  label = '',
  log: Logger = logger
): Promise<{ id: string; token: string; label: string; createdAt: string }> {
  const trimmedLabel = label.trim().slice(0, 120);
  const token = randomBytes(24).toString('base64url');
  const [row] = await db<{ id: string; created_at: string }[]>`
    insert into share_links (node_id, token_hash, label, created_by)
    values (${nodeId}, ${hashToken(token)}, ${trimmedLabel}, ${userId})
    returning id, created_at`;
  // Named-user grants log as node.shares_changed instead (docs/architecture/logging.md).
  logEvent(log, 'share.created', { shareLinkId: row.id, tokenHash: tokenHashPrefix(token), nodeId, actorId: userId });
  return { id: row.id, token, label: trimmedLabel, createdAt: row.created_at };
}

export async function listShareLinks(nodeId: string): Promise<ShareLinkRow[]> {
  return db<ShareLinkRow[]>`
    select id, node_id, label, created_by, created_at
    from share_links where node_id = ${nodeId} order by created_at desc`;
}

// Scoped to the node, so one node's endpoint can never revoke another's link.
export async function revokeShareLink(id: string, nodeId: string): Promise<void> {
  await db`delete from share_links where id = ${id} and node_id = ${nodeId}`;
}

// The row's existence is the authorization, whatever the node's visibility or
// namespace, so only nodeId is returned: nothing invites a visibility check.
export async function resolveShareLink(token: string, log: Logger = logger): Promise<{ nodeId: string } | null> {
  const [row] = await db<{ node_id: string }[]>`select node_id from share_links where token_hash = ${hashToken(token)}`;
  const tokenHash = tokenHashPrefix(token);
  if (!row) {
    // Unknown and revoked look the same. A run of these from one IP is guessing.
    logEvent(log, 'share.not_found', { tokenHash });
    return null;
  }
  logEvent(log, 'share.resolved', { tokenHash, nodeId: row.node_id });
  return { nodeId: row.node_id };
}
