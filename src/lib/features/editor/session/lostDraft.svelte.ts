// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Unsaved work when the edit lock goes: kept as a draft version, which the
// reconcile panel diffs against the stored page; its picks are applied under
// the lock taken anew.
import type { ApplyPicksResult, BlockPick } from '$lib/features/pages';
import type { EditLock } from './editLock.svelte';

/** The page client's draft and picks requests (pages/client.ts). */
export interface DraftClient {
  saveDraft: (pageId: string, doc: unknown, baseVersionId: string | null) => Promise<{ versionId: string; currentDoc: unknown } | null>;
  applyPicks: (pageId: string, picks: BlockPick[], lockToken: string) => Promise<ApplyPicksResult>;
}

export class LostDraft {
  reconcile = $state<{ current: unknown; draft: unknown } | null>(null);
  #pageId: () => string | null;
  #baseVersionId: () => string | null;
  #lock: EditLock;
  #client: DraftClient;
  #reload: () => void;
  #leave: () => void;

  constructor(deps: {
    pageId: () => string | null;
    /** The version the editor loaded, which the draft is based on. */
    baseVersionId: () => string | null;
    lock: EditLock;
    client: DraftClient;
    reload: () => void;
    /** Goes to the page's read view; the draft stays saved as a version. */
    leave: () => void;
  }) {
    this.#pageId = deps.pageId;
    this.#baseVersionId = deps.baseVersionId;
    this.#lock = deps.lock;
    this.#client = deps.client;
    this.#reload = deps.reload;
    this.#leave = deps.leave;
  }

  onLockLost = async (draftDoc: unknown, dirty: boolean, held: (doc: unknown) => unknown) => {
    const id = this.#pageId();
    if (!id) return;
    if (!dirty) {
      this.#lock.markMoved();
      return;
    }
    try {
      const saved = await this.#client.saveDraft(id, draftDoc, this.#baseVersionId());
      if (!saved) return; // the editor stays read-only, with the banner
      // Read as the editor holds a document: one an agent wrote lacks attributes
      // the editor gives every block, so every block would read as changed.
      this.reconcile = { current: held(saved.currentDoc), draft: draftDoc };
    } catch {
      // the read-only banner stays; the reader can still copy their text
    }
  };

  apply = async (picks: BlockPick[]): Promise<{ ok: true } | { ok: false; reason: string }> => {
    const id = this.#pageId();
    if (!id) return { ok: false, reason: 'error' };
    const token = await this.#lock.reacquire();
    if (!token) return { ok: false, reason: 'lock' };
    const res = await this.#client.applyPicks(id, picks, token);
    if (res.ok) {
      this.#lock.adopt(token); // released by the reload's teardown
      this.#reload();
      return { ok: true };
    }
    return { ok: false, reason: res.reason };
  };

  discard = () => {
    this.reconcile = null;
    this.#leave();
  };
}
