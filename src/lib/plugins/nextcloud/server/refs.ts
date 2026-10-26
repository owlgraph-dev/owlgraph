// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's source record (docs/architecture/plugins.md, "Sources"): never the share's token
// or password, which are sealed apart. The file id is kept beside the share path
// since everyone the file is shared with sees the same id. Read leniently: an
// odd record falls back to unknown rather than failing a page.
import { checkSharePath } from '../sharePath';
import { isUid } from './davRoot';

export type SourceStatus = 'ok' | 'disabled' | 'unconfigured' | 'unauthorized' | 'revoked' | 'notFound' | 'unreachable' | 'tooLarge';

/** Where the picker found an own-files node, for that person alone: never shown, never indexed. */
export interface PathHint {
  path: string;
  uid: string;
}

const STATUSES: ReadonlySet<string> = new Set(['ok', 'disabled', 'unconfigured', 'unauthorized', 'revoked', 'notFound', 'unreachable', 'tooLarge']);

export interface CollectionRef {
  /** '' for the share itself. */
  path: string;
  name: string;
  /** The folder's, once known. */
  fileid: string | null;
  hint: PathHint | null;
  status: SourceStatus;
  checkedAt: string | null;
  /** Entries in the folder when last listed. */
  count: number | null;
}

export interface DocumentRef {
  /** Null for an own-files document. */
  path: string | null;
  /** The server's id of the file: what survives a rename. */
  fileid: string;
  hint: PathHint | null;
  etag: string | null;
  modified: string | null;
  status: SourceStatus;
  checkedAt: string | null;
  /** When last found where expected; kept while it is missing. */
  seenAt: string | null;
  /** The collection whose share holds the file. */
  collectionId: string | null;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statusOf = (value: unknown): SourceStatus => (typeof value === 'string' && STATUSES.has(value) ? (value as SourceStatus) : 'ok');
const pathOf = (value: unknown): string | null => {
  const checked = checkSharePath(value ?? '');
  return 'path' in checked ? checked.path : null;
};

export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,20}$/.test(value);
}

function hintOf(raw: Readonly<Record<string, unknown>>): PathHint | null {
  const path = raw.pathHint === undefined ? null : pathOf(raw.pathHint);
  return path && isUid(raw.hintUid) ? { path, uid: raw.hintUid } : null;
}

export function hintFields(hint: PathHint): { pathHint: string; hintUid: string } {
  return { pathHint: hint.path, hintUid: hint.uid };
}

export function collectionRef(raw: Readonly<Record<string, unknown>>): CollectionRef {
  return {
    path: pathOf(raw.path) ?? '',
    name: text(raw.name) ?? '',
    fileid: isFileId(raw.fileid) ? raw.fileid : null,
    hint: hintOf(raw),
    status: statusOf(raw.status),
    checkedAt: text(raw.checkedAt),
    count: typeof raw.count === 'number' && Number.isInteger(raw.count) && raw.count >= 0 ? raw.count : null,
  };
}

/** Null for a record that names no file. */
export function documentRef(raw: Readonly<Record<string, unknown>>): DocumentRef | null {
  if (!isFileId(raw.fileid)) return null;
  const path = raw.path === undefined || raw.path === null ? null : pathOf(raw.path);
  if (raw.path !== undefined && raw.path !== null && !path) return null;
  return {
    path,
    fileid: raw.fileid,
    hint: hintOf(raw),
    etag: text(raw.etag),
    modified: text(raw.modified),
    status: statusOf(raw.status),
    checkedAt: text(raw.checkedAt),
    seenAt: text(raw.seenAt),
    collectionId: typeof raw.collectionId === 'string' && UUID.test(raw.collectionId) ? raw.collectionId : null,
  };
}
