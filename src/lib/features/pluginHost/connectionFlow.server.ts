// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Connecting a person's account at an integration's service (docs/architecture/plugins.md,
// "Connections"): the flow the core runs around the plugin's handshake. The
// handle stays server-side, sealed to the session; the browser only learns
// where to approve. A credential that is not kept is one the service is asked
// to forget, best effort.
import { logEvent, type Logger } from '$lib/platform/logger.server';
import { pluginFailed } from './pluginFailure.server';
import type { PluginConnectionFlow, PluginCredential, PluginFlowClient } from '$lib/plugins/api';
import type { ConnectionBinding, ConnectionRow, FlowRow, FlowSecret } from './connections.server';

/** How long a connect may take here; the service may keep its side longer. */
const FLOW_TTL_SECONDS = 600;
/** One poll of the service at a time, held at most this long… */
const LEASE_SECONDS = 15;
/** …and at most one every this many seconds. */
const MIN_POLL_INTERVAL_SECONDS = 3;

/** The database (connections.server.ts), or a test's memory. */
export interface FlowStore {
  beginFlow(input: ConnectionBinding & { sessionId: string; sealed: string; ttlSeconds: number }): Promise<string>;
  flowOf(sessionId: string, userId: string, plugin: string): Promise<FlowRow | null>;
  leaseFlow(id: string, opts: { leaseSeconds: number; minIntervalSeconds: number }): Promise<boolean>;
  releaseFlow(id: string): Promise<void>;
  endFlow(id: string): Promise<void>;
  sealFlow(binding: ConnectionBinding & { sessionId: string }, secret: FlowSecret): string | null;
  openFlow(row: FlowRow): FlowSecret | null;
  sealCredential(binding: ConnectionBinding, credential: PluginCredential): string | null;
  openCredential(row: ConnectionRow): PluginCredential | null;
  /** Stores the new connection, replacing the person's older one, and ends the flow in one transaction. */
  connect(input: ConnectionBinding & { flowId: string; kind: PluginCredential['kind']; sealed: string; accountId: string; accountLabel: string }): Promise<{ id: string; replaced: ConnectionRow | null }>;
  connectionOf(userId: string, plugin: string): Promise<ConnectionRow | null>;
  deleteConnection(userId: string, plugin: string): Promise<ConnectionRow | null>;
  markActive(id: string): Promise<boolean>;
  markRevoked(id: string): Promise<{ userId: string } | null>;
}

export interface FlowDeps {
  plugin: string;
  flow: PluginConnectionFlow;
  /** The integration's address as configured now; null while it is off or has none. */
  origin(): Promise<string | null>;
  /** A client pinned to the origin that may also POST and DELETE. */
  client(origin: string): PluginFlowClient;
  /** What the service names the credential after (an app password's name). */
  clientName: string;
  userId: string;
  sessionId: string;
  store: FlowStore;
  log: Logger;
}

export type BeginResult = { ok: true; approveUrl: string } | { ok: false; reason: 'disabled' | 'unreachable' | 'refused' | 'no-key' };

export type PollFailure = 'expired' | 'disabled' | 'foreign-server' | 'unauthorized' | 'unreachable' | 'no-key';
export type PollResult =
  | { state: 'none' }
  | { state: 'pending'; approveUrl: string }
  | { state: 'connected'; connectionId: string; accountLabel: string }
  | { state: 'failed'; reason: PollFailure };

export type RecheckResult = 'active' | 'renew' | 'unreachable' | 'disabled' | 'none';

/** Runs a plugin step; what it throws is logged by class, never by its message, which could quote a credential. */
async function step<T>(deps: Pick<FlowDeps, 'plugin' | 'log'>, name: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    pluginFailed(deps.log, `connection flow of '${deps.plugin}': ${name}`, error);
    return fallback;
  }
}

/** The approve address on the integration's own origin: the service's path and query, never its host. */
export function onOrigin(address: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) return null;
  const rebased = new URL(`${url.pathname}${url.search}`, origin);
  return rebased.origin === new URL(origin).origin ? rebased.toString() : null;
}

/** Whether the server an approval names is the integration's: its host and port, at its root (scheme aside: a TLS proxy may hide it). */
export function isOwnServer(server: string, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(server);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  return url.host === new URL(origin).host && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password;
}

/** Starts a connect: the handle is sealed server-side for this session; the browser gets where to approve. */
export async function beginConnect(deps: FlowDeps): Promise<BeginResult> {
  const origin = await deps.origin();
  if (!origin) return { ok: false, reason: 'disabled' };
  const started = await step(deps, 'begin', () => deps.flow.begin(deps.client(origin), { clientName: deps.clientName }), { ok: false as const, reason: 'unreachable' as const });
  if (!started.ok) return started;
  const approveUrl = onOrigin(started.approveUrl, origin);
  if (!approveUrl || !started.handle) return { ok: false, reason: 'refused' };
  const binding = { sessionId: deps.sessionId, userId: deps.userId, plugin: deps.plugin, origin };
  const sealed = deps.store.sealFlow(binding, { handle: started.handle, approveUrl });
  if (!sealed) return { ok: false, reason: 'no-key' };
  await deps.store.beginFlow({ ...binding, sealed, ttlSeconds: Math.min(Math.max(started.ttlSeconds, 60), FLOW_TTL_SECONDS) });
  return { ok: true, approveUrl };
}

/** Where to approve the session's connect in progress, or null for none. */
export async function pendingConnect(deps: Pick<FlowDeps, 'store' | 'sessionId' | 'userId' | 'plugin'>): Promise<{ approveUrl: string } | null> {
  const row = await deps.store.flowOf(deps.sessionId, deps.userId, deps.plugin);
  const secret = row ? deps.store.openFlow(row) : null;
  return secret ? { approveUrl: secret.approveUrl } : null;
}

