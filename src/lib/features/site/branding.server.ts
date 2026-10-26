// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Site-wide branding: the logos and the interface font. The logo is an `assets`
// row (kind 'logo', scope 'global') that the 'logo_asset_id' setting points at.
// The upload lives in logoUpload.server.ts, so importers of this never load jsdom.
import { db } from '$lib/platform/db.server';
import { getSetting, setSetting } from '$lib/platform/settings.server';
import { getAssetMeta } from '$lib/features/media/server';
import type { JsonArg } from '$lib/platform/db.server';
import { getSiteTheme } from './theme.server';

export interface CurrentLogo {
  id: string;
  mime: string;
}

export async function getLogoAssetId(): Promise<string | null> {
  return getSetting('logo_asset_id');
}

export async function getCurrentLogo(): Promise<CurrentLogo | null> {
  const id = await getLogoAssetId();
  if (!id) return null;
  const meta = await getAssetMeta(id);
  // A dangling pointer must not break every page load.
  return meta ? { id: meta.id, mime: meta.mime } : null;
}

export async function removeLogo(): Promise<void> {
  const id = await getLogoAssetId();
  if (!id) return;
  await db.begin(async (sql) => {
    await sql`delete from site_settings where key = 'logo_asset_id'`;
    await sql`delete from assets where id = ${id}`;
  });
}

// The interface's font, independent of the content's 'body' role. A built-in
// FontId or a `custom:<id>` ref, resolved to a stack at render time.
export async function getUiFontFamily(): Promise<string | null> {
  return getSetting('ui_font_family');
}

export async function setUiFontFamily(family: string | null): Promise<void> {
  await setSetting('ui_font_family', family);
}

/** Removes the dark-scheme logo (theme.server.ts, logoDarkAssetId) and its asset. */
export async function removeDarkLogo(): Promise<void> {
  const { theme } = await getSiteTheme();
  const id = theme.logoDarkAssetId;
  if (!id) return;
  await db.begin(async (sql) => {
    await sql`update themes set tokens = ${sql.json({ ...theme, logoDarkAssetId: null } as unknown as JsonArg)}, updated_at = now() where scope_kind = 'site'`;
    await sql`delete from assets where id = ${id}`;
  });
}
