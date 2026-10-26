// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The editor's wording for a contrast warning (contrastGuidance.ts).
import * as m from '$lib/paraglide/messages';
import { formatNumber } from '$lib/platform/i18n/format';
import { markContrast, textContrast, type ContrastWarning } from './contrastGuidance';
import type { Tier } from '../capabilities/cascade';
import type { ContentScheme } from './contentScheme';
import type { GroundNode } from './schemeRegions';

export function contrastWarningText(warning: ContrastWarning | null): string | null {
  if (!warning) return null;
  const ratio = formatNumber(warning.ratio, { maximumFractionDigits: 1 });
  switch (warning.kind) {
    case 'unknown-ground':
      return m.capability_contrast_unknown_ground();
    case 'no-default-text':
      return m.capability_contrast_no_default_text({ ratio });
    case 'default-text':
      if (warning.scheme === 'light') return m.capability_contrast_default_text_light({ ratio });
      if (warning.scheme === 'dark') return m.capability_contrast_default_text_dark({ ratio });
      return m.capability_contrast_default_text({ ratio });
    default:
      if (warning.scheme === 'light') return m.capability_contrast_text_light({ ratio });
      if (warning.scheme === 'dark') return m.capability_contrast_text_dark({ ratio });
      return m.capability_contrast_text({ ratio });
  }
}

/**
 * The warning under the typography colour field for the editor's selection:
 * the selected block's own colour when the field edits the block, else the
 * inline colour of the selected text. `chain` is the selection's root-to-leaf
 * chain of blocks, `selectedIndex` the selected entry.
 */
export function typographyColorWarningText(options: {
  chain: readonly GroundNode[];
  selectedIndex: number;
  blockScope: boolean;
  markColor: string | null;
  bp: Tier;
  scheme: ContentScheme;
}): string | null {
  const { chain, selectedIndex, blockScope, markColor, bp, scheme } = options;
  return contrastWarningText(
    blockScope ? textContrast(chain.slice(0, selectedIndex + 1), bp, scheme) : markContrast(chain, markColor, bp, scheme)
  );
}
