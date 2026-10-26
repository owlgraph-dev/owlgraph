// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Height capability (docs/architecture/blocks/capabilities.md, "Min-height"). Not a Layout field: grids
// and sections have no Layout capability, and Layout's class makes its host a
// flex box. svh, unlike vh, doesn't jump when a phone's address bar collapses,
// and unlike dvh doesn't resize while scrolling. 'none' takes back a larger
// viewport's height.
import { resolveCapability, type Tier, TIERS, TIER_CHAR } from '../cascade';
import type { OverrideSet } from '../overrides';

export type MinHeightUnit = 'px' | 'rem' | 'svh';
export const MIN_HEIGHT_UNITS: readonly MinHeightUnit[] = ['px', 'rem', 'svh'];
export const MIN_HEIGHT_BOUNDS: Record<MinHeightUnit, { min: number; max: number }> = {
  px: { min: 40, max: 2000 },
  rem: { min: 2.5, max: 125 },
  svh: { min: 10, max: 100 },
};
/** The block settings panel's quick picks; not the stored type. */
export const MIN_HEIGHT_PRESETS = { s: '320px', m: '480px', l: '640px', screen: '100svh' } as const;
export const MIN_HEIGHT_NONE = 'none';

export interface HeightValue {
  /** A bounded length, or 'none'. */
  min?: string;
}
export type HeightData = Partial<Record<Tier, HeightValue>>;

/** A min-height split into value and unit, or null when it isn't one within bounds. */
export function parseMinHeight(raw: unknown): { value: number; unit: MinHeightUnit } | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)(px|rem|svh)$/.exec(raw.trim());
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2] as MinHeightUnit;
  const b = MIN_HEIGHT_BOUNDS[unit];
  return Number.isFinite(value) && value >= b.min && value <= b.max ? { value, unit } : null;
}

/** A min-height written back from a value and unit, clamped to the unit's bounds. */
export function formatMinHeight(value: number, unit: MinHeightUnit): string {
  const b = MIN_HEIGHT_BOUNDS[unit];
  const v = Math.min(b.max, Math.max(b.min, value));
  return `${unit === 'px' || unit === 'svh' ? Math.round(v) : Math.round(v * 100) / 100}${unit}`;
}

/** px and rem convert at 16px; a switch to or from svh starts that unit over. */
export function convertMinHeight(from: { value: number; unit: MinHeightUnit }, unit: MinHeightUnit): string {
  if (from.unit === unit) return formatMinHeight(from.value, unit);
  if (unit === 'svh') return '60svh';
  if (from.unit === 'svh') return unit === 'px' ? MIN_HEIGHT_PRESETS.m : formatMinHeight(30, 'rem');
  return formatMinHeight(unit === 'rem' ? from.value / 16 : from.value * 16, unit);
}

function minOrNull(v: unknown): string | null {
  if (v === MIN_HEIGHT_NONE) return MIN_HEIGHT_NONE;
  return parseMinHeight(v) ? (v as string).trim() : null;
}

/** What a tier resolves to through the cascade: a length, or null for no minimum. */
export function resolvedMinHeight(data: HeightData | null | undefined, bp: Tier): string | null {
  const v = minOrNull(resolveCapability<HeightValue>(data, bp).min);
  return v === MIN_HEIGHT_NONE ? null : v;
}

/** The min-height as overrides: per tier, when it differs from the tier above (desktop: from none). */
export function heightVars(data: HeightData | null | undefined): OverrideSet {
  const out: Record<string, string> = {};
  let above: string | null = null;
  for (const bp of TIERS) {
    const own = resolvedMinHeight(data, bp);
    if (own !== above) out[`--min-height-${TIER_CHAR[bp]}`] = own ?? 'auto';
    above = own;
  }
  return out;
}

/** Sanitizes a raw (possibly absent or malformed) value into valid HeightData. */
export function normalizeHeightData(raw: unknown): HeightData {
  if (!raw || typeof raw !== 'object') return {};
  const out: HeightData = {};
  for (const bp of TIERS) {
    const t = (raw as Record<string, Record<string, unknown> | undefined>)[bp];
    const min = t && typeof t === 'object' ? minOrNull(t.min) : null;
    // 'none' only takes back a larger tier's height; at desktop there is none to take back.
    if (min && !(bp === 'desktop' && min === MIN_HEIGHT_NONE)) out[bp] = { min };
  }
  return out;
}

/** Sets or clears (null) one tier's min-height. */
export function setHeightField(data: HeightData | null | undefined, bp: Tier, value: string | null): HeightData {
  const next: HeightData = { ...(data ?? {}) };
  const min = minOrNull(value);
  if (min && !(bp === 'desktop' && min === MIN_HEIGHT_NONE)) next[bp] = { min };
  else delete next[bp];
  return next;
}

export function heightAttr() {
  return {
    default: null as HeightData | null,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-height');
        return raw ? normalizeHeightData(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const h = attrs.height as HeightData | null | undefined;
      return h && Object.keys(h).length ? { 'data-height': JSON.stringify(h) } : {};
    },
  };
}
