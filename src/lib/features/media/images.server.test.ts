// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { prepareImage, renderVariant, hasVariants } from './images.server';

// A photo as a phone saves it: stored sideways with an orientation flag, and
// carrying the camera and the position it was taken at.
async function phonePhoto(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '48/1 8/1 0/1' } })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

describe('prepareImage', () => {
  it('stores a photo upright and without its camera and GPS metadata, measured upright', async () => {
    const { bytes, width, height } = await prepareImage(await phonePhoto(), 'image/jpeg');
    expect({ width, height }).toEqual({ width: 200, height: 400 });
    const m = await sharp(bytes).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.orientation ?? 1).toBe(1);
    expect({ w: m.width, h: m.height }).toEqual({ w: 200, h: 400 });
  });

  it('keeps an image that carries no metadata byte for byte', async () => {
    const png = await sharp({ create: { width: 30, height: 20, channels: 4, background: '#0000' } }).png().toBuffer();
    const prepared = await prepareImage(png, 'image/png');
    expect(prepared.bytes.equals(png)).toBe(true);
    expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 30, height: 20 });
  });

  it('measures a GIF without re-encoding it, and leaves what is not a raster image alone', async () => {
    const gif = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#fff' } }).gif().toBuffer();
    const prepared = await prepareImage(gif, 'image/gif');
    expect(prepared.bytes.equals(gif)).toBe(true);
    expect({ width: prepared.width, height: prepared.height }).toEqual({ width: 12, height: 8 });
    const font = Buffer.from('wOF2-not-an-image');
    expect(await prepareImage(font, 'font/woff2')).toEqual({ bytes: font, width: null, height: null });
  });

  it('throws for bytes that carry a signature but are no image', async () => {
    await expect(prepareImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), 'image/png')).rejects.toThrow();
  });
});

describe('renderVariant', () => {
  it('is a WebP copy at the width asked for, without metadata, never wider than the image', async () => {
    const photo = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#468' } }).jpeg().toBuffer();
    const copy = (await renderVariant(photo, 640))!;
    expect(copy.mime).toBe('image/webp');
    const m = await sharp(copy.bytes).metadata();
    expect({ format: m.format, width: m.width, height: m.height, exif: m.exif }).toEqual({ format: 'webp', width: 640, height: 360, exif: undefined });
    const small = (await renderVariant(await sharp({ create: { width: 100, height: 50, channels: 3, background: '#468' } }).png().toBuffer(), 640))!;
    expect((await sharp(small.bytes).metadata()).width).toBe(100);
  });

  it('makes copies of still images only', () => {
    expect(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'].map(hasVariants)).toEqual([true, true, true, false, false]);
  });
});
