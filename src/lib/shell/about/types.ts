// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Client-safe: AboutPage.svelte imports these.
import type { SiteLocaleConfig } from '$lib/platform/i18n/siteLocales';

export interface IntegrationState {
  /** The plugin's id; the page names it (pluginLabel) in the reader's language. */
  id: string;
  enabled: boolean;
  /** The configured service's host, or null while it is off or has none. */
  host: string | null;
  /** People's own connections to it, for a plugin that offers them. */
  connections: { active: number; total: number } | null;
}

export interface InstallationInfo {
  version: string;
  /** The commit or tag the build was made from, or `dev`. */
  revision: string;
  /** process.version */
  node: string;
  /** PostgreSQL's server_version. */
  postgres: string;
  origin: string;
  schema: {
    applied: number;
    /** The newest applied migration's file name. */
    latest: string | null;
    /** Shipped but not applied yet, in order. */
    pending: string[];
    /** The next migrate records `baseline` in place of `replaced` migrations, without running it. */
    adopts: { baseline: string; replaced: number } | null;
    /** The next migrate refuses this database: it predates `baseline` (`partial`), or its rows don't match it. */
    refused: { cause: 'partial' | 'mismatch' | 'foreign'; baseline: string; tag: string } | null;
  };
  languages: SiteLocaleConfig;
  integrations: IntegrationState[];
  /** APP_SECRET_KEY: whether it is there and fit — never a character of it. */
  secretKey: 'set' | 'unset' | 'unfit';
}
