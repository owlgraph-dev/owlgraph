// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page section (docs/architecture/blocks/layout.md, "Page layout: sections"): the grid bound to
// the page, its columns the page's column template.
import type { GridAttrs } from '../grid/model';

/** A page section's attrs: the grid's, less the columns, plus its one-column choice. */
export interface SectionAttrs extends GridAttrs {
  /** null = the page's template; 'single' = one column, whatever the page has. */
  columns?: string | null;
}
