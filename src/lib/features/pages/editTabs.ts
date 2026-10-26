// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every acquire reissues the user's edit lock token, so two of their tabs would
// take it from each other in turn (docs/architecture/authorization.md, "Edit lock"). Tabs of
// one browser coordinate over a BroadcastChannel instead; another browser or
// device is the heartbeat's business. Without BroadcastChannel, all no-ops.

type Message =
  | { kind: 'probe'; pageId: string; from: string }
  | { kind: 'here'; pageId: string; from: string }
  | { kind: 'claim'; pageId: string; from: string; at: number };

const CHANNEL = 'owlgraph:page-edit';
const PROBE_MS = 300;

export interface EditTabs {
  otherTabEditing(): Promise<boolean>;
  /** Call right after acquiring the lock. */
  claim(): void;
  close(): void;
}

export function editTabs(
  pageId: string,
  opts: {
    /** While true, this tab answers probes. */
    editing: () => boolean;
    /** Another tab took the lock after this one acquired it. */
    onClaimed: () => void;
  }
): EditTabs {
  if (typeof BroadcastChannel === 'undefined') {
    return { otherTabEditing: async () => false, claim: () => {}, close: () => {} };
  }
  const self = crypto.randomUUID();
  const channel = new BroadcastChannel(CHANNEL);
  let acquiredAt = 0;
  let onHere: (() => void) | null = null;

  channel.onmessage = (e: MessageEvent<Message>) => {
    const msg = e.data;
    if (!msg || msg.pageId !== pageId || msg.from === self) return;
    if (msg.kind === 'probe' && opts.editing()) channel.postMessage({ kind: 'here', pageId, from: self } satisfies Message);
    else if (msg.kind === 'here') onHere?.();
    // Two tabs acquiring at once both claim; only the later acquire holds the
    // lock, so only a claim at least as recent as this tab's moves it aside.
    else if (msg.kind === 'claim' && opts.editing() && msg.at >= acquiredAt) opts.onClaimed();
  };

  return {
    otherTabEditing: () =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          onHere = null;
          resolve(false);
        }, PROBE_MS);
        onHere = () => {
          clearTimeout(timer);
          onHere = null;
          resolve(true);
        };
        channel.postMessage({ kind: 'probe', pageId, from: self } satisfies Message);
      }),
    claim: () => {
      acquiredAt = Date.now();
      channel.postMessage({ kind: 'claim', pageId, from: self, at: acquiredAt } satisfies Message);
    },
    close: () => channel.close(),
  };
}
