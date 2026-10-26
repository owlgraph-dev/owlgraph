// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site's brand colours for the colour pickers, set by the root layout. A
// plain module value, not reactive state: the MCP server imports this outside
// Svelte, and a picker opens long after the layout has set it.
import type { BrandColor } from '$lib/design-system/theme/siteTheme';

let colors: readonly BrandColor[] = [];

export function setBrandColors(next: readonly BrandColor[] | null | undefined): void {
  colors = next ?? [];
}

export function getBrandColors(): readonly BrandColor[] {
  return colors;
}
