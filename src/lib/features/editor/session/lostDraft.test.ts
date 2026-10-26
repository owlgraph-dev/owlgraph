// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi } from 'vitest';
import type { EditLock } from './editLock.svelte';
import { LostDraft, type DraftClient } from './lostDraft.svelte';

const PAGE = 'p-1';
const PICKS = [{ blockId: 'b-1', take: 'draft' }] as never[];

function fixture(client: Partial<DraftClient> = {}, token: string | null = 'tok-r') {
  const lock = { markMoved: vi.fn(), reacquire: vi.fn(async () => token), adopt: vi.fn() };
  const fake: DraftClient = {
    saveDraft: vi.fn(async () => ({ versionId: 'v-2', currentDoc: { type: 'doc', stored: true } })),
    applyPicks: vi.fn(async () => ({ ok: true as const })),
    ...client,
  };
  const reload = vi.fn();
  const leave = vi.fn();
  const draft = new LostDraft({ pageId: () => PAGE, baseVersionId: () => 'v-base', lock: lock as unknown as EditLock, client: fake, reload, leave });
  return { draft, lock, client: fake, reload, leave };
}

describe("a lost lock's unsaved work", () => {
  it('is nothing to keep when nothing was unsaved: editing moved on', async () => {
    const f = fixture();
    await f.draft.onLockLost({ type: 'doc' }, false, (d) => d);
    expect(f.lock.markMoved).toHaveBeenCalled();
    expect(f.client.saveDraft).not.toHaveBeenCalled();
    expect(f.draft.reconcile).toBeNull();
  });

  it('is kept as a draft version on the version it was loaded from, then offered beside the stored page as the editor holds it', async () => {
    const f = fixture();
    const draftDoc = { type: 'doc', edited: true };
    await f.draft.onLockLost(draftDoc, true, (d) => ({ held: d }));
    expect(f.client.saveDraft).toHaveBeenCalledWith(PAGE, draftDoc, 'v-base');
    expect(f.draft.reconcile).toEqual({ current: { held: { type: 'doc', stored: true } }, draft: draftDoc });
  });

  it('leaves the read-only editor as it is when the draft cannot be kept', async () => {
    const refused = fixture({ saveDraft: vi.fn(async () => null) });
    await refused.draft.onLockLost({}, true, (d) => d);
    expect(refused.draft.reconcile).toBeNull();
    const failed = fixture({ saveDraft: vi.fn(async () => { throw new Error('offline'); }) });
    await failed.draft.onLockLost({}, true, (d) => d);
    expect(failed.draft.reconcile).toBeNull();
  });

  it('applies its picks under the lock taken again, then reloads', async () => {
    const f = fixture();
    expect(await f.draft.apply(PICKS)).toEqual({ ok: true });
    expect(f.client.applyPicks).toHaveBeenCalledWith(PAGE, PICKS, 'tok-r');
    expect(f.lock.adopt).toHaveBeenCalledWith('tok-r');
    expect(f.reload).toHaveBeenCalled();
  });

  it('says why its picks were not applied: the lock, or the server', async () => {
    const held = fixture({}, null);
    expect(await held.draft.apply(PICKS)).toEqual({ ok: false, reason: 'lock' });
    expect(held.client.applyPicks).not.toHaveBeenCalled();

    const refused = fixture({ applyPicks: vi.fn(async () => ({ ok: false as const, reason: 'unknown_dropped' as const })) });
    expect(await refused.draft.apply(PICKS)).toEqual({ ok: false, reason: 'unknown_dropped' });
    expect(refused.reload).not.toHaveBeenCalled();
    expect(refused.lock.adopt).not.toHaveBeenCalled();
  });

  it('is discarded for the read view, the draft staying saved as a version', () => {
    const f = fixture();
    f.draft.reconcile = { current: {}, draft: {} };
    f.draft.discard();
    expect(f.draft.reconcile).toBeNull();
    expect(f.leave).toHaveBeenCalled();
  });
});
