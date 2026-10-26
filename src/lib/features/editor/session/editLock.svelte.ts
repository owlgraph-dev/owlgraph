// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Who holds the page being edited (docs/architecture/authorization.md, "Edit lock"): its
// phases, the heartbeat that keeps the lock, the poll while someone else
// holds it, this browser's other tabs, and the save that carries its token.
// The lock coordinates editors; storage integrity is withPageDoc's row lock on
// the server. Its requests and the browser's storage are passed in.
import * as m from '$lib/paraglide/messages';
import type { AcquireLockResult, EditTabs, LockHolder, LockStatus, SaveResult } from '$lib/features/pages';

/**
 * 'elsewhere': another tab of this browser edits the page (editTabs.ts).
 * 'lost': the lock went with unsaved work to reconcile; 'moved': with none.
 */
export type EditPhase = 'acquiring' | 'editing' | 'blocked' | 'elsewhere' | 'lost' | 'moved';

/** The page client's lock requests (pages/client.ts) and the tab coordination (pages/editTabs.ts). */
export interface LockClient {
  acquire: (pageId: string, force?: boolean) => Promise<AcquireLockResult>;
  heartbeat: (pageId: string, token: string) => Promise<'ok' | 'lost' | 'unreachable'>;
  release: (pageId: string, token: string) => void;
  beaconRelease: (pageId: string, token: string) => void;
  status: (pageId: string) => Promise<LockStatus | null>;
  save: (pageId: string, doc: unknown, token: string | null, acknowledgeDropped?: readonly string[]) => Promise<SaveResult>;
  editTabs: (pageId: string, opts: { editing: () => boolean; onClaimed: () => void }) => EditTabs;
}

const HEARTBEAT_MS = 20_000;
const BLOCKED_POLL_MS = 15_000;

// "Edit here" in a tab that stepped aside reloads for the current page and
// takes the lock straight away: the reader already chose.
const claimKey = (id: string) => `owlgraph:edit-here:${id}`;

export class EditLock {
  #phase = $state<EditPhase>('acquiring');
  /** Why the lock went: another tab of this browser took it, or the server said so. */
  lostTo = $state<'tab' | 'other'>('other');
  holder = $state<LockHolder | null>(null);
  #token: string | null = null; // capability proof; read only inside handlers
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  #pollTimer: ReturnType<typeof setInterval> | null = null;
  // Made on open: the browser's tabs, never the server's.
  #tabs: EditTabs | null = null;
  #pageId: () => string | null;
  #client: LockClient;
  #storage: () => Storage;
  #reload: () => void;
  #confirm: (message: string) => boolean;

  /** `pageId` is read on every request: null while the route shows no page. */
  constructor(
    pageId: () => string | null,
    deps: { client: LockClient; storage: () => Storage; reload: () => void; confirm: (message: string) => boolean }
  ) {
    this.#pageId = pageId;
    this.#client = deps.client;
    this.#storage = deps.storage;
    this.#reload = deps.reload;
    this.#confirm = deps.confirm;
  }

  get phase(): EditPhase {
    return this.#phase;
  }

