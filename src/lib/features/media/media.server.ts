// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Asset storage. The bytes live in `assets.bytes`; object storage would change
// only the put and get here.
import { createHash } from 'node:crypto';
import { db, type TxSql } from '$lib/platform/db.server';
import { prepareImage, hasVariants, renderVariant } from './images.server';
import { CodedError } from '$lib/platform/codedError';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// Raster only: an SVG can carry script.
export const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// The declared type is the client's claim; the bytes must carry its signature,
// so "raster only" holds for what is stored, not just what was declared.
const IMAGE_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** Whether the bytes carry the signature of the raster type they were declared as. */
export function matchesImageType(mime: string, bytes: Buffer): boolean {
  return IMAGE_SIGNATURES[mime]?.(bytes) ?? false;
}


export interface AssetMeta {
  id: string;
  kind: string;
  mime: string;
  size: number;
  scope: string;
  owner_page_id: string | null;
  owner_user_id: string | null;
  /** Its size in pixels, upright; null when it isn't a raster image or hasn't been measured. */
  width: number | null;
  height: number | null;
  /** The stored bytes' hash: what their ETag is made of. */
  sha256: string;
}

export async function createImageAsset(
  opts: {
    bytes: Buffer;
    mime: string;
    ownerPageId: string | null;
    createdBy: string | null;
    kind?: string;
    scope?: string;
    ownerUserId?: string | null;
  },
  sql: TxSql = db
): Promise<{ id: string; size: AssetSize | null }> {
  // Stored upright, without a photo's metadata, and measured (docs/architecture/media.md).
  const { bytes, width, height } = await prepareImage(opts.bytes, opts.mime).catch(() => {
    // Bytes that carry an image type's signature but don't decode as one.
    throw new CodedError('invalid_image', 'Not a readable image.');
  });
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const kind = opts.kind ?? 'image';
  const scope = opts.scope ?? 'page';
  const ownerUserId = opts.ownerUserId ?? null;
  const [row] = await sql<{ id: string }[]>`
    insert into assets (kind, mime, size, bytes, sha256, scope, owner_page_id, owner_user_id, created_by, width, height)
    values (${kind}, ${opts.mime}, ${bytes.length}, ${bytes}, ${sha256}, ${scope}, ${opts.ownerPageId}, ${ownerUserId}, ${opts.createdBy}, ${width}, ${height})
    returning id`;
  return { id: row.id, size: width && height ? { width, height, variants: hasVariants(opts.mime) } : null };
}

export async function getAssetMeta(id: string): Promise<AssetMeta | null> {
  const [row] = await db<AssetMeta[]>`
    select id, kind, mime, size, scope, owner_page_id, owner_user_id, width, height, sha256 from assets where id = ${id}`;
  return row ?? null;
}

/** Whether a request for `width` gets a copy: a still image wider than that (docs/architecture/media.md). */
export function servesCopy(meta: AssetMeta, width: number | null): boolean {
  return width !== null && meta.width !== null && width < meta.width && hasVariants(meta.mime);
}

/** The image's hash, plus the width for a copy: a copy is made from the image alone. */
export function assetEtag(meta: AssetMeta, width: number | null): string {
  return servesCopy(meta, width) ? `"${meta.sha256}-w${width}"` : `"${meta.sha256}"`;
}

/** An image's size, as a renderer offers its copies (docs/architecture/media.md). */
export interface AssetSize {
  width: number;
  height: number;
  /** Whether copies are made of it (a still raster); an animation is served whole. */
  variants: boolean;
}

/** The measured sizes of the images among `ids`, by id. */
export async function getAssetSizes(ids: Iterable<string>): Promise<Record<string, AssetSize>> {
  const list = [...ids];
  if (list.length === 0) return {};
  const rows = await db<{ id: string; mime: string; width: number; height: number }[]>`
    select id, mime, width, height from assets where id = any(${list}::uuid[]) and width is not null`;
  return Object.fromEntries(rows.map((r) => [r.id, { width: r.width, height: r.height, variants: hasVariants(r.mime) }]));
}

// A second request for a copy being made waits for the first.
const making = new Map<string, Promise<{ mime: string; bytes: Buffer } | null>>();

/**
 * An image's WebP copy at `width`, made and stored on first request. Null for an
 * animation or a missing image. The caller has already checked the viewer may see it.
 */
export async function getImageVariant(id: string, width: number): Promise<{ mime: string; bytes: Buffer } | null> {
  const [stored] = await db<{ mime: string; bytes: Buffer }[]>`
    select mime, bytes from asset_variants where asset_id = ${id} and width = ${width}`;
  if (stored) return { mime: stored.mime, bytes: Buffer.from(stored.bytes) };
  const key = `${id}:${width}`;
  let pending = making.get(key);
  if (!pending) {
    pending = makeVariant(id, width).finally(() => making.delete(key));
    making.set(key, pending);
  }
  return pending;
}

async function makeVariant(id: string, width: number): Promise<{ mime: string; bytes: Buffer } | null> {
  const original = await getAssetBytes(id);
  if (!original || !hasVariants(original.mime)) return null;
  const copy = await renderVariant(original.bytes, width);
  if (!copy) return null;
  await db`
    insert into asset_variants (asset_id, width, mime, size, bytes)
    values (${id}, ${width}, ${copy.mime}, ${copy.bytes.length}, ${copy.bytes})
    on conflict do nothing`;
  return copy;
}

export async function getAssetBytes(id: string): Promise<{ mime: string; size: number; bytes: Buffer } | null> {
  const [row] = await db<{ mime: string; size: number; bytes: Buffer }[]>`
    select mime, size, bytes from assets where id = ${id}`;
  if (!row) return null;
  return { mime: row.mime, size: row.size, bytes: Buffer.from(row.bytes) };
}

// The response of every asset-serving route; each route does its own lookup and
// authorization. An SVG opened directly runs on the app's origin: this policy
// keeps it inert even if the sanitizer lets something through.
const SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

export function servePublicAssetBytes(
  data: { mime: string; bytes: Buffer },
  opts: { cacheControl?: string; etag?: string } = {}
): Response {
  // A fresh copy: a pooled Buffer's offset would desync content-length.
  const body = new Uint8Array(data.bytes);
  const headers: Record<string, string> = {
    'content-type': data.mime,
    'content-length': String(body.byteLength),
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
    'cache-control': opts.cacheControl ?? 'public, max-age=31536000, immutable',
  };
  if (opts.etag) headers['etag'] = opts.etag;
  if (data.mime === 'image/svg+xml') headers['content-security-policy'] = SVG_CSP;
  return new Response(body, { headers });
}

/** Which of `ids` are page assets owned by `pageId` — what content written on its behalf may reference. */
export async function pageOwnedAssetIds(pageId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db<{ id: string }[]>`
    select id from assets where id = any(${[...ids]}::uuid[]) and scope = 'page' and owner_page_id = ${pageId}`;
  return new Set(rows.map((r) => r.id));
}

// Deletes the page's own assets its doc no longer references, on every doc
// write (persistDocTx). Shared assets are never touched.
export async function reconcilePageAssets(pageId: string, referencedIds: Set<string>, sql: TxSql = db): Promise<number> {
  const owned = await sql<{ id: string }[]>`
    select id from assets where owner_page_id = ${pageId} and scope = 'page'`;
  const orphans = owned.filter((a) => !referencedIds.has(a.id));
  for (const a of orphans) {
    await sql`delete from assets where id = ${a.id}`;
  }
  return orphans.length;
}
