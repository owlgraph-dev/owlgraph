// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The class hierarchy (docs/architecture/semantic-layer.md), one single-parent tree:
//   L0  node                         kind 'root'    abstract, never assigned
//   L1  page, document, collection   kind 'type'    the node types
//   L2+ domain classes               kind 'domain'  admin-defined, any depth
// nodes.type caches the class's L1 slug and composite FKs keep the two in step,
// so the rules below are friendly errors over what the database enforces anyway.
import { db, type TxSql } from '$lib/platform/db.server';
import { readableNodes, type NodeType } from '$lib/features/nodes/server';
import { localize, compareLabels, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { localizedJson, parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import { NAME_RE } from './properties.server';
import { PARAMETER_GROUP, mergeChainDefinitions } from './propertyGroups';
import { orderClassTree } from './nodeClassTree';
import { localizeDefinition } from './localizeSchema';
import { ROOT_CLASS_SEED, TYPE_CLASS_SEEDS } from './schemaSeeds.server';
import { nodePath } from '$lib/features/nodes';
import type { ClassFields, ClassFieldGroup, NodeClassKind, NodeClassOption } from './nodeClass';
import { CodedError } from '$lib/platform/codedError';

export const ROOT_CLASS_SLUG = 'node';
export const PAGE_CLASS_SLUG = 'page';
export const DOCUMENT_CLASS_SLUG = 'document';
export const COLLECTION_CLASS_SLUG = 'collection';
// Core schema, never admin-creatable; their slugs are reserved.
export const CORE_CLASS_SLUGS: ReadonlySet<string> = new Set([ROOT_CLASS_SLUG, PAGE_CLASS_SLUG, DOCUMENT_CLASS_SLUG, COLLECTION_CLASS_SLUG]);

// label and description are stored LocalizedText; each channel resolves them (docs/architecture/languages.md).
export interface NodeClassRow {
  id: string;
  slug: string;
  label: LocalizedText;
  description: LocalizedText;
  property_group: string | null;
  overview_node_id: string | null;
  kind: NodeClassKind;
  parent_id: string | null; // null only for the root
  node_type: NodeType | null; // nearest L1 slug; null only for the root
}

export interface NodeClassListRow extends NodeClassRow {
  node_count: number;
  overview_title: string | null;
  overview_path: string | null;
  parent_slug: string | null;
  depth: number; // root 0, types 1, direct subclasses 2, …
}

const CLASS_COLUMNS = 'c.id, c.slug, c.label, c.description, c.property_group, c.overview_node_id, c.kind, c.parent_id, c.node_type';
// Same list without the alias — for an INSERT's `returning`, which has none.
const CLASS_COLUMNS_BARE = CLASS_COLUMNS.replaceAll('c.', '');

// Resolved for the request's locale; the label falls back to the slug.
export function toNodeClassOption(row: NodeClassRow, depth: number): NodeClassOption {
  return {
    id: row.id,
    slug: row.slug,
    label: localize(row.label, row.slug),
    description: localize(row.description, ''),
    kind: row.kind,
    parentId: row.parent_id,
    nodeType: row.node_type,
    depth,
  };
}

// Depth-first, so the table and every picker read as a tree. SQL only measures
// `depth`: siblings are ordered in TS by their resolved label, which SQL can't
// do over a LocalizedText.
export async function listNodeClasses(): Promise<NodeClassListRow[]> {
  const rows = await db<(NodeClassRow & { depth: number; node_count: number; overview_title: string | null; overview_slug: string | null; overview_namespace_slug: string | null; parent_slug: string | null })[]>`
    with recursive tree as (
      select c.id, 0 as depth
      from node_classes c where c.parent_id is null
      union all
      select c.id, tree.depth + 1
      from node_classes c join tree on c.parent_id = tree.id
    )
    select ${db.unsafe(CLASS_COLUMNS)}, tree.depth,
           (select count(*)::int from nodes n where n.class_id = c.id) as node_count,
           o.title as overview_title, o.slug as overview_slug, ons.slug as overview_namespace_slug,
           p.slug as parent_slug
    from node_classes c
    join tree on tree.id = c.id
    left join node_classes p on p.id = c.parent_id
    left join nodes o on o.id = c.overview_node_id
    left join namespaces ons on ons.id = o.namespace_id`;
  const ordered = orderClassTree(rows, (a, b) => compareLabels(localize(a.label, a.slug), localize(b.label, b.slug)) || a.slug.localeCompare(b.slug));
  return ordered.map(({ overview_slug, overview_namespace_slug, ...r }) => ({
    ...r,
    overview_path: overview_slug ? nodePath(overview_namespace_slug, overview_slug) : null,
  }));
}

// Every assignable class, in tree order: the one list every picker and catalogue reads.
export async function listNodeClassOptions(): Promise<NodeClassOption[]> {
  return (await listNodeClasses()).filter((c) => c.kind !== 'root').map((c) => toNodeClassOption(c, c.depth));
}

export async function getNodeClass(id: string, sql: TxSql = db): Promise<NodeClassRow | null> {
  const [row] = await sql<NodeClassRow[]>`select ${sql.unsafe(CLASS_COLUMNS)} from node_classes c where c.id = ${id}`;
  return row ?? null;
}

export async function getNodeClassBySlug(slug: string): Promise<NodeClassRow | null> {
  const [row] = await db<NodeClassRow[]>`select ${db.unsafe(CLASS_COLUMNS)} from node_classes c where c.slug = ${slug}`;
  return row ?? null;
}

// The classes of readable nodes and every class above them. Never the whole
// catalogue, so a picker shows no class that only hidden content carries.
export async function listClassIdsInUse(user: { id: string; role: string } | null): Promise<Set<string>> {
  const rows = await db<{ id: string }[]>`
    with recursive used as (
      select distinct n.class_id as id from nodes n where ${readableNodes(user, 'n')}
      union
      select c.parent_id from node_classes c join used on used.id = c.id where c.parent_id is not null
    )
    select id from used`;
  return new Set(rows.map((r) => r.id));
}

// What new nodes are classified with and setNodeClass(null) resets to. Missing
// means an unmigrated database, or a test truncate without ensureCoreClasses.
export async function getTypeClass(sql: TxSql, type: NodeType): Promise<NodeClassRow> {
  const [row] = await sql<NodeClassRow[]>`select ${sql.unsafe(CLASS_COLUMNS)} from node_classes c where c.kind = 'type' and c.slug = ${type}`;
  if (!row) throw new CodedError('core_class_missing', `Core class "${type}" is missing — has the database been migrated?`);
  return row;
}

// The baseline's seed rows of the core classes again, for the e2e suite, whose
// truncate empties node_classes through the overview FK. An existing row keeps
// its label; only the hierarchy columns are asserted. Keep the two in step.
export async function ensureCoreClasses(sql: TxSql = db): Promise<void> {
  await sql`
    insert into node_classes (slug, label, description, kind)
    values (${ROOT_CLASS_SEED.slug}, ${localizedJson(sql, ROOT_CLASS_SEED.label)}, ${localizedJson(sql, ROOT_CLASS_SEED.description)}, 'root')
    on conflict (slug) do update
      set kind = 'root', parent_id = null, parent_kind = null, node_type = null, parent_node_type = null`;
  const [root] = await sql<{ id: string }[]>`select id from node_classes where slug = ${ROOT_CLASS_SLUG}`;
  for (const t of TYPE_CLASS_SEEDS) {
    await sql`
      insert into node_classes (slug, label, description, property_group, kind, parent_id, parent_kind, node_type)
      values (${t.slug}, ${localizedJson(sql, t.label)}, ${localizedJson(sql, t.description)},
              (select slug from property_groups where slug = ${t.group}),
              'type', ${root.id}, 'root', ${t.slug})
      on conflict (slug) do update
        set kind = 'type', parent_id = ${root.id}, parent_kind = 'root', node_type = excluded.node_type, parent_node_type = null`;
  }
}

// `union`, not `union all`, terminates even on a cycle.
async function subtreeIds(sql: TxSql, rootId: string): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    with recursive down as (
      select id from node_classes where id = ${rootId}
      union
      select c.id from node_classes c join down on c.parent_id = down.id
    )
    select id from down`;
  return rows.map((r) => r.id);
}

function isFkViolationOn(err: { code?: string; constraint_name?: string }, ...constraints: string[]): boolean {
  return err.code === '23503' && !!err.constraint_name && constraints.includes(err.constraint_name);
}

async function validateClassRefs(sql: TxSql, propertyGroup: string | null, overviewNodeId: string | null): Promise<void> {
  if (propertyGroup === PARAMETER_GROUP) {
    throw new CodedError('group_not_found', `"${PARAMETER_GROUP}" is reserved for query-template parameters and cannot be a class's group.`);
  }
  if (propertyGroup) {
    const [g] = await sql`select 1 from property_groups where slug = ${propertyGroup}`;
    if (!g) throw new CodedError('group_not_found', 'Unknown property group');
  }
  if (overviewNodeId) {
    const [n] = await sql`select 1 from nodes where id = ${overviewNodeId}`;
    if (!n) throw new CodedError('node_not_found', 'Unknown overview page');
  }
}

