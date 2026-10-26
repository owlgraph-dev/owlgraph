// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Flex cell capability (docs/architecture/blocks/layout.md, "Placement"): a flex cell's size along
// its row and its align-self across it. Every size stays within the row:
//   Auto   `flex: 0 1 auto`, its content's minimum as its own
//   Fill   `flex: <weight> 1 0%`: shares the free space by weight, and wraps
//          rather than squeezing text past its longest word
//   Fixed  `flex: 0 1 <basis>`, also set as the width: a row sized to its
//          cells measures them by width, not by flex-basis
import { resolveCapability, type Tier, TIERS, TIER_CHAR } from '../cascade';
import type { OverrideSet } from '../overrides';
import { LENGTH_UNITS, type LengthUnit } from '../../page/pageAttrs';

export type FlexItemSize = 'fill' | 'fixed';
export type FlexItemSelf = 'start' | 'center' | 'end' | 'stretch';
export type FlexItemWeight = 1 | 2 | 3;

export interface FlexItemValue {
  size?: FlexItemSize;
  weight?: FlexItemWeight;
  /** Fixed's size: `<n>px`, `<n>rem` or `<n>%`, within FLEX_BASIS_BOUNDS. */
  basis?: string;
  self?: FlexItemSelf;
}
export type FlexItemData = Partial<Record<Tier, FlexItemValue>>;

export const FLEX_ITEM_SELVES: readonly FlexItemSelf[] = ['start', 'center', 'end', 'stretch'];
export const FLEX_ITEM_WEIGHTS: readonly FlexItemWeight[] = [1, 2, 3];

export type FlexBasisUnit = LengthUnit | '%';
export const FLEX_BASIS_UNITS: readonly FlexBasisUnit[] = [...LENGTH_UNITS, '%'];
export const FLEX_BASIS_BOUNDS: Record<FlexBasisUnit, { min: number; max: number }> = {
  px: { min: 40, max: 1200 },
  rem: { min: 2.5, max: 75 },
  '%': { min: 5, max: 100 },
};
/** What Fixed starts from when the author picks it. */
export const FLEX_BASIS_START = '240px';

/** A basis split into value and unit, or null when it isn't one within bounds. */
export function parseFlexBasis(raw: unknown): { value: number; unit: FlexBasisUnit } | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d+(?:\.\d+)?)(px|rem|%)$/.exec(raw.trim());
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2] as FlexBasisUnit;
  const b = FLEX_BASIS_BOUNDS[unit];
  return Number.isFinite(value) && value >= b.min && value <= b.max ? { value, unit } : null;
}

/** A basis written back from a value and unit, clamped to the unit's bounds. */
export function formatFlexBasis(value: number, unit: FlexBasisUnit): string {
  const b = FLEX_BASIS_BOUNDS[unit];
  const v = Math.min(b.max, Math.max(b.min, value));
  return `${unit === 'px' ? Math.round(v) : Math.round(v * 100) / 100}${unit}`;
}

/** px and rem convert at 16px; a switch to or from % starts that unit over. */
export function convertFlexBasis(from: { value: number; unit: FlexBasisUnit }, unit: FlexBasisUnit): string {
  if (from.unit === unit) return formatFlexBasis(from.value, unit);
  if (unit === '%') return '50%';
  if (from.unit === '%') return unit === 'px' ? FLEX_BASIS_START : formatFlexBasis(parseFlexBasis(FLEX_BASIS_START)!.value / 16, 'rem');
  return formatFlexBasis(unit === 'rem' ? from.value / 16 : from.value * 16, unit);
}

function flexSizeOrNull(v: unknown): FlexItemSize | null {
  return v === 'fill' || v === 'fixed' ? v : null;
}
function selfOrNull(v: unknown): FlexItemSelf | null {
  return typeof v === 'string' && (FLEX_ITEM_SELVES as readonly string[]).includes(v) ? (v as FlexItemSelf) : null;
}
function flexWeightOrNull(v: unknown): FlexItemWeight | null {
  return v === 1 || v === 2 || v === 3 ? v : null;
}

/** What a tier resolves to through the desktop-first cascade, every field validated (null = Auto). */
export function resolvedFlexItem(
  data: FlexItemData | null | undefined,
  bp: Tier
): { size: FlexItemSize | null; weight: FlexItemWeight; basis: string | null; self: FlexItemSelf | null } {
  const r = resolveCapability<FlexItemValue>(data, bp);
  const basis = parseFlexBasis(r.basis) ? r.basis!.trim() : null;
  const size = flexSizeOrNull(r.size);
  return {
    // Fixed without a basis is Auto: nothing to size it by.
    size: size === 'fixed' && !basis ? null : size,
    weight: flexWeightOrNull(r.weight) ?? 1,
    basis,
    self: selfOrNull(r.self),
  };
}

