// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Surface capability: background, border colour (always 1px solid), radius,
// shadow, and for a few hosts an image layer. Text colour is Typography's. An
// unset field falls to the group default (`--default-*`), then the property's
// initial value.
import { resolveCapability, type Tier, TIER_CHAR } from '../cascade';
import { colorCss, fillTextProperty, type FillKind } from '../../color/colorTokens';
import type { OverrideSet } from '../overrides';
import { colorOrNull, safeColor, shadowOrNull } from '../parse';
import { normalizePosition, type ObjectPosition } from '../../blocks/image/imageBox';
import { isAssetId } from '$lib/features/media';

export type ShadowToken = 'none' | 'sm' | 'md' | 'lg';

export interface SurfaceValue {
  bg?: string; // background colour, safeColor-validated
  border?: string; // border colour, safeColor-validated (presence = 1px solid; absence = none)
  radius?: number; // px
  // A preset: a free shadow string is a larger sanitising surface than a colour regex.
  shadow?: ShadowToken;
  // The image layer (docs/architecture/blocks/capabilities.md, "Background images"), over the colour.
  // Each field cascades on its own, so a tier may change only the focus point.
  image?: string; // asset id (uuid) — the URL is built from it, never stored
  imageFit?: ImageFit;
  imageFocus?: ObjectPosition;
  overlay?: string; // overlay colour, safeColor-validated
  overlayOpacity?: number; // 0–100, percent of the overlay colour
  imageScheme?: ImageScheme; // absent = Auto: decided from the overlay (schemeRegions.ts)
}
export type SurfaceData = Partial<Record<Tier, SurfaceValue>>;
/** The colour layer's fields: what every Surface host carries (the image layer is a few hosts' only). */
export type SurfaceBoxField = 'bg' | 'border' | 'radius' | 'shadow';

export type ImageFit = 'cover' | 'contain' | 'repeat';
export type ImageScheme = 'light' | 'dark';
export const IMAGE_FITS: readonly ImageFit[] = ['cover', 'contain', 'repeat'];
/** What an unset field of the image layer resolves to. */
export const IMAGE_DEFAULTS = { imageFit: 'cover' as ImageFit, imageFocus: 'center' as ObjectPosition, overlayOpacity: 50 };
/** The surface fields that make up the image layer. */
export const IMAGE_FIELDS = ['image', 'imageFit', 'imageFocus', 'overlay', 'overlayOpacity', 'imageScheme'] as const;
export type ImageField = (typeof IMAGE_FIELDS)[number];

export const RADIUS_MIN = 0;
export const RADIUS_MAX = 60;
// UI quick picks, not the stored type.
export const RADIUS_PRESETS = { none: 0, sm: 4, md: 8, lg: 12 } as const;

// A stored shadow is a preset name; its value is the content palette's shadow
// token, so the shadow follows the colour scheme it renders in.
export const SHADOW_PRESETS: Record<ShadowToken, string> = {
  none: 'none',
  sm: 'var(--content-shadow-sm)',
  md: 'var(--content-shadow-md)',
  lg: 'var(--content-shadow-lg)',
};

function clampRadius(v: number): number {
  return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, Math.round(v)));
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? clampRadius(v) : null;
}

export function imageFitOrNull(v: unknown): ImageFit | null {
  return v === 'cover' || v === 'contain' || v === 'repeat' ? v : null;
}

export function imageSchemeOrNull(v: unknown): ImageScheme | null {
  return v === 'light' || v === 'dark' ? v : null;
}

export function opacityOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
}

/** A tier's image-layer fields, validated; absent fields omitted. */
export function ownImageFields(tier: Record<string, unknown> | undefined): Pick<SurfaceValue, ImageField> {
  const out: Pick<SurfaceValue, ImageField> = {};
  if (!tier) return out;
  if (isAssetId(tier.image)) out.image = tier.image;
  const fit = imageFitOrNull(tier.imageFit);
  if (fit) out.imageFit = fit;
  const focus = normalizePosition(tier.imageFocus);
  if (focus) out.imageFocus = focus;
  const overlay = colorOrNull(tier.overlay);
  if (overlay) out.overlay = overlay;
  const opacity = opacityOrNull(tier.overlayOpacity);
  if (opacity != null) out.overlayOpacity = opacity;
  const scheme = imageSchemeOrNull(tier.imageScheme);
  if (scheme) out.imageScheme = scheme;
  return out;
}

