// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Self-hosted custom font families: woff2 uploads stored as global assets, with
// their family, weight and style in font_families/font_variants.
import { db } from '$lib/platform/db.server';
import { logEvent, logger } from '$lib/platform/logger.server';
import { createImageAsset } from '$lib/features/media/server';
import { FONT_STACKS, type CustomFontEntry } from './fonts';
import { CodedError } from '$lib/platform/codedError';

const MAX_FONT_BYTES = 5 * 1024 * 1024; // 5 MB

// The "wOF2" signature: browsers often send no MIME type for a picked font file.
export function isWoff2(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x77 && // w
    bytes[1] === 0x4f && // O
    bytes[2] === 0x46 && // F
    bytes[3] === 0x32 // 2
  );
}

// The name is interpolated unescaped into the @font-face <style> every page
// injects via {@html}: an unrestricted name would be a stored injection vector.
const FAMILY_NAME_RE = /^[\p{L}\p{N} '-]{1,64}$/u;
export function isValidFamilyName(name: string): boolean {
  return FAMILY_NAME_RE.test(name);
}

export function isValidWeight(weight: number): boolean {
  return Number.isInteger(weight) && weight >= 100 && weight <= 900;
}

export function isValidStyle(style: string): style is 'normal' | 'italic' {
  return style === 'normal' || style === 'italic';
}

export interface FontVariant {
  id: string;
  assetId: string;
  weight: number;
  style: 'normal' | 'italic';
  size: number;
}
export interface FontFamily {
  id: string;
  name: string;
  variants: FontVariant[];
}

export async function listFontFamilies(): Promise<FontFamily[]> {
  const rows = await db<
    { family_id: string; family_name: string; variant_id: string | null; asset_id: string | null; weight: number | null; style: string | null; size: number | null }[]
  >`
    select ff.id as family_id, ff.name as family_name,
           fv.id as variant_id, fv.asset_id, fv.weight, fv.style, a.size
    from font_families ff
    left join font_variants fv on fv.family_id = ff.id
    left join assets a on a.id = fv.asset_id
    order by ff.name, fv.weight, fv.style`;

  const byId = new Map<string, FontFamily>();
  for (const r of rows) {
    let family = byId.get(r.family_id);
    if (!family) {
      family = { id: r.family_id, name: r.family_name, variants: [] };
      byId.set(r.family_id, family);
    }
    if (r.variant_id && r.asset_id && r.weight != null && r.style && r.size != null) {
      family.variants.push({ id: r.variant_id, assetId: r.asset_id, weight: r.weight, style: r.style as 'normal' | 'italic', size: r.size });
    }
  }
  return [...byId.values()];
}

export async function createFontFamily(name: string, createdBy: string | null): Promise<{ id: string }> {
  if (!isValidFamilyName(name)) {
    throw new CodedError('invalid_family_name', 'Family names may only contain letters, numbers, spaces, hyphens, and apostrophes (max 64 characters).');
  }
  const [row] = await db<{ id: string }[]>`
    insert into font_families (name, created_by) values (${name}, ${createdBy}) returning id`;
  return { id: row.id };
}

export async function addFontVariant(opts: {
  familyId: string;
  bytes: Buffer;
  weight: number;
  style: string;
  createdBy: string | null;
}): Promise<{ id: string }> {
  // The magic-byte check is 'content': the file claimed to be a font and is not.
  if (!isWoff2(opts.bytes)) {
    logEvent(logger, 'upload.rejected', { kind: 'font', reason: 'content', bytes: opts.bytes.length });
    throw new CodedError('invalid_font_file', 'That file is not a valid woff2 font.');
  }
  if (opts.bytes.length > MAX_FONT_BYTES) {
    logEvent(logger, 'upload.rejected', { kind: 'font', reason: 'size', bytes: opts.bytes.length });
    throw new CodedError('too_large', `Font file too large (max ${Math.round(MAX_FONT_BYTES / 1024 / 1024)} MB).`, { limit: Math.round(MAX_FONT_BYTES / 1024 / 1024) });
  }
  if (!isValidWeight(opts.weight)) {
    logEvent(logger, 'upload.rejected', { kind: 'font', reason: 'type', bytes: opts.bytes.length });
    throw new CodedError('invalid_font_weight', 'Weight must be between 100 and 900.');
  }
  if (!isValidStyle(opts.style)) {
    logEvent(logger, 'upload.rejected', { kind: 'font', reason: 'type', bytes: opts.bytes.length });
    throw new CodedError('invalid_font_style', 'Style must be "normal" or "italic".');
  }

  try {
    return await db.begin(async (sql) => {
      const { id: assetId } = await createImageAsset(
        { bytes: opts.bytes, mime: 'font/woff2', ownerPageId: null, createdBy: opts.createdBy, kind: 'font', scope: 'global' },
        sql
      );
      const [row] = await sql<{ id: string }[]>`
        insert into font_variants (family_id, asset_id, weight, style)
        values (${opts.familyId}, ${assetId}, ${opts.weight}, ${opts.style})
        returning id`;
      return { id: row.id };
    });
  } catch (e) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new CodedError('font_variant_taken', 'This family already has a variant with that weight and style.');
    }
    throw e;
  }
}

// assets has no FK back to font_variants, so its row is deleted explicitly.
export async function removeFontVariant(variantId: string): Promise<void> {
  await db.begin(async (tx) => {
    const [row] = await tx<{ asset_id: string }[]>`delete from font_variants where id = ${variantId} returning asset_id`;
    if (row) await tx`delete from assets where id = ${row.asset_id}`;
  });
}

export async function removeFontFamily(familyId: string): Promise<void> {
  await db.begin(async (tx) => {
    const variantAssets = await tx<{ asset_id: string }[]>`select asset_id from font_variants where family_id = ${familyId}`;
    for (const { asset_id } of variantAssets) {
      await tx`delete from assets where id = ${asset_id}`;
    }
    // The variants go by the family_id cascade; their assets rows hold the bytes.
    await tx`delete from font_families where id = ${familyId}`;
  });
}

// Namespaced so it never collides with a built-in FontId.
function customFontId(familyId: string): string {
  return `custom:${familyId}`;
}

// font-display: swap renders the fallback stack at once and swaps when the face loads.
export async function getFontFaceCss(): Promise<string> {
  const families = await listFontFamilies();
  const rules: string[] = [];
  for (const family of families) {
    for (const v of family.variants) {
      rules.push(
        `@font-face{font-family:'${family.name}';font-weight:${v.weight};font-style:${v.style};font-display:swap;src:url('/api/media/fonts/${v.assetId}') format('woff2');}`
      );
    }
  }
  return rules.join('');
}

// One entry per family, not per variant: the browser matches weight and style
// against the family's registered faces.
export async function getCustomFontEntries(): Promise<CustomFontEntry[]> {
  const families = await listFontFamilies();
  return families
    .filter((f) => f.variants.length > 0)
    .map((f) => ({ id: customFontId(f.id), name: f.name, stack: `'${f.name}', ${FONT_STACKS.sans}` }));
}