const SELF_CSS: Record<FlexItemSelf, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
// The chain's fallbacks in flex.css — the Auto cell.
const AUTO = { flex: '0 1 auto', minw: 'auto', maxw: '100%', w: 'auto', self: 'auto' };

function rendered(data: FlexItemData | null | undefined, bp: Tier): typeof AUTO {
  const r = resolvedFlexItem(data, bp);
  const self = r.self ? SELF_CSS[r.self] : AUTO.self;
  if (r.size === 'fill') return { flex: `${r.weight} 1 0%`, minw: 'auto', maxw: '100%', w: 'auto', self };
  if (r.size === 'fixed') return { flex: `0 1 ${r.basis}`, minw: '0', maxw: '100%', w: r.basis!, self };
  return { ...AUTO, self };
}

/** The property names flexItemVars can emit, which a unit test counts. */
export const FLEX_ITEM_PROPS: readonly string[] = (Object.keys(AUTO) as (keyof typeof AUTO)[]).flatMap((key) => TIERS.map((bp) => `--flex-item-${key}-${TIER_CHAR[bp]}`));

/** The cell's sizing and alignment as overrides: per tier, each value that differs from the tier above (desktop: from Auto). */
export function flexItemVars(data: FlexItemData | null | undefined): OverrideSet {
  const out: Record<string, string> = {};
  let above = AUTO;
  for (const bp of TIERS) {
    const own = rendered(data, bp);
    for (const key of Object.keys(AUTO) as (keyof typeof AUTO)[]) {
      if (own[key] !== above[key]) out[`--flex-item-${key}-${TIER_CHAR[bp]}`] = own[key];
    }
    above = own;
  }
  return out;
}

/** The class a flex cell adds while it sizes or aligns itself (the editor's empty-cell floor stands aside for it). */
export function flexItemClass(data: FlexItemData | null | undefined): string {
  return Object.keys(flexItemVars(data)).length > 0 ? 'cap-flex-item' : '';
}

/** Sanitizes a raw (possibly absent or malformed) value into valid FlexItemData. */
export function normalizeFlexItem(raw: unknown): FlexItemData {
  if (!raw || typeof raw !== 'object') return {};
  const out: FlexItemData = {};
  for (const bp of TIERS) {
    const t = (raw as Record<string, Record<string, unknown> | undefined>)[bp];
    if (!t || typeof t !== 'object') continue;
    const tier: FlexItemValue = {};
    const size = flexSizeOrNull(t.size);
    if (size) tier.size = size;
    const weight = flexWeightOrNull(t.weight);
    if (weight) tier.weight = weight;
    if (parseFlexBasis(t.basis)) tier.basis = (t.basis as string).trim();
    const self = selfOrNull(t.self);
    if (self) tier.self = self;
    if (Object.keys(tier).length > 0) out[bp] = tier;
  }
  return out;
}

/**
 * Sets or clears (null) one field of one tier. Choosing a size keeps the tier
 * coherent: Fill drops a basis, Fixed drops a weight and starts from
 * FLEX_BASIS_START without a basis, Auto drops both.
 */
export function setFlexItemField<K extends keyof FlexItemValue>(
  data: FlexItemData | null | undefined,
  bp: Tier,
  field: K,
  value: FlexItemValue[K] | null
): FlexItemData {
  const next: FlexItemData = { ...(data ?? {}) };
  const tier: FlexItemValue = { ...(next[bp] ?? {}) };
  if (value == null) delete tier[field];
  else tier[field] = value;
  if (field === 'size') {
    if (value !== 'fixed') delete tier.basis;
    if (value !== 'fill') delete tier.weight;
    if (value === 'fixed' && !parseFlexBasis(resolveCapability<FlexItemValue>({ ...next, [bp]: tier }, bp).basis)) tier.basis = FLEX_BASIS_START;
  }
  if (Object.keys(tier).length > 0) next[bp] = tier;
  else delete next[bp];
  return next;
}

export function flexItemAttr() {
  return {
    default: null as FlexItemData | null,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-flex-item');
        return raw ? normalizeFlexItem(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const f = attrs.flexItem as FlexItemData | null | undefined;
      return f && Object.keys(f).length ? { 'data-flex-item': JSON.stringify(f) } : {};
    },
  };
}
