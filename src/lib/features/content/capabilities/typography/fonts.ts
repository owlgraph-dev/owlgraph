// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Typography capability's font stacks. A stored family is a FontId or a
// `custom:<familyId>` reference, never a raw font-family string. Names with
// spaces are single-quoted, so a stack can sit in a double-quoted attribute.
export type FontId = 'sans' | 'serif' | 'mono';
export const FONT_IDS: readonly FontId[] = ['sans', 'serif', 'mono'];

export const FONT_STACKS: Record<FontId, string> = {
  // Matches app.css's body font, so picking it is a visual no-op.
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  // Matches the `code` stack in app.css exactly.
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const FONT_LABELS: Record<FontId, string> = {
  sans: 'Sans',
  serif: 'Serif',
  mono: 'Monospace',
};

// A shape check only: a reference to a deleted family fails soft at render.
const CUSTOM_FONT_RE = /^custom:[0-9a-f-]{36}$/i;
export function isCustomFontRef(v: unknown): v is string {
  return typeof v === 'string' && CUSTOM_FONT_RE.test(v);
}

export interface CustomFontEntry {
  id: string;
  name: string;
  stack: string;
}

export function customFontStacksRecord(entries: readonly CustomFontEntry[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.id, e.stack]));
}

// Undefined for anything unresolvable. Validate untrusted input with
// familyOrNull first: this only looks the value up.
export function resolveFontStack(family: string | null | undefined, customStacks: Record<string, string> = {}): string | undefined {
  if (!family) return undefined;
  return (FONT_STACKS as Record<string, string>)[family] ?? customStacks[family];
}
