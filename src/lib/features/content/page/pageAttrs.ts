// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page's own settings (docs/architecture/blocks/layout.md, "Page settings"), on the doc root's
// attrs so versions, restores and backups carry them: spacing (block spacing),
// layout (mode, column template, widths, gutters) and surface (a page ground).
// Widths and the ground live on the desktop tier and apply at every width.
// Gutter tiers stand alone, so a phone never inherits a desktop inset.
import { TIERS, type Tier } from '../capabilities/cascade';
import { normalizeSpacingData, type SpacingData } from '../capabilities/spacing/spacing';
import { surfaceAttr } from '../capabilities/surface/surface';
import { BUILTIN_WIDTHS } from '../capabilities/defaults/tokens';
import { colorToken, colorTokenName, colorTokenProperty, type ContentColorToken } from '../color/colorTokens';
import { normalizePageColumns, type ColumnGap, type ColumnTemplate, type PageColumns } from './pageColumns';

export type PageWidthKey = 'read' | 'wide';
export const PAGE_WIDTH_KEYS: readonly PageWidthKey[] = ['read', 'wide'];

/** px or rem only: a percentage would scale with the canvas instead of capping it. */
export type LengthUnit = 'px' | 'rem';
export const LENGTH_UNITS: readonly LengthUnit[] = ['px', 'rem'];

/** The range a page's own width may take, per unit. The canvas's outer cap still applies whatever the page asks for. */
export const PAGE_WIDTH_BOUNDS: Readonly<Record<PageWidthKey, Record<LengthUnit, { min: number; max: number }>>> = {
  read: { px: { min: 320, max: 2400 }, rem: { min: 20, max: 150 } },
  wide: { px: { min: 320, max: 3200 }, rem: { min: 20, max: 200 } },
};

/** The range a page's own gutter may take, per unit. */
export const PAGE_GUTTER_BOUNDS: Readonly<Record<LengthUnit, { min: number; max: number }>> = {
  px: { min: 0, max: 160 },
  rem: { min: 0, max: 10 },
};

export type PageLayoutMode = 'flow' | 'columns';

export interface PageWidths {
  read?: string;
  wide?: string;
}

export interface PageLayout {
  /** Absent for flow (the default); `columns` with its template (pageColumns.ts). */
  mode?: PageLayoutMode;
  template?: ColumnTemplate;
  gap?: ColumnGap;
  preset?: PageColumns['preset'];
  presetLabel?: PageColumns['presetLabel'];
  sectionDefaults?: PageColumns['sectionDefaults'];
  widths?: Partial<Record<Tier, PageWidths>>;
  /** The side inset per tier, a length each; an unset tier is the site's. */
  gutters?: Partial<Record<Tier, string>>;
}

export type PageSurface = Partial<Record<Tier, { bg?: string }>>;

/**
 * The theme colours the content's text, muted text and links are checked
 * against, so a page on one reads without any other colour changing.
 */
export const PAGE_GROUND_TOKENS = [
  'background',
  'subtle',
  'accent-soft',
  'info-soft',
  'success-soft',
  'warning-soft',
  'danger-soft',
] as const satisfies readonly ContentColorToken[];
export type PageGroundToken = (typeof PAGE_GROUND_TOKENS)[number];

export interface PageAttrs {
  spacing: SpacingData;
  layout: PageLayout;
  surface: PageSurface;
}

/** The doc-root attrs that are page settings — what a write carries over (pageAttrsForWrite). */
export const PAGE_ATTR_KEYS = ['spacing', 'layout', 'surface'] as const;
export type PageAttrKey = (typeof PAGE_ATTR_KEYS)[number];

const LENGTH = /^(\d{1,4}(?:\.\d{1,2})?)(px|rem)$/;
const LEGACY_PERCENT = /^(\d{1,4}(?:\.\d{1,2})?)%$/;

/** A stored length's number and unit, or null for anything that is not one. */
export function parseLength(v: unknown): { value: number; unit: LengthUnit } | null {
  if (typeof v !== 'string') return null;
  const m = LENGTH.exec(v.trim());
  if (!m) return null;
  return { value: Number(m[1]), unit: m[2] as LengthUnit };
}

export function formatLength(value: number, unit: LengthUnit): string {
  return `${Number(value.toFixed(2))}${unit}`;
}

