// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A collection is curated, or mirrors a source an integration holds
// (docs/architecture/semantic-layer.md, "Collections"). The integration's credential is
// sealed apart in node_source_secrets and never read here.
import { db, type TxSql } from '$lib/platform/db.server';
import type { SessionUser } from '$lib/features/auth/server';
import type { Visibility } from '$lib/features/nodes';
import {
  insertNode,
  readableNodes,
  touchNode,
  slugify,
  cleanSlug,
  assertSlugAvailable,
  namespaceJoin,
  namespaceSlugColumn,
  assertCanPlaceInNamespace,
  assertNotWiderThanNamespace,
  userCanReadNode,
  userCanWriteNode,
} from '$lib/features/nodes/server';
import { getNamespace, getDefaultNamespace } from '$lib/features/namespaces/server';
import { getTypeClass } from '$lib/features/semantic/server';
import { CodedError } from '$lib/platform/codedError';

export interface CollectionRow {
  id: string;
  title: string;
  slug: string;
  namespace_id: string;
  namespace_slug: string | null;
  // The plugin id of a mirrored collection (docs/architecture/plugins.md); null for a curated one.
  plugin: string | null;
  visibility: string | null; // null = inherits namespace_access_level, live
  namespace_access_level: Visibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  class_id: string;
  locale: string;
}

// Explicit columns: a missed join fails loudly instead of leaving visibility
// undefined. No `source_ref`: it is its integration's business.
export const COLLECTION_COLUMNS = `c.id, n.title, n.slug, n.namespace_id, ${namespaceSlugColumn()}, c.plugin,
    n.visibility, ns.access_level as namespace_access_level, n.created_by, n.created_at, n.updated_at, n.class_id, n.locale`;
export const COLLECTION_FROM = `from collections c join nodes n on n.id = c.id ${namespaceJoin('n')}`;

export async function getCollection(id: string): Promise<CollectionRow | null> {
  const [row] = await db<CollectionRow[]>`select ${db.unsafe(COLLECTION_COLUMNS)} ${db.unsafe(COLLECTION_FROM)} where c.id = ${id}`;
  return row ?? null;
}

/** `plugin` null lists the curated collections, undefined all of them. */
export async function listCollectionsForUser(
  user: SessionUser | null,
  opts: { plugin?: string | null; q?: string; limit?: number } = {}
): Promise<CollectionRow[]> {
  const plugin = opts.plugin === undefined ? db`true` : opts.plugin === null ? db`c.plugin is null` : db`c.plugin = ${opts.plugin}`;
  const term = opts.q?.trim() ? db`n.title ilike ${`%${opts.q.trim()}%`}` : db`true`;
  return db<CollectionRow[]>`
    select ${db.unsafe(COLLECTION_COLUMNS)} ${db.unsafe(COLLECTION_FROM)}
    where ${plugin} and ${term} and ${readableNodes(user, 'n')}
    order by n.updated_at desc limit ${Math.min(Math.max(opts.limit ?? 50, 1), 200)}`;
}

/**
 * `visibility` may only narrow the namespace's. Mirrored when an integration
 * passes its id and source record, curated otherwise. Runs in `sql` when given.
 */
export async function createCollection(
  opts: {
    title: string;
    createdBy: string | null;
    user: SessionUser | null;
    namespaceId?: string;
    locale?: string;
    plugin?: string | null;
    sourceRef?: Record<string, unknown> | null;
    visibility?: Visibility | null;
  },
  sql?: TxSql
): Promise<{ id: string; slug: string }> {
  const title = opts.title.trim();
  if (title === '') throw new CodedError('title_required', 'Title cannot be empty');
  const curated = (opts.plugin ?? null) === null;
  if (curated !== ((opts.sourceRef ?? null) === null)) throw new Error('A plugin and its source record come together');
  const run = async (tx: TxSql) => {
    const namespace = opts.namespaceId ? await getNamespace(tx, opts.namespaceId) : await getDefaultNamespace(tx);
    if (!namespace) throw new CodedError('unknown_namespace', 'Unknown namespace');
    await assertCanPlaceInNamespace(tx, opts.user, namespace.id, namespace.access_level);
    if (opts.visibility) assertNotWiderThanNamespace(opts.visibility, namespace.access_level);
    const collectionClass = await getTypeClass(tx, 'collection');
    const slug = slugify(title);
    const node = await insertNode(tx, {
      classId: collectionClass.id,
      slug,
      namespaceId: namespace.id,
      createdBy: opts.createdBy,
      visibility: opts.visibility ?? null, // null inherits the namespace's access level, live
      title,
      locale: opts.locale,
    });
    await tx`
      insert into collections (id, plugin, source_ref, search_title, search_locale)
      values (${node.id}, ${opts.plugin ?? null}, ${opts.sourceRef ? tx.json(opts.sourceRef as never) : null}, ${title}, ${node.locale})`;
    return { id: node.id, slug };
  };
  return sql ? run(sql) : db.begin(run);
}

