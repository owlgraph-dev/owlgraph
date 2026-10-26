// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Spacing capability, stored as plain px; the *_PRESETS are UI quick picks only.
//   pad         padding, per side
//   blockSpace  a flow's rhythm: the space every block inside it puts above itself
//   spaceAbove  one block's override of that
// The space between blocks is one margin-top per boundary, resolved in app.css;
// this module only computes the vars (docs/architecture/blocks/capabilities.md, "Block spacing").
import { resolveCapability, type Tier, TIER_CHAR } from '../cascade';
import { NO_OVERRIDES, styleAttr, type OverrideSet } from '../overrides';

export type Side = 'top' | 'right' | 'bottom' | 'left';
const ALL_SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
// The same desktop-first chain the CSS var() fallbacks express.
const BP_FALLBACK_ORDER: Record<Tier, Tier[]> = {
  desktop: ['desktop'],
  tablet: ['tablet', 'desktop'],
  phone: ['phone', 'tablet', 'desktop'],
};

export interface SpacingValue {
  pad?: number; // all sides, px, clamped to PAD_MIN..PAD_MAX
  // Only the sides that differ from `pad`.
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  /** This flow's rhythm — the space every block inside it puts above itself. */
  blockSpace?: number;
  /** This block's own override of the space above it. Absent = the cascade. */
  spaceAbove?: number;
}
export type SpacingData = Partial<Record<Tier, SpacingValue>>;

/** The flow-level and per-block fields, as opposed to the per-side `pad` ones. */
export type SpaceField = 'blockSpace' | 'spaceAbove';

export const PAD_MIN = 0;
export const PAD_MAX = 200;

export const PAD_PRESETS = { none: 0, sm: 8, md: 16, lg: 24 } as const;
// Space-above presets span a wider range: an override exists to break the rhythm.
export const BLOCK_SPACE_PRESETS = { none: 0, sm: 16, md: 24, lg: 40 } as const;
export const SPACE_ABOVE_PRESETS = { none: 0, sm: 12, md: 24, lg: 48 } as const;

function clampPad(v: number): number {
  return Math.max(PAD_MIN, Math.min(PAD_MAX, Math.round(v)));
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clampPad(v) : null;
}

// `fallback` is the block's group default (capabilities/defaults), null for none.
export function resolvedPad(data: SpacingData | null | undefined, bp: Tier, fallback: number | null): number {
  const v = resolveCapability<SpacingValue>(data, bp).pad;
  return numOrNull(v) ?? clampPad(fallback ?? 0);
}

// A side falls back to the same tier's `pad`, not an ancestor tier's, so a
// tablet `pad` wins for every side at tablet even when desktop set one side.
function tierSideValue(tier: SpacingValue | undefined, side: Side): number | null {
  return numOrNull(tier?.[side] ?? tier?.pad);
}

// Walks the tiers in JS, unlike tier selection, because side-vs-pad
// doesn't depend on the device. Mirrors what the CSS chain resolves.
export function resolvedSide(data: SpacingData | null | undefined, bp: Tier, side: Side, fallback: number | null): number {
  for (const tier of BP_FALLBACK_ORDER[bp]) {
    const v = tierSideValue(data?.[tier], side);
    if (v != null) return v;
  }
  return clampPad(fallback ?? 0);
}

// No fallback to a sibling field: rhythm and override are separate axes.
function tierSpace(tier: SpacingValue | undefined, field: SpaceField): number | null {
  return numOrNull(tier?.[field]);
}

// Null is Auto; what Auto resolves to is the caller's business.
export function resolvedSpace(data: SpacingData | null | undefined, bp: Tier, field: SpaceField): number | null {
  for (const tier of BP_FALLBACK_ORDER[bp]) {
    const v = tierSpace(data?.[tier], field);
    if (v != null) return v;
  }
  return null;
}

// The rhythm is a plain inheriting custom property, so a flow that sets any
// tier emits the complete triple: a sparse one would mix its own tiers with an
// ancestor's. A flow that is also a block publishes only --flow-space-*, which
// its cells relay, so it doesn't shadow the --block-space-* its own margin
// reads (docs/architecture/blocks/capabilities.md, "Block spacing"). `fallback` is the theme's page
// rhythm for the page: pinning exactly that emits nothing.
export function blockSpaceVars(
  data: SpacingData | null | undefined,
  fallback: number | null = null,
  prefix: 'block-space' | 'flow-space' = 'block-space'
): OverrideSet {
  const own = (['desktop', 'tablet', 'phone'] as const).some((bp) => tierSpace(data?.[bp], 'blockSpace') != null);
  if (!own) return NO_OVERRIDES;
  const base = fallback == null ? 0 : clampPad(fallback);
  const triple = (['desktop', 'tablet', 'phone'] as const).map((bp) => resolvedSpace(data, bp, 'blockSpace') ?? base);
  if (fallback != null && triple.every((v) => v === base)) return NO_OVERRIDES;
  const out: Record<string, string> = {};
  (['desktop', 'tablet', 'phone'] as const).forEach((bp, i) => {
    out[`--${prefix}-${TIER_CHAR[bp]}`] = `${triple[i]}px`;
  });
  return out;
}

