// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The theme colours an author can pick (colorTokens.ts) as picker options:
// what is stored, how the swatch paints, and the translated name — and the
// name of a stored value for hints and labels.
import * as m from '$lib/paraglide/messages';
import { CONTENT_COLOR_TOKENS, brandColorId, brandColorToken, colorCss, colorToken, colorTokenName, type ContentColorToken } from './colorTokens';
import { getBrandColors } from './brandColors';
import { PAGE_GROUND_TOKENS } from '../page/pageAttrs';

const LABELS: Record<ContentColorToken, () => string> = {
  text: m.content_color_text,
  muted: m.content_color_muted,
  border: m.content_color_border,
  'border-strong': m.content_color_border_strong,
  background: m.content_color_background,
  subtle: m.content_color_subtle,
  accent: m.content_color_accent,
  'accent-soft': m.content_color_accent_soft,
  'on-accent': m.content_color_on_accent,
  inverse: m.content_color_inverse,
  'on-inverse': m.content_color_on_inverse,
  info: m.content_color_info,
  'info-soft': m.content_color_info_soft,
  success: m.content_color_success,
  'success-soft': m.content_color_success_soft,
  warning: m.content_color_warning,
  'warning-soft': m.content_color_warning_soft,
  danger: m.content_color_danger,
  'danger-soft': m.content_color_danger_soft,
};

/** The theme colours, then the site's brand colours. */
export function themeColorOptions(): { value: string; label: string; css: string }[] {
  const theme = CONTENT_COLOR_TOKENS.map((name) => {
    const value = colorToken(name);
    return { value, label: LABELS[name](), css: colorCss(value) };
  });
  const brand = getBrandColors().map((color) => {
    const value = brandColorToken(color.id);
    return { value, label: color.name, css: colorCss(value) };
  });
  return [...brand, ...theme];
}

/** A stored colour for display: a theme or brand colour's name, a literal as it is. */
export function colorLabel(value: string | null | undefined): string {
  const name = colorTokenName(value);
  if (name) return LABELS[name]();
  const brand = brandColorId(value);
  if (brand) return getBrandColors().find((c) => c.id === brand)?.name ?? brand;
  return value ?? '';
}

/** The theme colours a page's ground may be (pageAttrs.ts), as picker options — no brand colours, no literals. */
export function pageGroundOptions(): { value: string; label: string; css: string }[] {
  return PAGE_GROUND_TOKENS.map((name) => {
    const value = colorToken(name);
    return { value, label: LABELS[name](), css: colorCss(value) };
  });
}
