// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Colour references (docs/architecture/theming.md, "Colour references"): a stored colour is
// a literal, the same in every scheme, or a reference that follows the scheme:
// `token:<name>` from the closed set below, or `token:brand.<id>` for a site
// brand colour. A reference to a removed brand colour renders as nothing.
import { BRAND_ID, brandProperty } from '$lib/design-system/theme/siteTheme';

export const CONTENT_COLOR_TOKENS = [
  'text',
  'muted',
  'border',
  'border-strong',
  'background',
  'subtle',
  'accent',
  'accent-soft',
  'on-accent',
  'inverse',
  'on-inverse',
  'info',
  'info-soft',
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
] as const;
export type ContentColorToken = (typeof CONTENT_COLOR_TOKENS)[number];

const PREFIX = 'token:';

/** The stored form of a theme-colour reference. */
export function colorToken(name: ContentColorToken): string {
  return `${PREFIX}${name}`;
}

/** The theme colour a stored value references, or null for a literal (or anything else). */
export function colorTokenName(value: unknown): ContentColorToken | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
  const name = value.slice(PREFIX.length);
  return CONTENT_COLOR_TOKENS.includes(name as ContentColorToken) ? (name as ContentColorToken) : null;
}

const BRAND_PREFIX = `${PREFIX}brand.`;

/** The stored form of a brand-colour reference. */
export function brandColorToken(id: string): string {
  return `${BRAND_PREFIX}${id}`;
}

/** The brand colour id a stored value references, or null. */
export function brandColorId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(BRAND_PREFIX)) return null;
  const id = value.slice(BRAND_PREFIX.length);
  return BRAND_ID.test(id) ? id : null;
}

/** Whether a stored colour follows the scheme — a theme or brand colour — rather than being a fixed literal. */
export function isColorReference(value: unknown): boolean {
  return colorTokenName(value) !== null || brandColorId(value) !== null;
}

/** The CSS custom property a stored reference renders from, or null for a literal. */
export function colorReferenceProperty(value: unknown): string | null {
  const name = colorTokenName(value);
  if (name) return colorTokenProperty(name);
  const brand = brandColorId(value);
  return brand ? brandProperty(brand) : null;
}

/** The CSS custom property a theme colour renders from. */
export function colorTokenProperty(name: ContentColorToken): string {
  return `--content-theme-${name}`;
}

/** The theme colour that reads on theme colour `name` in every scheme (themeColorContrast.ts checks each pair). */
export function readableOn(name: ContentColorToken): ContentColorToken {
  switch (name) {
    case 'accent':
    case 'info':
    case 'success':
    case 'warning':
    case 'danger':
      return 'on-accent';
    case 'inverse':
    case 'text':
    case 'muted':
      return 'on-inverse';
    default:
      return 'text';
  }
}

/**
 * Every stored colour reaches a style through this, so `token:…` never leaks
 * into CSS. Callers pass values already validated by safeColor.
 */
export function colorCss(value: string): string {
  const property = colorReferenceProperty(value);
  return property ? `var(${property})` : value;
}

/** What a filled block is: a quick link, or any other block with a background. */
export type FillKind = 'block' | 'card';

/**
 * On a theme colour, its readable partner; on a literal, the text of the
 * scheme its region pins (a quick link's from --content-filled-fg).
 */
export function fillTextProperty(fill: string, kind: FillKind): string {
  const name = colorTokenName(fill);
  if (name) return colorTokenProperty(readableOn(name));
  const brand = brandColorId(fill);
  if (brand) return `${brandProperty(brand)}-fg`;
  return kind === 'card' ? '--content-filled-fg' : '--content-fg';
}
