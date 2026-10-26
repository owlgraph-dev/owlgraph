// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The grid's and its cells' styles, shared by the editor and the public
// renderer. Values come from fixed tokens and validated colours, so the output
// is safe in an inline style.
import { blockSpaceVars, flowRhythmVars, padVars, type SpacingData } from '../../capabilities/spacing/spacing';
import { surfaceVars, type SurfaceData } from '../../capabilities/surface/surface';
import { surfaceImageVars } from '../../capabilities/surface/surfaceImage';
import { heightVars, type HeightData } from '../../capabilities/height/height';
import { typographyVars, type TypographyData } from '../../capabilities/typography/typography';
import { EMPTY_TYPOGRAPHY_REGISTRY, type TypographyRegistry } from '../../capabilities/typography/roles';
import { bodyDefaults } from '../../capabilities/typography/paragraphStyles';
import { BUILTIN_BLOCK_DEFAULTS, defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import type { PlacementData } from '../../capabilities/placement/placement';
import { desktopColumns, resolvedGridColumns, resolvedGridGap } from './gridColumns';
import type { GridCellAttrs, GridAttrs } from './model';

export const SPACE = { none: '0', sm: '0.5rem', md: '1rem', lg: '1.5rem' } as const;
export type SpaceToken = keyof typeof SPACE;

const ALIGN_X = { start: 'left', center: 'center', end: 'right' } as const; // text-align
const ALIGN_FLEX = { start: 'flex-start', center: 'center', end: 'flex-end' } as const; // justify/align-items
export type AlignToken = 'start' | 'center' | 'end';

const tracks = (ratios: number[]) => ratios.map((n) => `${n}fr`).join(' ');

function gridTemplate(attrs: GridAttrs | undefined): string {
  return tracks(desktopColumns(attrs));
}

/**
 * The desktop's columns and gap always; a tablet's or a phone's only where
 * they differ from grid.css's fallback there (gridColumns.ts).
 */
function gridTierVars(attrs: GridAttrs | undefined): Record<string, string> {
  const out: Record<string, string> = { '--gap-d': SPACE[resolvedGridGap(attrs, 'desktop')] };
  const desktop = desktopColumns(attrs);
  const tablet = resolvedGridColumns(attrs, 'tablet');
  const phone = resolvedGridColumns(attrs, 'phone');
  if (tracks(tablet) !== tracks(desktop)) out['--cols-t'] = tracks(tablet);
  if (phone.length > 1 || phone[0] !== 1) out['--cols-p'] = tracks(phone);
  const gapT = resolvedGridGap(attrs, 'tablet');
  const gapP = resolvedGridGap(attrs, 'phone');
  if (gapT !== resolvedGridGap(attrs, 'desktop')) out['--gap-t'] = SPACE[gapT];
  if (gapP !== gapT) out['--gap-p'] = SPACE[gapP];
  return out;
}

// minmax(floor, auto) never shrinks a track below its content, and a spanning
// cell gets the tracks' summed size without any height math here.
function rowTemplate(attrs: GridAttrs | undefined): string {
  const h = Array.isArray(attrs?.rowHeights) ? attrs.rowHeights : null;
  if (!h || !h.length) return 'auto';
  return h.map((n: unknown) => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? `minmax(${Math.min(2000, Math.round(v))}px, auto)` : 'auto';
  }).join(' ');
}

export function gridStyle(attrs: GridAttrs | undefined, blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS): OverrideSet {
  const defaults = defaultsFor('grid', blockDefaults);
  const own: Record<string, string> = { '--cols': gridTemplate(attrs), '--rows': rowTemplate(attrs), ...gridTierVars(attrs) };
  // Its space above belongs on the wrapper, not this row (view.ts). Its rhythm
  // goes out as --flow-space-*: --block-space-* here would feed its own margin.
  return mergeOverrides(own, padVars(attrs?.spacing, defaults.pad), blockSpaceVars(attrs?.spacing, defaults.blockSpace, 'flow-space'), surfaceVars(attrs?.surface, defaults, 'surface'), surfaceImageVars(attrs?.surface), heightVars(attrs?.height));
}

export function cellStyle(
  attrs: GridCellAttrs | undefined,
  registry: TypographyRegistry = EMPTY_TYPOGRAPHY_REGISTRY,
  blockDefaults: ResolvedBlockDefaults = BUILTIN_BLOCK_DEFAULTS
): OverrideSet {
  const defaults = defaultsFor('gridCell', blockDefaults);
  const own: Record<string, string> = {};

  // Only once a merge made the container explicit (boxesOf); a tier with
  // another column count resets it to auto (grid.css, data-reflow).
  if (attrs?.colStart != null) {
    const colSpan = Math.max(1, Number(attrs?.colSpan) || 1);
    const rowSpan = Math.max(1, Number(attrs?.rowSpan) || 1);
    own['grid-column'] = `${attrs.colStart} / span ${colSpan}`;
    own['grid-row'] = `${attrs.rowStart} / span ${rowSpan}`;
  }

  const stretch = !!attrs?.stretch;
  if (stretch) {
    // A grid stretches both axes, unlike flex; 1fr rows share the cell's
    // height. alignX/alignY then place the stretched child's own content
    // (.quick-link in quickLink.css).
    own.display = 'grid';
    own['grid-auto-rows'] = '1fr';
    own['--quick-link-justify'] = ALIGN_FLEX[attrs?.alignX as AlignToken] ?? 'flex-start';
    own['--quick-link-align'] = ALIGN_FLEX[attrs?.alignY as AlignToken] ?? 'flex-start';
  } else {
    const ax = ALIGN_X[attrs?.alignX as AlignToken];
    if (ax) own['text-align'] = ax;

    // The cell is as tall as its row, which can exceed its content.
    const ay = attrs?.alignY as AlignToken | undefined;
    if (ay && ay !== 'start') {
      own.display = 'flex';
      own['flex-direction'] = 'column';
      own['justify-content'] = ay === 'center' ? 'center' : ay === 'end' ? 'flex-end' : 'flex-start';
    }
  }
  return mergeOverrides(
    // Always the default paragraph style's look, a theme stylesheet rule, so
    // only a deviation is emitted.
    typographyVars(attrs?.typography, bodyDefaults(registry), 'typography', registry),
    padVars(attrs?.spacing, defaults.pad),
    // A cell is a flow but not a spacing target, so it publishes both names (spacing.ts).
    flowRhythmVars(attrs?.spacing, defaults.blockSpace),
    surfaceVars(attrs?.surface, defaults, 'surface'),
    surfaceImageVars(attrs?.surface),
    own
  );
}
