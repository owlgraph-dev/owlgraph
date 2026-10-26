// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { SpacedBlockAttrs } from '../../doc/blockAttrs';
import type { TypographyData } from '../../capabilities/typography/typography';

export interface HeadingAttrs extends SpacedBlockAttrs {
  level?: number;
  typography?: TypographyData | null;
  /** A paragraph style id; absent resolves the level's default style. */
  paragraphStyle?: string | null;
  /** Read, never set (capabilities/typography/roles.ts). */
  typographyRole?: unknown;
}
