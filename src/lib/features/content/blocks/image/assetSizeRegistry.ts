// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The measured sizes of the images the editor shows (docs/architecture/media.md), set
// before the editor mounts and added to on upload. An image without a size
// renders by its src alone.
import type { ImageSize } from './imageSources';

let sizes: Record<string, ImageSize> = {};

export function setAssetSizes(next: Record<string, ImageSize>): void {
  sizes = { ...next };
}

/** An uploaded image's size, so the image block shows its copies at once. */
export function rememberAssetSize(id: string, size: ImageSize): void {
  sizes[id] = size;
}

export function assetSizeOf(id: string): ImageSize | undefined {
  return sizes[id];
}
