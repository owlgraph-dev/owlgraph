// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The row pages, documents and collections share by primary key: class and its
// derived type, namespace + slug (the route), visibility, owner, timestamps.
// Free of SvelteKit-only imports: the MCP server imports it too.
import { randomUUID } from 'node:crypto';
import type postgres from 'postgres';
import { db, type TxSql } from '$lib/platform/db.server';
import { isEnabledLocale, siteDefaultLocale } from '$lib/platform/i18n/siteLocales';
import type { Visibility } from './access';
import type { NodeType } from './types';
import type { SessionUser } from '$lib/features/auth/server';
import { CodedError } from '$lib/platform/codedError';

export function slugify(base: string): string {
  const cleaned = base.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${cleaned || 'untitled'}-${randomUUID().slice(0, 6)}`;
}

export function cleanSlug(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// A static top-level route wins over the root [slug] catch-all, so a slug equal
// to one would be unreachable (docs/architecture/routing.md, "Reserved-word policy"). Kept by
// hand; reservedSlugs.test.ts checks every static top-level route is here. 'p'
// and 'd' have no route but stay reserved for links to the retired /p and /d.
const RESERVED_SLUGS = new Set([
  '-',
  'api',
  'd',
  'dev',
  'graph',
  'login',
  'logout',
  'p',
  'search',
  'settings',
  'share',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

// Identity is (namespace_id, slug), not the slug alone.
export async function getNodeBySlug(namespaceId: string, slug: string): Promise<{ id: string; type: NodeType } | null> {
  const [row] = await db<{ id: string; type: NodeType }[]>`
    select id, type from nodes where namespace_id = ${namespaceId} and slug = ${slug}`;
  return row ?? null;
}

// For /share/[id], which has only the node id.
export async function getNodeType(id: string): Promise<NodeType | null> {
  const [row] = await db<{ type: NodeType }[]>`select type from nodes where id = ${id}`;
  return row?.type ?? null;
}

// `sql` may be the write's own transaction. In the default namespace a slug must
// not equal a namespace's slug either: both are the first path segment there.
// Create skips this; slugify()'s random suffix makes a clash practically impossible.
export async function assertSlugAvailable(
  sql: TxSql | typeof db,
  slug: string,
  excludeId: string | undefined,
  namespaceId: string
): Promise<void> {
  if (isReservedSlug(slug)) {
    throw new CodedError('slug_reserved', 'That URL is reserved');
  }
  const [ns] = await sql<{ is_default: boolean }[]>`select is_default from namespaces where id = ${namespaceId}`;
  if (ns?.is_default) {
    const [nsConflict] = await sql`select 1 from namespaces where slug = ${slug}`;
    if (nsConflict) {
      throw new CodedError('slug_reserved', 'That URL is reserved for a namespace');
    }
  }
  const [conflict] = excludeId
    ? await sql`select 1 from nodes where namespace_id = ${namespaceId} and slug = ${slug} and id <> ${excludeId}`
    : await sql`select 1 from nodes where namespace_id = ${namespaceId} and slug = ${slug}`;
  if (conflict) {
    throw new CodedError('slug_taken', 'That URL is already taken');
  }
}

// Here, not in namespaces.server.ts, which imports from this module.
export async function isNamespaceMember(sql: TxSql | typeof db, namespaceId: string, userId: string): Promise<boolean> {
  const [r] = await sql`select 1 from namespace_members where namespace_id = ${namespaceId} and user_id = ${userId}`;
  return !!r;
}

// Creating or moving a node into a restricted namespace takes an admin or a
// member: anyone else couldn't read the node back.
export async function assertCanPlaceInNamespace(
  sql: TxSql | typeof db,
  user: SessionUser | null,
  namespaceId: string,
  accessLevel: Visibility
): Promise<void> {
  if (accessLevel !== 'restricted') return;
  if (user?.role === 'admin') return;
  if (user && (await isNamespaceMember(sql, namespaceId, user.id))) return;
  throw new CodedError('namespace_membership_required', 'You are not a member of this restricted namespace');
}

// `type` is the class's nearest L1 type, cached for routing and held consistent
// by nodes_class_type_fkey. The locale defaults to the site's (docs/architecture/languages.md); the
// caller mirrors the returned one into its table's search_locale.
export async function insertNode(
  sql: TxSql,
  opts: { classId: string; slug: string; namespaceId: string; createdBy: string | null; visibility: Visibility | null; title: string; locale?: string | null }
): Promise<{ id: string; type: NodeType; locale: string }> {
  const locale = assertContentLocale(opts.locale ?? siteDefaultLocale());
  const [cls] = await sql<{ id: string; node_type: NodeType }[]>`
    select id, node_type from node_classes where id = ${opts.classId} and kind <> 'root'`;
  if (!cls) throw new CodedError('class_not_found', 'Unknown class');
  const [row] = await sql<{ id: string }[]>`
    insert into nodes (type, slug, namespace_id, created_by, visibility, title, class_id, locale)
    values (${cls.node_type}, ${opts.slug}, ${opts.namespaceId}, ${opts.createdBy}, ${opts.visibility}, ${opts.title}, ${cls.id}, ${locale})
    returning id`;
  return { id: row.id, type: cls.node_type, locale };
}

// A node keeps a language disabled later; it just can't be given one.
function assertContentLocale(locale: string): string {
  if (!isEnabledLocale(locale)) {
    throw new CodedError('locale_not_enabled', `"${locale}" is not an enabled language.`);
  }
  return locale;
}

// The search_locale mirrors change in the same transaction, so the generated
// search_tsv recomputes in the new language for this row only.
export async function setNodeLocale(id: string, locale: string): Promise<void> {
  assertContentLocale(locale);
  await db.begin(async (sql) => {
    const rows = await sql`update nodes set locale = ${locale}, updated_at = now() where id = ${id} returning id`;
    if (rows.length === 0) throw new CodedError('not_found', 'Not found');
    await sql`update pages set search_locale = ${locale} where id = ${id}`;
    // A document's detected-language suggestion is answered by any choice.
    await sql`update documents set search_locale = ${locale}, detected_locale = null where id = ${id}`;
    await sql`update collections set search_locale = ${locale} where id = ${id}`;
  });
}

// A namespace's access_level is an upper bound: an override, or a node moved
// into a stricter namespace, may only be equal or stricter, never wider.
// Widening past the namespace is a share link's job, not visibility's.
const VISIBILITY_RANK: Record<Visibility, number> = { public: 0, internal: 1, restricted: 2 };

export function assertNotWiderThanNamespace(visibility: Visibility, namespaceAccessLevel: Visibility): void {
  if (VISIBILITY_RANK[visibility] < VISIBILITY_RANK[namespaceAccessLevel]) {
    throw new CodedError('widening_not_allowed', `A node cannot be made more accessible than its namespace (${namespaceAccessLevel}) — ` +
        "an admin raises the namespace's access level first, under Settings → Namespaces.");
  }
}

// null inherits the namespace's level, live. 'public' is stored as inherit: it
// can only equal a public namespace's level, and as an override it would outlive
// that namespace being narrowed. Returns what was stored. `touch` bumps
// updated_at, for a node no content save bumps (a document, a collection).
export async function setNodeVisibility(id: string, visibility: Visibility | null, opts: { touch?: boolean } = {}): Promise<Visibility | null> {
  return db.begin(async (sql) => {
    const [row] = await sql<{ access_level: Visibility }[]>`
      select ns.access_level from nodes n join namespaces ns on ns.id = n.namespace_id
      where n.id = ${id} for update of n`;
    if (!row) throw new CodedError('not_found', 'Not found');
    if (visibility !== null) assertNotWiderThanNamespace(visibility, row.access_level);
    const stored = visibility === 'public' ? null : visibility;
    await sql`update nodes set visibility = ${stored} where id = ${id}`;
    if (opts.touch) await touchNode(sql, id);
    return stored;
  });
}

// Narrowing a namespace narrows its wider overrides to the new level, as
// setNodeNamespace does on a move. Inheriting nodes follow the namespace live.
export async function narrowOverridesToNamespace(sql: TxSql, namespaceId: string, accessLevel: Visibility): Promise<void> {
  const wider = (Object.keys(VISIBILITY_RANK) as Visibility[]).filter((v) => VISIBILITY_RANK[v] < VISIBILITY_RANK[accessLevel]);
  if (wider.length === 0) return;
  await sql`update nodes set visibility = ${accessLevel} where namespace_id = ${namespaceId} and visibility = any(${wider}::text[])`;
}

// Changes the node's route: the old URL 404s, no slug history (docs/architecture/routing.md).
// A restricted target needs `user` to be a member or admin. An override wider
// than the target is narrowed to its level rather than refusing the move.
export async function setNodeNamespace(id: string, namespaceId: string, user: SessionUser | null): Promise<void> {
  await db.begin(async (sql) => {
    const [node] = await sql<{ slug: string; visibility: Visibility | null }[]>`
      select slug, visibility from nodes where id = ${id} for update`;
    if (!node) throw new CodedError('not_found', 'Not found');
    await assertSlugAvailable(sql, node.slug, id, namespaceId);
    const [target] = await sql<{ access_level: Visibility }[]>`select access_level from namespaces where id = ${namespaceId}`;
    if (!target) throw new CodedError('not_found', 'Unknown namespace');
    await assertCanPlaceInNamespace(sql, user, namespaceId, target.access_level);
    const visibility =
      node.visibility !== null && VISIBILITY_RANK[node.visibility] < VISIBILITY_RANK[target.access_level]
        ? target.access_level
        : node.visibility;
    await sql`update nodes set namespace_id = ${namespaceId}, visibility = ${visibility}, updated_at = now() where id = ${id}`;
  });
}

// Cascades to the node's own table, its shares, tags, properties and locks, and
// both directions of `edges`.
export async function deleteNodeTx(sql: TxSql, id: string): Promise<boolean> {
  const rows = await sql`delete from nodes where id = ${id} returning id`;
  return rows.length > 0;
}

export async function deleteNode(id: string): Promise<void> {
  await deleteNodeTx(db, id);
}

// Documents have no write chokepoint that bumps updated_at, as pages'
// persistDocTx does: call this wherever a document's node-level facts change.
export async function touchNode(sql: TxSql, id: string): Promise<void> {
  await sql`update nodes set updated_at = now() where id = ${id}`;
}

// Aliases are caller-written identifiers, never user input; checked anyway
// because they reach db.unsafe.
const IDENT_RE = /^[a-z_][a-z0-9_]*$/i;

// For queries that build a node's URL: the default namespace's slug is null,
// nodePath()'s "no prefix". The left join is only defensive (namespace_id is NOT NULL).
export function namespaceJoin(nodeAlias: string, nsAlias = 'ns'): string {
  if (!IDENT_RE.test(nodeAlias) || !IDENT_RE.test(nsAlias)) throw new Error('namespaceJoin: invalid alias');
  return `left join namespaces ${nsAlias} on ${nsAlias}.id = ${nodeAlias}.namespace_id`;
}

export function namespaceSlugColumn(nsAlias = 'ns'): string {
  if (!IDENT_RE.test(nsAlias)) throw new Error('namespaceSlugColumn: invalid alias');
  return `${nsAlias}.slug as namespace_slug`;
}

// The viewer-scoped read predicate over `nodes` under `alias` (docs/architecture/authorization.md).
// A null visibility inherits the namespace's access_level, live. Admin: all.
// Signed out: public. Signed in: public, internal, their own nodes, and restricted
// ones through namespace membership (inherited) or a share (override).
export function readableNodes(user: { id: string; role: string } | null, alias: string): postgres.Fragment {
  if (!IDENT_RE.test(alias)) throw new Error(`readableNodes: invalid alias "${alias}"`);
  const col = (name: string) => db.unsafe(`${alias}.${name}`);
  const effective = db.unsafe(`coalesce(${alias}.visibility, (select access_level from namespaces where id = ${alias}.namespace_id))`);
  if (!user) return db`(${effective} = 'public')`;
  if (user.role === 'admin') return db`(true)`;
  return db`(
    ${effective} in ('public', 'internal')
    or ${col('created_by')} = ${user.id}
    or (${col('visibility')} is not null and (
      ${col('id')} in (select page_id from page_shares where user_id = ${user.id})
      or ${col('id')} in (select document_id from document_shares where user_id = ${user.id})
    ))
    or (${col('visibility')} is null and exists (
      select 1 from namespace_members nm where nm.namespace_id = ${col('namespace_id')} and nm.user_id = ${user.id}
    ))
  )`;
}

/** A node a picker offers: what it is, where it sits — its namespace, by name — and its address's parts. */
export interface NodeSearchHit {
  id: string;
  type: NodeType;
  title: string;
  slug: string;
  namespace_slug: string | null;
  namespace_name: string | null;
}

/** A page of a node search: the hits, whether more follow, and the types with a node titled exactly as searched. */
export interface NodeSearchHits {
  hits: NodeSearchHit[];
  more: boolean;
  /** The types searched that have a readable node whose title is the term itself, case aside. */
  exact: NodeType[];
}

/**
 * The readable nodes of `types` whose title contains `q` literally (`%` and `_`
 * are not wildcards), across namespaces: an exact title first, then the most
 * recently changed, ties broken by id so pages never overlap.
 */
export async function searchNodesForUser(
  user: SessionUser | null,
  q: string,
  opts: { types: readonly NodeType[]; limit?: number; offset?: number; exclude?: readonly string[] }
): Promise<NodeSearchHits> {
  const term = q.trim();
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  if (opts.types.length === 0) return { hits: [], more: false, exact: [] };
  const types = opts.types as NodeType[];
  const literal = term.replace(/[\\%_]/g, '\\$&');
  const match = term ? db`n.title ilike ${`%${literal}%`}` : db`true`;
  const kept = opts.exclude?.length ? db`n.id not in ${db(opts.exclude as string[])}` : db`true`;
  const exactFirst = term ? db`(lower(n.title) = lower(${term})) desc,` : db``;
  const rows = await db<NodeSearchHit[]>`
    select n.id, n.type, n.title, n.slug, ${db.unsafe(namespaceSlugColumn())}, ns.name as namespace_name
    from nodes n ${db.unsafe(namespaceJoin('n'))}
    where n.type in ${db(types)} and ${match} and ${kept} and ${readableNodes(user, 'n')}
    order by ${exactFirst} n.updated_at desc, n.id
    limit ${limit + 1} offset ${offset}`;
  const exact = term
    ? (
        await db<{ type: NodeType }[]>`
          select distinct n.type from nodes n
          where n.type in ${db(types)} and lower(n.title) = lower(${term}) and ${readableNodes(user, 'n')}`
      ).map((r) => r.type)
    : [];
  return { hits: rows.slice(0, limit), more: rows.length > limit, exact };
}