/** A block's surface defaults (capabilities/defaults): the group's, in stored units; null = none. */
export interface SurfaceDefaults {
  bg: string | null;
  border: string | null;
  radius: number | null;
  shadow: ShadowToken | null;
}

export const NO_SURFACE_DEFAULTS: SurfaceDefaults = { bg: null, border: null, radius: null, shadow: null };

// An unset bg/border is '' and an unset shadow 'none': the property's initial value.
export function resolvedRadius(data: SurfaceData | null | undefined, bp: Tier, fallback: number | null = null): number {
  const v = numOrNull(resolveCapability<SurfaceValue>(data, bp).radius);
  return v ?? clampRadius(fallback ?? 0);
}

export function resolvedBg(data: SurfaceData | null | undefined, bp: Tier, fallback: string | null = null): string {
  return colorOrNull(resolveCapability<SurfaceValue>(data, bp).bg) ?? fallback ?? '';
}

export function resolvedBorder(data: SurfaceData | null | undefined, bp: Tier, fallback: string | null = null): string {
  return colorOrNull(resolveCapability<SurfaceValue>(data, bp).border) ?? fallback ?? '';
}

export function resolvedShadow(data: SurfaceData | null | undefined, bp: Tier, fallback: ShadowToken | null = null): ShadowToken {
  return shadowOrNull(resolveCapability<SurfaceValue>(data, bp).shadow) ?? fallback ?? 'none';
}

function own(tier: SurfaceValue | undefined) {
  return {
    bg: colorOrNull(tier?.bg),
    border: colorOrNull(tier?.border),
    radius: numOrNull(tier?.radius),
    shadow: shadowOrNull(tier?.shadow),
  };
}

// What the chain resolves each field to without the tier's own values.
function baseline(data: SurfaceData | null | undefined, bp: Tier, defaults: SurfaceDefaults) {
  const parent: Tier | null = bp === 'desktop' ? null : bp === 'tablet' ? 'desktop' : 'tablet';
  if (!parent) return { bg: defaults.bg ?? '', border: defaults.border ?? '', radius: defaults.radius ?? 0, shadow: defaults.shadow ?? 'none' };
  return {
    bg: resolvedBg(data, parent, defaults.bg),
    border: resolvedBorder(data, parent, defaults.border),
    radius: resolvedRadius(data, parent, defaults.radius),
    shadow: resolvedShadow(data, parent, defaults.shadow),
  };
}

// A background also sets the text on it (`-fg-`): a theme colour's readable
// partner, or on a literal the scheme its region pins (docs/architecture/theming.md,
// "Scheme regions"). `fill` says which text a card takes.
export function surfaceVars(
  data: SurfaceData | null | undefined,
  defaults: SurfaceDefaults = NO_SURFACE_DEFAULTS,
  prefix = 'surface',
  fill: FillKind = 'block'
): OverrideSet {
  const out: Record<string, string> = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = data?.[bp];
    if (!tier) continue;
    const ch = TIER_CHAR[bp];
    const o = own(tier);
    const base = baseline(data, bp, defaults);
    if (o.bg != null && o.bg !== base.bg) {
      out[`--${prefix}-bg-${ch}`] = colorCss(o.bg);
      out[`--${prefix}-fg-${ch}`] = `var(${fillTextProperty(o.bg, fill)})`;
    }
    if (o.border != null && o.border !== base.border) out[`--${prefix}-border-${ch}`] = `1px solid ${colorCss(o.border)}`;
    if (o.shadow != null && o.shadow !== base.shadow) out[`--${prefix}-shadow-${ch}`] = SHADOW_PRESETS[o.shadow];
    if (o.radius != null && o.radius !== base.radius) out[`--${prefix}-radius-${ch}`] = `${o.radius}px`;
  }
  return out;
}

/** The surface data with every value the chain would resolve to anyway removed — the predicate surfaceVars emits by. */
export function pruneSurface(data: SurfaceData | null | undefined, defaults: SurfaceDefaults, opts: { image?: boolean } = {}): SurfaceData {
  const src = normalizeSurfaceData(data);
  const out: SurfaceData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier = src[bp];
    if (!tier) continue;
    const o = own(tier);
    const base = baseline(src, bp, defaults);
    const next: SurfaceValue = {};
    if (o.bg != null && o.bg !== base.bg) next.bg = o.bg;
    if (o.border != null && o.border !== base.border) next.border = o.border;
    if (o.radius != null && o.radius !== base.radius) next.radius = o.radius;
    if (o.shadow != null && o.shadow !== base.shadow) next.shadow = o.shadow;
    if (opts.image) Object.assign(next, pruneImageTier(src, bp));
    if (Object.keys(next).length > 0) out[bp] = next;
  }
  return out;
}

