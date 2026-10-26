// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Capability defaults (docs/architecture/blocks/capabilities.md, "Capability defaults"): the site-wide
// value a field resolves to when a block sets none, per block-type group and
// token-only. Stored sparse on the site theme; resolution fills every field.
import { BLOCK_GROUPS, blockGroupOf, type BlockGroup } from '../../blocks/catalog';
import { isColorReference } from '../../color/colorTokens';
import type { ShadowToken } from '../surface/surface';
import { shadowOrNull } from '../parse';
import { BUILTIN_GUTTERS, BUILTIN_WIDTHS, stepPx, stepTokenOrNull, WIDTH_TOKENS, widthPxOrNull, type StepToken, type WidthToken } from './tokens';
import { TIERS, type Tier } from '../cascade';

export type { BlockGroup } from '../../blocks/catalog';

/** One group's explicit defaults, as stored: every field optional, colours references only. */
export interface GroupDefaults {
  pad?: StepToken;
  radius?: StepToken;
  shadow?: ShadowToken;
  /** A theme-colour reference (`token:…`), never a literal — so it adapts per scheme. */
  border?: string;
  bg?: string;
  /** The rhythm the group's flows give their contents; unset = inherit the ancestor flow's. */
  blockSpace?: StepToken;
}

export interface StoredBlockDefaults {
  /** The page's rhythm is where the cascade bottoms out; widths in px, gutters as steps. */
  page?: { blockSpace?: StepToken; widths?: Partial<Record<WidthToken, number>>; gutters?: Partial<Record<Tier, StepToken>> };
  groups?: Partial<Record<BlockGroup, GroupDefaults>>;
}

export interface ResolvedGroupDefaults {
  pad: StepToken | null;
  radius: StepToken | null;
  shadow: ShadowToken | null;
  border: string | null;
  bg: string | null;
  blockSpace: StepToken | null;
}

export interface ResolvedBlockDefaults {
  page: { blockSpace: StepToken; widths: Record<WidthToken, number>; gutters: Record<Tier, StepToken> };
  groups: Record<BlockGroup, ResolvedGroupDefaults>;
}

const NONE: ResolvedGroupDefaults = { pad: null, radius: null, shadow: null, border: null, bg: null, blockSpace: null };

/**
 * Which defaults a group's blocks can take: what the capability defaults
 * matrix offers. A card pads itself; text and media carry neither capability.
 */
export const GROUP_DEFAULT_FIELDS: Record<BlockGroup, readonly (keyof GroupDefaults)[]> = {
  text: [],
  containers: ['pad', 'radius', 'shadow', 'border', 'bg', 'blockSpace'],
  media: [],
  cards: ['radius', 'shadow', 'border', 'bg'],
};

/** The groups with something to set, in matrix order. */
export const DEFAULTS_UI_GROUPS: readonly BlockGroup[] = BLOCK_GROUPS.filter((g) => GROUP_DEFAULT_FIELDS[g].length > 0);

/** What Auto resolves to when the admin has set nothing. */
export const BUILTIN_BLOCK_DEFAULTS: ResolvedBlockDefaults = {
  page: { blockSpace: 'md', widths: { ...BUILTIN_WIDTHS }, gutters: { ...BUILTIN_GUTTERS } },
  groups: {
    text: { ...NONE },
    containers: { ...NONE, pad: 'sm', radius: 'sm' },
    media: { ...NONE },
    cards: { ...NONE, radius: 'md' },
  },
};

function colorRefOrNull(v: unknown): string | null {
  return typeof v === 'string' && isColorReference(v.trim()) ? v.trim() : null;
}

function isGroup(v: unknown): v is BlockGroup {
  return typeof v === 'string' && (BLOCK_GROUPS as readonly string[]).includes(v);
}

