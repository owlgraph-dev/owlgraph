// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Layout capability: a flex container's arrangement, per tier. A grid's
// columns and gap are its own attrs (blocks/grid/gridColumns.ts). An unset var
// falls to the literal in app.css's `.cap-layout` rule, not the property's
// initial value, which isn't what a flex container wants.
//
// A host whose defaults differ (the query block's results stack as a column)
// passes a sparse `LayoutDefaults`, which its own stylesheet sets as a rule;
// resolvedX() and layoutVars compare against it.
import { resolveCapability, type Tier, TIER_CHAR } from '../cascade';
import type { OverrideSet } from '../overrides';

export type Display = 'flex' | 'inline-flex';
export type FlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
// 'scroll' is a nowrap row that scrolls sideways in its own box (docs/architecture/responsive.md).
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse' | 'scroll';
export type JustifyContent = 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
export type AlignItems = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline';
export type AlignContent = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'space-between' | 'space-around';

// Must match the fallback literals in app.css's `.cap-layout` rule.
export const LAYOUT_DEFAULTS = {
  display: 'flex' as Display,
  flexDirection: 'row' as FlexDirection,
  flexWrap: 'nowrap' as FlexWrap,
  justifyContent: 'flex-start' as JustifyContent,
  alignItems: 'stretch' as AlignItems,
  alignContent: 'flex-start' as AlignContent,
};
export type LayoutDefaults = Partial<typeof LAYOUT_DEFAULTS>;

export interface LayoutValue {
  display?: Display;
  flexDirection?: FlexDirection;
  flexWrap?: FlexWrap;
  justifyContent?: JustifyContent;
  alignItems?: AlignItems;
  // Only meaningful when wrapping; kept in storage while wrap is off.
  alignContent?: AlignContent;
  gap?: number; // px
}
export type LayoutData = Partial<Record<Tier, LayoutValue>>;

export const GAP_MIN = 0;
export const GAP_MAX = 200;
// UI quick picks, not the stored type.
export const GAP_PRESETS = { none: 0, sm: 8, md: 16, lg: 24 } as const;

function clampGap(v: number): number {
  return Math.max(GAP_MIN, Math.min(GAP_MAX, Math.round(v)));
}

function gapOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clampGap(v) : null;
}

function displayOrNull(v: unknown): Display | null {
  return v === 'flex' || v === 'inline-flex' ? v : null;
}
function flexDirectionOrNull(v: unknown): FlexDirection | null {
  return v === 'row' || v === 'row-reverse' || v === 'column' || v === 'column-reverse' ? v : null;
}
function flexWrapOrNull(v: unknown): FlexWrap | null {
  return v === 'nowrap' || v === 'wrap' || v === 'wrap-reverse' || v === 'scroll' ? v : null;
}
function justifyContentOrNull(v: unknown): JustifyContent | null {
  return v === 'flex-start' || v === 'flex-end' || v === 'center' || v === 'space-between' || v === 'space-around' || v === 'space-evenly'
    ? v
    : null;
}
function alignItemsOrNull(v: unknown): AlignItems | null {
  return v === 'flex-start' || v === 'flex-end' || v === 'center' || v === 'stretch' || v === 'baseline' ? v : null;
}
function alignContentOrNull(v: unknown): AlignContent | null {
  return v === 'flex-start' || v === 'flex-end' || v === 'center' || v === 'stretch' || v === 'space-between' || v === 'space-around'
    ? v
    : null;
}

export function resolvedDisplay(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): Display {
  return displayOrNull(resolveCapability<LayoutValue>(data, bp).display) ?? defaults?.display ?? LAYOUT_DEFAULTS.display;
}
export function resolvedFlexDirection(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): FlexDirection {
  return flexDirectionOrNull(resolveCapability<LayoutValue>(data, bp).flexDirection) ?? defaults?.flexDirection ?? LAYOUT_DEFAULTS.flexDirection;
}
export function resolvedFlexWrap(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): FlexWrap {
  return flexWrapOrNull(resolveCapability<LayoutValue>(data, bp).flexWrap) ?? defaults?.flexWrap ?? LAYOUT_DEFAULTS.flexWrap;
}
export function resolvedJustifyContent(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): JustifyContent {
  return justifyContentOrNull(resolveCapability<LayoutValue>(data, bp).justifyContent) ?? defaults?.justifyContent ?? LAYOUT_DEFAULTS.justifyContent;
}
export function resolvedAlignItems(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): AlignItems {
  return alignItemsOrNull(resolveCapability<LayoutValue>(data, bp).alignItems) ?? defaults?.alignItems ?? LAYOUT_DEFAULTS.alignItems;
}
export function resolvedAlignContent(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): AlignContent {
  return alignContentOrNull(resolveCapability<LayoutValue>(data, bp).alignContent) ?? defaults?.alignContent ?? LAYOUT_DEFAULTS.alignContent;
}
export function resolvedGap(data: LayoutData | null | undefined, bp: Tier, fallback: number = GAP_DEFAULT): number {
  return gapOrNull(resolveCapability<LayoutValue>(data, bp).gap) ?? clampGap(fallback);
}

