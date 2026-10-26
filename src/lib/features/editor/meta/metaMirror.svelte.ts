// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Optimistic copies of a node's stored metadata: each commit shows its value
// at once, then what the server stored. Seeded once from the load; afterwards
// only the commits change them. Public methods are arrow fields: chrome takes
// them as bare callback props.
import type { NodeMetaActions, NodeProperty } from './nodeMeta';

type Writes = Pick<NodeMetaActions, 'onSetTags' | 'onSetManualProperties' | 'onSetVisibility' | 'onSetShares'>;

export class MetaMirror {
  tags = $state<string[]>([]);
  manualProperties = $state<NodeProperty[]>([]);
  // Stored visibility: null inherits the namespace's access level.
  visibility = $state<string | null>(null);
  shares = $state<string[]>([]);
  #writes: Writes;

  constructor(seed: { tags?: string[]; manualProperties?: NodeProperty[]; visibility?: string | null; shares?: string[] }, writes: Writes) {
    if (seed.tags) this.tags = seed.tags;
    if (seed.manualProperties) this.manualProperties = seed.manualProperties;
    if (seed.visibility !== undefined) this.visibility = seed.visibility;
    if (seed.shares) this.shares = seed.shares;
    this.#writes = writes;
  }

  commitTags = async (next: string[]) => {
    this.tags = next;
    const res = await this.#writes.onSetTags?.(next);
    if (res?.ok && res.tags) this.tags = res.tags; // server-normalized (dedupe/casing)
  };

  commitManualProperties = async (next: NodeProperty[]) => {
    this.manualProperties = next;
    const res = await this.#writes.onSetManualProperties?.(next);
    if (res?.ok && res.properties) this.manualProperties = res.properties;
  };

  commitVisibility = async (next: string | null) => {
    this.visibility = next;
    const res = await this.#writes.onSetVisibility?.(next);
    if (res?.ok && res.visibility !== undefined) this.visibility = res.visibility;
    return res;
  };

  commitShares = async (next: string[]) => {
    this.shares = next;
    const res = await this.#writes.onSetShares?.(next);
    if (res?.ok && res.shares) this.shares = res.shares;
    return res;
  };
}
