// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// applyColorPref stores the choice in the cookie and updates what the server
// rendered (data-color-pref, the theme-color metas), so it shows without a reload.
import { appbarColors, COLOR_PREF_COOKIE, COLOR_PREF_MAX_AGE, resolveColorPref, themeColors, type ColorPref } from './preference';

/**
 * In the browser this, not the root layout's data, is the truth: the layout
 * load doesn't rerun on client-side navigation.
 */
export function currentColorPref(): ColorPref {
  return resolveColorPref(document.documentElement.dataset.colorPref);
}

export function applyColorPref(pref: ColorPref): void {
  document.cookie = `${COLOR_PREF_COOKIE}=${pref}; path=/; max-age=${COLOR_PREF_MAX_AGE}; SameSite=Lax`;
  document.documentElement.dataset.colorPref = pref;
  const colors = themeColors(pref, appbarColors());
  for (const meta of Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))) {
    meta.content = /dark/.test(meta.media) ? colors.dark : colors.light;
  }
}
