// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The query block's result formats (docs/architecture/dynamic-rendering.md). A format owns
// the result container the instances sit in: which capabilities it exposes and
// their vars. The template format's is a flex container with the flex
// container's own Layout, Spacing and Surface capabilities; unset, it is a
// plain stacked list. Isomorphic: no DOM or i18n imports.
import { layoutVars, normalizeLayoutData, scrollTiers, type LayoutData, type LayoutDefaults } from '../../capabilities/layout/layout';
import { blockSpaceVars, spaceAboveVars, padVars, normalizeSpacingData, type SpacingData } from '../../capabilities/spacing/spacing';
import { surfaceVars, normalizeSurfaceData, type SurfaceData } from '../../capabilities/surface/surface';
import { BUILTIN_BLOCK_DEFAULTS, defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';

export type QueryFormatId = 'template';
export type QueryFormatCapability = 'layout' | 'spacing' | 'surface';

export interface TemplateFormatOptions {
  layout?: LayoutData;
  spacing?: SpacingData;
  surface?: SurfaceData;
}

// Kind pins, mirroring query.css's rules: a column, flush (its instances are
// padded blocks). The emitters compare against these and the block settings panel shows them.
export const TEMPLATE_RESULT_LAYOUT_DEFAULTS: LayoutDefaults = { flexDirection: 'column' };
export const TEMPLATE_RESULT_PAD_FALLBACK = 0;

/** The result container's defaults: the containers group's, with the kind pins above. */
export function templateResultDefaults(blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS) {
  return { ...defaultsFor('queryBlock', blockDefaults), pad: TEMPLATE_RESULT_PAD_FALLBACK };
}

export interface QueryFormat {
  id: QueryFormatId;
  // What the block settings panel offers.
  capabilities: readonly QueryFormatCapability[];
  containerClass: string;
  // Normalizes the stored options, so both renderers tolerate bad data alike.
  containerOverrides(options: unknown, blockDefaults: ResolvedBlockDefaults): OverrideSet;
  // The tiers the container's row scrolls at (data-scroll).
  containerAttrs(options: unknown): Record<string, string>;
}

function templateContainerAttrs(options: unknown): Record<string, string> {
  const o = (options && typeof options === 'object' ? options : {}) as TemplateFormatOptions;
  const scroll = scrollTiers(normalizeLayoutData(o.layout), TEMPLATE_RESULT_LAYOUT_DEFAULTS);
  return scroll ? { 'data-scroll': scroll } : {};
}

function templateContainerOverrides(options: unknown, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  const o = (options && typeof options === 'object' ? options : {}) as TemplateFormatOptions;
  const defaults = templateResultDefaults(blockDefaults);
  const spacing = normalizeSpacingData(o.spacing);
  return mergeOverrides(
    layoutVars(normalizeLayoutData(o.layout), TEMPLATE_RESULT_LAYOUT_DEFAULTS),
    padVars(spacing, defaults.pad),
    // A block (its own space above) and the flow its instances' content reads.
    spaceAboveVars(spacing),
    blockSpaceVars(spacing, defaults.blockSpace, 'flow-space'),
    surfaceVars(normalizeSurfaceData(o.surface), defaults, 'surface')
  );
}

export const QUERY_FORMATS: Record<QueryFormatId, QueryFormat> = {
  template: {
    id: 'template',
    capabilities: ['layout', 'spacing', 'surface'],
    containerClass: 'query-block grp-containers cap-layout cap-spacing cap-surface',
    containerOverrides: templateContainerOverrides,
    containerAttrs: templateContainerAttrs,
  },
};

// An unknown or absent id is the template format, the attr's default.
export function queryFormat(id: unknown): QueryFormat {
  return (typeof id === 'string' && (QUERY_FORMATS as Record<string, QueryFormat>)[id]) || QUERY_FORMATS.template;
}

// One helper for the editor and the page, so they can't disagree.
export function queryFormatContainer(
  format: unknown,
  options: unknown,
  blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS
): { class: string; overrides: OverrideSet; attrs: Record<string, string> } {
  const f = queryFormat(format);
  return { class: f.containerClass, overrides: f.containerOverrides(options, blockDefaults), attrs: f.containerAttrs(options) };
}

// Replaces one capability bag; empty options collapse to null, never `{}`.
export function setTemplateFormatOption(
  options: unknown,
  key: keyof TemplateFormatOptions,
  data: LayoutData | SpacingData | SurfaceData | null | undefined
): TemplateFormatOptions | null {
  const base = (options && typeof options === 'object' ? options : {}) as TemplateFormatOptions;
  const next: TemplateFormatOptions = { ...base };
  if (data && Object.keys(data).length > 0) next[key] = data as never;
  else delete next[key];
  return Object.keys(next).length > 0 ? next : null;
}
