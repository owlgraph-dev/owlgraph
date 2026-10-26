// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A page's columns layout (docs/architecture/blocks/layout.md, "Page layout: sections"): the
// template its sections' cells take their widths from, so an image sits
// beside its own paragraph and a phone reads them in order. A smaller viewport
// never has more columns than a larger one. Choosing one of the page layouts
// (pages/pageLayoutPresets.ts) copies it into the page with its id and label,
// so a preset's later edits never restructure a page behind its author's back.
import { TIERS, TIER_CHAR, type Tier } from '../capabilities/cascade';
import { SPACE, type SpaceToken } from '../blocks/grid/gridStyle';
import { sameRatios } from '../blocks/grid/gridColumns';


/** Column proportions per tier, each a list of whole-number ratios. */
export type ColumnTemplate = Record<Tier, number[]>;
export type ColumnGap = Partial<Record<Tier, SpaceToken>>;
export const GAP_STEPS: readonly SpaceToken[] = ['none', 'sm', 'md', 'lg'];

export const MAX_PAGE_COLUMNS = 4;
export const MAX_COLUMN_RATIO = 12;

/** A section's span on the page — the same choice a grid container has. */
export type SectionWidth = 'normal' | 'wide' | 'full';

/** What a new section starts as: its span (absent = the reading column) and bleed-to-top. */
export interface SectionDefaults {
  width?: 'wide' | 'full';
  bleedToTop?: boolean;
}

/** Standard's id: the protected flow preset. */
export const STANDARD_PRESET_ID = 'standard';
/** A page's own template, from no preset ("Custom"). Never a preset's id. */
export const CUSTOM_PRESET_ID = 'custom';

/** A preset id: lowercase letters, digits and hyphens. */
export const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const MAX_PRESET_LABEL = 64;


/** The part of a page's layout this module owns. */
export interface PageColumns {
  mode: 'columns';
  template: ColumnTemplate;
  gap?: ColumnGap;
  /** Where the values came from: a preset's id, or `custom` — a template of the page's own. */
  preset: string;
  /** The preset's label when it was applied: its provenance where the id is unknown (another site). */
  presetLabel?: string;
  /** What a new section starts as, copied from the preset. */
  sectionDefaults?: SectionDefaults;
}

function ratiosOrNull(v: unknown, max: number): number[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return null;
  const out: number[] = [];
  for (const n of v) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_COLUMN_RATIO) return null;
    out.push(n);
  }
  return out;
}

/**
 * Null unless the desktop tier is valid. A smaller tier that is missing or
 * invalid takes the tier above's; one with more columns is cut.
 */
export function normalizeTemplate(raw: unknown, maxColumns: number = MAX_PAGE_COLUMNS): ColumnTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const desktop = ratiosOrNull(r.desktop, maxColumns);
  if (!desktop) return null;
  const tablet = (ratiosOrNull(r.tablet, maxColumns) ?? desktop).slice(0, desktop.length);
  const phone = (ratiosOrNull(r.phone, maxColumns) ?? tablet).slice(0, tablet.length);
  return { desktop, tablet, phone };
}

export function normalizeGap(raw: unknown): ColumnGap {
  if (!raw || typeof raw !== 'object') return {};
  const out: ColumnGap = {};
  for (const tier of TIERS) {
    const g = (raw as Record<string, unknown>)[tier];
    if (typeof g === 'string' && (GAP_STEPS as readonly string[]).includes(g)) out[tier] = g as SpaceToken;
  }
  return out;
}

/** Null for a flow page, or a template that doesn't hold up: a page falls back to flow, never breaks. */
export function normalizePageColumns(raw: unknown): PageColumns | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.mode !== 'columns') return null;
  const template = normalizeTemplate(r.template);
  if (!template) return null;
  const gap = normalizeGap(r.gap);
  const preset = typeof r.preset === 'string' && PRESET_ID_RE.test(r.preset) && r.preset !== STANDARD_PRESET_ID ? r.preset : CUSTOM_PRESET_ID;
  const label = preset !== CUSTOM_PRESET_ID && typeof r.presetLabel === 'string' ? r.presetLabel.trim().slice(0, MAX_PRESET_LABEL) : '';
  const sectionDefaults = normalizeSectionDefaults(r.sectionDefaults);
  return {
    mode: 'columns',
    template,
    ...(Object.keys(gap).length ? { gap } : {}),
    preset,
    ...(label ? { presetLabel: label } : {}),
    ...(Object.keys(sectionDefaults).length ? { sectionDefaults } : {}),
  };
}

