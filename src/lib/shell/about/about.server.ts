// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /-/about, public as AGPL-3.0 §13 asks (docs/guides/deployment.md,
// "Source code for network users"): the version and revision are what "the
// source of the version you use" means.
import type { ServerLoadEvent } from '@sveltejs/kit';
import { can } from '$lib/features/auth/server';
import { appVersion } from '$lib/platform/logger.server';
import { sourceHref, sourceInfo } from '$lib/platform/source.server';
import { installationInfo } from './installation.server';

export const load = async ({ setHeaders, locals, url }: ServerLoadEvent) => {
  // Not disallowed in robots.txt: a crawler barred from the page never sees this.
  setHeaders({ 'x-robots-tag': 'noindex' });
  const source = sourceInfo();
  return {
    version: appVersion(),
    revision: source.revision === 'dev' ? null : source.revision,
    sourceHref: sourceHref(source),
    // Gathered only for this viewer's `installation:view`, so nothing of it
    // reaches anyone else's page.
    installation: can(locals.user, 'installation:view') ? await installationInfo(url) : null,
  };
};
