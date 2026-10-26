// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// What a person's connect runs against, per request (connectionFlow.server.ts),
// and an administrator's removal of everyone's connections at once.
import { errorClass, logEvent, type Logger } from '$lib/platform/logger.server';
import { READ_METHODS, upstreamClient } from '$lib/platform/upstream.server';
import { PLUGINS_WITH_CONNECTIONS, pluginManifest } from '$lib/plugins';
import { pluginServer } from '$lib/plugins/server';
import { pluginOrigin } from './settings.server';
import { connectionStore, deleteConnections, openCredential, type ConnectionRow } from './connections.server';
import type { FlowDeps } from './connectionFlow.server';

// The handshake's verbs, which no other client a plugin holds may send.
const FLOW_METHODS = [...READ_METHODS, 'POST', 'DELETE'] as const;
/** At most this many of the service's forgets in flight at once, so removing many connections never floods it. */
const FORGET_CONCURRENCY = 4;

export interface ConnectContext {
  userId: string;
  /** locals.sessionId */
  sessionId: string;
  log: Logger;
  /** The service names the credential after it, so a person can tell it apart there. */
  appHost: string;
}

/** The name the service gives a credential this app holds (its app password's). */
export function clientNameFor(appHost: string): string {
  return `owlgraph (${appHost})`;
}

/** Whether some plugin that offers connections is turned on with an address. */
export async function connectionsOffered(): Promise<boolean> {
  for (const plugin of PLUGINS_WITH_CONNECTIONS) if (await pluginOrigin(plugin)) return true;
  return false;
}

/** Null for a plugin that offers no connections. */
export function flowDepsFor(pluginId: string, ctx: ConnectContext): FlowDeps | null {
  const manifest = pluginManifest(pluginId);
  const flow = pluginServer(pluginId)?.connections;
  if (!manifest?.connections || !flow) return null;
  return {
    plugin: pluginId,
    flow,
    origin: () => pluginOrigin(manifest),
    client: (origin) => upstreamClient(origin, {}, { methods: FLOW_METHODS }),
    clientName: clientNameFor(ctx.appHost),
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    store: connectionStore,
    log: ctx.log,
  };
}

/** Runs `work` over the items, at most `size` at a time. */
async function pooled<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
}

/**
 * Removes every connection to a plugin's service (`admin`), or those made for another address than
 * its current one (`origin_changed`). The service is then asked, in the background and a few at a
 * time, to forget each credential made for its current address; one made for another address is
 * never sent anywhere. `notAsked` counts those not asked, which stay valid there until their person removes them.
 */
export async function removeConnections(
  pluginId: string,
  opts: { reason: 'admin' | 'origin_changed'; actorId: string; log: Logger }
): Promise<{ removed: number; notAsked: number }> {
  const manifest = pluginManifest(pluginId);
  const flow = pluginServer(pluginId)?.connections;
  if (!manifest?.connections || !flow) return { removed: 0, notAsked: 0 };
  const origin = await pluginOrigin(manifest);
  // Without an address, nothing has replaced the one they were made for.
  if (opts.reason === 'origin_changed' && !origin) return { removed: 0, notAsked: 0 };
  const removed: ConnectionRow[] = opts.reason === 'admin' ? await deleteConnections(pluginId) : await deleteConnections(pluginId, { keepOrigin: origin! });
  if (opts.reason === 'admin') logEvent(opts.log, 'integration.connections_cleared', { plugin: pluginId, count: removed.length, actorId: opts.actorId });
  const forget = async (row: ConnectionRow) => {
    let remoteRevoked = false;
    const credential = origin && row.origin === origin ? openCredential(row) : null;
    if (origin && credential) {
      try {
        remoteRevoked = await flow.revoke(upstreamClient(origin, {}, { methods: FLOW_METHODS }), credential);
      } catch (error) {
        logEvent(opts.log, 'error.unhandled', { errorClass: errorClass(error), message: `connection flow of '${pluginId}': revoke failed` });
      }
    }
    logEvent(opts.log, 'integration.connection_removed', { plugin: pluginId, connectionId: row.id, subjectId: row.user_id, actorId: opts.actorId, reason: opts.reason, remoteRevoked });
  };
  void pooled(removed, FORGET_CONCURRENCY, forget).catch(() => {});
  return { removed: removed.length, notAsked: removed.filter((row) => !origin || row.origin !== origin).length };
}