/** Sanitizes stored (possibly malformed) defaults into the sparse shape; never throws. */
export function normalizeBlockDefaults(raw: unknown): StoredBlockDefaults {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: StoredBlockDefaults = {};
  const page = r.page as Record<string, unknown> | undefined;
  const pageRhythm = stepTokenOrNull(page?.blockSpace);
  if (pageRhythm) out.page = { blockSpace: pageRhythm };
  const rawWidths = page?.widths as Record<string, unknown> | undefined;
  if (rawWidths && typeof rawWidths === 'object') {
    const widths: Partial<Record<WidthToken, number>> = {};
    for (const w of WIDTH_TOKENS) {
      const px = widthPxOrNull(w, rawWidths[w]);
      if (px != null) widths[w] = px;
    }
    if (Object.keys(widths).length > 0) out.page = { ...out.page, widths };
  }
  const rawGutters = page?.gutters as Record<string, unknown> | undefined;
  if (rawGutters && typeof rawGutters === 'object') {
    const gutters: Partial<Record<Tier, StepToken>> = {};
    for (const tier of TIERS) {
      const step = stepTokenOrNull(rawGutters[tier]);
      if (step) gutters[tier] = step;
    }
    if (Object.keys(gutters).length > 0) out.page = { ...out.page, gutters };
  }
  const groups = r.groups as Record<string, unknown> | undefined;
  if (groups && typeof groups === 'object') {
    for (const [name, value] of Object.entries(groups)) {
      if (!isGroup(name) || !value || typeof value !== 'object') continue;
      const g = value as Record<string, unknown>;
      const next: GroupDefaults = {};
      const pad = stepTokenOrNull(g.pad);
      if (pad) next.pad = pad;
      const radius = stepTokenOrNull(g.radius);
      if (radius) next.radius = radius;
      const shadow = shadowOrNull(g.shadow);
      if (shadow) next.shadow = shadow;
      const border = colorRefOrNull(g.border);
      if (border) next.border = border;
      const bg = colorRefOrNull(g.bg);
      if (bg) next.bg = bg;
      const blockSpace = stepTokenOrNull(g.blockSpace);
      if (blockSpace) next.blockSpace = blockSpace;
      if (Object.keys(next).length > 0) (out.groups ??= {})[name] = next;
    }
  }
  return out;
}

/** The complete defaults: the admin's picks over the built-ins, every group and field present. */
export function resolveBlockDefaults(stored: StoredBlockDefaults | null | undefined): ResolvedBlockDefaults {
  const s = normalizeBlockDefaults(stored);
  const groups = {} as Record<BlockGroup, ResolvedGroupDefaults>;
  for (const group of BLOCK_GROUPS) {
    const own = s.groups?.[group] ?? {};
    const builtin = BUILTIN_BLOCK_DEFAULTS.groups[group];
    groups[group] = {
      pad: own.pad ?? builtin.pad,
      radius: own.radius ?? builtin.radius,
      shadow: own.shadow ?? builtin.shadow,
      border: own.border ?? builtin.border,
      bg: own.bg ?? builtin.bg,
      blockSpace: own.blockSpace ?? builtin.blockSpace,
    };
  }
  const widths = { ...BUILTIN_BLOCK_DEFAULTS.page.widths, ...s.page?.widths };
  const gutters = { ...BUILTIN_BLOCK_DEFAULTS.page.gutters, ...s.page?.gutters };
  return { page: { blockSpace: s.page?.blockSpace ?? BUILTIN_BLOCK_DEFAULTS.page.blockSpace, widths, gutters }, groups };
}

/**
 * A group's defaults in the units the capabilities store: what emitters compare
 * against and the block settings panel shows as "Auto · <value>". `null` is the CSS
 * property's initial value (for the rhythm, the ancestor flow's).
 */
export interface DefaultValues {
  pad: number | null;
  radius: number | null;
  shadow: ShadowToken | null;
  border: string | null;
  bg: string | null;
  blockSpace: number | null;
}

export const NO_DEFAULTS: DefaultValues = { pad: null, radius: null, shadow: null, border: null, bg: null, blockSpace: null };

export function defaultValuesOf(group: ResolvedGroupDefaults): DefaultValues {
  return {
    pad: group.pad == null ? null : stepPx('pad', group.pad),
    radius: group.radius == null ? null : stepPx('radius', group.radius),
    shadow: group.shadow === 'none' ? null : group.shadow,
    border: group.border,
    bg: group.bg,
    blockSpace: group.blockSpace == null ? null : stepPx('rhythm', group.blockSpace),
  };
}

/** The defaults a node type's capabilities resolve against; NO_DEFAULTS for something that is not a block kind. */
export function defaultsFor(type: string, resolved: ResolvedBlockDefaults): DefaultValues {
  const group = blockGroupOf(type);
  return group ? defaultValuesOf(resolved.groups[group]) : NO_DEFAULTS;
}

/** The site's gutter at one tier, px — what a page tier with no gutter of its own renders. */
export function pageGutterPx(resolved: ResolvedBlockDefaults, tier: Tier): number {
  return stepPx('gutter', resolved.page.gutters[tier]);
}

/** The page's rhythm in px — what a page with no rhythm of its own renders. */
export function pageRhythmPx(resolved: ResolvedBlockDefaults): number {
  return stepPx('rhythm', resolved.page.blockSpace);
}
