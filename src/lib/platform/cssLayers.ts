// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The cascade layers page content is styled in (docs/architecture/design-system/tokens.md,
// "Cascade layers"): base consumes capability variables, theme sets defaults,
// custom is the site's stylesheet. The per-page overrides are unlayered, so
// they beat all three. Every sheet repeats the order statement: the first one
// parsed fixes the order, and under `vite dev` that isn't always app.css.
export const CSS_LAYERS = ['base', 'theme', 'custom'] as const;
export type CssLayer = (typeof CSS_LAYERS)[number];

export const LAYER_ORDER = `@layer ${CSS_LAYERS.join(', ')};`;

/** `css` inside `layer`, or '' for empty css. */
export function inLayer(layer: CssLayer, css: string): string {
  return css ? `@layer ${layer}{${css}}` : '';
}
