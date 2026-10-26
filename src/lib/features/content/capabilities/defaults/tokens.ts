// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A capability default is never a literal: it names a step of the block settings panel's
// quick-pick ladder, emitted as the step's custom property (`--content-pad-sm`)
// (docs/architecture/blocks/capabilities.md, "Capability defaults").
import { BLOCK_SPACE_PRESETS, PAD_PRESETS } from '../spacing/spacing';
import { RADIUS_PRESETS } from '../surface/surface';
import { TIERS, TIER_CHAR, type Tier } from '../cascade';

export type StepToken = 'none' | 'sm' | 'md' | 'lg';
export const STEP_TOKENS: readonly StepToken[] = ['none', 'sm', 'md', 'lg'];

export function stepTokenOrNull(v: unknown): StepToken | null {
  return v === 'none' || v === 'sm' || v === 'md' || v === 'lg' ? v : null;
}

/** The page gutter's ladder: the side inset between canvas edge and content (docs/architecture/blocks/layout.md, "Page settings"). */
export const GUTTER_PRESETS: Readonly<Record<StepToken, number>> = { none: 0, sm: 16, md: 24, lg: 40 };

/** The ladders a default picks from, and the custom-property family each is emitted as. */
export type StepFamily = 'pad' | 'radius' | 'rhythm' | 'gutter';

const FAMILIES: Record<StepFamily, { property: string; presets: Readonly<Record<StepToken, number>> }> = {
  pad: { property: 'content-pad', presets: PAD_PRESETS },
  radius: { property: 'content-radius', presets: RADIUS_PRESETS },
  rhythm: { property: 'content-rhythm', presets: BLOCK_SPACE_PRESETS },
  gutter: { property: 'content-gutter', presets: GUTTER_PRESETS },
};

/** The custom property a step renders as, e.g. `--content-pad-sm`. */
export function stepProperty(family: StepFamily, step: StepToken): string {
  return `--${FAMILIES[family].property}-${step}`;
}

/** The px value a step stands for — what a stored px value is compared against. */
export function stepPx(family: StepFamily, step: StepToken): number {
  return FAMILIES[family].presets[step];
}

/** The `:root` declarations app.css holds for the ladders — a unit test keeps the two identical. */
export function contentStepTokensCss(): string[] {
  const lines: string[] = [];
  for (const family of ['pad', 'radius', 'rhythm', 'gutter'] as const) {
    for (const step of STEP_TOKENS) lines.push(`${stepProperty(family, step)}: ${stepPx(family, step)}px;`);
  }
  return lines;
}

// The canvas widths (docs/architecture/blocks/layout.md, "Page settings"): the reading column, the
// wide band and the outer cap a full-width block spans. One px value each, not
// a step; bounded so a typo cannot collapse or explode the column.
export type WidthToken = 'read' | 'wide' | 'max';
export const WIDTH_TOKENS: readonly WidthToken[] = ['read', 'wide', 'max'];

export const BUILTIN_WIDTHS: Readonly<Record<WidthToken, number>> = { read: 760, wide: 1200, max: 1800 };

export const WIDTH_BOUNDS: Readonly<Record<WidthToken, { min: number; max: number }>> = {
  read: { min: 320, max: 2400 },
  wide: { min: 320, max: 3200 },
  max: { min: 960, max: 3840 },
};

/** The custom property a width token renders as, e.g. `--content-width-read`. */
export function widthProperty(width: WidthToken): string {
  return `--content-width-${width}`;
}

/** A stored width if it is a whole px value within its bounds, else null. */
export function widthPxOrNull(width: WidthToken, v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  const { min, max } = WIDTH_BOUNDS[width];
  return v >= min && v <= max ? v : null;
}

/** The `:root` declarations app.css holds for the canvas widths — a unit test keeps the two identical. */
export function contentWidthTokensCss(): string[] {
  return WIDTH_TOKENS.map((w) => `${widthProperty(w)}: ${BUILTIN_WIDTHS[w]}px;`);
}

// The page gutter per tier, a step of the gutter ladder each.

export const BUILTIN_GUTTERS: Readonly<Record<Tier, StepToken>> = { desktop: 'lg', tablet: 'md', phone: 'sm' };

/** The custom property a tier's site gutter renders as, e.g. `--content-gutter-d`. */
export function gutterTierProperty(tier: Tier): string {
  return `--content-gutter-${TIER_CHAR[tier]}`;
}

/** The `:root` declarations app.css holds for the tier gutters — a unit test keeps the two identical. */
export function contentGutterTokensCss(): string[] {
  return TIERS.map((t) => `${gutterTierProperty(t)}: var(${stepProperty('gutter', BUILTIN_GUTTERS[t])});`);
}
