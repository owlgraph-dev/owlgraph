// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Browser-only: renderHTML takes no parameters, so the root layout sets the
// defaults here before the editor mounts. SSR passes them to renderDoc instead,
// since one process serves many requests.
import { BUILTIN_BLOCK_DEFAULTS, type ResolvedBlockDefaults } from './blockDefaults';

let active: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS;

export function setBlockDefaults(next: ResolvedBlockDefaults): void {
  active = next;
}

export function getBlockDefaults(): ResolvedBlockDefaults {
  return active;
}
