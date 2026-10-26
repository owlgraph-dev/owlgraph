// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Uploading the site logos: the light one (a site setting) and the dark one (the
// site theme). The only place SVG is accepted, so the only module needing the
// SVG sanitizer and jsdom: it stays out of the barrel (server.ts), which the MCP
// server and every logo-rendering route import.
import { db } from '$lib/platform/db.server';
import { createImageAsset, matchesImageType, ALLOWED_IMAGE_MIME, MAX_IMAGE_BYTES } from '$lib/features/media/server';
import { sanitizeSvg, SvgRejectedError } from '$lib/platform/svgSanitize.server';
import { logEvent, logger } from '$lib/platform/logger.server';
import type { JsonArg } from '$lib/platform/db.server';
import type { StoredTheme } from '$lib/design-system/theme/siteTheme';
import { getLogoAssetId } from './branding.server';
import { getSiteTheme, SITE_THEME_CONFLICT } from './theme.server';
import { CodedError } from '$lib/platform/codedError';

const ALLOWED_LOGO_MIME = new Set([...ALLOWED_IMAGE_MIME, 'image/svg+xml']);
const MAX_LOGO_BYTES = MAX_IMAGE_BYTES;

interface LogoUpload {
  bytes: Buffer;
  mime: string;
  createdBy: string | null;
}

/** Checks type and size, and sanitizes an SVG: the bytes that may be stored. */
function acceptLogo({ bytes, mime }: LogoUpload): Buffer {
  if (!ALLOWED_LOGO_MIME.has(mime)) {
    logEvent(logger, 'upload.rejected', { kind: 'logo', reason: 'type', bytes: bytes.length });
    throw new CodedError('unsupported_file_type', `Unsupported image type: ${mime || 'unknown'}`, { type: mime || 'unknown' });
  }
  if (bytes.length > MAX_LOGO_BYTES) {
    logEvent(logger, 'upload.rejected', { kind: 'logo', reason: 'size', bytes: bytes.length });
    throw new CodedError('too_large', `Image too large (max ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)} MB).`, { limit: Math.round(MAX_LOGO_BYTES / 1024 / 1024) });
  }
  if (mime !== 'image/svg+xml') {
    if (!matchesImageType(mime, bytes)) {
      logEvent(logger, 'upload.rejected', { kind: 'logo', reason: 'content', bytes: bytes.length });
      throw new CodedError('invalid_file_content', `Not a ${mime} file.`);
    }
    return bytes;
  }
  let clean: Buffer;
  try {
    clean = Buffer.from(sanitizeSvg(bytes.toString('utf-8')), 'utf-8');
  } catch (e) {
    if (e instanceof SvgRejectedError) {
      logEvent(logger, 'sanitizer.rejected', { kind: 'svg', reason: 'not-an-svg-after-sanitize' });
      throw new CodedError('invalid_svg', 'That SVG could not be safely processed.');
    }
    throw e;
  }
  if (clean.length > MAX_LOGO_BYTES) throw new CodedError('too_large', 'Image too large after processing.');
  return clean;
}

// Insert, repoint and delete the old row in one transaction, so a replace never leaves an orphan.
export async function replaceLogo(upload: LogoUpload): Promise<{ id: string }> {
  const bytes = acceptLogo(upload);
  const previousId = await getLogoAssetId();
  return db.begin(async (sql) => {
    const { id } = await createImageAsset(
      { bytes, mime: upload.mime, ownerPageId: null, createdBy: upload.createdBy, kind: 'logo', scope: 'global' },
      sql
    );
    // setSetting's upsert, inlined: setSetting is bound to the pool, not this transaction.
    await sql`
      insert into site_settings (key, value) values ('logo_asset_id', ${id})
      on conflict (key) do update set value = excluded.value`;
    if (previousId) await sql`delete from assets where id = ${previousId}`;
    return { id };
  });
}

/** As replaceLogo, for the dark logo, which the site theme points at (logoDarkAssetId). */
export async function replaceDarkLogo(upload: LogoUpload): Promise<{ id: string }> {
  const bytes = acceptLogo(upload);
  const { theme } = await getSiteTheme();
  const previousId = theme.logoDarkAssetId ?? null;
  return db.begin(async (sql) => {
    const { id } = await createImageAsset({ bytes, mime: upload.mime, ownerPageId: null, createdBy: upload.createdBy, kind: 'logo', scope: 'global' }, sql);
    const next: StoredTheme = { ...theme, logoDarkAssetId: id };
    await sql`
      insert into themes (scope_kind, tokens) values ('site', ${sql.json(next as unknown as JsonArg)})
      on conflict ${sql.unsafe(SITE_THEME_CONFLICT)} do update set tokens = excluded.tokens, updated_at = now()`;
    if (previousId) await sql`delete from assets where id = ${previousId}`;
    return { id };
  });
}
