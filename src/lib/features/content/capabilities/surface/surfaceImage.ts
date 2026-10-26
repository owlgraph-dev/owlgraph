// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The Surface capability's image layer (docs/architecture/blocks/capabilities.md, "Background images"):
// an image over the block's colour, with an overlay between so text reads. One
// declaration carries overlay and image, so the two can't get out of step. The
// URL is built from the asset id, never stored or author-supplied.
import { resolveCapability, type Tier, TIER_CHAR } from '../cascade';
import { colorCss, fillTextProperty, isColorReference } from '../../color/colorTokens';
import { POSITION_CSS, type ObjectPosition } from '../../blocks/image/imageBox';
import { mediaUrl, mediaVariantUrl } from '$lib/features/media';
import type { OverrideSet } from '../overrides';
import { IMAGE_DEFAULTS, ownImageFields, type ImageFit, type ImageScheme, type SurfaceData, type SurfaceValue } from './surface';

/** Not the query block (one image for every result), the page, a table or a card. */
export const SURFACE_IMAGE_TYPES: ReadonlySet<string> = new Set(['grid', 'pageSection', 'gridCell', 'flexContainer', 'flexCell']);

/** A block's image layer at one tier, every field resolved. */
export interface ImageLayer {
  image: string;
  fit: ImageFit;
  focus: ObjectPosition;
  /** The overlay colour as stored, or null for none. */
  overlay: string | null;
  /** 0–100. */
  opacity: number;
  /** The scheme the author pinned, or null for Auto. */
  scheme: ImageScheme | null;
}

/** The image layer at a tier, or null where no image resolves. */
export function resolvedImageLayer(data: SurfaceData | null | undefined, bp: Tier): ImageLayer | null {
  const own = ownImageFields(resolveCapability<SurfaceValue>(data, bp) as Record<string, unknown>);
  if (!own.image) return null;
  return {
    image: own.image,
    fit: own.imageFit ?? IMAGE_DEFAULTS.imageFit,
    focus: own.imageFocus ?? IMAGE_DEFAULTS.imageFocus,
    overlay: own.overlay ?? null,
    opacity: own.overlayOpacity ?? IMAGE_DEFAULTS.overlayOpacity,
    scheme: own.imageScheme ?? null,
  };
}

/**
 * A theme-colour overlay changes with the scheme, so like a theme-colour
 * background it is no island and its text is the colour's readable partner.
 * An author's scheme pins regardless.
 */
export function overlayFollowsScheme(layer: ImageLayer): boolean {
  return !layer.scheme && !!layer.overlay && layer.opacity > 0 && isColorReference(layer.overlay);
}

/** The custom property the default text on the layer reads. */
export function imageTextProperty(layer: ImageLayer): string {
  return overlayFollowsScheme(layer) ? fillTextProperty(layer.overlay!, 'block') : '--content-fg';
}

/** The overlay colour at its opacity, as CSS. */
export function overlayCss(overlay: string, opacity: number): string {
  const color = colorCss(overlay);
  return opacity >= 100 ? color : `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
}

/** The copy widths a tier's background shows at 1× and 2× (docs/architecture/media.md). */
export const TIER_COPY_WIDTHS: Record<Tier, readonly [number, number]> = {
  desktop: [1920, 2560],
  tablet: [960, 1920],
  phone: [640, 1280],
};

/**
 * `[url, density]` candidates, 1× first. A tiled image is the original: its
 * own pixels set the tile size, which a density would change.
 */
export function layerImageCandidates(layer: ImageLayer, bp: Tier): [string, string][] {
  if (layer.fit === 'repeat') return [[mediaUrl(layer.image), '1x']];
  const [x1, x2] = TIER_COPY_WIDTHS[bp];
  return [[mediaVariantUrl(layer.image, x1), '1x'], [mediaVariantUrl(layer.image, x2), '2x']];
}

/** The layer stack's background-image value at a tier: the overlay over the image. */
export function imageLayerCss(layer: ImageLayer, bp: Tier = 'desktop'): string {
  const candidates = layerImageCandidates(layer, bp);
  const url = candidates.length === 1 ? `url(${candidates[0][0]})` : `image-set(${candidates.map(([u, d]) => `url(${u}) ${d}`).join(', ')})`;
  if (!layer.overlay || layer.opacity <= 0) return url;
  const o = overlayCss(layer.overlay, layer.opacity);
  return `linear-gradient(${o}, ${o}), ${url}`;
}

/** Each background property the layer sets at a tier, as CSS — and, for no layer, the property's initial value. */
function layerProps(layer: ImageLayer | null, bp: Tier): Record<'img' | 'img-size' | 'img-repeat' | 'img-pos', string> {
  if (!layer) return { img: 'none', 'img-size': 'auto', 'img-repeat': 'repeat', 'img-pos': '0% 0%' };
  return {
    img: imageLayerCss(layer, bp),
    'img-size': layer.fit === 'repeat' ? 'auto' : layer.fit,
    'img-repeat': layer.fit === 'repeat' ? 'repeat' : 'no-repeat',
    'img-pos': POSITION_CSS[layer.focus],
  };
}

/**
 * Sparse against the tier above. Merge after surfaceVars: on an image the text
 * is the scheme's or the overlay's partner, never the fallback colour's.
 */
export function surfaceImageVars(data: SurfaceData | null | undefined, prefix = 'surface'): OverrideSet {
  const out: Record<string, string> = {};
  let above: ImageLayer | null = null;
  let aboveBp: Tier = 'desktop';
  for (const bp of ['desktop', 'tablet', 'phone'] as const) {
    const layer = resolvedImageLayer(data, bp);
    const ch = TIER_CHAR[bp];
    if (layer) {
      const now = layerProps(layer, bp);
      const before = layerProps(above, aboveBp);
      for (const key of Object.keys(now) as (keyof typeof now)[]) {
        if (now[key] !== before[key]) out[`--${prefix}-${key}-${ch}`] = now[key];
      }
      // Also wherever this tier's own colour would otherwise set its own.
      const fg = `var(${imageTextProperty(layer)})`;
      if (!above || fg !== `var(${imageTextProperty(above)})` || data?.[bp]?.bg != null) out[`--${prefix}-fg-${ch}`] = fg;
    }
    above = layer;
    aboveBp = bp;
  }
  return out;
}
