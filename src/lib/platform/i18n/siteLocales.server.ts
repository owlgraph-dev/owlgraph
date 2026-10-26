// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The site's languages as site_settings stores them. Every rendered request
// reads them, so they are cached: refreshed by a save in this process, else
// re-read after the TTL, which picks up another process's change too.
import { db } from '$lib/platform/db.server';
import { CodedError } from '$lib/platform/codedError';
import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  normalizeSiteLocaleConfig,
  setSiteLocaleConfig,
  siteLocaleConfig,
  type SiteLocaleConfig,
} from './siteLocales';

const ENABLED_KEY = 'locales_enabled';
const DEFAULT_KEY = 'locale_default';
const TTL_MS = 10_000;

let loadedAt = 0;
let inflight: Promise<SiteLocaleConfig> | null = null;

function parseEnabled(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Reads the configuration fresh, makes it current, and returns it. */
export async function loadSiteLocaleConfig(): Promise<SiteLocaleConfig> {
  const rows = await db<{ key: string; value: string }[]>`
    select key, value from site_settings where key in (${ENABLED_KEY}, ${DEFAULT_KEY})`;
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const config = normalizeSiteLocaleConfig({ enabled: parseEnabled(byKey.get(ENABLED_KEY)), defaultLocale: byKey.get(DEFAULT_KEY) });
  setSiteLocaleConfig(config);
  loadedAt = Date.now();
  return config;
}

/** A failed re-read keeps the last good value rather than failing the request. */
export async function currentSiteLocaleConfig(): Promise<SiteLocaleConfig> {
  if (Date.now() - loadedAt < TTL_MS) return siteLocaleConfig();
  inflight ??= loadSiteLocaleConfig().finally(() => {
    inflight = null;
  });
  try {
    return await inflight;
  } catch {
    return siteLocaleConfig();
  }
}

/** Refuses an empty set, an unknown code and a default not enabled: the server's guard. */
export async function saveSiteLocaleConfig(input: { enabled: readonly string[]; defaultLocale: string }): Promise<SiteLocaleConfig> {
  const enabled = SUPPORTED_LOCALES.filter((l) => input.enabled.includes(l));
  if (input.enabled.some((l) => !isSupportedLocale(l))) throw new CodedError('unknown_locale', 'Unknown language.');
  if (enabled.length === 0) throw new CodedError('language_required', 'At least one language must stay enabled.');
  if (!isSupportedLocale(input.defaultLocale) || !enabled.includes(input.defaultLocale)) {
    throw new CodedError('default_language_disabled', 'The default language must be one of the enabled languages.');
  }
  await db.begin(async (sql) => {
    await sql`
      insert into site_settings (key, value) values (${ENABLED_KEY}, ${JSON.stringify(enabled)})
      on conflict (key) do update set value = excluded.value`;
    await sql`
      insert into site_settings (key, value) values (${DEFAULT_KEY}, ${input.defaultLocale})
      on conflict (key) do update set value = excluded.value`;
  });
  return loadSiteLocaleConfig();
}
