// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A grid container's columns per tier (docs/architecture/blocks/layout.md, "Grid columns
// per tier"). Absent, a tablet keeps the desktop's columns and a phone
// stacks; a tier never has more columns than the one above it, and stores
// only what differs from what it would resolve to.
import type { Tier } from '../../capabilities/cascade';

export type GridTier = 'tablet' | 'phone';
export const GRID_TIERS: readonly GridTier[] = ['tablet', 'phone'];
export type GapStep = 'none' | 'sm' | 'md' | 'lg';
const GAP_STEPS: readonly GapStep[] = ['none', 'sm', 'md', 'lg'];
export type GridColumnsByTier = Partial<Record<GridTier, number[]>>;
export type GridGapByTier = Partial<Record<GridTier, GapStep>>;

export interface GridColumnAttrs {
  columnWidths?: unknown;
  gap?: unknown;
  columnsByTier?: unknown;
  gapByTier?: unknown;
}

export const MAX_GRID_RATIO = 12;
const DEFAULT_GAP: GapStep = 'md';
const STACKED = [1];

/** Whole numbers ≥ 1; two equal columns when absent. */
export function desktopColumns(attrs: GridColumnAttrs | undefined): number[] {
  const w = attrs?.columnWidths;
  return Array.isArray(w) && w.length > 0 ? w.map((n) => Math.max(1, Math.round(Number(n) || 1))) : [1, 1];
}

function gapOrNull(v: unknown): GapStep | null {
  return typeof v === 'string' && (GAP_STEPS as readonly string[]).includes(v) ? (v as GapStep) : null;
}

export function desktopGap(attrs: GridColumnAttrs | undefined): GapStep {
  return gapOrNull(attrs?.gap) ?? DEFAULT_GAP;
}

function ratiosOrNull(v: unknown, cap: number): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: number[] = [];
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_GRID_RATIO) return null;
    out.push(n);
  }
  return out.slice(0, cap);
}

function tierOf(raw: unknown, tier: GridTier): unknown {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[tier] : undefined;
}

/** A tier's columns through the cascade: tablet → the desktop's, phone → one column, each capped by the tier above. */
export function resolvedGridColumns(attrs: GridColumnAttrs | undefined, bp: Tier): number[] {
  const desktop = desktopColumns(attrs);
  if (bp === 'desktop') return desktop;
  const tablet = ratiosOrNull(tierOf(attrs?.columnsByTier, 'tablet'), desktop.length) ?? desktop;
  if (bp === 'tablet') return tablet;
  return ratiosOrNull(tierOf(attrs?.columnsByTier, 'phone'), tablet.length) ?? STACKED;
}

/** A tier's own columns, or null where it takes the cascade's (Auto). */
export function ownGridColumns(attrs: GridColumnAttrs | undefined, tier: GridTier): number[] | null {
  const own = normalizeColumnsByTier(attrs);
  return own[tier] ?? null;
}

export function resolvedGridGap(attrs: GridColumnAttrs | undefined, bp: Tier): GapStep {
  const desktop = desktopGap(attrs);
  if (bp === 'desktop') return desktop;
  const tablet = gapOrNull(tierOf(attrs?.gapByTier, 'tablet')) ?? desktop;
  if (bp === 'tablet') return tablet;
  return gapOrNull(tierOf(attrs?.gapByTier, 'phone')) ?? tablet;
}

/** A tier's own gap, or null where it takes the tier above's. */
export function ownGridGap(attrs: GridColumnAttrs | undefined, tier: GridTier): GapStep | null {
  return normalizeGapByTier(attrs)[tier] ?? null;
}

/**
 * The `data-reflow` tiers (`t`, `p`) where merges and row heights don't
 * apply: a column count other than the desktop's, and a phone on Auto, which
 * stacks.
 */
export function reflowTiers(attrs: GridColumnAttrs | undefined): string {
  const count = desktopColumns(attrs).length;
  const reflows = (tier: GridTier) => resolvedGridColumns(attrs, tier).length !== count || (tier === 'phone' && !ownGridColumns(attrs, 'phone'));
  return GRID_TIERS.filter(reflows)
    .map((tier) => (tier === 'tablet' ? 't' : 'p'))
    .join(' ');
}

/** Whether two lists of column ratios are the same, ratio by ratio. */
export const sameRatios = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((n, i) => n === b[i]);

/** Cut to the tier above; a tier equal to what it would resolve to anyway is dropped. */
export function normalizeColumnsByTier(attrs: GridColumnAttrs | undefined): GridColumnsByTier {
  const desktop = desktopColumns(attrs);
  const out: GridColumnsByTier = {};
  const tablet = ratiosOrNull(tierOf(attrs?.columnsByTier, 'tablet'), desktop.length);
  if (tablet && !sameRatios(tablet, desktop)) out.tablet = tablet;
  const phone = ratiosOrNull(tierOf(attrs?.columnsByTier, 'phone'), (tablet ?? desktop).length);
  if (phone && !sameRatios(phone, STACKED)) out.phone = phone;
  return out;
}

/** A tier equal to the one above it is dropped. */
export function normalizeGapByTier(attrs: GridColumnAttrs | undefined): GridGapByTier {
  const desktop = desktopGap(attrs);
  const out: GridGapByTier = {};
  const tablet = gapOrNull(tierOf(attrs?.gapByTier, 'tablet'));
  if (tablet && tablet !== desktop) out.tablet = tablet;
  const phone = gapOrNull(tierOf(attrs?.gapByTier, 'phone'));
  if (phone && phone !== (tablet ?? desktop)) out.phone = phone;
  return out;
}

const orNull = <T extends object>(v: T): T | null => (Object.keys(v).length ? v : null);

/** Null `ratios` clears the tier; null back when nothing is left. */
export function withGridTierColumns(attrs: GridColumnAttrs | undefined, tier: GridTier, ratios: number[] | null): GridColumnsByTier | null {
  const current = (attrs?.columnsByTier && typeof attrs.columnsByTier === 'object' ? attrs.columnsByTier : {}) as GridColumnsByTier;
  const next: GridColumnsByTier = { ...current };
  if (ratios) next[tier] = ratios;
  else delete next[tier];
  return orNull(normalizeColumnsByTier({ ...attrs, columnsByTier: next }));
}

/** Null `gap` clears the tier; null back when nothing is left. */
export function withGridTierGap(attrs: GridColumnAttrs | undefined, tier: GridTier, gap: GapStep | null): GridGapByTier | null {
  const current = (attrs?.gapByTier && typeof attrs.gapByTier === 'object' ? attrs.gapByTier : {}) as GridGapByTier;
  const next: GridGapByTier = { ...current };
  if (gap) next[tier] = gap;
  else delete next[tier];
  return orNull(normalizeGapByTier({ ...attrs, gapByTier: next }));
}

/** The tier attrs re-validated against a new desktop `columnWidths` or gap. */
export function gridTierAttrs(attrs: GridColumnAttrs): { columnsByTier: GridColumnsByTier | null; gapByTier: GridGapByTier | null } {
  return { columnsByTier: orNull(normalizeColumnsByTier(attrs)), gapByTier: orNull(normalizeGapByTier(attrs)) };
}
