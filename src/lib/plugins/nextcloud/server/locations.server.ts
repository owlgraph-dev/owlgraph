// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Where a node's root lies in one person's files (locate.server.ts), held so
// pages don't search each time. Keyed by their connection first and never read
// for anyone else; a connection made anew has a new id and misses.
const FOUND_MS = 10 * 60_000;
/** Not among their files: asked again soon, since it may have been shared with them since. */
const MISSING_MS = 30_000;
const MAX_LOCATIONS = 2000;

export interface Location {
  /** Null when it is not among their files. */
  path: string | null;
  /** When found or last confirmed by its id, ms since the epoch. */
  checkedAt: number;
}

const locations = new Map<string, Location & { at: number }>();

const keyOf = (connectionId: string, fileid: string) => `${connectionId}\n${fileid}`;

export function heldLocation(connectionId: string, fileid: string, now: number = Date.now()): Location | null {
  const key = keyOf(connectionId, fileid);
  const held = locations.get(key);
  if (!held) return null;
  if (now - held.at >= (held.path === null ? MISSING_MS : FOUND_MS)) {
    locations.delete(key);
    return null;
  }
  return held;
}

export function rememberLocation(connectionId: string, fileid: string, path: string | null, now: number = Date.now()): void {
  const key = keyOf(connectionId, fileid);
  locations.delete(key);
  locations.set(key, { path, at: now, checkedAt: now });
  if (locations.size > MAX_LOCATIONS) locations.delete(locations.keys().next().value!);
}

export function confirmLocation(connectionId: string, fileid: string, now: number = Date.now()): void {
  const held = locations.get(keyOf(connectionId, fileid));
  if (held) held.checkedAt = now;
}

export function forgetLocation(connectionId: string, fileid: string): void {
  locations.delete(keyOf(connectionId, fileid));
}

/** For a connection Nextcloud refused. */
export function forgetConnectionLocations(connectionId: string): void {
  for (const key of locations.keys()) if (key.startsWith(`${connectionId}\n`)) locations.delete(key);
}

/** For tests. */
export function clearLocations(): void {
  locations.clear();
}
