// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Scheme regions (docs/architecture/theming.md, "Scheme regions"): a block with a literal
// background pins the scheme its subtree renders in. The scheme whose text
// contrasts more with the effective ground wins (a translucent literal
// composited over what it sits on); if the light and dark page grounds pick
// differently, it is no scheme region. Theme-colour backgrounds and overlays follow
// the scheme and pin nothing. An image's pixels are never read: its grounds
// are the overlay over black and over white, judged by the worse.
//
// Pure, so the renderer and the editor emit identical attributes.
import { composite, contrastRatio, parseColor, type Rgba } from '$lib/design-system/theme/color';
import { resolveSchemeValue, SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import { readableScheme } from '$lib/design-system/theme/readableScheme';
import { TIERS, type Tier } from '../capabilities/cascade';
import { resolvedBg, type SurfaceData } from '../capabilities/surface/surface';
import { imageTextProperty, overlayFollowsScheme, resolvedImageLayer, SURFACE_IMAGE_TYPES, type ImageLayer } from '../capabilities/surface/surfaceImage';
import { defaultsFor } from '../capabilities/defaults/blockDefaults';
import { getBlockDefaults } from '../capabilities/defaults/defaultsRegistry';
import { blockFacets } from '../blocks/facets';
import { colorReferenceProperty, fillTextProperty, isColorReference, type FillKind } from './colorTokens';
import { normalizePageSurface } from '../page/pageAttrs';

/** Text needs 4.5:1 against its ground (WCAG AA, normal text). */
export const TEXT_MINIMUM = 4.5;

/** What content meets at one place, when the page renders in one scheme. */
export interface Ground {
  /** The scheme the content resolves its tokens in there: the page's, or a scheme region's. */
  scheme: SchemeName;
  /** The opaque colour behind it — on an image, the overlay at its worst for the scheme's text. */
  color: Rgba;
  /** On an image with no overlay: nothing says what is behind the text, so nothing on it is measured. */
  unknown?: boolean;
}
/** One ground per scheme the page can render in, keyed by that page scheme. */
export type GroundPair = Readonly<Record<SchemeName, Ground>>;
export type Grounds = Readonly<Record<Tier, GroundPair>>;

/** The minimal node shape every walker hands in: stored JSON, or a ProseMirror node's name and attrs. */
export interface GroundNode {
  type?: string;
  attrs?: Record<string, unknown> | null;
}

function propertyColor(scheme: SchemeName, property: string): Rgba {
  const color = parseColor(resolveSchemeValue(scheme, property) ?? '');
  if (!color) throw new Error(`Scheme token ${property} has no colour in ${scheme}`);
  return color;
}

/** A stored colour (literal or `token:<name>`) as it renders in a scheme; null when it isn't one. */
export function colorInScheme(stored: string, scheme: SchemeName): Rgba | null {
  const property = colorReferenceProperty(stored);
  return parseColor(property ? (resolveSchemeValue(scheme, property) ?? '') : stored);
}

const PAGE_GROUND: GroundPair = {
  light: { scheme: 'light', color: propertyColor('light', '--content-bg') },
  dark: { scheme: 'dark', color: propertyColor('dark', '--content-bg') },
};

/** The page canvas: each scheme's content ground, at every tier. */
export const PAGE_GROUNDS: Grounds = { desktop: PAGE_GROUND, tablet: PAGE_GROUND, phone: PAGE_GROUND };

/** The scheme whose content text reads better on an opaque ground, with that text's ratio. Ties go to light. */
export function schemeForGround(ground: Rgba): { scheme: SchemeName; ratio: number } {
  return readableScheme(ground, '--content-fg');
}

/** A table's own background shows only between its cells, so it is no ground for content. */
export function groundSurface(node: GroundNode): SurfaceData | null {
  if (node.type === 'table') return null;
  // 'page' is the selection chain's root (blockOps.ts's PAGE_TYPE, not imported:
  // that module is the editor's). A page ground is a theme colour, never a scheme region.
  if (node.type === 'doc' || node.type === 'page') return normalizePageSurface(node.attrs?.surface);
  // A quick link: only its variant's fields count (blocks/facets.ts).
  const ground = blockFacets(node.type)?.ground;
  if (ground) return ground.surface(node.attrs ?? {});
  if (node.type === 'queryBlock') {
    const options = node.attrs?.formatOptions as { surface?: SurfaceData } | undefined;
    return options?.surface ?? null;
  }
  return (node.attrs?.surface as SurfaceData | undefined) ?? null;
}

export function fillKind(node: GroundNode): FillKind {
  return blockFacets(node.type)?.ground?.fill ?? 'block';
}

/** A block's background at one tier, over what surrounds it. */
export interface Fill {
  /** The stored colour. */
  stored: string;
  /** The scheme the block pins for its subtree, or null when it inherits. */
  regionScheme: SchemeName | null;
  /** The ground its content sits on, per page scheme. */
  inner: GroundPair;
  /** The image layer, when the block paints one here (`stored` is then its colour fallback, or ''). */
  image?: ImageLayer;
}

export function fillOver(stored: string, outer: GroundPair): Fill {
  const inner = {} as Record<SchemeName, Ground>;
  const picks = {} as Record<SchemeName, SchemeName>;
  for (const page of SCHEME_NAMES) {
    const around = outer[page];
    const paint = colorInScheme(stored, around.scheme);
    const color = !paint ? around.color : paint.a < 1 ? composite(paint, around.color) : { ...paint, a: 1 };
    // A translucent paint over a ground nothing can measure is still unknown.
    inner[page] = { scheme: around.scheme, color, ...(around.unknown && (!paint || paint.a < 1) ? { unknown: true } : {}) };
    picks[page] = schemeForGround(color).scheme;
  }
  const regionScheme = !isColorReference(stored) && picks.light === picks.dark ? picks.light : null;
  if (regionScheme) for (const page of SCHEME_NAMES) inner[page] = { ...inner[page], scheme: regionScheme };
  return { stored, regionScheme, inner };
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

/** The ground among `grounds` on which a text colour reads worst, and that ratio. */
function worstFor(text: Rgba, grounds: readonly Rgba[]): { color: Rgba; ratio: number } {
  return grounds
    .map((color) => ({ color, ratio: contrastRatio(text, color) }))
    .reduce((a, b) => (b.ratio < a.ratio ? b : a));
}

/** Around a contained image the overlay over the colour fallback is a ground too. */
export function imageFillOver(layer: ImageLayer, fallback: string, outer: GroundPair): Fill {
  const inner = {} as Record<SchemeName, Ground>;
  const picks = {} as Record<SchemeName, SchemeName>;
  const candidates = {} as Record<SchemeName, Rgba[] | null>;
  for (const page of SCHEME_NAMES) {
    const around = outer[page];
    const paint = layer.overlay && layer.opacity > 0 ? colorInScheme(layer.overlay, around.scheme) : null;
    if (!paint) {
      candidates[page] = null;
      continue;
    }
    const overlay = { ...paint, a: paint.a * (layer.opacity / 100) };
    const grounds = [composite(overlay, BLACK), composite(overlay, WHITE)];
    if (layer.fit === 'contain') {
      const fill = colorInScheme(fallback, around.scheme);
      const under = !fill ? around.color : fill.a < 1 ? composite(fill, around.color) : { ...fill, a: 1 };
      grounds.push(composite(overlay, under));
    }
    candidates[page] = grounds;
    // Ties go to light, as for a colour (readableScheme).
    const dark = worstFor(propertyColor('dark', '--content-fg'), grounds).ratio;
    picks[page] = dark > worstFor(propertyColor('light', '--content-fg'), grounds).ratio ? 'dark' : 'light';
  }
  const auto = !overlayFollowsScheme(layer) && candidates.light && candidates.dark && picks.light === picks.dark ? picks.light : null;
  const regionScheme = layer.scheme ?? auto;
  for (const page of SCHEME_NAMES) {
    const scheme = regionScheme ?? outer[page].scheme;
    const grounds = candidates[page];
    inner[page] = grounds
      ? { scheme, color: worstFor(propertyColor(scheme, imageTextProperty(layer)), grounds).color }
      : { scheme, color: outer[page].color, unknown: true };
  }
  return { stored: fallback, regionScheme, inner, image: layer };
}

export interface GroundStep {
  /** The block's background per tier, or null where it has none. */
  fills: Readonly<Record<Tier, Fill | null>>;
  /** What the block's content sits on. */
  inner: Grounds;
}

/** One level down the tree: the block's backgrounds, and the grounds its children meet. */
export function groundStep(node: GroundNode, outer: Grounds): GroundStep {
  const surface = groundSurface(node);
  const ground = blockFacets(node.type)?.ground;
  const defaultBg =
    node.type === 'table'
      ? null
      : ground
        ? ground.defaultBg(node.attrs ?? {}, getBlockDefaults())
        : defaultsFor(node.type ?? '', getBlockDefaults()).bg;
  const fills = {} as Record<Tier, Fill | null>;
  const inner = {} as Record<Tier, GroundPair>;
  for (const bp of TIERS) {
    // The group's default background is a theme colour: never a scheme region, but a ground.
    const bg = surface ? resolvedBg(surface, bp, defaultBg) : (defaultBg ?? '');
    const image = surface && SURFACE_IMAGE_TYPES.has(node.type ?? '') ? resolvedImageLayer(surface, bp) : null;
    const fill = image ? imageFillOver(image, bg, outer[bp]) : bg ? fillOver(bg, outer[bp]) : null;
    fills[bp] = fill;
    inner[bp] = fill?.inner ?? outer[bp];
  }
  return { fills, inner };
}

/** Every walker starts here, so a scheme region on a tinted page is decided against the tint. */
export function pageGrounds(docAttrs: Record<string, unknown> | null | undefined): Grounds {
  return groundStep({ type: 'doc', attrs: docAttrs ?? {} }, PAGE_GROUNDS).inner;
}

/** The grounds inside the last of a root-to-leaf chain of blocks (the page, when it heads the chain, included). */
export function groundsAlong(chain: readonly GroundNode[]): Grounds {
  return chain.reduce<Grounds>((grounds, node) => groundStep(node, grounds).inner, PAGE_GROUNDS);
}

/** `data-scheme` when the scheme region is the same at every tier, else `data-scheme-d` / `-t` / `-p`. */
export function schemeAttributes(step: GroundStep): Record<string, string> {
  const regionSchemes = TIERS.map((bp) => step.fills[bp]?.regionScheme ?? null);
  if (regionSchemes.every((regionScheme) => regionScheme === regionSchemes[0])) return regionSchemes[0] ? { 'data-scheme': regionSchemes[0] } : {};
  const attrs: Record<string, string> = {};
  TIERS.forEach((bp, i) => {
    if (regionSchemes[i]) attrs[`data-scheme-${bp[0]}`] = regionSchemes[i];
  });
  return attrs;
}

/** schemeAttributes as HTML attribute text (values are scheme names — nothing to escape). */
export function schemeAttributeHtml(step: GroundStep): string {
  return Object.entries(schemeAttributes(step))
    .map(([name, value]) => ` ${name}="${value}"`)
    .join('');
}

/** The default text on a block's background, for one page scheme. */
export function fillText(node: GroundNode, fill: Fill, page: SchemeName): Rgba {
  const ground = fill.inner[page];
  // On an image: the scheme's own, or a theme-colour overlay's partner (surfaceImageVars).
  return propertyColor(ground.scheme, fill.image ? imageTextProperty(fill.image) : fillTextProperty(fill.stored, fillKind(node)));
}

/** A colour against a ground, alpha composited first. */
export function contrastOn(color: Rgba, ground: Rgba): number {
  return contrastRatio(color.a < 1 ? composite(color, ground) : color, ground);
}