// Creates only domain classes, whose parent fixes the node type they may be
// assigned to. A core class keeps its slug, kind and parent; the rest stays
// editable. A move to another node type is refused (nodes_class_type_fkey) once
// any node carries the subtree: a page can't become a document by moving its class.
export async function upsertNodeClass(def: {
  id?: string | null;
  slug: string;
  label?: LocalizedText;
  description?: LocalizedText;
  propertyGroup?: string | null;
  overviewNodeId?: string | null;
  parentId?: string | null;
}): Promise<NodeClassRow> {
  const slug = String(def.slug ?? '').trim();
  if (!NAME_RE.test(slug)) {
    throw new CodedError('invalid_key', 'Class key may only contain letters, numbers, underscores and hyphens (no spaces).');
  }
  const label = localizedJson(db, parseLocalizedText(def.label));
  const description = localizedJson(db, parseLocalizedText(def.description));
  const propertyGroup = String(def.propertyGroup ?? '').trim() || null;
  const overviewNodeId = String(def.overviewNodeId ?? '').trim() || null;
  const parentId = String(def.parentId ?? '').trim() || null;

  try {
    return await db.begin(async (sql) => {
      await validateClassRefs(sql, propertyGroup, overviewNodeId);

      if (def.id) {
        const [existing] = await sql<NodeClassRow[]>`select ${sql.unsafe(CLASS_COLUMNS)} from node_classes c where c.id = ${def.id} for update`;
        if (!existing) throw new CodedError('not_found', 'Class not found');

        if (existing.kind !== 'domain') {
          if (slug !== existing.slug) throw new CodedError('class_protected', `"${existing.slug}" is a core class; its key cannot change.`);
          if (parentId && parentId !== existing.parent_id) throw new CodedError('class_protected', `"${existing.slug}" is a core class; it cannot be moved.`);
          const [row] = await sql<NodeClassRow[]>`
            update node_classes c set label = ${label}, description = ${description},
              property_group = ${propertyGroup}, overview_node_id = ${overviewNodeId}, updated_at = now()
            where c.id = ${def.id}
            returning ${sql.unsafe(CLASS_COLUMNS)}`;
          return row;
        }

        if (CORE_CLASS_SLUGS.has(slug)) throw new CodedError('reserved_key', `"${slug}" is reserved for a core class.`);
        const [row] = await sql<NodeClassRow[]>`
          update node_classes c set slug = ${slug}, label = ${label}, description = ${description},
            property_group = ${propertyGroup}, overview_node_id = ${overviewNodeId}, updated_at = now()
          where c.id = ${def.id}
          returning ${sql.unsafe(CLASS_COLUMNS)}`;
        if (parentId && parentId !== existing.parent_id) return reparentTx(sql, row, parentId);
        return row;
      }

      if (CORE_CLASS_SLUGS.has(slug)) throw new CodedError('reserved_key', `"${slug}" is reserved for a core class.`);
      if (!parentId) throw new CodedError('parent_required', 'A class needs a parent: a node type or another class.');
      const parent = await getNodeClass(parentId, sql);
      if (!parent || parent.kind === 'root') throw new CodedError('parent_invalid', 'Unknown parent class');
      const [row] = await sql<NodeClassRow[]>`
        insert into node_classes (slug, label, description, property_group, overview_node_id, kind, parent_id, parent_kind, node_type, parent_node_type)
        values (${slug}, ${label}, ${description}, ${propertyGroup}, ${overviewNodeId}, 'domain', ${parent.id}, ${parent.kind}, ${parent.node_type}, ${parent.node_type})
        returning ${sql.unsafe(CLASS_COLUMNS_BARE)}`;
      return row;
    });
  } catch (e) {
    const err = e as Error & { code?: string; constraint_name?: string };
    if (err.code === '23505') throw new CodedError('class_slug_taken', 'A class with that key already exists.');
    if (isFkViolationOn(err, 'nodes_class_type_fkey')) {
      throw new CodedError('class_reparent_blocked', 'Cannot move this class under a different node type while nodes still carry it or one of its subclasses.');
    }
    throw e;
  }
}

