// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EditTabs, LockStatus } from '$lib/features/pages';
import { EditLock, type LockClient } from './editLock.svelte';

const PAGE = 'p-1';
const lockStatus = (s: Partial<LockStatus>): LockStatus => ({ locked: true, lockedById: 'u-ada', lockedByName: 'Ada', acquiredAt: null, heartbeatAt: null, stale: false, ...s });

/** A page client and this browser's tabs, every request recorded; storage a map. */
function fixture(client: Partial<LockClient> = {}, opts: { otherTab?: boolean; chosen?: boolean } = {}) {
  let tabOpts: { editing: () => boolean; onClaimed: () => void } | null = null;
  const tabs: EditTabs = { otherTabEditing: vi.fn(async () => !!opts.otherTab), claim: vi.fn(), close: vi.fn() };
  const fake: LockClient = {
    acquire: vi.fn(async () => ({ ok: true as const, token: 'tok-1' })),
    heartbeat: vi.fn(async () => 'ok' as const),
    release: vi.fn(),
    beaconRelease: vi.fn(),
    status: vi.fn(async () => null),
    save: vi.fn(async () => ({ ok: true as const })),
    editTabs: vi.fn((_id: string, o: { editing: () => boolean; onClaimed: () => void }) => {
      tabOpts = o;
      return tabs;
    }),
    ...client,
  };
  const stored = new Map<string, string>(opts.chosen ? [[`owlgraph:edit-here:${PAGE}`, '1']] : []);
  const storage = {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  } as Storage;
  const reload = vi.fn();
  const confirm = vi.fn(() => true);
  const lock = new EditLock(() => PAGE, { client: fake, storage: () => storage, reload, confirm });
  return { lock, client: fake, tabs, stored, reload, confirm, claimedByAnotherTab: () => tabOpts!.onClaimed(), answersProbes: () => tabOpts!.editing() };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a page's edit lock", () => {
  it('opens by acquiring, claims the page for this tab, and answers other tabs while editing', async () => {
    const f = fixture();
    expect(f.lock.phase).toBe('acquiring');
    await f.lock.open();
    expect(f.client.acquire).toHaveBeenCalledWith(PAGE, false);
    expect(f.lock.phase).toBe('editing');
    expect(f.tabs.claim).toHaveBeenCalledTimes(1);
    expect(f.answersProbes()).toBe(true);
  });

  it('steps aside for another tab of this browser editing the page, until asked to edit here', async () => {
    const f = fixture({}, { otherTab: true });
    await f.lock.open();
    expect(f.lock.phase).toBe('elsewhere');
    expect(f.client.acquire).not.toHaveBeenCalled();
    await f.lock.acquire();
    expect(f.lock.phase).toBe('editing');
  });

  it('takes the lock straight away after Edit here again, the choice used once', async () => {
    const f = fixture({}, { otherTab: true });
    await f.lock.open();
    f.lock.markMoved();
    expect(f.lock.phase).toBe('moved');
    f.lock.editHereAgain();
    expect(f.stored.get(`owlgraph:edit-here:${PAGE}`)).toBe('1');
    expect(f.reload).toHaveBeenCalledTimes(1);

    // The reload's tab.
    const again = fixture({}, { otherTab: true, chosen: true });
    await again.lock.open();
    expect(again.tabs.otherTabEditing).not.toHaveBeenCalled();
    expect(again.lock.phase).toBe('editing');
    expect(again.stored.size).toBe(0);
  });

  it('beats every 20 seconds with its token, and a lost beat leaves it lost to someone else', async () => {
    let lost = false;
    const f = fixture({ heartbeat: vi.fn(async () => (lost ? ('lost' as const) : ('ok' as const))) });
    await f.lock.open();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(f.client.heartbeat).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(f.client.heartbeat).toHaveBeenCalledWith(PAGE, 'tok-1');

    lost = true;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.lock.phase).toBe('lost');
    expect(f.lock.lostTo).toBe('other');
    // No token, no beat.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.client.heartbeat).toHaveBeenCalledTimes(2);
    f.lock.stop();
    expect(f.client.release).not.toHaveBeenCalled();
  });

  it('is lost to the tab that claims the page after it', async () => {
    const f = fixture();
    await f.lock.open();
    f.claimedByAnotherTab();
    expect(f.lock.phase).toBe('lost');
    expect(f.lock.lostTo).toBe('tab');
    expect(f.answersProbes()).toBe(false);
  });

  it('polls a held lock every 15 seconds while blocked, naming its holder, and enters once it is free or stale', async () => {
    let free = false;
    let stale = false;
    const f = fixture({
      acquire: vi.fn(async () => (free ? { ok: true as const, token: 'tok-2' } : { ok: false as const, holder: { lockedByName: 'Ada', stale: false } })),
      status: vi.fn(async () => lockStatus({ locked: !free, lockedByName: 'Bea', stale })),
    });
    await f.lock.open();
    expect(f.lock.phase).toBe('blocked');
    expect(f.lock.holder).toEqual({ lockedByName: 'Ada', stale: false });

    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.client.status).toHaveBeenCalledTimes(1);
    expect(f.lock.holder?.lockedByName).toBe('Bea');

    stale = true;
    await vi.advanceTimersByTimeAsync(15_000);
    // A stale holder: acquired again, refused again, still blocked.
    expect(f.client.acquire).toHaveBeenCalledTimes(2);
    expect(f.lock.phase).toBe('blocked');

    free = true;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(f.lock.phase).toBe('editing');
    // Editing: the poll stopped.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.client.status).toHaveBeenCalledTimes(3);
  });

  it('takes over only after the admin confirms, naming the holder', async () => {
    const f = fixture({ acquire: vi.fn(async (_id: string, force?: boolean) => (force ? { ok: true as const, token: 'tok-f' } : { ok: false as const, holder: { lockedByName: 'Ada', stale: false } })) });
    await f.lock.open();
    f.confirm.mockReturnValueOnce(false);
    f.lock.takeover();
    expect(f.confirm).toHaveBeenCalledWith('Take over editing? Ada will be switched to read-only.');
    expect(f.client.acquire).toHaveBeenCalledTimes(1);

    f.lock.takeover();
    await vi.waitFor(() => expect(f.lock.phase).toBe('editing'));
    expect(f.client.acquire).toHaveBeenLastCalledWith(PAGE, true);
  });

  it('saves with its token, and a save refused for a lost lock loses it', async () => {
    const f = fixture({ save: vi.fn(async () => ({ ok: false as const, lockLost: true })) });
    await f.lock.open();
    const res = await f.lock.save({ type: 'doc' }, { acknowledgeDropped: ['u-1'] });
    expect(f.client.save).toHaveBeenCalledWith(PAGE, { type: 'doc' }, 'tok-1', ['u-1']);
    expect(res).toEqual({ ok: false, lockLost: true, unknownDropped: false });
    expect(f.lock.phase).toBe('lost');
  });

  it('gives the lock back on leaving, and on the teardown closes the tab channel too', async () => {
    const f = fixture();
    await f.lock.open();
    f.lock.leave();
    expect(f.client.release).toHaveBeenCalledWith(PAGE, 'tok-1');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.client.heartbeat).not.toHaveBeenCalled();

    const g = fixture();
    await g.lock.open();
    g.lock.stop();
    expect(g.client.release).toHaveBeenCalledWith(PAGE, 'tok-1');
    expect(g.tabs.close).toHaveBeenCalled();
    g.lock.stop();
    expect(g.client.release).toHaveBeenCalledTimes(1);
  });

  it('sends a beacon on pagehide, unless the page goes into the back-forward cache', async () => {
    const f = fixture();
    await f.lock.open();
    f.lock.beaconRelease({ persisted: true } as PageTransitionEvent);
    expect(f.client.beaconRelease).not.toHaveBeenCalled();
    f.lock.beaconRelease({ persisted: false } as PageTransitionEvent);
    expect(f.client.beaconRelease).toHaveBeenCalledWith(PAGE, 'tok-1');
  });

  it("takes the lock again for a reconcile's picks without entering, and keeps that token for the teardown", async () => {
    const f = fixture({ heartbeat: vi.fn(async () => 'lost' as const) });
    await f.lock.open();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.lock.phase).toBe('lost');
    (f.client.acquire as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, token: 'tok-r' });
    expect(await f.lock.reacquire()).toBe('tok-r');
    expect(f.lock.phase).toBe('lost');
    expect(f.tabs.claim).toHaveBeenCalledTimes(2);
    f.lock.adopt('tok-r');
    f.lock.stop();
    expect(f.client.release).toHaveBeenCalledWith(PAGE, 'tok-r');
  });
});
