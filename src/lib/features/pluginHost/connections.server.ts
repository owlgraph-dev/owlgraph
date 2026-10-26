// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// People's connections to an integration's service (docs/architecture/authorization.md,
// "Reading another service as the viewer"), and the connects in progress, bound
// to the session that started them. A sealed value names its user, integration
// and origin and opens only for a row that says the same: copied to another
// row, or kept after the integration's address changed, it opens as nothing.
import { db, type TxSql } from '$lib/platform/db.server';
import { secretBox, SecretKeyMissing } from '$lib/platform/secretBox.server';
import type { ConnectionCredentialKind, PluginCredential } from '$lib/plugins/api';
import type { FlowStore } from './connectionFlow.server';

export type ConnectionStatus = 'active' | 'revoked' | 'error';

export interface ConnectionRow {
  id: string;
  user_id: string;
  plugin: string;
  origin: string;
  credential_kind: ConnectionCredentialKind;
  sealed_credential: string;
  account_id: string;
  account_label: string;
  status: ConnectionStatus;
  created_at: Date;
  last_used_at: Date | null;
  last_error_at: Date | null;
}

/** Everything but the credential, for its person's pages. */
export type ConnectionSummary = Omit<ConnectionRow, 'sealed_credential'>;

/** What a sealed value belongs to. */
export interface ConnectionBinding {
  userId: string;
  plugin: string;
  origin: string;
}

const COLUMNS = 'id, user_id, plugin, origin, credential_kind, sealed_credential, account_id, account_label, status, created_at, last_used_at, last_error_at';
const SUMMARY_COLUMNS = 'id, user_id, plugin, origin, credential_kind, account_id, account_label, status, created_at, last_used_at, last_error_at';

function seal(purpose: 'user-credential' | 'connection-flow', value: unknown): string | null {
  try {
    return secretBox().seal(purpose, JSON.stringify(value));
  } catch (e) {
    if (e instanceof SecretKeyMissing) return null;
    throw e;
  }
}