export function normalizeSectionDefaults(raw: unknown): SectionDefaults {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: SectionDefaults = {};
  if (r.width === 'wide' || r.width === 'full') out.width = r.width;
  if (r.bleedToTop === true) out.bleedToTop = true;
  return out;
}

/** How many cells a section on this page has: the desktop tier's column count. */
export function sectionCellCount(columns: PageColumns | null): number {
  return columns ? columns.template.desktop.length : 1;
}

/**
 * Keeps the tiers ordered: a smaller tier's count is capped at the larger's,
 * and lowering desktop cuts the smaller tiers. New columns get ratio 1.
 */
export function setTierColumnCount(template: ColumnTemplate, tier: Tier, count: number, maxColumns: number = MAX_PAGE_COLUMNS): ColumnTemplate {
  const cap = tier === 'desktop' ? maxColumns : template[tier === 'tablet' ? 'desktop' : 'tablet'].length;
  const n = Math.max(1, Math.min(cap, Math.round(count)));
  const resize = (ratios: number[], size: number) => (ratios.length >= size ? ratios.slice(0, size) : [...ratios, ...Array(size - ratios.length).fill(1)]);
  const next = { ...template, [tier]: resize(template[tier], n) };
  return normalizeTemplate(next, maxColumns)!;
}

/** Sets one column's ratio in one tier. */
export function setTierColumnRatio(template: ColumnTemplate, tier: Tier, index: number, ratio: number, maxColumns: number = MAX_PAGE_COLUMNS): ColumnTemplate {
  const ratios = [...template[tier]];
  if (index < 0 || index >= ratios.length) return template;
  ratios[index] = Math.max(1, Math.min(MAX_COLUMN_RATIO, Math.round(ratio)));
  return normalizeTemplate({ ...template, [tier]: ratios }, maxColumns)!;
}

/** The CSS track list for one tier's ratios, e.g. `3fr 2fr`. */
export function templateTracks(ratios: number[]): string {
  return ratios.map((n) => `minmax(0, ${n}fr)`).join(' ');
}

/**
 * The canvas variables a columns page publishes; `--page-columns-flow` makes extra cells
 * wrap rather than add columns. On a flow page a section falls back to an
 * equal-column row (grid.css).
 */
export function pageColumnsVars(columns: PageColumns | null): Record<string, string> {
  if (!columns) return {};
  const out: Record<string, string> = { '--page-columns-flow': 'row' };
  for (const tier of TIERS) out[`--page-columns-cols-${TIER_CHAR[tier]}`] = templateTracks(columns.template[tier]);
  for (const tier of TIERS) {
    const gap = columns.gap?.[tier];
    if (gap) out[`--page-columns-gap-${TIER_CHAR[tier]}`] = SPACE[gap];
  }
  return out;
}

/** What a new section starts as on this page: the span its preset gave it (the page's own copy, never the registry's). */
export function sectionDefaultWidth(columns: PageColumns | null): SectionWidth | null {
  return columns?.sectionDefaults?.width ?? null;
}

/** Whether a new section on this page starts bled to the top — meaningful for the page's first. */
export function sectionDefaultBleed(columns: PageColumns | null): boolean {
  return !!columns?.sectionDefaults?.bleedToTop;
}

/** Like normalizeTemplate but refuses instead of repairing: a preset's template is never silently cut. */
export function strictTemplate(raw: unknown): ColumnTemplate | null {
  const normalized = normalizeTemplate(raw);
  if (!normalized) return null;
  const r = raw as Record<string, unknown>;
  return TIERS.every((tier) => Array.isArray(r[tier]) && sameRatios(r[tier] as number[], normalized[tier])) ? normalized : null;
}
