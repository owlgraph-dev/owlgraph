// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Typography capability. Each field resolves tier value → the block's
// paragraph style look (paragraphStyles.ts) → CSS inheritance; colour has no style
// default. app.css mirrors the colour into --quick-link-color for the quick link.
import { resolveCapability, type Tier, TIER_CHAR } from '../cascade';
import { colorOrNull } from '../parse';
import { colorCss } from '../../color/colorTokens';
import { isCustomFontRef, resolveFontStack, type FontId } from './fonts';
import { EMPTY_TYPOGRAPHY_REGISTRY, type ElementDefaults, type TypographyRegistry } from './roles';
import { sizeCss, sizeOrNull, type TypeSize } from './typeScale';
import type { OverrideSet } from '../overrides';

export type WeightToken = 'normal' | 'medium' | 'semibold' | 'bold';

export interface TypographyValue {
  family?: FontId | string; // a built-in FontId, or a `custom:<id>` ref — see fonts.ts
  size?: TypeSize; // a type-scale step `scale:<step>`, or a px literal clamped SIZE_MIN..SIZE_MAX — see typeScale.ts
  color?: string; // safeColor-validated
  weight?: WeightToken;
  lineHeight?: number; // unitless CSS line-height multiplier, clamped LINE_HEIGHT_MIN..MAX
  letterSpacing?: number; // em, clamped LETTER_SPACING_MIN..MAX
}
export type TypographyData = Partial<Record<Tier, TypographyValue>>;

export const LINE_HEIGHT_MIN = 1;
export const LINE_HEIGHT_MAX = 3;
export const LETTER_SPACING_MIN = -0.05;
export const LETTER_SPACING_MAX = 0.5;

// Combobox suggestions for free numeric fields, not the stored type.
export const LINE_HEIGHT_STEPS = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2] as const;
export const LETTER_SPACING_STEPS = [-0.02, -0.01, 0, 0.01, 0.02, 0.05, 0.1] as const;

export const WEIGHT_PRESETS: Record<WeightToken, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export function clampLineHeight(v: number): number {
  return Math.max(LINE_HEIGHT_MIN, Math.min(LINE_HEIGHT_MAX, v));
}

export function clampLetterSpacing(v: number): number {
  return Math.max(LETTER_SPACING_MIN, Math.min(LETTER_SPACING_MAX, v));
}

export function lineHeightOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clampLineHeight(v) : null;
}

export function letterSpacingOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clampLetterSpacing(v) : null;
}

export function weightOrNull(v: unknown): WeightToken | null {
  return v === 'normal' || v === 'medium' || v === 'semibold' || v === 'bold' ? v : null;
}

export function familyOrNull(v: unknown): FontId | string | null {
  if (v === 'sans' || v === 'serif' || v === 'mono') return v as FontId;
  return isCustomFontRef(v) ? v : null;
}

// `defaults` is the block's resolved style look; every built-in role has a size.
export function resolvedSize(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults = {}): TypeSize {
  return sizeOrNull(resolveCapability<TypographyValue>(data, bp).size) ?? sizeOrNull(defaults.size) ?? 'scale:m';
}

// Null inherits the ambient value.
export function resolvedFamily(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults = {}): FontId | string | null {
  return familyOrNull(resolveCapability<TypographyValue>(data, bp).family) ?? familyOrNull(defaults.family);
}

export function resolvedColor(data: TypographyData | null | undefined, bp: Tier): string {
  return colorOrNull(resolveCapability<TypographyValue>(data, bp).color) ?? '';
}

export function resolvedWeight(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults = {}): WeightToken | null {
  return weightOrNull(resolveCapability<TypographyValue>(data, bp).weight) ?? weightOrNull(defaults.weight);
}

export function resolvedLineHeight(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults = {}): number | null {
  return lineHeightOrNull(resolveCapability<TypographyValue>(data, bp).lineHeight) ?? lineHeightOrNull(defaults.lineHeight);
}

export function resolvedLetterSpacing(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults = {}): number | null {
  return letterSpacingOrNull(resolveCapability<TypographyValue>(data, bp).letterSpacing) ?? letterSpacingOrNull(defaults.letterSpacing);
}

function ownTypography(tier: TypographyValue | undefined) {
  return {
    family: familyOrNull(tier?.family),
    size: sizeOrNull(tier?.size),
    color: colorOrNull(tier?.color),
    weight: weightOrNull(tier?.weight),
    lineHeight: lineHeightOrNull(tier?.lineHeight),
    letterSpacing: letterSpacingOrNull(tier?.letterSpacing),
  };
}

