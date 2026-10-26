// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { ClientInit } from '@sveltejs/kit';
import { setKnownNamespaceSlugs } from '$lib/features/namespaces';
import { baseLocale, isLocale, overwriteGetLocale } from '$lib/paraglide/runtime';

// The interface language is the server's decision, read from <html lang>:
// Paraglide's own getLocale() would negotiate over every catalogue and write a
// cookie recording a choice nobody made. Set before anything renders.
overwriteGetLocale(() => {
  const lang = document.documentElement.lang;
  return isLocale(lang) ? lang : baseLocale;
});

// SvelteKit awaits init() before hydration re-resolves the URL, which the
// [namespace] param matcher needs its registry for (docs/architecture/routing.md, "The
// routing ambiguity, and the params matcher that resolves it").
export const init: ClientInit = async () => {
  try {
    const res = await fetch('/api/namespaces/slugs');
    if (res.ok) setKnownNamespaceSlugs(await res.json());
  } catch {
    // Best effort: +layout.ts's load() fills the registry a moment later.
  }
};