// The caller locks the row. One UPDATE over the subtree, so the
// parent_node_type FK sees a consistent tree at statement end.
async function reparentTx(sql: TxSql, row: NodeClassRow, parentId: string): Promise<NodeClassRow> {
  const parent = await getNodeClass(parentId, sql);
  if (!parent || parent.kind === 'root') throw new CodedError('parent_invalid', 'Unknown parent class');
  const subtree = await subtreeIds(sql, row.id);
  if (subtree.includes(parent.id)) throw new CodedError('class_cycle', 'A class cannot be moved under itself or one of its subclasses.');
  const [updated] = await sql<NodeClassRow[]>`
    update node_classes c
      set parent_id = case when c.id = ${row.id} then ${parent.id} else c.parent_id end,
          parent_kind = case when c.id = ${row.id} then ${parent.kind} else c.parent_kind end,
          node_type = ${parent.node_type},
          parent_node_type = ${parent.node_type},
          updated_at = now()
    where c.id = any(${subtree}::uuid[])
    returning ${sql.unsafe(CLASS_COLUMNS)}`;
  return updated.id === row.id ? updated : ((await getNodeClass(row.id, sql)) as NodeClassRow);
}

// Only domain classes can be deleted.
export async function deleteNodeClass(id: string): Promise<void> {
  try {
    const rows = await db`delete from node_classes where id = ${id} and kind = 'domain' returning id`;
    if (rows.length === 0) {
      const existing = await getNodeClass(id);
      if (existing) throw new CodedError('class_protected', `"${existing.slug}" is a core class and cannot be deleted.`);
      throw new CodedError('not_found', 'Class not found');
    }
  } catch (e) {
    const err = e as Error & { code?: string; constraint_name?: string };
    if (isFkViolationOn(err, 'nodes_class_id_fkey', 'nodes_class_type_fkey')) {
      throw new CodedError('class_in_use', 'Cannot delete a class that is still assigned to nodes.');
    }
    if (isFkViolationOn(err, 'node_classes_parent_id_fkey', 'node_classes_parent_kind_fkey', 'node_classes_parent_node_type_fkey')) {
      throw new CodedError('class_has_children', 'Cannot delete a class that still has subclasses.');
    }
    throw e;
  }
}