/** Asks the service whether the person approved, at most one poll at a time however many tabs ask; on approval, connects them. */
export async function pollConnect(deps: FlowDeps): Promise<PollResult> {
  const row = await deps.store.flowOf(deps.sessionId, deps.userId, deps.plugin);
  if (!row) return { state: 'none' };
  const secret = deps.store.openFlow(row);
  const origin = await deps.origin();
  if (!secret || !origin || origin !== row.origin) {
    await deps.store.endFlow(row.id);
    return { state: 'failed', reason: !secret ? 'expired' : 'disabled' };
  }
  if (!(await deps.store.leaseFlow(row.id, { leaseSeconds: LEASE_SECONDS, minIntervalSeconds: MIN_POLL_INTERVAL_SECONDS }))) {
    return { state: 'pending', approveUrl: secret.approveUrl };
  }
  const client = deps.client(origin);
  const polled = await step(deps, 'poll', () => deps.flow.poll(client, secret.handle), { state: 'failed' as const });
  if (polled.state !== 'approved') {
    if (polled.state === 'gone') {
      await deps.store.endFlow(row.id);
      return { state: 'failed', reason: 'expired' };
    }
    // Not yet, or no answer this time: the flow's own lifetime ends a wait that goes on too long.
    await deps.store.releaseFlow(row.id);
    return { state: 'pending', approveUrl: secret.approveUrl };
  }
  // The credential exists at the service now: from here on a failure asks the
  // configured origin, the only one ever asked, to forget it again.
  const discard = async (reason: PollFailure): Promise<PollResult> => {
    await step(deps, 'revoke', () => deps.flow.revoke(client, polled.credential), false);
    await deps.store.endFlow(row.id);
    return { state: 'failed', reason };
  };
  if (!isOwnServer(polled.server, origin)) return discard('foreign-server');
  const verified = await step(deps, 'verify', () => deps.flow.verify(client, polled.credential), { ok: false as const, reason: 'unreachable' as const });
  if (!verified.ok) return discard(verified.reason);
  const binding = { userId: deps.userId, plugin: deps.plugin, origin };
  const sealed = deps.store.sealCredential(binding, polled.credential);
  if (!sealed) return discard('no-key');
  let stored: { id: string; replaced: ConnectionRow | null };
  try {
    stored = await deps.store.connect({ ...binding, flowId: row.id, kind: polled.credential.kind, sealed, accountId: verified.accountId, accountLabel: verified.accountLabel });
  } catch (error) {
    await step(deps, 'revoke', () => deps.flow.revoke(client, polled.credential), false);
    throw error;
  }
  logEvent(deps.log, 'integration.connection_created', { plugin: deps.plugin, connectionId: stored.id, subjectId: deps.userId, actorId: deps.userId, replaced: stored.replaced !== null });
  if (stored.replaced) await forget(deps, stored.replaced, 'replaced', deps.userId);
  return { state: 'connected', connectionId: stored.id, accountLabel: verified.accountLabel };
}

export async function cancelConnect(deps: Pick<FlowDeps, 'store' | 'sessionId' | 'userId' | 'plugin'>): Promise<void> {
  const row = await deps.store.flowOf(deps.sessionId, deps.userId, deps.plugin);
  if (row) await deps.store.endFlow(row.id);
}

/** Asks the service to forget a removed connection's credential, only at the address it was made for, and logs the removal. */
async function forget(deps: FlowDeps, row: ConnectionRow, reason: 'disconnect' | 'replaced', actorId: string): Promise<boolean> {
  const credential = deps.store.openCredential(row);
  const origin = await deps.origin();
  const remoteRevoked = credential && origin === row.origin ? await step(deps, 'revoke', () => deps.flow.revoke(deps.client(origin), credential), false) : false;
  logEvent(deps.log, 'integration.connection_removed', { plugin: deps.plugin, connectionId: row.id, subjectId: row.user_id, actorId, reason, remoteRevoked });
  return remoteRevoked;
}

/** The connection goes at once, whether or not the service can be asked to forget its credential. */
export async function disconnect(deps: FlowDeps): Promise<{ removed: boolean; remoteRevoked: boolean }> {
  const row = await deps.store.deleteConnection(deps.userId, deps.plugin);
  if (!row) return { removed: false, remoteRevoked: false };
  return { removed: true, remoteRevoked: await forget(deps, row, 'disconnect', deps.userId) };
}

/**
 * Checks the connection once, on the person's request and never on its own: a
 * refusal counts against this server's address at the service.
 */
export async function recheck(deps: FlowDeps): Promise<RecheckResult> {
  const row = await deps.store.connectionOf(deps.userId, deps.plugin);
  if (!row) return 'none';
  const origin = await deps.origin();
  if (!origin) return 'disabled';
  const credential = deps.store.openCredential(row);
  if (origin !== row.origin || !credential) return 'renew';
  const verified = await step(deps, 'verify', () => deps.flow.verify(deps.client(origin), credential), { ok: false as const, reason: 'unreachable' as const });
  if (verified.ok) {
    if (await deps.store.markActive(row.id)) {
      logEvent(deps.log, 'integration.connection_state', { plugin: deps.plugin, connectionId: row.id, subjectId: deps.userId, from: 'revoked', to: 'active' });
    }
    return 'active';
  }
  if (verified.reason === 'unauthorized') {
    if (await deps.store.markRevoked(row.id)) {
      logEvent(deps.log, 'integration.connection_state', { plugin: deps.plugin, connectionId: row.id, subjectId: deps.userId, from: 'active', to: 'revoked' });
    }
    return 'renew';
  }
  return 'unreachable';
}
