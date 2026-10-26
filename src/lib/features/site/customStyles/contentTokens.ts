// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The token vocabulary a custom style should be written in (docs/architecture/theming.md,
// "Content palette"), derived from the scheme sets so it can't drift from them.
import { DEFAULT_SCHEMES } from '$lib/design-system/theme/tokens';
import { getBrandColors, typeScaleOptions } from '$lib/features/content';

export interface ContentToken {
  name: string;
  /** What it is for, in the admin's terms; a brand colour carries its name. */
  hint: string;
}

const PREFIX = '--content-';

// Offered page colours first (what most styles want), then the palette, then shadows.
function familyHint(name: string): string {
  if (name.startsWith('--content-theme-')) return 'theme';
  if (name.startsWith('--content-shadow-')) return 'shadow';
  return 'page';
}

const FAMILY_ORDER = ['page', 'theme', 'shadow'];

/**
 * Every `--content-*` token, the type scale's `--type-<step>`, and the brand
 * colours. Brand colours are a module value the root layout sets, so call this
 * at render time, not at module scope.
 */
export function contentTokens(): ContentToken[] {
  const tokens: ContentToken[] = [];
  for (const name of Object.keys(DEFAULT_SCHEMES.light)) {
    if (name.startsWith(PREFIX)) tokens.push({ name, hint: familyHint(name) });
  }
  tokens.sort((a, b) => {
    const family = FAMILY_ORDER.indexOf(a.hint) - FAMILY_ORDER.indexOf(b.hint);
    return family !== 0 ? family : a.name.localeCompare(b.name);
  });

  for (const step of typeScaleOptions()) {
    tokens.push({ name: `--type-${step.label}`, hint: `type ${step.hint}` });
  }

  for (const brand of getBrandColors()) {
    tokens.push({ name: `--content-brand-${brand.id}`, hint: brand.name });
    tokens.push({ name: `--content-brand-${brand.id}-fg`, hint: `${brand.name} — text on it` });
  }
  return tokens;
}
