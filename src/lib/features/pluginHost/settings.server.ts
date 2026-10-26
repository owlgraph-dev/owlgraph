// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A plugin's settings as site_settings stores them (key `plugin:<id>`). Read on
// every request a plugin serves, so cached in-process: a save here drops the
// entry, and a change made elsewhere (another process, an e2e reset) shows after a few seconds.
import { getSetting, setSetting } from '$lib/platform/settings.server';
import { loopbackHttpAllowed, parseUpstreamOrigin } from '$lib/platform/upstream.server';
import { PLUGINS } from '$lib/plugins';
import type { PluginManifest, PluginSettings } from '$lib/plugins/api';
import { originOf, storedSettings } from './settingsFields.server';

const TTL_MS = 10_000;
const cache = new Map<string, { at: number; settings: PluginSettings }>();

const keyOf = (pluginId: string) => `plugin:${pluginId}`;

/** A plugin without a settings section is always on. */
export async function getPluginSettings(manifest: PluginManifest): Promise<PluginSettings> {
  if (!manifest.settings) return { enabled: true, values: {} };
  const hit = cache.get(manifest.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.settings;
  const raw = await getSetting(keyOf(manifest.id));
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  const settings = storedSettings(manifest.settings, parsed, { allowLoopbackHttp: loopbackHttpAllowed() });
  cache.set(manifest.id, { at: Date.now(), settings });
  return settings;
}

/** The editor offers these plugins' blocks (docs/architecture/blocks/node-embeds.md, "One family in the editor"). */
export async function enabledPlugins(): Promise<string[]> {
  const on: string[] = [];
  for (const plugin of PLUGINS as readonly PluginManifest[]) if ((await getPluginSettings(plugin)).enabled) on.push(plugin.id);
  return on;
}

/**
 * The service address as configured now; null while the plugin is off or has none. Re-checked at
 * use: a stored loopback origin stops working once the deployment no longer allows it.
 */
export async function pluginOrigin(manifest: PluginManifest): Promise<string | null> {
  if (!manifest.settings) return null;
  const settings = await getPluginSettings(manifest);
  const origin = settings.enabled ? originOf(manifest.settings, settings) : null;
  if (!origin) return null;
  const parsed = parseUpstreamOrigin(origin, { allowLoopbackHttp: loopbackHttpAllowed() });
  return 'origin' in parsed ? parsed.origin : null;
}

/** Stores settings already validated (validateSettings) and returns them as read back. */
export async function savePluginSettings(manifest: PluginManifest, settings: PluginSettings): Promise<PluginSettings> {
  await setSetting(keyOf(manifest.id), JSON.stringify({ enabled: settings.enabled, values: settings.values }));
  cache.delete(manifest.id);
  return getPluginSettings(manifest);
}
