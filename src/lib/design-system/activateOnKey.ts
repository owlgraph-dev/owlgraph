// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A group item's Enter and Space run its command, as its click does.
export function activateOnKey(e: KeyboardEvent, run: (() => void) | undefined): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    run?.();
  }
}
