// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Which scheme reads on a fixed ground (docs/architecture/theming.md, "Scheme regions"), by the
// schemes' own text colours, never a luminance threshold.
import { contrastRatio, parseColor, type Rgba } from './color';
import { resolveSchemeValue, SCHEME_NAMES, type SchemeName } from './tokens';

/**
 * The scheme whose `textProperty` (`--ds-color-fg` for chrome, `--content-fg`
 * for content) contrasts more with an opaque ground. Ties go to light.
 */
export function readableScheme(ground: Rgba, textProperty: string): { scheme: SchemeName; ratio: number } {
  let best: { scheme: SchemeName; ratio: number } | null = null;
  for (const scheme of SCHEME_NAMES) {
    const text = parseColor(resolveSchemeValue(scheme, textProperty) ?? '');
    if (!text) throw new Error(`Scheme token ${textProperty} has no colour in ${scheme}`);
    const ratio = contrastRatio(text, ground);
    if (!best || ratio > best.ratio) best = { scheme, ratio };
  }
  return best!;
}
