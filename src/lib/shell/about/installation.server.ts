// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The About page's admin half: only what the server already knows. What
// nothing records (the last backup, a key's rotation) is left out, not guessed.
// Never a credential, a settings value beyond a service host, or a character
// of APP_SECRET_KEY: only whether it is there and fit.
import { join } from 'node:path';
import { db } from '$lib/platform/db.server';
import { appVersion } from '$lib/platform/logger.server';
import { migrationStatus } from '$lib/platform/migrate.server';
import { sourceInfo } from '$lib/platform/source.server';
import { secretKeySummary } from '$lib/platform/secretBox.server';
import { currentSiteLocaleConfig } from '$lib/platform/i18n/siteLocales.server';
import { countConnections, getPluginSettings, pluginOrigin } from '$lib/features/pluginHost/server';
import { PLUGINS } from '$lib/plugins';
import type { PluginManifest } from '$lib/plugins/api';
import type { InstallationInfo, IntegrationState } from './types';

async function integrationState(plugin: PluginManifest): Promise<IntegrationState> {
  const [settings, origin, connections] = await Promise.all([
    getPluginSettings(plugin),
    pluginOrigin(plugin),
    plugin.connections ? countConnections(plugin.id) : Promise.resolve(null),
  ]);
  return { id: plugin.id, enabled: settings.enabled, host: origin ? new URL(origin).host : null, connections };
}

const SECRET_KEY = { '(set)': 'set', '(unset)': 'unset', '(unfit)': 'unfit' } as const;

export async function installationInfo(url: URL): Promise<InstallationInfo> {
  const [[{ server_version }], schema, languages, integrations] = await Promise.all([
    db<{ server_version: string }[]>`show server_version`,
    // The shipped migrations sit in the working directory (the image's /app).
    migrationStatus(db, join(process.cwd(), 'migrations')),
    currentSiteLocaleConfig(),
    Promise.all((PLUGINS as readonly PluginManifest[]).map(integrationState)),
  ]);
  return {
    version: appVersion(),
    revision: sourceInfo().revision,
    node: process.version,
    postgres: server_version,
    origin: url.origin,
    schema,
    languages,
    integrations,
    secretKey: SECRET_KEY[secretKeySummary()],
  };
}