function pruneImageTier(data: SurfaceData, bp: Tier): Pick<SurfaceValue, ImageField> {
  const own = ownImageFields(data[bp] as Record<string, unknown> | undefined);
  const parent: Tier | null = bp === 'desktop' ? null : bp === 'tablet' ? 'desktop' : 'tablet';
  const above: Record<string, unknown> = parent ? { ...IMAGE_DEFAULTS, ...resolveCapability<SurfaceValue>(data, parent) } : { ...IMAGE_DEFAULTS };
  const out: Pick<SurfaceValue, ImageField> = {};
  for (const field of IMAGE_FIELDS) {
    const v = own[field];
    if (v != null && v !== above[field]) (out as Record<string, unknown>)[field] = v;
  }
  return out;
}

// Malformed or missing data reads as defaults; never throws.
export function normalizeSurfaceData(raw: unknown): SurfaceData {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: SurfaceData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tierRaw = r[bp] as Record<string, unknown> | undefined;
    if (!tierRaw || typeof tierRaw !== 'object') continue;
    const tier: SurfaceValue = {};
    const bg = colorOrNull(tierRaw.bg);
    if (bg) tier.bg = bg;
    const border = colorOrNull(tierRaw.border);
    if (border) tier.border = border;
    const radius = numOrNull(tierRaw.radius);
    if (radius != null) tier.radius = radius;
    const shadow = shadowOrNull(tierRaw.shadow);
    if (shadow) tier.shadow = shadow;
    Object.assign(tier, ownImageFields(tierRaw));
    if (Object.keys(tier).length > 0) out[bp] = tier;
  }
  return out;
}

// One JSON data attribute: a capability's data is one key, not one attribute per field.
export function surfaceAttr() {
  return {
    default: {} as SurfaceData,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-surface');
        return raw ? (JSON.parse(raw) as SurfaceData) : {};
      } catch {
        return {};
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const s = attrs.surface as SurfaceData | undefined;
      return s && Object.keys(s).length ? { 'data-surface': JSON.stringify(s) } : {};
    },
  };
}

/** The surface with the whole image layer removed, at every tier — back to colour only (one edit). */
export function clearSurfaceImage(data: SurfaceData | null | undefined): SurfaceData {
  const next: SurfaceData = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const tier: SurfaceValue = { ...(data?.[bp] ?? {}) };
    for (const field of IMAGE_FIELDS) delete tier[field];
    if (Object.keys(tier).length > 0) next[bp] = tier;
  }
  return next;
}

/** Whether the surface has an image at any tier — the block settings panel's image mode. */
export function hasSurfaceImage(data: SurfaceData | null | undefined): boolean {
  return (['desktop', 'tablet', 'phone'] as const).some((bp) => isAssetId(data?.[bp]?.image));
}

// Every field is independent: setting one clears no sibling.
export function setSurfaceField(
  data: SurfaceData | null | undefined,
  bp: Tier,
  field: keyof SurfaceValue,
  value: string | number | null
): SurfaceData {
  const next: SurfaceData = { ...data };
  const tier: SurfaceValue = { ...(next[bp] ?? {}) };
  if (value == null || value === '') {
    delete tier[field];
  } else if (field === 'radius') {
    tier.radius = clampRadius(value as number);
  } else if (field === 'shadow') {
    const s = shadowOrNull(value);
    if (s) tier.shadow = s;
    else delete tier.shadow;
  } else if (field === 'bg' || field === 'border' || field === 'overlay') {
    const safe = safeColor(value);
    if (safe) tier[field] = safe;
    else delete tier[field];
  } else if ((IMAGE_FIELDS as readonly string[]).includes(field)) {
    const v = ownImageFields({ [field]: value })[field as ImageField];
    if (v != null) (tier as Record<string, unknown>)[field] = v;
    else delete tier[field];
  }
  if (Object.keys(tier).length > 0) next[bp] = tier;
  else delete next[bp];
  return next;
}
