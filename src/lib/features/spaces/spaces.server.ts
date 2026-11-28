// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A space groups and routes content; its access_level is the live read gate
// of every node without a visibility of its own, and a restricted one's members
// read those nodes (docs/architecture/authorization.md). Free of SvelteKit-only imports: the
// MCP server imports it too.
import { db, type TxSql } from '#lib/platform/db.server.ts';
import type { Visibility } from '#lib/features/nodes/index.ts';
import { isReservedSlug, cleanSlug, narrowOverridesToSpace, readableNodes } from '#lib/features/nodes/server.ts';
import { setServerSpaceSlugs } from './spaceRegistry';
import { CodedError } from '#lib/platform/codedError.ts';

export interface SpaceRow {
  id: string;
  slug: string | null;
  name: string;
  access_level: Visibility;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceListRow extends SpaceRow {
  node_count: number;
  /** Nodes with no visibility of their own: they follow the access level. */
  inheriting_count: number;
}

export async function listSpaces(): Promise<SpaceListRow[]> {
  return db<SpaceListRow[]>`
    select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
    from spaces ns
    left join nodes n on n.space_id = ns.id
    group by ns.id
    order by ns.is_default desc, ns.name asc`;
}

// Viewer-scoped: what every picker and client payload lists. A restricted
// space only for its members and admins; signed out, public ones only, since
// this backs the layout payload of every anonymous page. /settings/spaces
// uses the unfiltered listSpaces().
export async function listSpacesForUser(user: { id: string; role: string } | null): Promise<SpaceListRow[]> {
  if (user?.role === 'admin') return listSpaces();
  if (!user) {
    return db<SpaceListRow[]>`
      select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
      from spaces ns
      left join nodes n on n.space_id = ns.id
      where ns.access_level = 'public'
      group by ns.id
      order by ns.is_default desc, ns.name asc`;
  }
  return db<SpaceListRow[]>`
    select ns.*, count(n.id)::int as node_count,
           count(n.id) filter (where n.visibility is null)::int as inheriting_count
    from spaces ns
    left join nodes n on n.space_id = ns.id
    where ns.access_level <> 'restricted'
      or ns.id in (select space_id from space_members where user_id = ${user.id})
    group by ns.id
    order by ns.is_default desc, ns.name asc`;
}

// Restricted-space membership, managed under /settings/spaces (space:manage).

export async function getSpaceMembers(spaceId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`select user_id from space_members where space_id = ${spaceId}`;
  return rows.map((r) => r.user_id);
}

export async function setSpaceMembers(spaceId: string, userIds: unknown): Promise<string[]> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map((u) => String(u)))] : [];
  await db.begin(async (sql) => {
    await sql`delete from space_members where space_id = ${spaceId}`;
    for (const uid of ids) {
      await sql`insert into space_members (space_id, user_id) values (${spaceId}, ${uid}) on conflict do nothing`;
    }
  });
  return ids;
}

// Unfiltered: the admin's routing slugs; for no one else.
async function listSpaceSlugs(): Promise<string[]> {
  const rows = await db<{ slug: string }[]>`select slug from spaces where not is_default`;
  return rows.map((r) => r.slug);
}

// The spaces the user's addresses route under: those whose level or membership
// admits them, and a restricted one holding a node they may read — its owner's
// after they left it, a share's (docs/features/002-visibility-and-spaces.md,
// criterion 21). The browser routes by it (hooks.client.ts) and the reroute hook
// asks it on the server (src/hooks.ts), so signed out it stays one cheap query.
export async function listSpaceSlugsForUser(user: { id: string; role: string } | null): Promise<string[]> {
  if (user?.role === 'admin') return listSpaceSlugs();
  const rows = await db<{ slug: string }[]>`
    select ns.slug from spaces ns
    where not ns.is_default
      and (
        ns.access_level = 'public'
        ${user ? db`or ns.access_level = 'internal'` : db``}
        ${user ? db`or ns.id in (select space_id from space_members where user_id = ${user.id})` : db``}
        ${user ? db`or exists (select 1 from nodes n where n.space_id = ns.id and ${readableNodes(user, 'n')})` : db``}
      )`;
  return rows.map((r) => r.slug);
}

// Run at startup (src/hooks.server.ts) and after each space change, never at
// import: unit tests import this module without a database. Refreshes can finish
// out of order; each reads after its own change committed, so only one newer
// than the last applied may land.
let refreshesStarted = 0;
let lastApplied = 0;
export async function refreshSpaceCache(): Promise<void> {
  const ticket = ++refreshesStarted;
  const rows = await db<{ slug: string; access_level: Visibility }[]>`select slug, access_level from spaces where not is_default`;
  if (ticket < lastApplied) return;
  lastApplied = ticket;
  setServerSpaceSlugs(
    rows.map((r) => r.slug),
    rows.filter((r) => r.access_level === 'restricted').map((r) => r.slug)
  );
}

