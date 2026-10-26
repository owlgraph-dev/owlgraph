// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How the viewer reads a node (docs/architecture/authorization.md, "Reading another service
// as the viewer"): their own connection where the root lies in their files, else
// the node's share, never the other way round. Nothing here writes to the node:
// what one viewer finds says nothing of it to others.
import type { PluginHost, PluginNode } from '$lib/plugins/api';
import { decodeSecret, shareAccess, userAccess, type DavProblem, type ShareAccess, type UserAccess } from './client.server';
import { locate } from './locate.server';
import { collectionRef, documentRef, type PathHint } from './refs';

export type Resolution =
  /** `base`: the root's path in their files; `fileid`: confirmed by every read there. */
  | { via: 'user'; access: UserAccess; base: string; fileid: string }
  /** `base`: '' for a collection, the file's path in the share for a document. */
  | { via: 'node'; access: ShareAccess; base: string }
  | { via: null; reason: 'connect' | 'renew' | 'unavailable'; problem: DavProblem | null };

/** `sharePath` is null when the node has no share. */
export interface NodeRoot {
  fileid: string | null;
  hint: PathHint | null;
  sharePath: string | null;
}

export function rootOfNode(node: PluginNode): NodeRoot {
  if (node.type === 'collection') {
    const ref = collectionRef(node.ref);
    return { fileid: ref.fileid, hint: ref.hint, sharePath: '' };
  }
  const ref = documentRef(node.ref);
  return { fileid: ref?.fileid ?? null, hint: ref?.hint ?? null, sharePath: ref?.path ?? null };
}

/** From the viewer's active connection, without asking Nextcloud. */
export async function viewerAccess(host: PluginHost): Promise<UserAccess | null> {
  const connection = await host.connection.open();
  return connection ? userAccess(connection) : null;
}

export async function nodeAccess(host: PluginHost, node: PluginNode): Promise<ShareAccess | null> {
  const secret = decodeSecret(await host.secrets.get(node.id));
  return secret ? shareAccess(secret) : null;
}

/** With nothing to read with: what the viewer can do, when connecting would help. */
export async function placeholderReason(host: PluginHost, root: NodeRoot): Promise<'connect' | 'renew' | 'unavailable'> {
  if (host.viewerId === null || root.fileid === null) return 'unavailable';
  const status = await host.connection.status();
  return status === 'none' ? 'connect' : status === 'renew' ? 'renew' : 'unavailable';
}

/** Asks Nextcloud where the root lies in the viewer's files when they are connected. */
export async function resolveNode(host: PluginHost, node: PluginNode, opts: { operation: string; fresh?: boolean }): Promise<Resolution> {
  const root = rootOfNode(node);
  let problem: DavProblem | null = null;
  if (root.fileid) {
    const access = await viewerAccess(host);
    if (access) {
      const located = await locate(host, access, root.fileid, { hint: root.hint, operation: opts.operation, fresh: opts.fresh });
      if (located.ok) return { via: 'user', access, base: located.path, fileid: root.fileid };
      problem = located.problem;
    }
  }
  if (root.sharePath !== null) {
    const access = await nodeAccess(host, node);
    if (access) return { via: 'node', access, base: root.sharePath };
  }
  return { via: null, reason: await placeholderReason(host, root), problem };
}
