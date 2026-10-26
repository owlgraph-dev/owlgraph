// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A flex row (flexContainer > flexCell+), the grid's content-sized sibling,
// arranged by the Layout capability. A cell has no alignX/alignY/stretch: it
// has no track box to place content in, only its size and alignment in the
// row (the flex cell capability, capabilities/flexItem).
import type { LayoutData } from '../../capabilities/layout/layout';
import type { SpacingData } from '../../capabilities/spacing/spacing';
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { HeightData } from '../../capabilities/height/height';
import type { TypographyData } from '../../capabilities/typography/typography';
import type { PlacementData } from '../../capabilities/placement/placement';
import type { FlexItemData } from '../../capabilities/flexItem/flexItem';

export interface FlexContainerAttrs {
  blockId?: string | null;
  layout?: LayoutData | null;
  spacing?: SpacingData | null;
  surface?: SurfaceData | null;
  height?: HeightData | null;
  /** 'normal' (the reading column), 'wide' or 'full' (the canvas). */
  width?: string | null;
  /** Flush against the page's top as the page's first block (pageLayout.ts). */
  bleedToTop?: boolean;
  placement?: PlacementData | null;
}
export interface FlexCellAttrs {
  typography?: TypographyData | null;
  spacing?: SpacingData | null;
  surface?: SurfaceData | null;
  flexItem?: FlexItemData | null;
}
