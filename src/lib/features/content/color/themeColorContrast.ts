// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The pairs the content palette must pass in every scheme (docs/architecture/theming.md,
// "Letting pages adapt"). The strong border is a 3:1 line colour, so no text
// reaches 4.5:1 on it as a ground; the block settings panel warns where it fills a block.
import { contrastRatio, parseColor } from '$lib/design-system/theme/color';
import { resolveSchemeValue, SCHEME_NAMES, type SchemeName } from '$lib/design-system/theme/tokens';
import { CONTENT_COLOR_TOKENS, colorTokenProperty, readableOn } from './colorTokens';
import { TEXT_MINIMUM } from './schemeRegions';

export interface PaletteShortfall {
  scheme: SchemeName;
  foreground: string;
  ground: string;
  ratio: number;
  minimum: number;
}

const PAIRS: readonly [foreground: string, ground: string, minimum: number][] = [
  ['--content-fg', '--content-bg', TEXT_MINIMUM],
  ['--content-muted', '--content-bg', TEXT_MINIMUM],
  ['--content-link', '--content-bg', TEXT_MINIMUM],
  ['--content-accent', '--content-bg', TEXT_MINIMUM],
  ['--content-theme-border-strong', '--content-bg', 3],
  ...CONTENT_COLOR_TOKENS.filter((name) => name !== 'border-strong').map(
    (name) => [colorTokenProperty(readableOn(name)), colorTokenProperty(name), TEXT_MINIMUM] as [string, string, number]
  ).filter(([foreground, ground]) => foreground !== ground),
];

export function themeColorShortfalls(): PaletteShortfall[] {
  const shortfalls: PaletteShortfall[] = [];
  for (const scheme of SCHEME_NAMES) {
    for (const [foreground, ground, minimum] of PAIRS) {
      const fg = parseColor(resolveSchemeValue(scheme, foreground) ?? '');
      const bg = parseColor(resolveSchemeValue(scheme, ground) ?? '');
      if (!fg || !bg) continue;
      const ratio = contrastRatio(fg, bg);
      if (ratio < minimum) shortfalls.push({ scheme, foreground, ground, ratio, minimum });
    }
  }
  return shortfalls;
}
