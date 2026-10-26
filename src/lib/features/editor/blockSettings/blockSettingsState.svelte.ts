// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Module-level so a folded section stays folded for the session, though the
// panel is recreated on toggle; keyed by section id alone, so it folds the
// same on every block.
const sectionOpen = $state<Record<string, boolean>>({});

export function isSectionOpen(id: string): boolean {
  return sectionOpen[id] ?? true;
}

export function setSectionOpen(id: string, open: boolean): void {
  sectionOpen[id] = open;
}
