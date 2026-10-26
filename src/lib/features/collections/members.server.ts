// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One `contains` edge per member (docs/architecture/semantic-layer.md, "Collections"). Its
// type and properties are ordinary schema rows created on first use, not by a
// migration, so they come back after a truncate or an admin's delete.
// Every curated change runs under the collection's row lock and touches only
// members the editor may read; one they may not read is never moved or counted.
import { createHash } from 'node:crypto';
import { db, type TxSql } from '$lib/platform/db.server';
import { localize, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import type { SessionUser } from '$lib/features/auth/server';
import { nodePath } from '$lib/features/nodes';
import { LOCALIZED_TEXT_DATATYPE, MEMBERSHIP_PROPERTY_GROUP, MEMBERSHIP_RELATIONSHIP } from '$lib/features/semantic';
import { pluginLabel } from '$lib/plugins';
import type { NodeType } from '$lib/features/nodes/server';
import { readableNodes, namespaceJoin, namespaceSlugColumn } from '$lib/features/nodes/server';
import { compareMembers, isReorderOf, mergeVisibleOrder, nextPosition, positionOf } from './members';
import type { CollectionMember } from './types';
import { CodedError } from '$lib/platform/codedError';

export const CONTAINS = MEMBERSHIP_RELATIONSHIP;
const POSITION_PROPERTY = `${MEMBERSHIP_PROPERTY_GROUP}:position`;
const LABEL_PROPERTY = `${MEMBERSHIP_PROPERTY_GROUP}:label`;
const GROUP = MEMBERSHIP_PROPERTY_GROUP;

/** How far up a collection's ancestry is walked before a nesting is refused rather than trusted. */
const MAX_NESTING_DEPTH = 32;

const json = (sql: TxSql, value: Record<string, string>) => sql.json(value as never);

/** The `contains` type with its property group and properties, each created only when missing. */
async function ensureContainsType(sql: TxSql): Promise<void> {
  await sql`
    insert into relationship_types (slug, label, description, inverse_label)
    values (${CONTAINS},
      ${json(sql, { en: 'contains', de: 'enthält' })},
      ${json(sql, { en: 'A collection holds this node, in its place.', de: 'Eine Sammlung enthält diesen Knoten, an seiner Stelle.' })},
      ${json(sql, { en: 'is in', de: 'ist in' })})
    on conflict (slug) do nothing`;
  await sql`
    insert into property_groups (slug, label, description)
    values (${GROUP},
      ${json(sql, { en: 'Collection', de: 'Sammlung' })},
      ${json(sql, { en: 'What a collection records about its members.', de: 'Was eine Sammlung über ihre Mitglieder festhält.' })})
    on conflict (slug) do nothing`;
  await sql`
    insert into property_definitions (name, group_slug, label, datatype, description)
    values (${POSITION_PROPERTY}, ${GROUP},
      ${json(sql, { en: 'Position', de: 'Position' })}, 'number',
      ${json(sql, { en: "The member's place in its collection.", de: 'Die Stelle des Mitglieds in seiner Sammlung.' })})
    on conflict (name) do nothing`;
  await sql`
    insert into property_definitions (name, group_slug, label, datatype, description)
    values (${LABEL_PROPERTY}, ${GROUP},
      ${json(sql, { en: 'Label', de: 'Bezeichnung' })}, ${LOCALIZED_TEXT_DATATYPE},
      ${json(sql, { en: 'What the collection calls the member, in each language.', de: 'Wie die Sammlung das Mitglied nennt, in jeder Sprache.' })})
    on conflict (name) do nothing`;
  await sql`
    insert into relationship_type_properties (relationship_type_slug, property_name)
    values (${CONTAINS}, ${POSITION_PROPERTY}), (${CONTAINS}, ${LABEL_PROPERTY})
    on conflict do nothing`;
}

/**
 * Adds at the end, or leaves an existing member where it is. Locks the
 * collection row in the caller's transaction, so two members added at once
 * never share a position.
 */
export async function addMember(sql: TxSql, collectionId: string, nodeId: string): Promise<{ edgeId: string; position: number; added: boolean }> {
  await ensureContainsType(sql);
  const [locked] = await sql`select id from collections where id = ${collectionId} for update`;
  if (!locked) throw new CodedError('not_found', 'Collection not found');
  const [existing] = await sql<{ id: string; value: string | null }[]>`
    select l.id, lp.value from edges l
    left join edge_properties lp on lp.edge_id = l.id and lp.name = ${POSITION_PROPERTY}
    where l.source_id = ${collectionId} and l.target_id = ${nodeId} and l.relationship_type = ${CONTAINS}`;
  if (existing) return { edgeId: existing.id, position: positionOf(existing.value) ?? 0, added: false };
  const held = await sql<{ value: string }[]>`
    select lp.value from edges l join edge_properties lp on lp.edge_id = l.id and lp.name = ${POSITION_PROPERTY}
    where l.source_id = ${collectionId} and l.relationship_type = ${CONTAINS}`;
  const position = nextPosition(held.map((h) => h.value));
  const [link] = await sql<{ id: string }[]>`
    insert into edges (source_id, target_id, relationship_type) values (${collectionId}, ${nodeId}, ${CONTAINS}) returning id`;
  await sql`insert into edge_properties (edge_id, name, value) values (${link.id}, ${POSITION_PROPERTY}, ${String(position)})`;
  return { edgeId: link.id, position, added: true };
}

/** Locks a collection's row for the rest of the caller's transaction, so a member found or made under it is decided once. False when it is gone. */
export async function lockCollection(sql: TxSql, collectionId: string): Promise<boolean> {
  const [locked] = await sql`select id from collections where id = ${collectionId} for update`;
  return Boolean(locked);
}

/**
 * The integration's member document whose source record holds every key of
 * `match`. Run under lockCollection, so two requests for one file make one node.
 */
export async function findMemberDocument(
  sql: TxSql,
  collectionId: string,
  plugin: string,
  match: Readonly<Record<string, string | number>>
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select d.id from edges l join documents d on d.id = l.target_id
    where l.source_id = ${collectionId} and l.relationship_type = ${CONTAINS}
      and d.plugin = ${plugin} and d.source_ref @> ${sql.json(match as never)}
    order by l.created_at limit 1`;
  return row?.id ?? null;
}

export interface MemberDocumentRow {
  id: string;
  title: string;
  slug: string;
  namespace_slug: string | null;
  filename: string;
  mime: string | null;
  size: number | null;
  source_ref: Record<string, unknown>;
  position: number | null;
}

/** One integration's documents in a collection that a viewer may read, in the collection's order. */
export async function memberDocumentsOf(collectionId: string, plugin: string, user: SessionUser | null): Promise<MemberDocumentRow[]> {
  const rows = await db<(Omit<MemberDocumentRow, 'position'> & { position: string | null })[]>`
    select n.id, n.title, n.slug, ${db.unsafe(namespaceSlugColumn())}, d.filename, d.mime, d.size, d.source_ref, lp.value as position
    from edges l
    join nodes n on n.id = l.target_id ${db.unsafe(namespaceJoin('n'))}
    join documents d on d.id = n.id
    left join edge_properties lp on lp.edge_id = l.id and lp.name = ${POSITION_PROPERTY}
    where l.source_id = ${collectionId} and l.relationship_type = ${CONTAINS}
      and d.plugin = ${plugin} and ${readableNodes(user, 'n')}`;
  return rows.map((r) => ({ ...r, position: positionOf(r.position) })).sort(compareMembers);
}

/** Null for no label or a value that is not one. */
function labelOf(value: string | null | undefined): LocalizedText | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const text = Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim() !== '')) as LocalizedText;
    return Object.keys(text).length > 0 ? text : null;
  } catch {
    return null;
  }
}

/** The members a viewer may read, in their collection's order, numbered from 1 among themselves. */
export async function membersOf(collectionId: string, user: SessionUser | null): Promise<CollectionMember[]> {
  return (await membersOfMany([collectionId], user)).get(collectionId) ?? [];
}

/** membersOf for several collections in one query, as a page's collection blocks ask. */
export async function membersOfMany(collectionIds: readonly string[], user: SessionUser | null): Promise<Map<string, CollectionMember[]>> {
  type Read = Omit<CollectionMember, 'position'> & { position: number | null };
  const read = new Map<string, Read[]>(collectionIds.map((id) => [id, []]));
  if (collectionIds.length === 0) return new Map();
  const rows = await db<
    {
      collection_id: string;
      id: string;
      type: NodeType;
      slug: string;
      namespace_slug: string | null;
      title: string;
      position: string | null;
      label: string | null;
      plugin: string | null;
    }[]
  >`
    select l.source_id as collection_id, n.id, n.type, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title,
      (select value from edge_properties where edge_id = l.id and name = ${POSITION_PROPERTY} order by value limit 1) as position,
      (select value from edge_properties where edge_id = l.id and name = ${LABEL_PROPERTY} limit 1) as label,
      coalesce(d.plugin, mc.plugin) as plugin
    from edges l
    join nodes n on n.id = l.target_id ${db.unsafe(namespaceJoin('n'))}
    left join documents d on d.id = n.id and d.source = 'plugin'
    left join collections mc on mc.id = n.id
    where l.source_id = any(${[...collectionIds]}::uuid[]) and l.relationship_type = ${CONTAINS} and ${readableNodes(user, 'n')}`;
  for (const r of rows) {
    const labelText = labelOf(r.label);
    read.get(r.collection_id)?.push({
      id: r.id,
      type: r.type,
      title: r.title,
      url: nodePath(r.namespace_slug, r.slug),
      position: positionOf(r.position),
      label: labelText ? localize(labelText, '') || null : null,
      labelText,
      plugin: r.plugin,
      pluginLabel: r.plugin ? pluginLabel(r.plugin) : null,
    });
  }
  return new Map([...read].map(([id, members]) => [id, members.sort(compareMembers).map((member, index) => ({ ...member, position: index + 1 }))]));
}

/**
 * A rearrangement names the basis it was made against, so one made against an
 * order someone has changed since is refused rather than applied over it.
 */
function orderBasis(memberIds: readonly string[]): string {
  return createHash('sha256').update(memberIds.join('\n')).digest('hex').slice(0, 32);
}

export async function membersWithBasis(collectionId: string, user: SessionUser | null): Promise<{ members: CollectionMember[]; basis: string }> {
  const members = await membersOf(collectionId, user);
  return { members, basis: orderBasis(members.map((m) => m.id)) };
}

export type MembershipCode =
  | 'not_found'
  /** Its members come from its integration's source, not from an editor. */
  | 'mirrored'
  /** Not one the editor may read, or not a member. */
  | 'member_not_found'
  | 'self_member'
  /** The member holds the collection already, at some depth. */
  | 'cycle'
  /** Its ancestry runs deeper than is walked: refused rather than trusted. */
  | 'too_deep'
  /** The order changed since the editor read it. */
  | 'stale_order'
  /** The new order does not name the editor's members once each. */
  | 'invalid_order'
  | 'invalid_label';

// English, for the log.
const MEMBERSHIP_MESSAGES: Record<MembershipCode, string> = {
  not_found: 'Collection not found',
  mirrored: 'Its members come from its source.',
  member_not_found: 'Member not found',
  self_member: 'A collection cannot hold itself.',
  cycle: 'That collection holds this one already.',
  too_deep: 'Collections are nested too deeply here to add another.',
  stale_order: 'The order changed since it was read.',
  invalid_order: 'The order must name each member once.',
  invalid_label: 'A label is one text per language.',
};

/** The refusal of one membership change. */
function membershipRefused(code: MembershipCode): CodedError {
  return new CodedError(code, MEMBERSHIP_MESSAGES[code]);
}

/** Refuses a missing or a mirrored collection. */
async function lockCurated(sql: TxSql, collectionId: string): Promise<void> {
  const [row] = await sql<{ plugin: string | null }[]>`select plugin from collections where id = ${collectionId} for update`;
  if (!row) throw membershipRefused('not_found');
  if (row.plugin !== null) throw membershipRefused('mirrored');
}

/**
 * Asked on `sql`, the writing transaction's own connection: a second one taken
 * from the pool while this one holds the row lock could wait forever, every
 * connection held by a writer queued on that lock.
 */
async function readableOf(sql: TxSql, user: SessionUser | null, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await sql<{ id: string }[]>`select n.id from nodes n where n.id in ${sql(ids)} and ${readableNodes(user, 'n')}`;
  return new Set(rows.map((r) => r.id));
}

/** Includes the members the viewer may not read. */
async function allMembers(sql: TxSql, collectionId: string): Promise<{ edgeId: string; nodeId: string }[]> {
  const rows = await sql<{ edge_id: string; node_id: string; title: string; position: string | null }[]>`
    select l.id as edge_id, l.target_id as node_id, n.title,
      (select value from edge_properties where edge_id = l.id and name = ${POSITION_PROPERTY} order by value limit 1) as position
    from edges l join nodes n on n.id = l.target_id
    where l.source_id = ${collectionId} and l.relationship_type = ${CONTAINS}`;
  return rows
    .map((r) => ({ edgeId: r.edge_id, nodeId: r.node_id, title: r.title, position: positionOf(r.position) }))
    .sort(compareMembers)
    .map(({ edgeId, nodeId }) => ({ edgeId, nodeId }));
}

/** Numbers 1..n in one delete and one insert, whatever the count. */
async function renumber(sql: TxSql, edgeIds: readonly string[]): Promise<void> {
  if (edgeIds.length === 0) return;
  await sql`delete from edge_properties where name = ${POSITION_PROPERTY} and edge_id in ${sql(edgeIds)}`;
  await sql`insert into edge_properties ${sql(edgeIds.map((edgeId, i) => ({ edge_id: edgeId, name: POSITION_PROPERTY, value: String(i + 1) })))}`;
}

/**
 * Walks every ancestor, whoever may read it. Stops at MAX_NESTING_DEPTH and
 * refuses what it could not see the end of.
 */
async function nestingOf(sql: TxSql, collectionId: string, memberId: string): Promise<'ok' | 'cycle' | 'too_deep'> {
  const [row] = await sql<{ cycle: boolean; deepest: number }[]>`
    with recursive ancestors(id, depth) as (
      select l.source_id, 1
      from edges l join collections c on c.id = l.source_id
      where l.target_id = ${collectionId} and l.relationship_type = ${CONTAINS}
      union
      select l.source_id, a.depth + 1
      from ancestors a
      join edges l on l.target_id = a.id and l.relationship_type = ${CONTAINS}
      join collections c on c.id = l.source_id
      where a.depth < ${MAX_NESTING_DEPTH}
    )
    select coalesce(bool_or(id = ${memberId}), false) as cycle, coalesce(max(depth), 0)::int as deepest from ancestors`;
  if (row.cycle) return 'cycle';
  return row.deepest >= MAX_NESTING_DEPTH ? 'too_deep' : 'ok';
}

/** A foreign-key or check violation: a node gone mid-request, or a collection asked to hold itself. */
function membershipFailure(error: unknown): CodedError | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === '23503') return membershipRefused('member_not_found');
  if (code === '23514') return membershipRefused('self_member');
  return null;
}

async function inMembershipTransaction<T>(run: (sql: TxSql) => Promise<T>): Promise<T> {
  try {
    return (await db.begin(run)) as T;
  } catch (error) {
    throw membershipFailure(error) ?? error;
  }
}

/**
 * A collection added as a member is checked for a loop under one advisory lock,
 * so two collections added into each other at once cannot both pass.
 */
export async function addCuratedMember(collectionId: string, nodeId: string, user: SessionUser | null): Promise<{ added: boolean }> {
  if (nodeId === collectionId) throw membershipRefused('self_member');
  if (!(await readableOf(db, user, [nodeId])).has(nodeId)) throw membershipRefused('member_not_found');
  return inMembershipTransaction(async (sql) => {
    await ensureContainsType(sql);
    await lockCurated(sql, collectionId);
    const [member] = await sql<{ type: NodeType }[]>`select type from nodes where id = ${nodeId}`;
    if (!member) throw membershipRefused('member_not_found');
    if (member.type === 'collection') {
      await sql`select pg_advisory_xact_lock(hashtext('collection-nesting'))`;
      const nesting = await nestingOf(sql, collectionId, nodeId);
      if (nesting !== 'ok') throw membershipRefused(nesting);
    }
    const { added } = await addMember(sql, collectionId, nodeId);
    return { added };
  });
}

/** Refuses a member the editor may not read. */
async function editableMember(sql: TxSql, collectionId: string, nodeId: string, user: SessionUser | null): Promise<string> {
  const [link] = await sql<{ id: string }[]>`
    select id from edges where source_id = ${collectionId} and target_id = ${nodeId} and relationship_type = ${CONTAINS}`;
  if (!link || !(await readableOf(sql, user, [nodeId])).has(nodeId)) throw membershipRefused('member_not_found');
  return link.id;
}

/** The node itself stays. */
export async function removeCuratedMember(collectionId: string, nodeId: string, user: SessionUser | null): Promise<void> {
  await inMembershipTransaction(async (sql) => {
    await lockCurated(sql, collectionId);
    const edgeId = await editableMember(sql, collectionId, nodeId, user);
    await sql`delete from edges where id = ${edgeId}`;
    await renumber(sql, (await allMembers(sql, collectionId)).map((m) => m.edgeId));
  });
}

/**
 * The editor's readable members take their slots in the new order; every member
 * they may not read keeps its own slot.
 */
export async function reorderCuratedMembers(collectionId: string, order: readonly string[], basis: string, user: SessionUser | null): Promise<void> {
  await inMembershipTransaction(async (sql) => {
    await lockCurated(sql, collectionId);
    const all = await allMembers(sql, collectionId);
    const visible = await readableOf(sql, user, all.map((m) => m.nodeId));
    const seen = all.filter((m) => visible.has(m.nodeId)).map((m) => m.nodeId);
    if (orderBasis(seen) !== basis) throw membershipRefused('stale_order');
    if (!isReorderOf(seen, order)) throw membershipRefused('invalid_order');
    const linkOf = new Map(all.map((m) => [m.nodeId, m.edgeId]));
    const merged = mergeVisibleOrder(all.map((m) => m.nodeId), visible, order);
    await renumber(sql, merged.map((nodeId) => linkOf.get(nodeId)!));
  });
}

/** null, or nothing but blanks, clears the label. */
export async function setCuratedMemberLabel(collectionId: string, nodeId: string, label: unknown, user: SessionUser | null): Promise<LocalizedText | null> {
  let text: LocalizedText | null = null;
  if (label !== null) {
    let parsed: LocalizedText;
    try {
      parsed = parseLocalizedText(label);
    } catch {
      throw membershipRefused('invalid_label');
    }
    text = Object.keys(parsed).length > 0 ? parsed : null;
  }
  await inMembershipTransaction(async (sql) => {
    await ensureContainsType(sql);
    await lockCurated(sql, collectionId);
    const edgeId = await editableMember(sql, collectionId, nodeId, user);
    await sql`delete from edge_properties where edge_id = ${edgeId} and name = ${LABEL_PROPERTY}`;
    if (text) await sql`insert into edge_properties (edge_id, name, value) values (${edgeId}, ${LABEL_PROPERTY}, ${JSON.stringify(text)})`;
  });
  return text;
}