// A label lookup, not an access check: pass only the space ids of rows the
// viewer may read.
export async function resolveSpaceLabels(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db<{ id: string; name: string }[]>`select id, name from spaces where id = any(${ids}::uuid[])`;
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function getSpace(sql: TxSql, id: string): Promise<SpaceRow | null> {
  const [row] = await sql<SpaceRow[]>`select * from spaces where id = ${id}`;
  return row ?? null;
}

export async function getDefaultSpace(sql: TxSql = db): Promise<SpaceRow> {
  const [row] = await sql<SpaceRow[]>`select * from spaces where is_default`;
  if (!row) throw new Error('Default space missing — has the database been migrated?');
  return row;
}

async function getSpaceBySlug(slug: string): Promise<SpaceRow | null> {
  const [row] = await db<SpaceRow[]>`select * from spaces where slug = ${slug}`;
  return row ?? null;
}

// Absent is the default space; an unknown slug is null, which the caller 404s.
export async function resolveSpaceParam(spaceSlug: string | undefined): Promise<SpaceRow | null> {
  if (!spaceSlug) return getDefaultSpace();
  return getSpaceBySlug(spaceSlug);
}

// Runs on create too: an admin types the slug and nothing uniquifies it. It
// mustn't equal a root-level node's slug; assertSlugAvailable checks the reverse.
async function assertSpaceSlugAvailable(sql: TxSql, slug: string, excludeId?: string): Promise<void> {
  if (isReservedSlug(slug)) {
    throw new CodedError('space_slug_reserved', 'That name is reserved');
  }
  const [nsConflict] = excludeId
    ? await sql`select 1 from spaces where slug = ${slug} and id <> ${excludeId}`
    : await sql`select 1 from spaces where slug = ${slug}`;
  if (nsConflict) {
    throw new CodedError('space_slug_taken', 'That name is already taken');
  }
  const defaultNs = await getDefaultSpace(sql);
  const [nodeConflict] = await sql`select 1 from nodes where space_id = ${defaultNs.id} and slug = ${slug}`;
  if (nodeConflict) {
    throw new CodedError('space_slug_taken', 'A page or document already uses that URL at the site root');
  }
}

export async function createSpace(opts: { name: string; slug: string; accessLevel: Visibility }): Promise<SpaceRow> {
  const name = opts.name.trim();
  if (!name) throw new CodedError('name_required', 'Name cannot be empty');
  const slug = cleanSlug(opts.slug);
  if (!slug) throw new CodedError('space_slug_required', 'Space URL slug cannot be empty');
  const row = await db.begin(async (sql) => {
    await assertSpaceSlugAvailable(sql, slug);
    const [inserted] = await sql<SpaceRow[]>`
      insert into spaces (slug, name, access_level) values (${slug}, ${name}, ${opts.accessLevel})
      returning *`;
    return inserted;
  });
  await refreshSpaceCache();
  return row;
}

// The default space's slug stays null: it is root-routed
// (spaces_slug_null_iff_default_check backs this).
export async function renameSpace(id: string, changes: { name?: string; slug?: string }): Promise<SpaceRow> {
  const name = changes.name !== undefined ? changes.name.trim() : undefined;
  if (name !== undefined && name === '') throw new CodedError('name_required', 'Name cannot be empty');

  const row = await db.begin(async (sql) => {
    const [ns] = await sql<SpaceRow[]>`select * from spaces where id = ${id} for update`;
    if (!ns) throw new CodedError('not_found', 'Space not found');

    let slug: string | undefined;
    if (changes.slug !== undefined) {
      if (ns.is_default) throw new CodedError('default_space_has_no_url', 'The default space has no URL and cannot be given one');
      slug = cleanSlug(changes.slug);
      if (!slug) throw new CodedError('space_slug_required', 'Space URL slug cannot be empty');
      await assertSpaceSlugAvailable(sql, slug, id);
    }

    if (name !== undefined) await sql`update spaces set name = ${name}, updated_at = now() where id = ${id}`;
    if (slug !== undefined) await sql`update spaces set slug = ${slug}, updated_at = now() where id = ${id}`;

    const [updated] = await sql<SpaceRow[]>`select * from spaces where id = ${id}`;
    return updated;
  });
  await refreshSpaceCache();
  return row;
}

// Inheriting nodes follow at once; a wider override is narrowed in the same
// transaction, so the space stays the upper bound.
export async function setSpaceAccessLevel(id: string, accessLevel: Visibility): Promise<void> {
  await db.begin(async (sql) => {
    await sql`update spaces set access_level = ${accessLevel}, updated_at = now() where id = ${id}`;
    await narrowOverridesToSpace(sql, id, accessLevel);
  });
  // Whether its addresses route only under the stamp follows the level.
  await refreshSpaceCache();
}

// Moves the content to the default space first, as a move would: a setting
// wider than the default space is narrowed to it, and a slug already taken
// there — by a node, or as another space's name, the first segment of its
// addresses — gets a short id suffix. A node named like the space deleted
// keeps its name: that space is gone.
export async function deleteSpace(id: string): Promise<void> {
  await db.begin(async (sql) => {
    const [ns] = await sql<SpaceRow[]>`select * from spaces where id = ${id} for update`;
    if (!ns) return;
    if (ns.is_default) throw new CodedError('default_space_undeletable', 'The default space cannot be deleted');
    const defaultNs = await getDefaultSpace(sql);
    await narrowOverridesToSpace(sql, id, defaultNs.access_level);
    await sql`
      update nodes n
      set space_id = ${defaultNs.id},
          slug = case
            when exists (select 1 from nodes d where d.space_id = ${defaultNs.id} and d.slug = n.slug)
              or exists (select 1 from spaces s where s.slug = n.slug and s.id <> ${id})
            then n.slug || '-' || substr(n.id::text, 1, 6)
            else n.slug
          end
      where n.space_id = ${id}`;
    await sql`delete from spaces where id = ${id}`;
  });
  await refreshSpaceCache();
}
