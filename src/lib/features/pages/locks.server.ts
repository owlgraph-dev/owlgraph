// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The advisory edit lock coordinates people across an editing session; storage
// integrity is withPageDoc's row lock. A session's end can't be detected
// reliably, so a lock without a heartbeat for LOCK_TTL_SECONDS may be taken
// over. MCP writes ignore it: withPageDoc keeps storage safe regardless.
import { randomUUID } from 'node:crypto';
import { db } from '$lib/platform/db.server';
import type { LockStatus } from './types';

// About three missed 20 s heartbeats. Server time only, never a client clock.
export const LOCK_TTL_SECONDS = 60;

interface LockRow {
  page_id: string;
  locked_by: string;
  token: string;
  acquired_at: string;
  heartbeat_at: string;
}

const UNLOCKED: LockStatus = {
  locked: false,
  lockedById: null,
  lockedByName: null,
  acquiredAt: null,
  heartbeatAt: null,
  stale: false,
};

export async function getLock(pageId: string): Promise<LockStatus> {
  const [row] = await db<(LockRow & { name: string | null; stale: boolean })[]>`
    select l.page_id, l.locked_by, l.token, l.acquired_at, l.heartbeat_at, u.name,
           (l.heartbeat_at < now() - make_interval(secs => ${LOCK_TTL_SECONDS})) as stale
    from page_locks l
    join users u on u.id = l.locked_by
    where l.page_id = ${pageId}`;
  if (!row) return { ...UNLOCKED };
  return {
    locked: true,
    lockedById: row.locked_by,
    lockedByName: row.name,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    stale: row.stale,
  };
}

export interface AcquireResult {
  granted: boolean;
  token?: string;
  status: LockStatus; // the holder either way
}

// Granted when free, stale, held by the same user (a reopened tab: the new
// token makes the older tab lose it) or forced; admin-only `force` is enforced
// at the route. One conditional upsert, so two simultaneous acquires can't both win.
export async function acquireLock(pageId: string, userId: string, force = false): Promise<AcquireResult> {
  const token = randomUUID();
  const [row] = await db<LockRow[]>`
    insert into page_locks (page_id, locked_by, token)
    values (${pageId}, ${userId}, ${token})
    on conflict (page_id) do update
      set locked_by = excluded.locked_by,
          token = excluded.token,
          acquired_at = now(),
          heartbeat_at = now()
      where page_locks.locked_by = ${userId}
         or page_locks.heartbeat_at < now() - make_interval(secs => ${LOCK_TTL_SECONDS})
         or ${force}
    returning page_id, locked_by, token, acquired_at, heartbeat_at`;
  const status = await getLock(pageId);
  return row ? { granted: true, token, status } : { granted: false, status };
}

// Token-scoped: `false` means the lock was taken over.
export async function heartbeatLock(pageId: string, token: string): Promise<boolean> {
  const rows = await db`
    update page_locks set heartbeat_at = now()
    where page_id = ${pageId} and token = ${token}
    returning page_id`;
  return rows.length > 0;
}

// Token-scoped: a client can't release a lock already taken from it.
export async function releaseLock(pageId: string, token: string): Promise<boolean> {
  const rows = await db`
    delete from page_locks where page_id = ${pageId} and token = ${token}
    returning page_id`;
  return rows.length > 0;
}

// Regardless of holder: the caller checks the admin.
export async function forceReleaseLock(pageId: string): Promise<void> {
  await db`delete from page_locks where page_id = ${pageId}`;
}
