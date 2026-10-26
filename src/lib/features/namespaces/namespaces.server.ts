// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A namespace groups and routes content; its access_level is the live read gate
// of every node without a visibility of its own, and a restricted one's members
// read those nodes (docs/architecture/authorization.md). Free of SvelteKit-only imports: the
// MCP server imports it too.
import { db, type TxSql } from '$lib/platform/db.server';
import type { Visibility } from '$lib/features/nodes';
import { isReservedSlug, cleanSlug, narrowOverridesToNamespace } from '$lib/features/nodes/server';
import { setKnownNamespaceSlugs } from './namespaceRegistry';
import { CodedError } from '$lib/platform/codedError';

export interface NamespaceRow {
  id: string;
  slug: string | null;
  name: string;
  access_level: Visibility;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface NamespaceListRow extends NamespaceRow {
  node_count: number;
  /** Nodes with no visibility of their own: they follow the access level. */
  inheriting_count: number;
}

export async function listNamespaces(): Promise<NamespaceListRow[]> {
  return db<NamespaceListRow[]>`
    select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
    from namespaces ns
    left join nodes n on n.namespace_id = ns.id
    group by ns.id
    order by ns.is_default desc, ns.name asc`;
}

// Viewer-scoped: what every picker and client payload lists. A restricted
// namespace only for its members and admins; signed out, public ones only, since
// this backs the layout payload of every anonymous page. /settings/namespaces
// uses the unfiltered listNamespaces().
export async function listNamespacesForUser(user: { id: string; role: string } | null): Promise<NamespaceListRow[]> {
  if (user?.role === 'admin') return listNamespaces();
  if (!user) {
    return db<NamespaceListRow[]>`
      select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
      from namespaces ns
      left join nodes n on n.namespace_id = ns.id
      where ns.access_level = 'public'
      group by ns.id
      order by ns.is_default desc, ns.name asc`;
  }
  return db<NamespaceListRow[]>`
    select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
    from namespaces ns
    left join nodes n on n.namespace_id = ns.id
    where ns.access_level <> 'restricted'
      or ns.id in (select namespace_id from namespace_members where user_id = ${user.id})
    group by ns.id
    order by ns.is_default desc, ns.name asc`;
}

// Restricted-namespace membership, managed under /settings/namespaces (namespace:manage).

export async function getNamespaceMembers(namespaceId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`select user_id from namespace_members where namespace_id = ${namespaceId}`;
  return rows.map((r) => r.user_id);
}

export async function setNamespaceMembers(namespaceId: string, userIds: unknown): Promise<string[]> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map((u) => String(u)))] : [];
  await db.begin(async (sql) => {
    await sql`delete from namespace_members where namespace_id = ${namespaceId}`;
    for (const uid of ids) {
      await sql`insert into namespace_members (namespace_id, user_id) values (${namespaceId}, ${uid}) on conflict do nothing`;
    }
  });
  return ids;
}

// Unfiltered: for the server-side matcher registry and the admin path only,
// never for anything that reaches a client.
async function listNamespaceSlugs(): Promise<string[]> {
  const rows = await db<{ slug: string }[]>`select slug from namespaces where not is_default`;
  return rows.map((r) => r.slug);
}

// Viewer-scoped by listNamespacesForUser's rule. Every visitor fetches it before
// hydration (hooks.client.ts), so it stays one cheap query.
export async function listNamespaceSlugsForUser(user: { id: string; role: string } | null): Promise<string[]> {
  if (user?.role === 'admin') return listNamespaceSlugs();
  const rows = await db<{ slug: string }[]>`
    select slug from namespaces
    where not is_default
      and (
        access_level = 'public'
        ${user ? db`or access_level = 'internal'` : db``}
        ${user ? db`or id in (select namespace_id from namespace_members where user_id = ${user.id})` : db``}
      )`;
  return rows.map((r) => r.slug);
}

// Run at startup (src/hooks.server.ts) and after each namespace change, never at
// import: unit tests import this module without a database. Refreshes can finish
// out of order; each reads after its own change committed, so only one newer
// than the last applied may land.
let refreshesStarted = 0;
let lastApplied = 0;
export async function refreshNamespaceCache(): Promise<void> {
  const ticket = ++refreshesStarted;
  const slugs = await listNamespaceSlugs();
  if (ticket < lastApplied) return;
  lastApplied = ticket;
  setKnownNamespaceSlugs(slugs);
}