/** A length in another unit (16px to the rem), clamped into the bounds given for that unit. */
export function convertLength(from: { value: number; unit: LengthUnit }, unit: LengthUnit, bounds: Record<LengthUnit, { min: number; max: number }>): string {
  const px = from.unit === 'px' ? from.value : from.value * 16;
  const value = from.unit === unit ? from.value : unit === 'px' ? Math.round(px) : Math.round((px / 16) * 100) / 100;
  const { min, max } = bounds[unit];
  return formatLength(Math.min(max, Math.max(min, value)), unit);
}

/** A page width moved to another unit, clamped into that unit's bounds. */
export function convertPageWidth(key: PageWidthKey, from: { value: number; unit: LengthUnit }, unit: LengthUnit): string {
  return convertLength(from, unit, PAGE_WIDTH_BOUNDS[key]);
}

/**
 * A length within bounds, canonically spelled, else null. A stored percentage
 * is converted to px against the built-in canvas cap, keeping about its width.
 */
export function safePageWidth(key: PageWidthKey, v: unknown): string | null {
  const legacy = typeof v === 'string' ? LEGACY_PERCENT.exec(v.trim()) : null;
  if (legacy) {
    const { min, max } = PAGE_WIDTH_BOUNDS[key].px;
    return formatLength(Math.min(max, Math.max(min, Math.round((Number(legacy[1]) / 100) * BUILTIN_WIDTHS.max))), 'px');
  }
  const length = parseLength(v);
  if (!length) return null;
  const { min, max } = PAGE_WIDTH_BOUNDS[key][length.unit];
  if (length.value < min || length.value > max) return null;
  return formatLength(length.value, length.unit);
}

/** A page gutter if it is a length within its bounds, canonically spelled; else null. */
export function safePageGutter(v: unknown): string | null {
  const length = parseLength(v);
  if (!length) return null;
  const { min, max } = PAGE_GUTTER_BOUNDS[length.unit];
  if (length.value < min || length.value > max) return null;
  return formatLength(length.value, length.unit);
}

/** A page ground if it is a reference to one of the page-strength theme colours; else null. */
export function safePageGround(v: unknown): string | null {
  const name = colorTokenName(v);
  return name && (PAGE_GROUND_TOKENS as readonly string[]).includes(name) ? colorToken(name) : null;
}

export function normalizePageLayout(raw: unknown): PageLayout {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  // A columns template that doesn't hold up leaves the page a flow.
  const columns = normalizePageColumns(r);
  const out: PageLayout = columns ? { ...columns } : {};
  const desktop = (r.widths as Record<string, unknown> | undefined)?.desktop as Record<string, unknown> | undefined;
  if (desktop && typeof desktop === 'object') {
    const widths: PageWidths = {};
    for (const key of PAGE_WIDTH_KEYS) {
      const w = safePageWidth(key, desktop[key]);
      if (w) widths[key] = w;
    }
    if (Object.keys(widths).length > 0) out.widths = { desktop: widths };
  }
  const rawGutters = r.gutters as Record<string, unknown> | undefined;
  if (rawGutters && typeof rawGutters === 'object') {
    const gutters: Partial<Record<Tier, string>> = {};
    for (const bp of TIERS) {
      const g = safePageGutter(rawGutters[bp]);
      if (g) gutters[bp] = g;
    }
    if (Object.keys(gutters).length > 0) out.gutters = gutters;
  }
  return out;
}

export function normalizePageSurface(raw: unknown): PageSurface {
  if (!raw || typeof raw !== 'object') return {};
  const bg = safePageGround(((raw as Record<string, unknown>).desktop as Record<string, unknown> | undefined)?.bg);
  return bg ? { desktop: { bg } } : {};
}

type DocLike = { attrs?: Record<string, unknown> | null } | null | undefined;

/** The page's settings off a document, tolerant of any doc shape (an older doc has no attrs at all). */
export function pageAttrsOf(doc: DocLike): PageAttrs {
  const attrs = doc?.attrs ?? {};
  return {
    spacing: normalizeSpacingData(attrs.spacing),
    layout: normalizePageLayout(attrs.layout),
    surface: normalizePageSurface(attrs.surface),
  };
}

/** The page's own width for one key, or null for Auto (the site's width token). */
export function pageWidth(layout: PageLayout | null | undefined, key: PageWidthKey): string | null {
  return safePageWidth(key, layout?.widths?.desktop?.[key]);
}