// What the chain resolves each field to without the tier's own values; at
// desktop, the style look the theme stylesheet sets by rule.
function typographyBaseline(data: TypographyData | null | undefined, bp: Tier, defaults: ElementDefaults) {
  const parent: Tier | null = bp === 'desktop' ? null : bp === 'tablet' ? 'desktop' : 'tablet';
  if (!parent) {
    return {
      family: familyOrNull(defaults.family),
      size: sizeOrNull(defaults.size) ?? 'scale:m',
      color: null as string | null,
      weight: weightOrNull(defaults.weight),
      lineHeight: lineHeightOrNull(defaults.lineHeight),
      letterSpacing: letterSpacingOrNull(defaults.letterSpacing),
    };
  }
  return {
    family: resolvedFamily(data, parent, defaults),
    size: resolvedSize(data, parent, defaults),
    color: colorOrNull(resolvedColor(data, parent)),
    weight: resolvedWeight(data, parent, defaults),
    lineHeight: resolvedLineHeight(data, parent, defaults),
    letterSpacing: resolvedLetterSpacing(data, parent, defaults),
  };
}

// A block set entirely by its paragraph style emits nothing. `defaults` is its
// resolved look (resolveParagraphStyle / bodyDefaults).
export function typographyVars(
  data: TypographyData | null | undefined,
  defaults: ElementDefaults,
  prefix = 'typography',
  registry: TypographyRegistry = EMPTY_TYPOGRAPHY_REGISTRY
): OverrideSet {
  const out: Record<string, string> = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = data?.[bp];
    if (!tier) continue;
    const ch = TIER_CHAR[bp];
    const o = ownTypography(tier);
    const base = typographyBaseline(data, bp, defaults);
    if (o.family != null && o.family !== base.family) {
      // A custom family that is gone falls back to the style's look.
      const stack = resolveFontStack(o.family, registry.customStacks);
      if (stack) out[`--${prefix}-family-${ch}`] = stack;
    }
    if (o.size != null && o.size !== base.size) out[`--${prefix}-size-${ch}`] = sizeCss(o.size);
    if (o.color != null && o.color !== base.color) out[`--${prefix}-color-${ch}`] = colorCss(o.color);
    if (o.weight != null && o.weight !== base.weight) out[`--${prefix}-weight-${ch}`] = String(WEIGHT_PRESETS[o.weight]);
    if (o.lineHeight != null && o.lineHeight !== base.lineHeight) out[`--${prefix}-lineheight-${ch}`] = String(o.lineHeight);
    if (o.letterSpacing != null && o.letterSpacing !== base.letterSpacing) out[`--${prefix}-letterspacing-${ch}`] = `${o.letterSpacing}em`;
  }
  return out;
}

// Malformed or missing data reads as defaults; never throws.
export function normalizeTypographyData(raw: unknown): TypographyData {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: TypographyData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tierRaw = r[bp] as Record<string, unknown> | undefined;
    if (!tierRaw || typeof tierRaw !== 'object') continue;
    const tier: TypographyValue = {};
    const family = familyOrNull(tierRaw.family);
    if (family) tier.family = family;
    const size = sizeOrNull(tierRaw.size);
    if (size != null) tier.size = size;
    const color = colorOrNull(tierRaw.color);
    if (color) tier.color = color;
    const weight = weightOrNull(tierRaw.weight);
    if (weight) tier.weight = weight;
    const lineHeight = lineHeightOrNull(tierRaw.lineHeight);
    if (lineHeight != null) tier.lineHeight = lineHeight;
    const letterSpacing = letterSpacingOrNull(tierRaw.letterSpacing);
    if (letterSpacing != null) tier.letterSpacing = letterSpacing;
    if (Object.keys(tier).length > 0) out[bp] = tier;
  }
  return out;
}

export function typographyAttr() {
  return {
    default: {} as TypographyData,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-typography');
        return raw ? (JSON.parse(raw) as TypographyData) : {};
      } catch {
        return {};
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const t = attrs.typography as TypographyData | undefined;
      return t && Object.keys(t).length ? { 'data-typography': JSON.stringify(t) } : {};
    },
  };
}

// Every field is independent: setting one clears no sibling.
export function setTypographyField(
  data: TypographyData | null | undefined,
  bp: Tier,
  field: keyof TypographyValue,
  value: string | number | null
): TypographyData {
  const next: TypographyData = { ...data };
  const tier: TypographyValue = { ...(next[bp] ?? {}) };
  if (value == null || value === '') {
    delete tier[field];
  } else if (field === 'size') {
    const s = sizeOrNull(value);
    if (s != null) tier.size = s;
    else delete tier.size;
  } else if (field === 'lineHeight') {
    tier.lineHeight = clampLineHeight(value as number);
  } else if (field === 'letterSpacing') {
    tier.letterSpacing = clampLetterSpacing(value as number);
  } else if (field === 'weight') {
    const w = weightOrNull(value);
    if (w) tier.weight = w;
    else delete tier.weight;
  } else if (field === 'family') {
    const f = familyOrNull(value);
    if (f) tier.family = f;
    else delete tier.family;
  } else if (field === 'color') {
    const c = colorOrNull(value);
    if (c) tier.color = c;
    else delete tier.color;
  }
  if (Object.keys(tier).length > 0) next[bp] = tier;
  else delete next[bp];
  return next;
}