/** A mirrored collection's source_ref, kept out of CollectionRow: it is its integration's business. */
export async function getCollectionSourceRef(id: string, sql: TxSql = db): Promise<Record<string, unknown> | null> {
  const [row] = await sql<{ source_ref: Record<string, unknown> | null }[]>`
    select source_ref from collections where id = ${id} and plugin is not null`;
  return row?.source_ref ?? null;
}

/** False for a curated collection. */
export async function setCollectionSourceRef(id: string, ref: Record<string, unknown>, sql: TxSql = db): Promise<boolean> {
  const rows = await sql`update collections set source_ref = ${sql.json(ref as never)} where id = ${id} and plugin is not null returning id`;
  return rows.length > 0;
}

export async function renameCollection(id: string, changes: { title?: string; slug?: string }): Promise<CollectionRow | null> {
  const title = changes.title !== undefined ? changes.title.trim() : undefined;
  if (title !== undefined && title === '') throw new CodedError('title_required', 'Title cannot be empty');
  let slug: string | undefined;
  if (changes.slug !== undefined) {
    slug = cleanSlug(changes.slug);
    if (slug === '') throw new CodedError('slug_required', 'URL slug cannot be empty');
    const [node] = await db<{ namespace_id: string }[]>`select namespace_id from nodes where id = ${id}`;
    if (!node) throw new CodedError('not_found', 'Not found');
    await assertSlugAvailable(db, slug, id, node.namespace_id);
  }
  if (title === undefined && slug === undefined) return getCollection(id);
  return db.begin(async (sql) => {
    if (title !== undefined) {
      await sql`update nodes set title = ${title} where id = ${id}`;
      await sql`update collections set search_title = ${title} where id = ${id}`;
    }
    if (slug !== undefined) await sql`update nodes set slug = ${slug} where id = ${id}`;
    await touchNode(sql, id);
    const [row] = await sql<CollectionRow[]>`select ${sql.unsafe(COLLECTION_COLUMNS)} ${sql.unsafe(COLLECTION_FROM)} where c.id = ${id}`;
    return row ?? null;
  });
}

// The metadata half of collections.search_tsv; call it after every write to a
// property, a tag or source_search.
export async function refreshCollectionSearchMeta(id: string, sql: TxSql = db): Promise<void> {
  await sql`
    update collections c set search_meta = trim(concat_ws(' ',
      (select string_agg(p.value, ' ' order by p.name, p.value) from node_properties p where p.node_id = c.id),
      (select string_agg(t.tag, ' ' order by t.tag) from node_tags t where t.node_id = c.id),
      c.source_search
    ))
    where c.id = ${id}`;
}

/** Every mirrored collection id, for maintenance across integrations. */
export async function mirroredCollectionIds(): Promise<string[]> {
  const rows = await db<{ id: string }[]>`select id from collections where plugin is not null order by id`;
  return rows.map((r) => r.id);
}

/** The plugin of each given collection an integration mirrors; curated ones are absent. */
export async function collectionPlugins(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db<{ id: string; plugin: string }[]>`select id, plugin from collections where id = any(${[...ids]}::uuid[]) and plugin is not null`;
  return new Map(rows.map((r) => [r.id, r.plugin]));
}

/** Sets the names a mirrored collection's source reports, which search matches beside the title, and refreshes search_meta. */
export async function setCollectionSourceSearch(id: string, text: string, sql: TxSql = db): Promise<void> {
  const rows = await sql`update collections set source_search = ${text || null} where id = ${id} and plugin is not null returning id`;
  if (rows.length > 0) await refreshCollectionSearchMeta(id, sql);
}

// Written like a page (docs/architecture/authorization.md): whoever may read a restricted
// one (the namespace's members while it inherits) may write it too.
export async function userCanReadCollection(user: SessionUser | null, row: CollectionRow): Promise<boolean> {
  return userCanReadNode(user, row, 'collection');
}

export async function userCanWriteCollection(user: SessionUser | null, row: CollectionRow): Promise<boolean> {
  return userCanWriteNode(user, row, 'collection');
}