/** A sealed value's plaintext as an object, or null; never a parser's message, which would quote the plaintext. */
function open(purpose: 'user-credential' | 'connection-flow', sealed: string): Record<string, unknown> | null {
  let plaintext: string | null;
  try {
    plaintext = secretBox().open(purpose, sealed);
  } catch {
    return null;
  }
  if (plaintext === null) return null;
  try {
    const value: unknown = JSON.parse(plaintext);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Null when the deployment has no key. */
export function sealCredential(binding: ConnectionBinding, credential: PluginCredential): string | null {
  return seal('user-credential', { u: binding.userId, p: binding.plugin, o: binding.origin, k: credential.kind, l: credential.login, s: credential.secret });
}

/** The row's credential, only when its seal opens and names this very row's user, integration, origin and kind. */
export function openCredential(row: Pick<ConnectionRow, 'user_id' | 'plugin' | 'origin' | 'credential_kind' | 'sealed_credential'>): PluginCredential | null {
  const value = open('user-credential', row.sealed_credential);
  if (!value || value.u !== row.user_id || value.p !== row.plugin || value.o !== row.origin || value.k !== row.credential_kind) return null;
  if (typeof value.l !== 'string' || typeof value.s !== 'string' || value.s === '') return null;
  return { kind: row.credential_kind, login: value.l, secret: value.s };
}

/** In whatever state. */
export async function connectionOf(userId: string, plugin: string, sql: TxSql = db): Promise<ConnectionRow | null> {
  const [row] = await sql<ConnectionRow[]>`
    select ${sql.unsafe(COLUMNS)} from user_connections where user_id = ${userId} and plugin = ${plugin}`;
  return row ?? null;
}

export async function connectionsOf(userId: string): Promise<ConnectionSummary[]> {
  return db<ConnectionSummary[]>`
    select ${db.unsafe(SUMMARY_COLUMNS)} from user_connections where user_id = ${userId} order by plugin`;
}

/**
 * Replaces a user's connection to an integration: the old row goes, and with it
 * whatever was keyed by its id (a grant, a cache entry). Returns the replaced
 * row, whose credential the caller may still ask the service to forget.
 */
export async function storeConnection(
  sql: TxSql,
  input: ConnectionBinding & { kind: ConnectionCredentialKind; sealed: string; accountId: string; accountLabel: string }
): Promise<{ id: string; replaced: ConnectionRow | null }> {
  const [replaced] = await sql<ConnectionRow[]>`
    delete from user_connections where user_id = ${input.userId} and plugin = ${input.plugin} returning ${sql.unsafe(COLUMNS)}`;
  const [row] = await sql<{ id: string }[]>`
    insert into user_connections (user_id, plugin, origin, credential_kind, sealed_credential, account_id, account_label)
    values (${input.userId}, ${input.plugin}, ${input.origin}, ${input.kind}, ${input.sealed}, ${input.accountId}, ${input.accountLabel})
    returning id`;
  return { id: row.id, replaced: replaced ?? null };
}

/** active → revoked, once: the user it belongs to when this call changed it, else null. */
export async function markRevoked(id: string): Promise<{ userId: string } | null> {
  const [row] = await db<{ user_id: string }[]>`
    update user_connections set status = 'revoked', last_error_at = now() where id = ${id} and status = 'active' returning user_id`;
  return row ? { userId: row.user_id } : null;
}

/** revoked → active, once a check found the credential good again: true when this call changed it. */
async function markActive(id: string): Promise<boolean> {
  const rows = await db`update user_connections set status = 'active' where id = ${id} and status = 'revoked' returning id`;
  return rows.length > 0;
}

/** At most once an hour, so a busy page writes nothing. */
export async function touchConnection(id: string): Promise<void> {
  await db`
    update user_connections set last_used_at = now()
    where id = ${id} and (last_used_at is null or last_used_at < now() - interval '1 hour')`;
}

/** Returns the removed row, for the service to forget its credential. */
async function deleteConnection(userId: string, plugin: string, sql: TxSql = db): Promise<ConnectionRow | null> {
  const [row] = await sql<ConnectionRow[]>`
    delete from user_connections where user_id = ${userId} and plugin = ${plugin} returning ${sql.unsafe(COLUMNS)}`;
  return row ?? null;
}

export async function countConnections(plugin: string): Promise<{ active: number; total: number }> {
  const [row] = await db<{ active: number; total: number }[]>`
    select count(*) filter (where status = 'active')::int as active, count(*)::int as total
    from user_connections where plugin = ${plugin}`;
  return { active: row?.active ?? 0, total: row?.total ?? 0 };
}

/** Removes every connection to an integration, or only those made against another origin than `keepOrigin`. */
export async function deleteConnections(plugin: string, opts: { keepOrigin?: string } = {}): Promise<ConnectionRow[]> {
  return opts.keepOrigin === undefined
    ? db<ConnectionRow[]>`delete from user_connections where plugin = ${plugin} returning ${db.unsafe(COLUMNS)}`
    : db<ConnectionRow[]>`delete from user_connections where plugin = ${plugin} and origin <> ${opts.keepOrigin} returning ${db.unsafe(COLUMNS)}`;
}

/** For a rotation (scripts/rotate-secrets.ts). */
export async function allSealedCredentials(sql: TxSql = db): Promise<{ id: string; sealed_credential: string }[]> {
  return sql<{ id: string; sealed_credential: string }[]>`select id, sealed_credential from user_connections order by id`;
}

/** Replaces a sealed credential with its re-sealing, unless it changed in the meantime. */
export async function replaceSealedCredential(sql: TxSql, id: string, before: string, after: string): Promise<boolean> {
  const rows = await sql`
    update user_connections set sealed_credential = ${after} where id = ${id} and sealed_credential = ${before} returning id`;
  return rows.length > 0;
}

// --- connects in progress ---------------------------------------------------------

export interface FlowRow {
  id: string;
  session_id: string;
  user_id: string;
  plugin: string;
  origin: string;
  sealed: string;
  expires_at: Date;
  last_polled_at: Date | null;
  polling_until: Date | null;
}

/** What a connect in progress keeps sealed: the plugin's handle and where the person approves. */
export interface FlowSecret {
  handle: string;
  approveUrl: string;
}

const FLOW_COLUMNS = 'id, session_id, user_id, plugin, origin, sealed, expires_at, last_polled_at, polling_until';

/** Seals for the session, user, integration and origin; null without a key. */
export function sealFlow(binding: ConnectionBinding & { sessionId: string }, secret: FlowSecret): string | null {
  return seal('connection-flow', { s: binding.sessionId, u: binding.userId, p: binding.plugin, o: binding.origin, h: secret.handle, a: secret.approveUrl });
}

/** Only when its seal opens and names this very row. */
export function openFlow(row: Pick<FlowRow, 'session_id' | 'user_id' | 'plugin' | 'origin' | 'sealed'>): FlowSecret | null {
  const value = open('connection-flow', row.sealed);
  if (!value || value.s !== row.session_id || value.u !== row.user_id || value.p !== row.plugin || value.o !== row.origin) return null;
  return typeof value.h === 'string' && typeof value.a === 'string' ? { handle: value.h, approveUrl: value.a } : null;
}

/** Starts a session's connect, replacing one it had started, after sweeping the expired flows. */
export async function beginFlow(input: ConnectionBinding & { sessionId: string; sealed: string; ttlSeconds: number }): Promise<string> {
  await db`delete from connection_flows where expires_at < now()`;
  const [row] = await db<{ id: string }[]>`
    insert into connection_flows (session_id, user_id, plugin, origin, sealed, expires_at)
    values (${input.sessionId}, ${input.userId}, ${input.plugin}, ${input.origin}, ${input.sealed}, now() + make_interval(secs => ${input.ttlSeconds}))
    on conflict (session_id, plugin) do update set
      user_id = excluded.user_id, origin = excluded.origin, sealed = excluded.sealed, expires_at = excluded.expires_at,
      last_polled_at = null, polling_until = null, created_at = now()
    returning id`;
  return row.id;
}

/** While its time lasts. */
async function flowOf(sessionId: string, userId: string, plugin: string): Promise<FlowRow | null> {
  const [row] = await db<FlowRow[]>`
    select ${db.unsafe(FLOW_COLUMNS)} from connection_flows
    where session_id = ${sessionId} and user_id = ${userId} and plugin = ${plugin} and expires_at > now()`;
  return row ?? null;
}

/**
 * Takes a flow for one poll of the service; false while another poll holds it or the last was too
 * recent, so two tabs or a fast browser never ask the service twice at once.
 */
async function leaseFlow(id: string, opts: { leaseSeconds: number; minIntervalSeconds: number }): Promise<boolean> {
  const rows = await db`
    update connection_flows set polling_until = now() + make_interval(secs => ${opts.leaseSeconds}), last_polled_at = now()
    where id = ${id} and expires_at > now()
      and (polling_until is null or polling_until < now())
      and (last_polled_at is null or last_polled_at < now() - make_interval(secs => ${opts.minIntervalSeconds}))
    returning id`;
  return rows.length > 0;
}

/** Gives a flow back after a poll that changed nothing. */
async function releaseFlow(id: string): Promise<void> {
  await db`update connection_flows set polling_until = null where id = ${id}`;
}

async function endFlow(id: string, sql: TxSql = db): Promise<void> {
  await sql`delete from connection_flows where id = ${id}`;
}

/** The store of connectionFlow.server.ts over the database. */
export const connectionStore: FlowStore = {
  beginFlow,
  flowOf,
  leaseFlow,
  releaseFlow,
  endFlow: (id) => endFlow(id),
  sealFlow,
  openFlow,
  sealCredential,
  openCredential,
  connect: (input) =>
    db.begin(async (tx) => {
      const stored = await storeConnection(tx, input);
      await endFlow(input.flowId, tx);
      return stored;
    }),
  connectionOf: (userId, plugin) => connectionOf(userId, plugin),
  deleteConnection: (userId, plugin) => deleteConnection(userId, plugin),
  markActive,
  markRevoked,
};