// null resets to the node's own type: there is no unclassified state. An
// ordinary node write, gated by the caller, not by class:manage. Property
// values stay; a class only changes which groups render as fields.
export async function setNodeClass(id: string, classId: string | null): Promise<NodeClassRow> {
  return db.begin(async (sql) => {
    const [node] = await sql<{ type: NodeType }[]>`select type from nodes where id = ${id} for update`;
    if (!node) throw new CodedError('not_found', 'Not found');
    const target = classId === null ? await getTypeClass(sql, node.type) : await getNodeClass(classId, sql);
    if (!target) throw new CodedError('class_not_found', 'Unknown class');
    if (target.kind === 'root') throw new CodedError('class_not_assignable', 'The root class is abstract and cannot be assigned.');
    if (target.node_type !== node.type) {
      throw new CodedError('class_type_mismatch', `"${localize(target.label, target.slug)}" is a ${target.node_type} class and cannot be assigned to a ${node.type}.`);
    }
    await sql`update nodes set class_id = ${target.id}, type = ${target.node_type}, updated_at = now() where id = ${id}`;
    return target;
  });
}

// The union of every property group on the class chain, the own class first;
// on a collision the nearer class wins (docs/architecture/semantic-layer.md). Labels are
// resolved here, for the request's locale.
export async function getNodeClassFields(classId: string | null | undefined): Promise<ClassFields | null> {
  if (!classId) return null;
  const chain = await db<(NodeClassRow & { distance: number; group_label: LocalizedText | null; overview_slug: string | null; overview_namespace_slug: string | null })[]>`
    with recursive up as (
      select c.id, c.parent_id, 0 as distance from node_classes c where c.id = ${classId}
      union all
      select c.id, c.parent_id, up.distance + 1 from node_classes c join up on c.id = up.parent_id
    )
    select ${db.unsafe(CLASS_COLUMNS)}, up.distance, g.label as group_label, o.slug as overview_slug, ons.slug as overview_namespace_slug
    from up
    join node_classes c on c.id = up.id
    left join property_groups g on g.slug = c.property_group
    left join nodes o on o.id = c.overview_node_id
    left join namespaces ons on ons.id = o.namespace_id
    order by up.distance`;
  const own = chain[0];
  if (!own) return null;
  const groups: ClassFieldGroup[] = chain
    .filter((c) => c.property_group)
    .map((c) => ({
      slug: c.property_group!,
      label: localize(c.group_label, c.property_group!),
      fromClass: { id: c.id, slug: c.slug, label: localize(c.label, c.slug) },
    }));
  const rows = groups.length
    ? await db<{ name: string; label: LocalizedText; datatype: string; description: LocalizedText; group: string }[]>`
        select name, label, datatype, description, group_slug as "group" from property_definitions
        where group_slug = any(${groups.map((g) => g.slug)}) order by name`
    : [];
  const defs = rows.map((d) => localizeDefinition(d));
  const definitions = mergeChainDefinitions(groups.map((g) => ({ slug: g.slug, definitions: defs.filter((d) => d.group === g.slug) })));
  return {
    nodeClass: {
      // The chain runs own class -> root, so its length - 1 is the depth.
      ...toNodeClassOption(own, chain.length - 1),
      overviewPath: own.overview_slug ? nodePath(own.overview_namespace_slug, own.overview_slug) : null,
    },
    groups,
    definitions,
  };
}
