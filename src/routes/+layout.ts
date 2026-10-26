// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Keeps the browser's [namespace] matcher registry fresh through a session;
// the first warm-up is hooks.client.ts's init(), which runs earlier. Browser
// only: on the server the registry is the process-wide one, and this viewer's
// namespaces written there would drop the others from routing for everyone.
import { browser } from '$app/environment';
import { setKnownNamespaceSlugs } from '$lib/features/namespaces';
import { setSiteLocaleConfig } from '$lib/platform/i18n/siteLocales';
import type { LayoutLoad } from './$types';

// The site's languages (docs/architecture/languages.md), the same way.
export const load: LayoutLoad = async ({ data }) => {
  if (browser) setKnownNamespaceSlugs(data.namespaces.filter((n) => !n.isDefault).map((n) => n.slug as string));
  if (browser) setSiteLocaleConfig(data.siteLocales);
  return data;
};
