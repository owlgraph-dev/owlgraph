// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An override set maps CSS property → value. Emitters return sets and never
// write style strings; the carriers turn a set into a `style` attribute, a live
// element's style or a per-page stylesheet rule (pageStyles.ts)
// (docs/architecture/blocks/capabilities.md, "Override sets and the carrier").
export type OverrideSet = Readonly<Record<string, string>>;

export const NO_OVERRIDES: OverrideSet = Object.freeze({});

/** Later sets win on a shared property; nullish sets are skipped. */
export function mergeOverrides(...sets: (OverrideSet | null | undefined)[]): OverrideSet {
  const out: Record<string, string> = {};
  for (const set of sets) if (set) Object.assign(out, set);
  return out;
}

/** The `style` attribute text for a set — `''` for an empty one, so a caller can omit the attribute. */
export function styleAttr(set: OverrideSet | null | undefined): string {
  if (!set) return '';
  return Object.entries(set)
    .map(([property, value]) => `${property}:${value}`)
    .join(';');
}

/** The inverse of styleAttr, for a stored style string (an older HTML attribute, a test). */
export function parseStyleText(text: string | null | undefined): OverrideSet {
  const out: Record<string, string> = {};
  for (const declaration of (text ?? '').split(';')) {
    const at = declaration.indexOf(':');
    if (at <= 0) continue;
    const property = declaration.slice(0, at).trim();
    const value = declaration.slice(at + 1).trim();
    if (property && value) out[property] = value;
  }
  return out;
}
