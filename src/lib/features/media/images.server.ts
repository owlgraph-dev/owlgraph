// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Raster images as stored and their narrower copies (docs/architecture/media.md). The one
// place sharp is used.
import sharp from 'sharp';

/** Types an upload is cleaned in and a copy is made from. A GIF is only measured: re-encoding would cost its frames. */
const STILL_FORMATS = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface PreparedImage {
  /** The bytes to store: the upload, or the upload upright and without its metadata. */
  bytes: Buffer;
  /** Its size in pixels, upright; null when it isn't a raster image. */
  width: number | null;
  height: number | null;
}

/**
 * A photo loses its metadata (the GPS position among it) and orientation flag:
 * turned upright, re-encoded at high quality, colour profile kept. One without
 * either, or an animation, is stored byte for byte. Throws when it doesn't decode.
 */
export async function prepareImage(bytes: Buffer, mime: string): Promise<PreparedImage> {
  if (mime !== 'image/gif' && !STILL_FORMATS.has(mime)) return { bytes, width: null, height: null };
  const m = await sharp(bytes).metadata();
  const frameHeight = m.pageHeight ?? m.height;
  if (mime === 'image/gif' || (m.pages ?? 1) > 1) return { bytes, width: m.width, height: frameHeight };
  const tagged = !!(m.exif || m.xmp || m.iptc) || (m.orientation ?? 1) > 1;
  if (!tagged) return { bytes, width: m.width, height: m.height };
  const upright = sharp(bytes).rotate().keepIccProfile();
  const encoded = mime === 'image/jpeg' ? upright.jpeg({ quality: 90, mozjpeg: true }) : mime === 'image/png' ? upright.png() : upright.webp({ quality: 90 });
  const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
  return { bytes: data, width: info.width, height: info.height };
}

/** Whether copies are made of an image of this type (a still raster). */
export function hasVariants(mime: string): boolean {
  return STILL_FORMATS.has(mime);
}

// Decoding a large photo takes tens of MB, and a page's first visit asks for
// every image's copy at once.
const AT_ONCE = 2;
let running = 0;
const queue: (() => void)[] = [];
async function oneOfFew<T>(work: () => Promise<T>): Promise<T> {
  if (running >= AT_ONCE) await new Promise<void>((go) => queue.push(go));
  running++;
  try {
    return await work();
  } finally {
    running--;
    queue.shift()?.();
  }
}

/** A WebP copy, never wider than the image, without metadata. Null for an animation. */
export function renderVariant(bytes: Buffer, width: number): Promise<{ bytes: Buffer; mime: string } | null> {
  return oneOfFew(async () => {
    const m = await sharp(bytes).metadata();
    if ((m.pages ?? 1) > 1) return null;
    const data = await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { bytes: data, mime: 'image/webp' };
  });
}
