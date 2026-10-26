// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Where a node's root lies in the viewer's own files: searched by its file id
// across what they own and what was shared with them; failing that, at the
// picker's path hint when the picker is asking (storage the search misses).
import type { PluginHost } from '$lib/plugins/api';
import { propfind, searchById, type DavProblem, type UserAccess } from './client.server';
import { confirmLocation, forgetConnectionLocations, forgetLocation, heldLocation, rememberLocation } from './locations.server';
import type { PathHint } from './refs';

/** A location older than this is confirmed by its id before it is used. */
const CONFIRM_AFTER_MS = 60_000;

export type Located = { ok: true; path: string } | { ok: false; problem: DavProblem };

/** Whether `path` holds `fileid`, or why that couldn't be told. */
async function holds(host: PluginHost, access: UserAccess, path: string, fileid: string, operation: string): Promise<boolean | DavProblem> {
  const looked = await propfind(host, access, path, 0, operation);
  if (!looked.ok) return looked.problem === 'notFound' ? false : looked.problem;
  return looked.entries.find((e) => e.path === path)?.fileid === fileid;
}

/** For an entry found at several paths: the shortest, then the first in order. */
function pick(paths: string[]): string | null {
  return [...paths].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null;
}

/** `fresh` skips the held location, such as one just found wrong. */
export async function locate(host: PluginHost, access: UserAccess, fileid: string, opts: { hint?: PathHint | null; operation: string; fresh?: boolean }): Promise<Located> {
  const connectionId = access.connection.id;
  const failed = (problem: DavProblem): Located => {
    if (problem === 'refused') forgetConnectionLocations(connectionId);
    return { ok: false, problem };
  };
  if (!opts.fresh) {
    const held = heldLocation(connectionId, fileid);
    if (held?.path === null) return { ok: false, problem: 'notFound' };
    if (held && held.path !== null) {
      if (Date.now() - held.checkedAt < CONFIRM_AFTER_MS) return { ok: true, path: held.path };
      const still = await holds(host, access, held.path, fileid, `${opts.operation}:confirm`);
      if (still === true) {
        confirmLocation(connectionId, fileid);
        return { ok: true, path: held.path };
      }
      if (still !== false) return failed(still);
    }
  }
  forgetLocation(connectionId, fileid);
  const found = await searchById(host, access, fileid, `${opts.operation}:search`);
  if (!found.ok) return failed(found.problem);
  let path = pick(found.entries.filter((e) => e.fileid === fileid).map((e) => e.path));
  if (path === null && opts.hint && opts.hint.uid === access.root.uid) {
    const atHint = await holds(host, access, opts.hint.path, fileid, `${opts.operation}:hint`);
    if (atHint === true) path = opts.hint.path;
    else if (atHint !== false) return failed(atHint);
  }
  rememberLocation(connectionId, fileid, path);
  return path === null ? { ok: false, problem: 'notFound' } : { ok: true, path };
}
