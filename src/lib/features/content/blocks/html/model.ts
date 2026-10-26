// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The freeform escape hatch: an atom holding authored HTML in an attribute.
// The HTML is sanitized on save (render/sanitize.server.ts, the boundary) and
// again wherever it is drawn.
import type { SpacedBlockAttrs } from '../../doc/blockAttrs';
import type { PlacementData } from '../../capabilities/placement/placement';

export interface HtmlBlockAttrs extends SpacedBlockAttrs {
  html?: string;
  placement?: PlacementData | null;
  /** Inline colours can't follow the page's scheme, so a block may pin one (docs/architecture/theming.md); null follows the page. */
  scheme?: string | null;
}
