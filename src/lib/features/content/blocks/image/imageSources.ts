// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The copies an image block offers the browser (docs/architecture/media.md), for the
// NodeView and the page alike. Never width/height attributes: an unloaded
// image is laid out at their size before its column caps it, widening a
// phone's page.
import { MEDIA_WIDTHS, mediaUrl, mediaVariantUrl } from '$lib/features/media';
import type { OverrideSet } from '../../capabilities/overrides';
import { effectiveWidth, type ImageWidthAttrs } from './imageWidth';
import { normalizeBoxMode, type ImageBoxAttrs } from './imageBox';

/** An image's measured size (media's AssetSize): its pixels, and whether copies are made of it. */
export interface ImageSize {
  width: number;
  height: number;
  variants: boolean;
}

export interface ImageSources {
  /** The copies and the image, by width; absent when there are no copies to choose from. */
  srcset?: string;
  sizes?: string;
  width: number;
  height: number;
}

// The default reading column. Only a guess, which decides only for an eager
// image: a lazy one's `sizes="auto"` measures instead.
const READING_COLUMN_PX = 760;

/**
 * The shown width per tier: its width % of the column, else its own
 * width capped by the column. `lazy` leads with `auto`, the laid-out width.
 */
export function imageSizes(naturalWidth: number, attrs: ImageWidthAttrs, lazy: boolean): string {
  const slot = (pct: number | null, column: string) => (pct == null ? `min(${naturalWidth}px, ${column})` : pct === 100 ? column : `calc(${column} * ${pct / 100})`);
  const phone = slot(effectiveWidth(attrs, 'phone'), '100vw');
  const tablet = slot(effectiveWidth(attrs, 'tablet'), '100vw');
  const desktop = slot(effectiveWidth(attrs, 'desktop'), `${READING_COLUMN_PX}px`);
  return `${lazy ? 'auto, ' : ''}(max-width: 640px) ${phone}, (max-width: 900px) ${tablet}, ${desktop}`;
}

/** Null when the size isn't known: the image renders by its `src` alone. */
export function imageSources(id: string, size: ImageSize | undefined, attrs: ImageWidthAttrs, lazy: boolean): ImageSources | null {
  if (!size) return null;
  const copies = size.variants ? MEDIA_WIDTHS.filter((w) => w < size.width) : [];
  if (copies.length === 0) return { width: size.width, height: size.height };
  return {
    srcset: [...copies.map((w) => `${mediaVariantUrl(id, w)} ${w}w`), `${mediaUrl(id)} ${size.width}w`].join(', '),
    sizes: imageSizes(size.width, attrs, lazy),
    width: size.width,
    height: size.height,
  };
}

/**
 * The stored size as the drawn box, whichever copy the browser picks. The
 * aspect ratio is required: a `sizes="auto"` image is size-contained (300 ×
 * 150), so without one it is squashed to 150 px high. --img-w keeps a copy at
 * the image's own width rather than the one `sizes` named. Merge
 * boxImgOverrides after this, so a fitted box's ratio wins.
 */
export function imageSizeOverrides(sources: ImageSources | null, attrs: ImageBoxAttrs): OverrideSet {
  if (!sources) return {};
  const out: Record<string, string> = { 'aspect-ratio': `auto ${sources.width} / ${sources.height}` };
  if (sources.srcset && normalizeBoxMode(attrs.boxMode) !== 'height') out['--img-w'] = `${sources.width}px`;
  return out;
}
