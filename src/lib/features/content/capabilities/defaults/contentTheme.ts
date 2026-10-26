// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The content half of the theme stylesheet: capability defaults and paragraph
// style looks. Server and browser compile it alike, so both inject identical CSS.
import type { StoredTheme } from '$lib/design-system/theme/siteTheme';
import { inLayer } from '$lib/platform/cssLayers';
import { EMPTY_TYPOGRAPHY_REGISTRY, type TypographyRegistry } from '../typography/roles';
import { emitParagraphStylesCss } from '../typography/emitParagraphStyles';
import { resolveBlockDefaults, type ResolvedBlockDefaults } from './blockDefaults';
import { emitBlockDefaultsCss } from './emitDefaults';

export interface ContentTheme {
  css: string;
  blockDefaults: ResolvedBlockDefaults;
}

const cache = new Map<string, ContentTheme>();

export function compileContentTheme(
  theme: StoredTheme | null | undefined,
  version: string | null | undefined,
  registry: TypographyRegistry = EMPTY_TYPOGRAPHY_REGISTRY
): ContentTheme {
  const key = `${version ?? JSON.stringify(theme?.blockDefaults ?? null)}|${JSON.stringify(registry)}`;
  let compiled = cache.get(key);
  if (!compiled) {
    const blockDefaults = resolveBlockDefaults(theme?.blockDefaults);
    // Defaults set variables, so they go in the theme layer (platform/cssLayers.ts):
    // above the component CSS, below the custom stylesheet and per-page overrides.
    compiled = { blockDefaults, css: inLayer('theme', emitBlockDefaultsCss(blockDefaults) + emitParagraphStylesCss(registry)) };
    if (cache.size > 8) cache.clear();
    cache.set(key, compiled);
  }
  return compiled;
}
