// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The type-agnostic version store: it owns identity, order, lineage, author and
// kind (node_versions); each registered type stores its own payload. Diff and
// cherry-pick are per-type, on top (pageDiff.ts).
import { db, type TxSql } from '$lib/platform/db.server';

export type VersionKind = 'autosave' | 'manual' | 'lost_draft';

/** The keys of the unknown blocks a restore's caller agrees to lose. */
export interface RestoreOptions {
  acknowledgeDropped?: readonly string[];
}

export interface VersionedType {
  // An upsert keyed by versionId: an autosave collapse overwrites in place.
  writePayload(sql: TxSql, versionId: string, payload: unknown): Promise<void>;
  readPayload(sql: TxSql, versionId: string): Promise<unknown>;
  // For restore: through the type's normal write path, its version capture and
  // its refusals (a page's unknownGuard.ts) included.
  applyCurrent(nodeId: string, payload: unknown, authorId: string | null, opts?: RestoreOptions): Promise<void>;
}

const registry = new Map<string, VersionedType>();
export function registerVersionedType(nodeType: string, impl: VersionedType) {
  registry.set(nodeType, impl);
}
function impl(nodeType: string): VersionedType {
  const t = registry.get(nodeType);
  if (!t) throw new Error(`no versioned-type implementation registered for '${nodeType}'`);
  return t;
}

// Autosaves by the same author within this window overwrite the latest version,
// so it always equals the newest save without unbounded rows. 'manual' and
// 'lost_draft' always insert.
const AUTOSAVE_COLLAPSE_SECONDS = 120;

export interface CaptureInput {
  nodeType: string;
  nodeId: string;
  payload: unknown;
  kind?: VersionKind;
  authorId?: string | null;
  baseVersionId?: string | null;
}

interface SpineRow {
  id: string;
  version_no: number;
  kind: string;
  author_id: string | null;
}

// Runs in the caller's transaction, so the version commits with the content write.
// version_no = max + 1 isn't safe against concurrent transactions (same MVCC
// snapshot): the unique (node_id, version_no) is the backstop,
// and the page row lock keeps saves serial.
export async function captureVersion(sql: TxSql, input: CaptureInput): Promise<string> {
  const { nodeType, nodeId, payload } = input;
  const kind: VersionKind = input.kind ?? 'autosave';
  const authorId = input.authorId ?? null;
  const t = impl(nodeType);

  const [latest] = await sql<SpineRow[]>`
    select id, version_no, kind, author_id
    from node_versions
    where node_id = ${nodeId}
    order by version_no desc limit 1`;

  if (
    kind === 'autosave' &&
    latest &&
    latest.kind === 'autosave' &&
    latest.author_id === authorId
  ) {
    const [fresh] = await sql<{ recent: boolean }[]>`
      select (created_at > now() - make_interval(secs => ${AUTOSAVE_COLLAPSE_SECONDS})) as recent
      from node_versions where id = ${latest.id}`;
    if (fresh?.recent) {
      await t.writePayload(sql, latest.id, payload);
      await sql`update node_versions set updated_at = now() where id = ${latest.id}`;
      return latest.id;
    }
  }

  const baseVersionId = input.baseVersionId ?? latest?.id ?? null;
  const [row] = await sql<{ id: string }[]>`
    insert into node_versions (node_id, version_no, base_version_id, kind, author_id)
    select ${nodeId}, coalesce(max(version_no), 0) + 1, ${baseVersionId}, ${kind}, ${authorId}
    from node_versions
    where node_id = ${nodeId}
    returning id`;
  await t.writePayload(sql, row.id, payload);
  return row.id;
}

// In a transaction of its own, for a caller outside a content write (a lost draft).
export async function captureStandaloneVersion(input: CaptureInput): Promise<string> {
  return db.begin((sql) => captureVersion(sql, input)) as Promise<string>;
}

export interface VersionMeta {
  id: string;
  versionNo: number;
  kind: string;
  authorId: string | null;
  authorName: string | null;
  baseVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

// Newest first, without payloads.
export async function listVersions(nodeId: string): Promise<VersionMeta[]> {
  const rows = await db<
    {
      id: string; version_no: number; kind: string; author_id: string | null;
      name: string | null; base_version_id: string | null; created_at: string; updated_at: string;
    }[]
  >`
    select v.id, v.version_no, v.kind, v.author_id, u.name,
           v.base_version_id, v.created_at, v.updated_at
    from node_versions v
    left join users u on u.id = v.author_id
    where v.node_id = ${nodeId}
    order by v.version_no desc`;
  return rows.map((r) => ({
    id: r.id,
    versionNo: r.version_no,
    kind: r.kind,
    authorId: r.author_id,
    authorName: r.name,
    baseVersionId: r.base_version_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// The version an editor diverges from at load time.
export async function latestVersionId(nodeId: string): Promise<string | null> {
  const [row] = await db<{ id: string }[]>`
    select id from node_versions
    where node_id = ${nodeId}
    order by version_no desc limit 1`;
  return row?.id ?? null;
}

export async function getVersion(
  versionId: string
): Promise<{ meta: { nodeType: string; nodeId: string; versionNo: number; kind: string }; payload: unknown } | null> {
  const [row] = await db<
    { node_type: string; node_id: string; version_no: number; kind: string }[]
  >`select n.type as node_type, v.node_id, v.version_no, v.kind from node_versions v join nodes n on n.id = v.node_id where v.id = ${versionId}`;
  if (!row) return null;
  const payload = await impl(row.node_type).readPayload(db, versionId);
  return {
    meta: { nodeType: row.node_type, nodeId: row.node_id, versionNo: row.version_no, kind: row.kind },
    payload,
  };
}

// Non-destructive: the write path captures a new version. Removing an unknown
// block throws until acknowledged (a page: UNKNOWN_DROPPED).
export async function restoreVersion(versionId: string, authorId: string | null, opts?: RestoreOptions): Promise<boolean> {
  const v = await getVersion(versionId);
  if (!v) return false;
  await impl(v.meta.nodeType).applyCurrent(v.meta.nodeId, v.payload, authorId, opts);
  return true;
}
