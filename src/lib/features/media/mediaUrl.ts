// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The one place a page asset's URL is built, for the editor and the page alike.
// Client-safe.

const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a value may be stored as a reference to an asset: a uuid. */
export function isAssetId(v: unknown): v is string {
  return typeof v === 'string' && ASSET_ID.test(v);
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}

/** A fixed ladder, so a page can't make the server store any number of sizes (docs/architecture/media.md). */
export const MEDIA_WIDTHS: readonly number[] = [320, 640, 960, 1280, 1920, 2560];

export function mediaVariantUrl(id: string, width: number): string {
  return `${mediaUrl(id)}?w=${width}`;
}