/** The tiers (d / t / p) at which the row scrolls sideways, for its `data-scroll` attribute. */
export function scrollTiers(data: LayoutData | null | undefined, defaults?: LayoutDefaults): string {
  return (['desktop', 'tablet', 'phone'] as const)
    .filter((bp) => resolvedFlexWrap(data, bp, defaults) === 'scroll' && resolvedFlexDirection(data, bp, defaults).startsWith('row'))
    .map((bp) => TIER_CHAR[bp])
    .join(' ');
}

/** The arrangement control's one-word model over direction and wrap. */
export type LayoutArrangement = 'row' | 'stack' | 'wrap' | 'scroll';

const ARRANGEMENT_FIELDS: Record<LayoutArrangement, { flexDirection: FlexDirection; flexWrap: FlexWrap }> = {
  row: { flexDirection: 'row', flexWrap: 'nowrap' },
  stack: { flexDirection: 'column', flexWrap: 'nowrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  scroll: { flexDirection: 'row', flexWrap: 'scroll' },
};

/** A tier's arrangement through the cascade (a reversed direction reads as its plain one). */
export function resolvedArrangement(data: LayoutData | null | undefined, bp: Tier, defaults?: LayoutDefaults): LayoutArrangement {
  if (resolvedFlexDirection(data, bp, defaults).startsWith('column')) return 'stack';
  const wrap = resolvedFlexWrap(data, bp, defaults);
  return wrap === 'scroll' ? 'scroll' : wrap === 'nowrap' ? 'row' : 'wrap';
}

/** Whether a tier sets its own direction or wrap — else its arrangement is the tier above's (Auto). */
export function hasOwnArrangement(data: LayoutData | null | undefined, bp: Tier): boolean {
  const tier = normalizeLayoutData(data)[bp];
  return !!tier && (tier.flexDirection != null || tier.flexWrap != null);
}

/** Sets one tier's direction and wrap to an arrangement at once, or clears both (null: Auto). */
export function setLayoutArrangement(data: LayoutData | null | undefined, bp: Tier, arrangement: LayoutArrangement | null): LayoutData {
  const fields = arrangement ? ARRANGEMENT_FIELDS[arrangement] : null;
  return setLayoutField(setLayoutField(data, bp, 'flexDirection', fields?.flexDirection ?? null), bp, 'flexWrap', fields?.flexWrap ?? null);
}

/** The tiers (d / t / p) at which the container is a column, for its `data-column` attribute (flex.css). */
export function columnTiers(data: LayoutData | null | undefined, defaults?: LayoutDefaults): string {
  return (['desktop', 'tablet', 'phone'] as const)
    .filter((bp) => resolvedFlexDirection(data, bp, defaults).startsWith('column'))
    .map((bp) => TIER_CHAR[bp])
    .join(' ');
}

// The CSS literal in app.css's `.cap-layout`.
export const GAP_DEFAULT = 0;

const FIELDS = [
  ['display', 'display', displayOrNull, resolvedDisplay],
  ['flexDirection', 'direction', flexDirectionOrNull, resolvedFlexDirection],
  ['flexWrap', 'wrap', flexWrapOrNull, resolvedFlexWrap],
  ['justifyContent', 'justify', justifyContentOrNull, resolvedJustifyContent],
  ['alignItems', 'align-items', alignItemsOrNull, resolvedAlignItems],
  ['alignContent', 'align-content', alignContentOrNull, resolvedAlignContent],
] as const;

// A scrolling row is a nowrap row; its scrolling is the container's data-scroll.
const cssValue = (v: string) => (v === 'scroll' ? 'nowrap' : v);

// Emits a tier's value only where the chain would resolve to something else.
// A kind default is a rule in the kind's own stylesheet, never a pinned var.
export function layoutVars(data: LayoutData | null | undefined, defaults?: LayoutDefaults, prefix = 'layout'): OverrideSet {
  const out: Record<string, string> = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = data?.[bp];
    if (!tier) continue;
    const ch = TIER_CHAR[bp];
    const parent: Tier | null = bp === 'desktop' ? null : bp === 'tablet' ? 'desktop' : 'tablet';
    for (const [key, name, validate, resolve] of FIELDS) {
      const own = validate(tier[key]);
      if (own == null) continue;
      const base = parent ? resolve(data, parent, defaults) : (defaults?.[key] ?? LAYOUT_DEFAULTS[key]);
      if (cssValue(own) !== cssValue(base)) out[`--${prefix}-${name}-${ch}`] = cssValue(own);
    }
    const gap = gapOrNull(tier.gap);
    if (gap != null && gap !== (parent ? resolvedGap(data, parent) : GAP_DEFAULT)) out[`--${prefix}-gap-${ch}`] = `${gap}px`;
  }
  return out;
}

