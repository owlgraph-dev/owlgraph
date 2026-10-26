// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { LOCK_TTL_SECONDS, acquireLock, createPage, getLock, heartbeatLock, releaseLock } from './server';
import { userOf } from '$tests/integration/users';

// A heartbeat is made stale by moving its timestamp back, not by waiting.

let n = 0;
const lockedPage = async () => (await createPage(`Lock probe ${++n}`, await userOf('editorA'))).id;

const staleHeartbeat = (pageId: string) => db`update page_locks set heartbeat_at = now() - make_interval(secs => ${LOCK_TTL_SECONDS + 1}) where page_id = ${pageId}`;

const storedLock = async (pageId: string) => (await db<{ locked_by: string; token: string }[]>`select locked_by, token from page_locks where page_id = ${pageId}`)[0] ?? null;

describe('a page’s edit lock', () => {
  it('is refused to another user while its holder’s heartbeat is fresh, a heartbeat keeping it so', async () => {
    const [a, b] = [await userOf('editorA'), await userOf('editorB')];
    const pageId = await lockedPage();
    const held = await acquireLock(pageId, a.id);
    expect(held).toMatchObject({ granted: true, status: { locked: true, lockedById: a.id, stale: false } });

    const refused = await acquireLock(pageId, b.id);
    expect(refused.granted).toBe(false);
    expect(refused.token).toBeUndefined();
    expect(refused.status).toMatchObject({ locked: true, lockedById: a.id, lockedByName: a.name, stale: false });
    expect(await storedLock(pageId)).toEqual({ locked_by: a.id, token: held.token });

    // Close to the TTL, a heartbeat makes it fresh again.
    await db`update page_locks set heartbeat_at = now() - make_interval(secs => ${LOCK_TTL_SECONDS - 5}) where page_id = ${pageId}`;
    expect(await heartbeatLock(pageId, held.token!)).toBe(true);
    expect((await acquireLock(pageId, b.id)).granted).toBe(false);
    expect(await storedLock(pageId)).toEqual({ locked_by: a.id, token: held.token });
  });

  it('is granted to another user once the heartbeat is stale; the holder’s heartbeat and release then fail', async () => {
    const [a, b] = [await userOf('editorA'), await userOf('editorB')];
    const pageId = await lockedPage();
    const held = await acquireLock(pageId, a.id);
    await staleHeartbeat(pageId);
    expect(await getLock(pageId)).toMatchObject({ locked: true, lockedById: a.id, stale: true });

    const taken = await acquireLock(pageId, b.id);
    expect(taken).toMatchObject({ granted: true, status: { locked: true, lockedById: b.id, stale: false } });
    expect(taken.token).not.toBe(held.token);
    expect(await storedLock(pageId)).toEqual({ locked_by: b.id, token: taken.token });

    expect(await heartbeatLock(pageId, held.token!)).toBe(false);
    expect(await releaseLock(pageId, held.token!)).toBe(false);
    expect(await storedLock(pageId)).toEqual({ locked_by: b.id, token: taken.token });
    expect(await heartbeatLock(pageId, taken.token!)).toBe(true);
  });

  it('is granted on a forced takeover while the heartbeat is fresh; the holder’s heartbeat and release then fail', async () => {
    const [a, admin] = [await userOf('editorA'), await userOf('admin')];
    const pageId = await lockedPage();
    const held = await acquireLock(pageId, a.id);
    expect((await acquireLock(pageId, admin.id)).granted).toBe(false);

    const taken = await acquireLock(pageId, admin.id, true);
    expect(taken).toMatchObject({ granted: true, status: { locked: true, lockedById: admin.id, stale: false } });
    expect(await storedLock(pageId)).toEqual({ locked_by: admin.id, token: taken.token });

    expect(await heartbeatLock(pageId, held.token!)).toBe(false);
    expect(await releaseLock(pageId, held.token!)).toBe(false);
    expect(await storedLock(pageId)).toEqual({ locked_by: admin.id, token: taken.token });

    expect(await releaseLock(pageId, taken.token!)).toBe(true);
    expect(await storedLock(pageId)).toBeNull();
    expect((await getLock(pageId)).locked).toBe(false);
  });
});