// The page and every cell publish both names. The --flow-space-* half keeps the
// cell relay defined: a var() referencing an undefined custom property is
// guaranteed-invalid and would wipe the inherited rhythm, not pass it through.
export function flowRhythmVars(data: SpacingData | null | undefined, fallback: number | null = null): OverrideSet {
  return { ...blockSpaceVars(data, fallback, 'block-space'), ...blockSpaceVars(data, fallback, 'flow-space') };
}

// Fully sparse: an absent var lets the owl rule reach the block type's default,
// then the flow's rhythm. Registered inherits:false, so nested blocks don't inherit it.
export function spaceAboveVars(data: SpacingData | null | undefined): OverrideSet {
  const out: Record<string, string> = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const v = tierSpace(data?.[bp], 'spaceAbove');
    if (v != null) out[`--space-above-${TIER_CHAR[bp]}`] = `${v}px`;
  }
  return out;
}

// One function, so renderHTML, the NodeViews and the public renderers agree.
export function spaceAboveOverrides(attrs: { spacing?: SpacingData | null } | null | undefined): OverrideSet {
  return spaceAboveVars(attrs?.spacing);
}

/** The `style` text of spaceAboveOverrides — for a host whose only inline style is this. */
export function spaceAboveStyle(attrs: { spacing?: SpacingData | null } | null | undefined): string {
  return styleAttr(spaceAboveOverrides(attrs));
}

// Against the CSS chain in app.css: side → shorthand → the tiers above → the
// group default (`defaultPad`) → 0. Emits the shorthand unless every side
// already resolves to it, then only the sides that differ.
export function padVars(data: SpacingData | null | undefined, defaultPad: number | null): OverrideSet {
  const out: Record<string, string> = {};
  const above: Record<Tier, Tier | null> = { desktop: null, tablet: 'desktop', phone: 'tablet' };
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = data?.[bp];
    if (!tier) continue;
    const parent = above[bp];
    const baseline = (side: Side) => (parent ? resolvedSide(data, parent, side, defaultPad) : clampPad(defaultPad ?? 0));
    const pad = numOrNull(tier.pad);
    const shorthand = pad != null && ALL_SIDES.some((side) => baseline(side) !== pad);
    if (shorthand) out[`--pad-${TIER_CHAR[bp]}`] = `${pad}px`;
    for (const side of ALL_SIDES) {
      const own = numOrNull(tier[side]);
      if (own == null) continue;
      const reference = shorthand ? pad : baseline(side);
      if (own !== reference) out[`--pad-${TIER_CHAR[bp]}-${side}`] = `${own}px`;
    }
  }
  return out;
}

// Stored data may be absent or malformed; that reads as "no overrides".
export function normalizeSpacingData(raw: unknown): SpacingData {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: SpacingData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tierRaw = r[bp] as Record<string, unknown> | undefined;
    if (!tierRaw || typeof tierRaw !== 'object') continue;
    const tier: SpacingValue = {};
    const pad = numOrNull(tierRaw.pad);
    if (pad != null) tier.pad = pad;
    for (const side of ALL_SIDES) {
      const v = numOrNull(tierRaw[side]);
      if (v != null) tier[side] = v;
    }
    for (const field of ['blockSpace', 'spaceAbove'] as const) {
      const v = numOrNull(tierRaw[field]);
      if (v != null) tier[field] = v;
    }
    if (Object.keys(tier).length > 0) out[bp] = tier;
  }
  return out;
}

// `value == null` clears the field; an empty tier is dropped. Setting `pad`
// also clears that tier's per-side values (`sides`, for a host that exposes
// fewer), so picking a uniform value never leaves stale sides in effect.
export function setSpacingField(
  data: SpacingData | null | undefined,
  bp: Tier,
  field: 'pad' | Side | SpaceField,
  value: number | null,
  sides: Side[] = ALL_SIDES
): SpacingData {
  const next: SpacingData = { ...data };
  const tier: SpacingValue = { ...(next[bp] ?? {}) };
  if (field === 'pad') {
    for (const s of sides) delete tier[s];
  }
  if (value == null) {
    delete tier[field];
  } else {
    tier[field] = clampPad(value);
  }
  if (Object.keys(tier).length > 0) next[bp] = tier;
  else delete next[bp];
  return next;
}

// One JSON data attribute, like surfaceAttr(): a capability's data is one key.
export function spacingAttr() {
  return {
    default: {} as SpacingData,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-spacing');
        return raw ? (JSON.parse(raw) as SpacingData) : {};
      } catch {
        return {};
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const s = attrs.spacing as SpacingData | undefined;
      return s && Object.keys(s).length ? { 'data-spacing': JSON.stringify(s) } : {};
    },
  };
}
