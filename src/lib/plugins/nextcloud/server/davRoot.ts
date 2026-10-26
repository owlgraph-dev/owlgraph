// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The WebDAV roots: a public share's (Nextcloud 29+) and a person's own files,
// which hold what was shared with them too. A path is checked (sharePath.ts)
// before it becomes an address; an href is believed only inside the root asked
// of, its uid compared decoded since Nextcloud writes it encoded.
import { checkSharePath, isShareToken } from '../sharePath';

export type DavRoot = { kind: 'share'; token: string } | { kind: 'user'; uid: string };

export const SHARE_PREFIX = '/public.php/dav/files/';
export const USER_PREFIX = '/remote.php/dav/files/';
export const SEARCH_PATH = '/remote.php/dav/';

/** What Nextcloud allows in a user id: letters, digits, space and _ . @ - ', at most 64, never dots alone. */
const UID = /^[A-Za-z0-9 _.@'-]{1,64}$/;

export function isUid(value: unknown): value is string {
  return typeof value === 'string' && UID.test(value) && !/^\.+$/.test(value);
}

/** Encoded, without a trailing slash; throws for an unchecked token or uid. */
function prefixOf(root: DavRoot): string {
  if (root.kind === 'share') {
    if (!isShareToken(root.token)) throw new Error('davPath: not a share token');
    return `${SHARE_PREFIX}${root.token}`;
  }
  if (!isUid(root.uid)) throw new Error('davPath: not a user id');
  return `${USER_PREFIX}${encodeURIComponent(root.uid)}`;
}

/** Every segment encoded; throws for an unchecked root or path. */
export function davPath(root: DavRoot, path: string): string {
  const checked = checkSharePath(path);
  if ('problem' in checked) throw new Error(`davPath: ${checked.problem} path`);
  const encoded = checked.path === '' ? '' : checked.path.split('/').map(encodeURIComponent).join('/');
  return `${prefixOf(root)}/${encoded}`;
}

export function searchScope(uid: string): string {
  if (!isUid(uid)) throw new Error('searchScope: not a user id');
  return `/files/${encodeURIComponent(uid)}`;
}

function decoded(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** The path inside `root` an answer's href names; null outside the root or for no valid path. */
export function pathOfHref(href: string, root: DavRoot): string | null {
  let pathname = href.trim();
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return null;
    }
  }
  let rest: string;
  if (root.kind === 'share') {
    const prefix = `${SHARE_PREFIX}${root.token}`;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
    rest = pathname.slice(prefix.length);
  } else {
    if (!pathname.startsWith(USER_PREFIX)) return null;
    const after = pathname.slice(USER_PREFIX.length);
    const slash = after.indexOf('/');
    const uid = decoded(slash === -1 ? after : after.slice(0, slash));
    if (uid === null || uid !== root.uid) return null;
    rest = slash === -1 ? '' : after.slice(slash);
  }
  rest = rest.replace(/^\/+/, '').replace(/\/+$/, '');
  if (rest === '') return '';
  const segments: string[] = [];
  for (const raw of rest.split('/')) {
    const segment = decoded(raw);
    if (segment === null || segment.includes('/')) return null;
    segments.push(segment);
  }
  const checked = checkSharePath(segments.join('/'));
  return 'path' in checked ? checked.path : null;
}
