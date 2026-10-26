// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Which tree browser a source section has open, if any. An open one counts as
// one of the editor's overlays (its Escape handling), so opening and closing it
// say so through the section's `overlayOpenChange`, read at the time.
export class Browsing<K extends string> {
  kind = $state<K | null>(null);
  readonly #overlayOpenChange: () => (open: boolean) => void;

  constructor(overlayOpenChange: () => (open: boolean) => void) {
    this.#overlayOpenChange = overlayOpenChange;
  }

  open(kind: K) {
    this.kind = kind;
    this.#overlayOpenChange()(true);
  }

  close() {
    if (this.kind === null) return;
    this.kind = null;
    this.#overlayOpenChange()(false);
  }
}