// A label lookup, not an access check: pass only the namespace ids of rows the
// viewer may read.
export async function resolveNamespaceLabels(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db<{ id: string; name: string }[]>`select id, name from namespaces where id = any(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getNamespace(sql: TxSql, id: string): Promise<NamespaceRow | null> {
  const [row] = await sql<NamespaceRow[]>`select * from namespaces where id = ${id}`;
  return row ?? null;
}

export async function getDefaultNamespace(sql: TxSql = db): Promise<NamespaceRow> {
  const [row] = await sql<NamespaceRow[]>`select * from namespaces where is_default`;
  if (!row) throw new Error('Default namespace missing — has the database been migrated?');
  return row;
}

async function getNamespaceBySlug(slug: string): Promise<NamespaceRow | null> {
  const [row] = await db<NamespaceRow[]>`select * from namespaces where slug = ${slug}`;
  return row ?? null;
}

// Absent is the default namespace; an unknown slug is null, which the caller 404s.
export async function resolveNamespaceParam(namespaceSlug: string | undefined): Promise<NamespaceRow | null> {
  if (!namespaceSlug) return getDefaultNamespace();
  return getNamespaceBySlug(namespaceSlug);
}

// Runs on create too: an admin types the slug and nothing uniquifies it. It
// mustn't equal a root-level node's slug; assertSlugAvailable checks the reverse.
async function assertNamespaceSlugAvailable(sql: TxSql, slug: string, excludeId?: string): Promise<void> {
  if (isReservedSlug(slug)) {
    throw new CodedError('namespace_slug_reserved', 'That name is reserved');
  }
  const [nsConflict] = excludeId
    ? await sql`select 1 from namespaces where slug = ${slug} and id <> ${excludeId}`
    : await sql`select 1 from namespaces where slug = ${slug}`;
  if (nsConflict) {
    throw new CodedError('namespace_slug_taken', 'That name is already taken');
  }
  const defaultNs = await getDefaultNamespace(sql);
  const [nodeConflict] = await sql`select 1 from nodes where namespace_id = ${defaultNs.id} and slug = ${slug}`;
  if (nodeConflict) {
    throw new CodedError('namespace_slug_taken', 'A page or document already uses that URL at the site root');
  }
}

export async function createNamespace(opts: { name: string; slug: string; accessLevel: Visibility }): Promise<NamespaceRow> {
  const name = opts.name.trim();
  if (!name) throw new CodedError('name_required', 'Name cannot be empty');
  const slug = cleanSlug(opts.slug);
  if (!slug) throw new CodedError('namespace_slug_required', 'Namespace URL slug cannot be empty');
  const row = await db.begin(async (sql) => {
    await assertNamespaceSlugAvailable(sql, slug);
    const [inserted] = await sql<NamespaceRow[]>`
      insert into namespaces (slug, name, access_level) values (${slug}, ${name}, ${opts.accessLevel})
      returning *`;
    return inserted;
  });
  await refreshNamespaceCache();
  return row;
}

// The default namespace's slug stays null: it is root-routed
// (namespaces_slug_null_iff_default_check backs this).
export async function renameNamespace(id: string, changes: { name?: string; slug?: string }): Promise<NamespaceRow> {
  const name = changes.name !== undefined ? changes.name.trim() : undefined;
  if (name !== undefined && name === '') throw new CodedError('name_required', 'Name cannot be empty');

  const row = await db.begin(async (sql) => {
    const [ns] = await sql<NamespaceRow[]>`select * from namespaces where id = ${id} for update`;
    if (!ns) throw new CodedError('not_found', 'Namespace not found');

    let slug: string | undefined;
    if (changes.slug !== undefined) {
      if (ns.is_default) throw new CodedError('default_namespace_has_no_url', 'The default namespace has no URL and cannot be given one');
      slug = cleanSlug(changes.slug);
      if (!slug) throw new CodedError('namespace_slug_required', 'Namespace URL slug cannot be empty');
      await assertNamespaceSlugAvailable(sql, slug, id);
    }

    if (name !== undefined) await sql`update namespaces set name = ${name}, updated_at = now() where id = ${id}`;
    if (slug !== undefined) await sql`update namespaces set slug = ${slug}, updated_at = now() where id = ${id}`;

    const [updated] = await sql<NamespaceRow[]>`select * from namespaces where id = ${id}`;
    return updated;
  });
  await refreshNamespaceCache();
  return row;
}

// Inheriting nodes follow at once; a wider override is narrowed in the same
// transaction, so the namespace stays the upper bound.
export async function setNamespaceAccessLevel(id: string, accessLevel: Visibility): Promise<void> {
  await db.begin(async (sql) => {
    await sql`update namespaces set access_level = ${accessLevel}, updated_at = now() where id = ${id}`;
    await narrowOverridesToNamespace(sql, id, accessLevel);
  });
}

// Moves the content to the default namespace first; a slug already taken there
// gets a short id suffix.
export async function deleteNamespace(id: string): Promise<void> {
  await db.begin(async (sql) => {
    const [ns] = await sql<NamespaceRow[]>`select * from namespaces where id = ${id} for update`;
    if (!ns) return;
    if (ns.is_default) throw new CodedError('default_namespace_undeletable', 'The default namespace cannot be deleted');
    const defaultNs = await getDefaultNamespace(sql);
    await sql`
      update nodes n
      set namespace_id = ${defaultNs.id},
          slug = case
            when exists (select 1 from nodes d where d.namespace_id = ${defaultNs.id} and d.slug = n.slug)
            then n.slug || '-' || substr(n.id::text, 1, 6)
            else n.slug
          end
      where n.namespace_id = ${id}`;
    await sql`delete from namespaces where id = ${id}`;
  });
  await refreshNamespaceCache();
}