/** Sets (or, with null, clears) one of the page's widths; the rest of the layout stays. */
export function setPageWidth(layout: PageLayout | null | undefined, key: PageWidthKey, value: string | null): PageLayout {
  const current = normalizePageLayout(layout);
  const widths: PageWidths = { ...current.widths?.desktop };
  const safe = value == null ? null : safePageWidth(key, value);
  if (safe) widths[key] = safe;
  else delete widths[key];
  return normalizePageLayout({ ...current, widths: { desktop: widths } });
}

/** The page's columns layout, or null for a flow page. */
export function pageColumnsOf(layout: PageLayout | null | undefined): PageColumns | null {
  return normalizePageColumns(layout);
}

/** Sets (or, with null, clears back to flow) the page's columns layout; widths and gutters stay. */
export function setPageColumns(layout: PageLayout | null | undefined, columns: PageColumns | null): PageLayout {
  const current = normalizePageLayout(layout);
  const rest: PageLayout = {
    ...(current.widths ? { widths: current.widths } : {}),
    ...(current.gutters ? { gutters: current.gutters } : {}),
  };
  return normalizePageLayout(columns ? { ...rest, ...columns } : rest);
}

/** The page's own gutter at one tier, or null for Auto (the site's gutter at that tier). */
export function pageGutter(layout: PageLayout | null | undefined, bp: Tier): string | null {
  return safePageGutter(layout?.gutters?.[bp]);
}

/** Sets (or, with null, clears) the page's gutter at one tier; the rest of the layout stays. */
export function setPageGutter(layout: PageLayout | null | undefined, bp: Tier, value: string | null): PageLayout {
  const current = normalizePageLayout(layout);
  const gutters = { ...current.gutters };
  const safe = value == null ? null : safePageGutter(value);
  if (safe) gutters[bp] = safe;
  else delete gutters[bp];
  return normalizePageLayout({ ...current, gutters });
}

/** The page's ground reference (`token:subtle`), or null for Auto (the content palette's ground). */
export function pageGround(surface: PageSurface | null | undefined): string | null {
  return safePageGround(surface?.desktop?.bg);
}

/** The page's ground's palette token name, for the colour reasoning that resolves it per scheme. */
export function pageGroundToken(surface: PageSurface | null | undefined): PageGroundToken | null {
  return colorTokenName(pageGround(surface)) as PageGroundToken | null;
}

export function setPageGround(value: string | null): PageSurface {
  const bg = safePageGround(value);
  return bg ? { desktop: { bg } } : {};
}

/** The CSS value of the page's ground, or null for Auto. */
export function pageGroundCss(surface: PageSurface | null | undefined): string | null {
  const token = pageGroundToken(surface);
  return token ? `var(${colorTokenProperty(token)})` : null;
}

const NORMALIZE: Record<PageAttrKey, (raw: unknown) => object> = {
  spacing: normalizeSpacingData,
  layout: normalizePageLayout,
  surface: normalizePageSurface,
};

/**
 * Per key: the incoming value if the doc mentions it, else the stored one. The
 * editor always sends every key (`{}` is "cleared"); a doc built from a block
 * list has no root attrs, so a content rewrite never resets a page setting.
 */
export function pageAttrsForWrite(incoming: DocLike, stored: Record<string, unknown> | null | undefined): Partial<Record<PageAttrKey, object>> {
  const attrs = incoming?.attrs ?? {};
  const out: Partial<Record<PageAttrKey, object>> = {};
  for (const key of PAGE_ATTR_KEYS) {
    const value = NORMALIZE[key](key in attrs ? attrs[key] : stored?.[key]);
    if (Object.keys(value).length > 0) out[key] = value;
  }
  return out;
}

/** Whether a doc mentions every page setting — then a write needs nothing from the stored doc. */
export function mentionsAllPageAttrs(doc: DocLike): boolean {
  const attrs = doc?.attrs;
  return !!attrs && PAGE_ATTR_KEYS.every((key) => key in attrs);
}

export function pageLayoutAttr() {
  return {
    default: {} as PageLayout,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-page-layout');
        return raw ? normalizePageLayout(JSON.parse(raw)) : {};
      } catch {
        return {};
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const l = attrs.layout as PageLayout | undefined;
      return l && Object.keys(l).length ? { 'data-page-layout': JSON.stringify(l) } : {};
    },
  };
}

export const pageSurfaceAttr = surfaceAttr;
