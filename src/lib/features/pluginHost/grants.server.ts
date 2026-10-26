// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Grants (docs/architecture/plugins.md, "Grants"): sealed five-minute tokens that let one
// viewer fetch one node's content. A page never carries one: it links a stable
// address, the same for every viewer, that redirects to a grant minted for
// whoever followed it. Redeeming re-checks everything that made it.
import type { PluginGrantDetail, PluginOpenConnection, PluginRedeemed } from '$lib/plugins/api';

/** How long a grant lasts: long enough to follow a redirect and stream a file, short enough to be useless once copied. */
export const GRANT_TTL_MS = 5 * 60_000;

interface Payload {
  v: 1;
  /** The plugin. */
  p: string;
  /** The node. */
  n: string;
  /** The plugin's own detail. */
  d: PluginGrantDetail;
  /** When it runs out (ms since the epoch). */
  e: number;
  /** The viewer it was minted for, null for an anonymous one. */
  u: string | null;
  /** The share link it was minted through, or null. */
  l: string | null;
  /** The viewer's connection it reads with; null or absent for the node's own credential. */
  c?: string | null;
}

export interface GrantDeps {
  pluginId: string;
  viewerId: string | null;
  /** The share link this request came through (its token), or null. */
  shareLink: string | null;
  /** Seals for the 'signed-url' purpose; throws without a key. */
  seal(plaintext: string): string;
  /** Opens a 'signed-url' value; null when it does not open. */
  open(sealed: string): string | null;
  now(): number;
  /** Whether the viewer may read the node — through the request's own grants too. */
  canRead(nodeId: string): Promise<boolean>;
  /** Whether a share link still exists and grants the node. */
  shareLinkGrants(token: string, nodeId: string): Promise<boolean>;
  /** Records that this request may read the node from now on. */
  granted(nodeId: string): void;
  /** The viewer's active connection to the plugin's service, opened; null without one. */
  openConnection(): Promise<PluginOpenConnection | null>;
}

export interface Grants {
  issue(nodeId: string, detail: PluginGrantDetail, opts?: { via?: 'node' | 'user' }): Promise<string | null>;
  redeem(token: string): Promise<PluginRedeemed | 'expired' | 'renew' | null>;
}

const isDetail = (value: unknown): value is PluginGrantDetail =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every((v) => typeof v === 'string' || typeof v === 'number');

function parse(plaintext: string): Payload | null {
  let value: unknown;
  try {
    value = JSON.parse(plaintext);
  } catch {
    return null;
  }
  const p = value as Partial<Payload> | null;
  if (!p || p.v !== 1 || typeof p.p !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') return null;
  if (!isDetail(p.d) || (p.u !== null && typeof p.u !== 'string') || (p.l !== null && typeof p.l !== 'string')) return null;
  const c = p.c ?? null;
  // A connection's grant is a signed-in viewer's, never one minted through a share link.
  if (c !== null && (typeof c !== 'string' || p.u === null || p.l !== null)) return null;
  return { ...(p as Payload), c };
}

export function createGrants(deps: GrantDeps): Grants {
  return {
    async issue(nodeId, detail, opts = {}) {
      if (!isDetail(detail) || !(await deps.canRead(nodeId))) return null;
      let connectionId: string | null = null;
      if (opts.via === 'user') {
        const connection = deps.viewerId && !deps.shareLink ? await deps.openConnection() : null;
        if (!connection) return null;
        connectionId = connection.id;
      }
      const payload: Payload = {
        v: 1,
        p: deps.pluginId,
        n: nodeId,
        d: detail,
        e: deps.now() + GRANT_TTL_MS,
        u: deps.viewerId,
        l: deps.shareLink,
        c: connectionId,
      };
      try {
        return deps.seal(JSON.stringify(payload));
      } catch {
        // No key to seal with: nothing can be granted.
        return null;
      }
    },

    async redeem(token) {
      const plaintext = typeof token === 'string' && token.length <= 4096 ? deps.open(token) : null;
      const payload = plaintext === null ? null : parse(plaintext);
      if (!payload || payload.p !== deps.pluginId) return null;
      if (payload.e <= deps.now()) return 'expired';
      // An anonymous viewer's grant is anyone's: it only reaches what anyone may read.
      if (payload.u !== null && payload.u !== deps.viewerId) return null;
      const allowed = payload.l !== null ? await deps.shareLinkGrants(payload.l, payload.n) : await deps.canRead(payload.n);
      if (!allowed) return null;
      if (payload.c) {
        // That connection or nothing: never a fallback to the node's own credential.
        const connection = await deps.openConnection();
        if (!connection || connection.id !== payload.c) return 'renew';
        deps.granted(payload.n);
        return { nodeId: payload.n, detail: payload.d, via: 'user', connection };
      }
      deps.granted(payload.n);
      return { nodeId: payload.n, detail: payload.d, via: 'node' };
    },
  };
}
