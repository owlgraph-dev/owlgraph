// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Contrast guidance for the editor's colour fields (docs/architecture/theming.md, "Contrast
// guidance"), measured on the grounds the renderers decide scheme regions from, so
// the warning describes what the page will show.
import { SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import type { Tier } from '../capabilities/cascade';
import { resolvedColor, type TypographyData } from '../capabilities/typography/typography';
import type { ContentScheme } from './contentScheme';
import { colorInScheme, contrastOn, fillText, groundStep, groundsAlong, TEXT_MINIMUM, type GroundNode, type GroundPair } from './schemeRegions';

export interface ContrastWarning {
  /**
   * `text`: a colour the author set; `default-text`: the text a background
   * leaves when none is set; `no-default-text`: a background that pins its
   * scheme but on which even the better text colour doesn't reach 4.5:1;
   * `unknown-ground`: an image with neither an overlay nor a scheme — nothing
   * says what its text sits on (ratio 0).
   */
  kind: 'text' | 'default-text' | 'no-default-text' | 'unknown-ground';
  /** The weakest ratio. */
  ratio: number;
  /** The page scheme it fails in, when the page renders in both and it fails in one; else null. */
  scheme: SchemeName | null;
}

/** The page schemes a content scheme renders in. */
export function pageSchemes(scheme: ContentScheme): SchemeName[] {
  return scheme === 'adaptive' ? [...SCHEME_NAMES] : [scheme];
}

function worst(schemes: SchemeName[], ratioIn: (page: SchemeName) => number | null): { ratio: number; scheme: SchemeName | null } | null {
  const failing = schemes
    .map((page) => ({ page, ratio: ratioIn(page) }))
    .filter((r): r is { page: SchemeName; ratio: number } => r.ratio !== null && r.ratio < TEXT_MINIMUM);
  if (!failing.length) return null;
  const weakest = failing.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return { ratio: weakest.ratio, scheme: failing.length === 1 && schemes.length > 1 ? weakest.page : null };
}

function colorOn(color: string, ground: GroundPair, schemes: SchemeName[]): ContrastWarning | null {
  const found = worst(schemes, (page) => {
    if (ground[page].unknown) return null;
    const paint = colorInScheme(color, ground[page].scheme);
    return paint ? contrastOn(paint, ground[page].color) : null;
  });
  return found && { kind: 'text', ...found };
}

/** The Typography colour of `chain`'s last block, on that block's own ground. */
export function textContrast(chain: readonly GroundNode[], bp: Tier, scheme: ContentScheme): ContrastWarning | null {
  const node = chain[chain.length - 1];
  const color = node && resolvedColor(node.attrs?.typography as TypographyData | undefined, bp);
  return color ? colorOn(color, groundsAlong(chain)[bp], pageSchemes(scheme)) : null;
}

/** An inline colour on text inside `chain`'s last block. */
export function markContrast(chain: readonly GroundNode[], color: string | null, bp: Tier, scheme: ContentScheme): ContrastWarning | null {
  return color ? colorOn(color, groundsAlong(chain)[bp], pageSchemes(scheme)) : null;
}

/** The default text on the background of `chain`'s last block, when it sets no text colour of its own. */
export function backgroundContrast(chain: readonly GroundNode[], bp: Tier, scheme: ContentScheme): ContrastWarning | null {
  const node = chain[chain.length - 1];
  if (!node || resolvedColor(node.attrs?.typography as TypographyData | undefined, bp)) return null;
  const fill = groundStep(node, groundsAlong(chain.slice(0, -1))).fills[bp];
  if (!fill) return null;
  if (fill.image && !fill.image.scheme && pageSchemes(scheme).some((page) => fill.inner[page].unknown)) {
    return { kind: 'unknown-ground', ratio: 0, scheme: null };
  }
  const found = worst(pageSchemes(scheme), (page) => (fill.inner[page].unknown ? null : contrastOn(fillText(node, fill, page), fill.inner[page].color)));
  if (!found) return null;
  return { kind: fill.regionScheme ? 'no-default-text' : 'default-text', ...found };
}
