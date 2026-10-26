// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node editor's delete confirmation: open, busy, and the error a refused
// delete gave. A delete that goes through navigates away.
import type { NodeMetaActions } from './nodeMeta';

export class DeleteRequest {
  open = $state(false);
  busy = $state(false);
  error = $state<string | null>(null);
  #onDelete: () => NodeMetaActions['onDelete'];

  /** `onDelete` is read when the delete is confirmed, so a callback passed later is the one called. */
  constructor(onDelete: () => NodeMetaActions['onDelete']) {
    this.#onDelete = onDelete;
  }

  ask = () => {
    this.error = null;
    this.open = true;
  };

  confirm = async () => {
    const onDelete = this.#onDelete();
    if (!onDelete) return;
    this.busy = true;
    this.error = null;
    const result = await onDelete();
    this.busy = false;
    if (!result.ok) this.error = result.error;
  };
}
