// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The settings sections open in the phone's sheet (docs/architecture/graph-view.md), kept
// for the session (per tab), not across visits.
const PANEL_SECTIONS = ['view', 'filter', 'display', 'forces'] as const;
export type PanelSection = (typeof PANEL_SECTIONS)[number];

export const DEFAULT_OPEN_SECTIONS: readonly PanelSection[] = ['view', 'filter'];
const STORAGE_KEY = 'owlgraph:graph-panel-sections';

const isSection = (v: unknown): v is PanelSection => typeof v === 'string' && (PANEL_SECTIONS as readonly string[]).includes(v);

/** Lenient: anything unreadable is the default, an unknown section is dropped. */
export function parseOpenSections(raw: string | null): PanelSection[] {
  if (raw === null) return [...DEFAULT_OPEN_SECTIONS];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSection) : [...DEFAULT_OPEN_SECTIONS];
  } catch {
    return [...DEFAULT_OPEN_SECTIONS];
  }
}

// sessionStorage may be unavailable (SSR, a locked-down browser).
export function loadOpenSections(): PanelSection[] {
  if (typeof sessionStorage === 'undefined') return [...DEFAULT_OPEN_SECTIONS];
  try {
    return parseOpenSections(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return [...DEFAULT_OPEN_SECTIONS];
  }
}

export function saveOpenSections(open: readonly string[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(open.filter(isSection)));
  } catch {
    // Storage full or blocked: the sections just aren't remembered.
  }
}
