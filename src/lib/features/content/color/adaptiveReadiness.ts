// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Adaptive readiness (docs/architecture/theming.md, "Adaptive readiness"): what would stop
// reading once the page follows the viewer's scheme, measured per scheme and
// tier on the grounds scheme regions.ts decides. A pair that is the same in
// both schemes isn't flagged: that is an authoring question, which the
// block settings panel's contrast guidance answers.
import type { Rgba } from '$lib/design-system/theme/color';
import { SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import { TIERS, type Tier } from '../capabilities/cascade';
import { brandColorId, colorToken, colorTokenName, readableOn } from './colorTokens';
import { pinnedScheme } from './contentScheme';
import { resolvedBorder } from '../capabilities/surface/surface';
import { resolvedColor, type TypographyData } from '../capabilities/typography/typography';
import {
  colorInScheme,
  contrastOn,
  fillText,
  groundStep,
  groundSurface,
  pageGrounds,
  TEXT_MINIMUM,
  type Fill,
  type GroundNode,
  type GroundPair,
  type Grounds,
} from './schemeRegions';

export const BORDER_MINIMUM = 3;

interface Located {
  /** The nearest block that carries a blockId (what "show" selects), and its type. */
  blockId: string | null;
  blockType: string;
}

export type ReadinessFinding =
  | (Located & {
      kind: 'text' | 'border';
      /** The stored colour (for the default text on a background, the theme colour it reads as). */
      color: string;
      scheme: SchemeName;
      /** The weakest ratio found for this colour in this scheme. */
      ratio: number;
      minimum: number;
      /** Where the pair fails; all three when it does everywhere. */
      tiers: Tier[];
    })
  | (Located & { kind: 'html' })
  | (Located & { kind: 'image-ground' });

interface JsonNode extends GroundNode {
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: JsonNode[];
}

const INLINE_COLOR_STYLE = /\bstyle\s*=\s*("[^"]*"|'[^']*')/gi;
const COLOR_PROPERTY = /(^|[;\s"'])(color|background(-color)?)\s*:/i;

function htmlHasColorStyles(html: string): boolean {
  for (const m of html.matchAll(INLINE_COLOR_STYLE)) if (COLOR_PROPERTY.test(m[1])) return true;
  return false;
}

const same = (a: Rgba, b: Rgba) => a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;

/** The theme colour a block's default text reads as, for a finding's label. */
function fillTextLabel(fill: Fill): string {
  if (brandColorId(fill.stored)) return fill.stored;
  const token = colorTokenName(fill.stored);
  return colorToken(token ? readableOn(token) : 'text');
}

export function checkAdaptiveReadiness(doc: unknown): ReadinessFinding[] {
  // Once per block, kind, colour and scheme, with its worst ratio.
  const found = new Map<string, ReadinessFinding>();

  const measure = (at: Located, kind: 'text' | 'border', label: string, bp: Tier, pair: (page: SchemeName) => [Rgba, Rgba] | null) => {
    const pairs = SCHEME_NAMES.map(pair);
    const [light, dark] = pairs;
    if (!light || !dark) return;
    // The same colour on the same ground in both schemes: nothing adapts.
    if (same(light[0], dark[0]) && same(light[1], dark[1])) return;
    const minimum = kind === 'text' ? TEXT_MINIMUM : BORDER_MINIMUM;
    SCHEME_NAMES.forEach((scheme, i) => {
      const [color, ground] = pairs[i]!;
      const ratio = contrastOn(color, ground);
      if (ratio >= minimum) return;
      const key = `${at.blockId ?? at.blockType}|${kind}|${label.toLowerCase()}|${scheme}`;
      const existing = found.get(key);
      if (existing && (existing.kind === 'text' || existing.kind === 'border')) {
        existing.ratio = Math.min(existing.ratio, ratio);
        if (!existing.tiers.includes(bp)) existing.tiers.push(bp);
      } else {
        found.set(key, { ...at, kind, color: label, scheme, ratio, minimum, tiers: [bp] });
      }
    });
  };

  // Resolved in the scheme of the place it is painted.
  const stored = (color: string, where: GroundPair, ground: GroundPair) => (page: SchemeName): [Rgba, Rgba] | null => {
    if (ground[page].unknown) return null;
    const paint = colorInScheme(color, where[page].scheme);
    return paint ? [paint, ground[page].color] : null;
  };

  const walk = (node: JsonNode, outer: Grounds, at: Located) => {
    const blockId = typeof node.attrs?.blockId === 'string' ? node.attrs.blockId : null;
    const here: Located = blockId && node.type ? { blockId, blockType: node.type } : at;

    if (node.type === 'htmlBlock' && !pinnedScheme(node.attrs?.scheme) && typeof node.attrs?.html === 'string' && htmlHasColorStyles(node.attrs.html)) {
      found.set(`${here.blockId ?? here.blockType}|html`, { ...here, kind: 'html' });
    }

    const step = groundStep(node, outer);
    const surface = groundSurface(node);
    for (const bp of TIERS) {
      const inside = step.inner[bp];
      // Painted in the block's own scheme, against what surrounds it.
      const border = surface ? resolvedBorder(surface, bp) : '';
      if (border) measure(here, 'border', border, bp, stored(border, inside, outer[bp]));
      // Without a text colour of its own, the default text its background sets.
      const color = resolvedColor(node.attrs?.typography as TypographyData | undefined, bp);
      const fill = step.fills[bp];
      if (fill?.image && !fill.image.scheme && SCHEME_NAMES.some((page) => fill.inner[page].unknown)) {
        found.set(`${here.blockId ?? here.blockType}|image-ground`, { ...here, kind: 'image-ground' });
      } else if (color) measure(here, 'text', color, bp, stored(color, inside, inside));
      else if (fill) {
        measure(here, 'text', fillTextLabel(fill), bp, (page) => (fill.inner[page].unknown ? null : [fillText(node, fill, page), fill.inner[page].color]));
      }
    }

    for (const mark of node.marks ?? []) {
      const color = mark.type === 'typographyColor' ? mark.attrs?.color : null;
      if (typeof color !== 'string' || !color) continue;
      for (const bp of TIERS) measure(here, 'text', color, bp, stored(color, outer[bp], outer[bp]));
    }

    for (const child of node.content ?? []) walk(child, step.inner, here);
  };

  const root = doc as JsonNode | null;
  const page = pageGrounds(root?.attrs);
  for (const block of root?.content ?? []) walk(block, page, { blockId: null, blockType: block.type ?? 'unknown' });
  return [...found.values()];
}
