// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An image block: an atom holding one uploaded image by its asset id
// (docs/architecture/media.md).
import type { SpacedBlockAttrs } from '../../doc/blockAttrs';
import type { PlacementData } from '../../capabilities/placement/placement';
import type { ImageWidthAttrs } from './imageWidth';
import type { ImageBoxAttrs } from './imageBox';

export interface ImageAttrs extends SpacedBlockAttrs, ImageWidthAttrs, ImageBoxAttrs {
  assetId?: string | null;
  alt?: string;
  caption?: string;
  placement?: PlacementData | null;
  /** Rendered until the image is placed. */
  align?: string;
  /** A content ground behind a transparent image, in that scheme; null shows the page through. */
  backdrop?: string | null;
}
