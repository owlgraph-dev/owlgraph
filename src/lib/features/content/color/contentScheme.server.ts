// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site-wide content scheme default (docs/architecture/theming.md, "Content scheme");
// unset reads as light.
import { getSetting, setSetting } from '$lib/platform/settings.server';
import { CONTENT_SCHEME_FALLBACK, isContentScheme, type ContentScheme } from './contentScheme';

const KEY = 'content_scheme_default';

export async function getContentSchemeDefault(): Promise<ContentScheme> {
  const value = await getSetting(KEY);
  return isContentScheme(value) ? value : CONTENT_SCHEME_FALLBACK;
}

/** Sets the site default; light, dark or adaptive (callers validate with isContentScheme). */
export async function setContentSchemeDefault(scheme: ContentScheme): Promise<void> {
  await setSetting(KEY, scheme);
}
