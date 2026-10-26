// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The viewer's colour preference (docs/architecture/theming.md, "The viewer's preference"):
// a device's cookie, not an account attribute. The server renders it as
// data-color-pref on <html>, so the first paint is in the right scheme.
import { DEFAULT_SCHEMES, resolveSchemeValue } from './tokens';

export const COLOR_PREFS = ['system', 'light', 'dark'] as const;
export type ColorPref = (typeof COLOR_PREFS)[number];

export const COLOR_PREF_COOKIE = 'color_pref';

/** What a viewer who never chose gets: the device's scheme. */
export const DEFAULT_COLOR_PREF: ColorPref = 'system';

/** The stored preference, or the default when there is none or it is not one we know. */
export function resolveColorPref(value: string | null | undefined): ColorPref {
  return COLOR_PREFS.includes(value as ColorPref) ? (value as ColorPref) : DEFAULT_COLOR_PREF;
}

/** A year: a device preference that outlives sessions. */
export const COLOR_PREF_MAX_AGE = 60 * 60 * 24 * 365;

/** The browser chrome colour for each scheme (`<meta name="theme-color">`): its page ground. */
export const THEME_COLOR: Record<'light' | 'dark', string> = {
  light: DEFAULT_SCHEMES.light['--ds-color-bg'],
  dark: DEFAULT_SCHEMES.dark['--ds-color-bg'],
};

/** The app bar's background per scheme in the active theme. */
export function appbarColors(): Record<'light' | 'dark', string | null> {
  return { light: resolveSchemeValue('light', '--ds-appbar-bg'), dark: resolveSchemeValue('dark', '--ds-appbar-bg') };
}

/**
 * The colours of the two theme-color metas (one per media query): an explicit
 * choice sets both, `system` gives each its scheme's. The browser chrome sits
 * above the app bar, so a branded bar (`bars`) is what it matches.
 */
export function themeColors(pref: ColorPref, bars?: Partial<Record<'light' | 'dark', string | null>>): { light: string; dark: string } {
  const color = (scheme: 'light' | 'dark') => bars?.[scheme] || THEME_COLOR[scheme];
  if (pref === 'system') return { light: color('light'), dark: color('dark') };
  return { light: color(pref), dark: color(pref) };
}
