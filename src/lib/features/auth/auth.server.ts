// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Who the viewer is: password hashing (Node's built-in scrypt, no native deps),
// users and server-side sessions. What they may do lives in authz.server.ts.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from '$lib/platform/db.server';
import { logEvent, logger, type Logger } from '$lib/platform/logger.server';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem, passwordProblemMessage } from './passwordPolicy';

import { ROLES, type Role, type SessionUser } from './types';
import { CodedError } from '$lib/platform/codedError';
export { ROLES, type Role, type SessionUser };

// Every stored password passes through here. Callers with a user to answer
// check passwordProblem() first; this throw is the backstop.
function assertPasswordPolicy(password: string): void {
  const problem = passwordProblem(password);
  if (problem) throw new CodedError('weak_password', passwordProblemMessage(problem), { problem, min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH });
}

const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export async function listUsers(): Promise<UserRow[]> {
  return db<UserRow[]>`select id, email, name, role, is_active, created_at from users order by created_at`;
}

// Display name (or email) per user id in one query, for a query's `creator` mapping.
export async function resolveUserLabels(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db<{ id: string; name: string; email: string }[]>`select id, name, email from users where id = any(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.name || r.email]));
}

export async function getUserByEmail(email: string) {
  const [row] = await db`select * from users where email = ${email.trim().toLowerCase()}`;
  return row ?? null;
}

export async function createUser(input: { email: string; name?: string; password: string; role?: Role }): Promise<UserRow> {
  assertPasswordPolicy(input.password);
  const [row] = await db<UserRow[]>`
    insert into users (email, name, password_hash, role)
    values (${input.email.trim().toLowerCase()}, ${input.name ?? ''}, ${hashPassword(input.password)}, ${input.role ?? 'viewer'})
    returning id, email, name, role, is_active, created_at`;
  return row;
}

export async function setUserRole(id: string, role: Role): Promise<void> {
  await db`update users set role = ${role} where id = ${id}`;
}

export async function setUserActive(id: string, active: boolean): Promise<void> {
  await db`update users set is_active = ${active} where id = ${id}`;
  if (!active) await deleteUserSessions(id); // cut access immediately
}

export async function setUserPassword(id: string, password: string): Promise<void> {
  assertPasswordPolicy(password);
  await db`update users set password_hash = ${hashPassword(password)} where id = ${id}`;
  await deleteUserSessions(id); // force re-login everywhere
}

// Self-service: callers pass the viewer's own id (locals.user), never one from the request.
const MAX_NAME_LENGTH = 120;

export async function setOwnName(id: string, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  await db`update users set name = ${trimmed} where id = ${id}`;
}

// The same own-row scoping. The caller validates the code against the enabled
// languages; null clears the preference (docs/architecture/languages.md).
export async function setOwnLocale(id: string, locale: string | null): Promise<void> {
  await db`update users set locale = ${locale} where id = ${id}`;
}

// The session cookie carries the raw token; sessions.id is its SHA-256
// (hashToken), so a database dump or backup yields no usable session.

/**
 * Why a login was refused, for the log only: the user sees one message for all
 * three, since telling which half was right is the enumeration an attacker wants.
 */
export type LoginFailure = 'no_such_user' | 'inactive' | 'bad_password';
export type LoginResult =
  | { ok: true; userId: string; token: string; expires: Date }
  | { ok: false; failureClass: LoginFailure };

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = (await getUserByEmail(email)) as (LoginCandidate & { id: string }) | null;
  const failure = judgeLogin(user, password);
  if (failure || !user) return { ok: false, failureClass: failure ?? 'no_such_user' };
  const session = await createSession(user.id);
  return { ok: true, userId: user.id, ...session };
}

/** What a sign-in is judged on: whether the account may sign in, and its stored password hash. */
export type LoginCandidate = { is_active: boolean; password_hash: string | null };

// A hash of a password no one knows, for an account with no usable hash. Made
// on first use: most processes that load this module never sign anyone in.
let unknownAccountHash: string | null = null;

/**
 * Why this sign-in fails, or null. The password is verified whatever was found,
 * against a stand-in hash when needed, so a refusal takes as long as a wrong
 * password and the timing doesn't reveal which addresses have accounts.
 */
export function judgeLogin(user: LoginCandidate | null | undefined, password: string): LoginFailure | null {
  const stored = user?.is_active && user.password_hash ? user.password_hash : (unknownAccountHash ??= hashPassword(randomBytes(16).toString('hex')));
  const passwordMatches = verifyPassword(password, stored);
  if (!user) return 'no_such_user';
  if (!user.is_active) return 'inactive';
  if (!user.password_hash || !passwordMatches) return 'bad_password';
  return null;
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db`insert into sessions (id, user_id, expires_at) values (${hashToken(token)}, ${userId}, ${expires})`;
  return { token, expires };
}

export async function getSessionUser(token: string | undefined, log: Logger = logger): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db`
    select u.id, u.email, u.name, u.role, u.locale, u.is_active, s.expires_at
    from sessions s join users u on u.id = s.user_id
    where s.id = ${hashToken(token)}`;
  if (!row) return null;
  if (!row.is_active || new Date(row.expires_at) < new Date()) {
    // Apart from user.activation_changed, which records the admin's act itself.
    logEvent(log, 'auth.session_invalidated', {
      reason: row.is_active ? 'expired' : 'deactivated',
      subjectId: row.id,
    });
    await deleteSession(token);
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role, locale: row.locale ?? null };
}

export async function deleteSession(token: string | undefined): Promise<void> {
  if (token) await db`delete from sessions where id = ${hashToken(token)}`;
}

export async function deleteUserSessions(userId: string): Promise<void> {
  await db`delete from sessions where user_id = ${userId}`;
}

// Sessions, API tokens and share links are high-entropy, so a fast hash
// suffices where passwords need a slow KDF. Only the hash is stored.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

export async function listApiTokens(userId: string): Promise<ApiTokenRow[]> {
  return db<ApiTokenRow[]>`
    select id, name, prefix, created_at, last_used_at, expires_at
    from api_tokens where user_id = ${userId} order by created_at desc`;
}

// Returns the raw token once; it can't be recovered. Expires after 90 days by
// default, since a leaked token that never expires is a standing liability.
export async function createApiToken(
  userId: string,
  name: string,
  expiresInDays = 90,
): Promise<{ token: string; prefix: string }> {
  const raw = `cms_${randomBytes(24).toString('base64url')}`;
  const prefix = raw.slice(0, 12);
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  await db`
    insert into api_tokens (user_id, name, token_hash, prefix, expires_at)
    values (${userId}, ${name.trim()}, ${hashToken(raw)}, ${prefix}, ${expiresAt})`;
  return { token: raw, prefix };
}

// Scoped to the owner so one user can't revoke another's token.
export async function revokeApiToken(id: string, userId: string): Promise<void> {
  await db`delete from api_tokens where id = ${id} and user_id = ${userId}`;
}

// Honours expiry and is_active, and reads the owner's current role, so a role
// change changes what their tokens can do.
export async function getUserByToken(token: string | undefined, log: Logger = logger): Promise<SessionUser | null> {
  if (!token) return null;
  const [row] = await db`
    select t.id as token_id, t.expires_at, u.id, u.email, u.name, u.role, u.locale, u.is_active
    from api_tokens t join users u on u.id = t.user_id
    where t.token_hash = ${hashToken(token)}`;
  if (!row) return null;
  if (!row.is_active) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  logEvent(log, 'auth.api_token_used', { tokenId: row.token_id });
  // best-effort last-used stamp; don't block the request on it
  db`update api_tokens set last_used_at = now() where id = ${row.token_id}`.catch(() => {});
  return { id: row.id, email: row.email, name: row.name, role: row.role as Role, locale: row.locale ?? null };
}
