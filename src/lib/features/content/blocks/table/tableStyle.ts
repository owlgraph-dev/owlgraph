// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The table's style emitters, shared by the editor and the page. Columns
// are sized by <col> percents: the cells are real <td>/<th>, not a CSS grid.
// The table has no padding (the block is the grid) and no border: its grid
// lines are its own background through the border-spacing (table.css).
// --table-header-bg-* inherits on purpose, unlike the --surface-* vars, so the
// header cells can read it.
import { flowRhythmVars, padVars } from '../../capabilities/spacing/spacing';
import { surfaceVars, type SurfaceData } from '../../capabilities/surface/surface';
import { colorCss } from '../../color/colorTokens';
import { BUILTIN_BLOCK_DEFAULTS, defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, NO_OVERRIDES, type OverrideSet } from '../../capabilities/overrides';
import { columnWeights, type TableAttrs, type TableCellAttrs, type TableRowAttrs } from './model';
import { TIER_CHAR } from '../../capabilities/cascade';

export type { TableAttrs, TableCellAttrs, TableRowAttrs };



// Only for a tier with a table background; without one, table.css falls to
// the palette's header shade, so a transparent table's header still reads.
function headerBgVars(surface: SurfaceData | null | undefined): OverrideSet {
  const out: Record<string, string> = {};
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const bg = surface?.[bp]?.bg;
    if (typeof bg === 'string' && bg) out[`--table-header-bg-${TIER_CHAR[bp]}`] = `color-mix(in srgb, ${colorCss(bg)} 100%, var(--content-mix-target) 18%)`;
  }
  return out;
}

// The corner radius the box and its corner cells share resolves in table.css.
export function tableStyle(attrs: TableAttrs | undefined, blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS): OverrideSet {
  const defaults = defaultsFor('table', blockDefaults);
  return mergeOverrides(surfaceVars(attrs?.surface, defaults, 'surface'), headerBgVars(attrs?.surface));
}

/**
 * The table's width in narrowest columns, which table.css turns into a min
 * width: the narrowest column stays readable and a wider table scrolls in its
 * block instead of squeezing. Takes columnWidthPercents, so the two agree.
 */
export function tableSpanVar(percents: readonly number[]): OverrideSet {
  const narrowest = Math.min(...percents.filter((p) => p > 0));
  const span = Number.isFinite(narrowest) ? 100 / narrowest : 1;
  return { '--table-span': String(Math.round(span * 100) / 100) };
}

export function rowStyle(attrs: TableRowAttrs | undefined): OverrideSet {
  const h = Number(attrs?.height);
  return Number.isFinite(h) && h > 0 ? { height: `${Math.min(2000, Math.round(h))}px` } : NO_OVERRIDES;
}

export function cellStyle(attrs: TableCellAttrs | undefined, blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS): OverrideSet {
  const defaults = defaultsFor('tableCell', blockDefaults);
  return mergeOverrides(
    padVars(attrs?.spacing, defaults.pad),
    flowRhythmVars(attrs?.spacing, defaults.blockSpace),
    // Square corners whatever the group default: table.css pins the cell's
    // --default-radius to 0, and the editor offers no radius for a cell.
    surfaceVars(attrs?.surface, { ...defaults, radius: 0 }, 'surface')
  );
}

// Four decimals, not whole percents like previewWeights: whole-percent
// rounding is off by up to half a percent per column, which widens the
// sub-pixel gaps between cells.
export function columnWidthPercents(columnWidths: unknown, cols: number): number[] {
  const w = columnWeights(columnWidths, cols);
  const total = w.reduce((a, b) => a + b, 0) || 1;
  return w.map((n) => Math.round((n / total) * 1000000) / 10000);
}