  // While blocked, the holder is polled, and the editor entered once the lock
  // frees or goes stale.
  #setPhase(next: EditPhase) {
    this.#phase = next;
    if (next === 'blocked') this.#startPoll();
    else this.#stopPoll();
  }

  /** On the route's mount: steps aside for another tab of this browser, else acquires. */
  open = async () => {
    const id = this.#pageId();
    if (!id) return;
    this.#tabs = this.#client.editTabs(id, { editing: () => this.#phase === 'editing', onClaimed: () => this.#lose('tab') });
    let chosen = false;
    try {
      chosen = this.#storage().getItem(claimKey(id)) === '1';
      this.#storage().removeItem(claimKey(id));
    } catch { /* storage unavailable */ }
    if (!chosen && (await this.#tabs?.otherTabEditing())) this.#setPhase('elsewhere');
    else this.acquire();
  };

  acquire = async (force = false) => {
    const id = this.#pageId();
    if (!id) return;
    this.#setPhase('acquiring');
    const res = await this.#client.acquire(id, force);
    if (res.ok) {
      this.#token = res.token;
      this.holder = null;
      this.#setPhase('editing');
      this.#tabs?.claim();
      this.#startHeartbeat();
    } else {
      this.#token = null;
      this.holder = res.holder;
      this.#setPhase('blocked');
    }
  };

  #startHeartbeat() {
    this.#stopHeartbeat();
    this.#heartbeatTimer = setInterval(async () => {
      const id = this.#pageId();
      if (!this.#token || !id) return;
      if ((await this.#client.heartbeat(id, this.#token)) === 'lost') this.#lose('other');
    }, HEARTBEAT_MS);
  }

  #stopHeartbeat() {
    if (this.#heartbeatTimer) { clearInterval(this.#heartbeatTimer); this.#heartbeatTimer = null; }
  }

  #lose(to: 'tab' | 'other') {
    if (this.#phase !== 'editing') return;
    this.#stopHeartbeat();
    this.#token = null;
    this.lostTo = to;
    this.#setPhase('lost'); // the editor stays mounted, read-only, so unsaved edits stay visible
  }

  /** Gives the lock back; keepalive, and the TTL is the real backstop. */
  release = () => {
    const id = this.#pageId();
    if (!this.#token || !id) return;
    this.#client.release(id, this.#token);
    this.#token = null;
  };

  /** For pagehide: a tab close or reload may skip the route's teardown. */
  beaconRelease = (e?: PageTransitionEvent) => {
    if (e?.persisted) return; // into the bfcache, may be restored: keep the lock
    const id = this.#pageId();
    if (!this.#token || !id) return;
    this.#client.beaconRelease(id, this.#token);
  };

  #startPoll() {
    this.#stopPoll();
    this.#pollTimer = setInterval(async () => {
      const id = this.#pageId();
      if (this.#phase !== 'blocked' || !id) return;
      const status = await this.#client.status(id);
      if (!status) return;
      if (!status.locked || status.stale) this.acquire();
      else this.holder = status;
    }, BLOCKED_POLL_MS);
  }

  #stopPoll() {
    if (this.#pollTimer) { clearInterval(this.#pollTimer); this.#pollTimer = null; }
  }

  // Admins only, for a fresh holder: "Try again" takes a stale lock for anyone.
  takeover = () => {
    const who = this.holder?.lockedByName;
    if (this.#confirm(who ? m.editor_lock_takeover_confirm({ name: who }) : m.editor_lock_takeover_confirm_unnamed())) this.acquire(true);
  };

  editHereAgain = () => {
    const id = this.#pageId();
    if (!id) return;
    try { this.#storage().setItem(claimKey(id), '1'); } catch { /* storage unavailable: the reload asks again */ }
    this.#reload();
  };

  /** Leaving the editor: the heartbeat stops and the lock goes back. */
  leave = () => {
    this.#stopHeartbeat();
    this.release();
  };

  /** The route's teardown. */
  stop = () => {
    this.#stopHeartbeat();
    this.#stopPoll();
    this.#tabs?.close();
    this.release();
  };

  /** The editor's save, with the token; a refusal for a lost lock loses it here too. */
  save = async (doc: unknown, opts?: { acknowledgeDropped?: readonly string[] }) => {
    const id = this.#pageId();
    if (!id) return { ok: false };
    const res = await this.#client.save(id, doc, this.#token, opts?.acknowledgeDropped);
    if (!res.ok && res.lockLost) this.#lose('other');
    return { ok: res.ok, lockLost: !res.ok && res.lockLost, unknownDropped: !res.ok && !!res.unknownDropped };
  };

  /** The lock went with nothing unsaved: there is nothing to reconcile. */
  markMoved = () => {
    this.#setPhase('moved');
  };

  /** The lock taken again for a reconcile's picks, without entering the editor: its token, or null. */
  reacquire = async (): Promise<string | null> => {
    const id = this.#pageId();
    if (!id) return null;
    const got = await this.#client.acquire(id);
    if (!got.ok) return null;
    this.#tabs?.claim();
    return got.token;
  };

  /** Holds a token taken elsewhere, for the teardown to release. */
  adopt = (token: string) => {
    this.#token = token;
  };
}