// Malformed or missing data reads as defaults; never throws.
export function normalizeLayoutData(raw: unknown): LayoutData {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: LayoutData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tierRaw = r[bp] as Record<string, unknown> | undefined;
    if (!tierRaw || typeof tierRaw !== 'object') continue;
    const tier: LayoutValue = {};
    const display = displayOrNull(tierRaw.display);
    if (display) tier.display = display;
    const direction = flexDirectionOrNull(tierRaw.flexDirection);
    if (direction) tier.flexDirection = direction;
    const wrap = flexWrapOrNull(tierRaw.flexWrap);
    if (wrap) tier.flexWrap = wrap;
    const justify = justifyContentOrNull(tierRaw.justifyContent);
    if (justify) tier.justifyContent = justify;
    const alignItems = alignItemsOrNull(tierRaw.alignItems);
    if (alignItems) tier.alignItems = alignItems;
    const alignContent = alignContentOrNull(tierRaw.alignContent);
    if (alignContent) tier.alignContent = alignContent;
    const gap = gapOrNull(tierRaw.gap);
    if (gap != null) tier.gap = gap;
    if (Object.keys(tier).length > 0) out[bp] = tier;
  }
  return out;
}

export function layoutAttr() {
  return {
    default: {} as LayoutData,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-layout');
        return raw ? (JSON.parse(raw) as LayoutData) : {};
      } catch {
        return {};
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const l = attrs.layout as LayoutData | undefined;
      return l && Object.keys(l).length ? { 'data-layout': JSON.stringify(l) } : {};
    },
  };
}

// Every field is independent: setting one clears no sibling.
export function setLayoutField(
  data: LayoutData | null | undefined,
  bp: Tier,
  field: keyof LayoutValue,
  value: string | number | null
): LayoutData {
  const next: LayoutData = { ...data };
  const tier: LayoutValue = { ...(next[bp] ?? {}) };
  if (value == null) {
    delete tier[field];
  } else if (field === 'gap') {
    tier.gap = clampGap(value as number);
  } else if (field === 'display') {
    const v = displayOrNull(value);
    if (v) tier.display = v;
    else delete tier.display;
  } else if (field === 'flexDirection') {
    const v = flexDirectionOrNull(value);
    if (v) tier.flexDirection = v;
    else delete tier.flexDirection;
  } else if (field === 'flexWrap') {
    const v = flexWrapOrNull(value);
    if (v) tier.flexWrap = v;
    else delete tier.flexWrap;
  } else if (field === 'justifyContent') {
    const v = justifyContentOrNull(value);
    if (v) tier.justifyContent = v;
    else delete tier.justifyContent;
  } else if (field === 'alignItems') {
    const v = alignItemsOrNull(value);
    if (v) tier.alignItems = v;
    else delete tier.alignItems;
  } else if (field === 'alignContent') {
    const v = alignContentOrNull(value);
    if (v) tier.alignContent = v;
    else delete tier.alignContent;
  }
  if (Object.keys(tier).length > 0) next[bp] = tier;
  else delete next[bp];
  return next;
}
