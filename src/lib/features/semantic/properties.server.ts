// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Property values, groups and definitions; compiling a filter over them is
// features/query/filterSql.server.ts's. A value comes from a page's content
// (source='inline') or is set on any node directly (source='manual').
import { db, type TxSql } from '$lib/platform/db.server';
import { timed } from '$lib/platform/logger.server';
import { readableNodes } from '$lib/features/nodes/server';
import type { LocalizedText } from '$lib/platform/i18n/localizedText';
import { localizedJson, parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import { PARAMETER_GROUP, isParameterName } from './propertyGroups';
import { MEMBERSHIP_PROPERTY_GROUP } from './membership';
import { localizeGroup, localizeSuggestion, byLabel, type PropertyGroupOption, type PropertySuggestion } from './localizeSchema';
import { isUnknownType, type JsonNode } from '$lib/features/content';
import { CodedError } from '$lib/platform/codedError';
export { DEFAULT_PROPERTY_GROUP } from './propertyGroups';

// A queryBlock's marks are template parameters, not facts about this page:
// stop there, so they never reach node_properties. A `parameter:` mark is
// skipped wherever it sits, pasted outside its template too.
export function collectProperties(node: JsonNode | null | undefined, out: { name: string; value: string }[]) {
  if (!node) return;
  if (node.type === 'queryBlock') return;
  // A block this build cannot read claims nothing about the page until its kind is back (docs/architecture/blocks/anatomy.md, "Unknown blocks").
  if (isUnknownType(node)) return;
  if (node.type === 'text' && node.text) {
    for (const mark of node.marks ?? []) {
      if (mark.type === 'semanticProperty' && mark.attrs?.propName && !isParameterName(String(mark.attrs.propName))) {
        out.push({ name: String(mark.attrs.propName), value: String(node.text) });
      }
    }
  }
  for (const child of node.content ?? []) collectProperties(child, out);
}

// The page's inline rows, regenerated from its content, the source of truth.
export function syncProperties(...args: Parameters<typeof syncPropertiesImpl>): ReturnType<typeof syncPropertiesImpl> {
  return timed('semantic.sync_properties', () => syncPropertiesImpl(...args)) as ReturnType<typeof syncPropertiesImpl>;
}

async function syncPropertiesImpl(sql: TxSql, pageId: string, doc: JsonNode) {
  const found: { name: string; value: string }[] = [];
  collectProperties(doc, found);
  const seen = new Set<string>();
  const rows = found.filter((a) => {
    const key = JSON.stringify([a.name, a.value]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  await sql`delete from node_properties where node_id = ${pageId} and source = 'inline'`;
  for (const r of rows) {
    await sql`insert into node_properties (node_id, name, value, source) values (${pageId}, ${r.name}, ${r.value}, 'inline')`;
  }
}

export async function getNodeProperties(id: string) {
  return db`select name, value, source from node_properties where node_id = ${id} order by source, name, value`;
}

// Per node, the first non-empty property whose local name is one of
// `localNames`, earlier names first, whatever group carries it.
export async function getPropertyByLocalName(ids: string[], localNames: string[]): Promise<Map<string, string>> {
  if (!ids.length || !localNames.length) return new Map();
  const rows = await db<{ node_id: string; value: string }[]>`
    select distinct on (node_id) node_id, value from node_properties
    where node_id = any(${ids}::uuid[]) and regexp_replace(name, '^.*:', '') = any(${localNames}::text[]) and btrim(value) <> ''
    order by node_id, array_position(${localNames}::text[], regexp_replace(name, '^.*:', '')), name`;
  return new Map(rows.map((r) => [r.node_id, r.value]));
}

// Beside the inline rows, so queries see both, but managed apart from the content sync.
export async function getManualProperties(id: string): Promise<{ name: string; value: string }[]> {
  const rows = await db<{ name: string; value: string }[]>`
    select name, value from node_properties where node_id = ${id} and source = 'manual' order by name, value`;
  return rows.map((r) => ({ name: r.name, value: r.value }));
}

// Replaces them wholesale; returns the cleaned, stored list.
export async function setManualProperties(id: string, props: unknown): Promise<{ name: string; value: string }[]> {
  const list = Array.isArray(props) ? props : [];
  const seen = new Set<string>();
  const clean: { name: string; value: string }[] = [];
  for (const a of list) {
    const name = String((a as { name?: unknown })?.name ?? '').trim();
    const value = String((a as { value?: unknown })?.value ?? '').trim();
    if (!name || isParameterName(name)) continue; // the parameter group is reserved, never a page fact
    const key = JSON.stringify([name, value]);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ name, value });
  }
  await db.begin(async (sql) => {
    await sql`delete from node_properties where node_id = ${id} and source = 'manual'`;
    for (const a of clean) {
      await sql`insert into node_properties (node_id, name, value, source) values (${id}, ${a.name}, ${a.value}, 'manual')`;
    }
  });
  return clean;
}

// Not viewer-scoped: the caller filters the rows to what the viewer may read.
export async function findPagesByProperty(name: string, value?: string) {
  if (value !== undefined && value !== null && value !== '') {
    return db`
      select p.id, n.slug, n.title, pp.value
      from node_properties pp join pages p on p.id = pp.node_id join nodes n on n.id = p.id
      where pp.name = ${name} and pp.value = ${value}
      order by n.title`;
  }
  return db`
    select p.id, n.slug, n.title, pp.value
    from node_properties pp join pages p on p.id = pp.node_id join nodes n on n.id = p.id
    where pp.name = ${name}
    order by n.title`;
}

// Names on nodes the user may read, counted there: a name only hidden content
// carries is neither named nor counted, as with the tag catalog.
export async function listPropertyNames(user: { id: string; role: string } | null): Promise<{ name: string; count: number }[]> {
  return db<{ name: string; count: number }[]>`
    select p.name, count(*)::int as count from node_properties p join nodes n on n.id = p.node_id
    where ${readableNodes(user, 'n')}
    group by p.name order by p.name`;
}


// One round trip for every name a filter references.
export async function getPropertyDatatypes(names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const rows = await db<{ name: string; datatype: string }[]>`
    select name, datatype from property_definitions where name in ${db(names)}`;
  return new Map(rows.map((r) => [r.name, r.datatype]));
}

// Also the rule for class keys and relationship type slugs.
export const NAME_RE = /^[\w-]+$/;

// Stored LocalizedText, resolved before it leaves the server; only the settings
// pages, which edit the maps, receive them (docs/architecture/languages.md).
export interface PropertyGroupRow {
  slug: string;
  label: LocalizedText;
  description: LocalizedText;
}

export async function listPropertyGroups(): Promise<PropertyGroupRow[]> {
  return db<PropertyGroupRow[]>`
    select slug, label, description from property_groups order by slug`;
}

export async function listPropertyGroupOptions(): Promise<PropertyGroupOption[]> {
  return (await listPropertyGroups()).map(localizeGroup).sort(byLabel);
}

// Which group renders as a node's fields is its class's choice, never the group's.
export async function upsertPropertyGroup(def: { slug: string; label?: LocalizedText; description?: LocalizedText }): Promise<PropertyGroupRow> {
  const slug = String(def.slug ?? '').trim();
  if (!NAME_RE.test(slug)) {
    throw new CodedError('invalid_key', 'A key may only contain letters, numbers, underscores and hyphens (no spaces).');
  }
  if (slug === PARAMETER_GROUP) {
    throw new CodedError('reserved_key', `"${PARAMETER_GROUP}" is reserved for query-template parameters and cannot be a property group.`);
  }
  const label = parseLocalizedText(def.label);
  const description = parseLocalizedText(def.description);
  const [row] = await db<PropertyGroupRow[]>`
    insert into property_groups (slug, label, description)
    values (${slug}, ${localizedJson(db, label)}, ${localizedJson(db, description)})
    on conflict (slug) do update
      set label = excluded.label, description = excluded.description
    returning slug, label, description`;
  return row;
}

// on delete restrict raises a foreign-key violation while the group owns definitions.
export async function deletePropertyGroup(slug: string) {
  try {
    await db`delete from property_groups where slug = ${slug}`;
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === '23503') {
      throw new CodedError('group_not_empty', 'Cannot delete a group that still has properties defined in it.');
    }
    throw e;
  }
}

export interface PropertyDefinitionRow {
  name: string;
  group_slug: string;
  label: LocalizedText;
  datatype: string;
  description: LocalizedText;
}

export async function listPropertyDefinitions(): Promise<PropertyDefinitionRow[]> {
  return db<PropertyDefinitionRow[]>`
    select name, group_slug, label, datatype, description from property_definitions order by name`;
}

// The name is composed here, never taken from the caller: a mismatch would
// meet the name-matches-group check as a raw SQL error.
export async function upsertPropertyDefinition(def: {
  localName: string;
  groupSlug: string;
  label?: LocalizedText;
  datatype?: string;
  description?: LocalizedText;
}): Promise<PropertyDefinitionRow> {
  const localName = String(def.localName ?? '').trim();
  const groupSlug = String(def.groupSlug ?? '').trim();
  if (!NAME_RE.test(localName)) {
    throw new CodedError('invalid_key', 'Property name may only contain letters, numbers, underscores and hyphens (no spaces).');
  }
  if (!NAME_RE.test(groupSlug)) {
    throw new CodedError('invalid_key', 'Group may only contain letters, numbers, underscores and hyphens (no spaces).');
  }
  if (groupSlug === PARAMETER_GROUP) {
    throw new CodedError('reserved_group', `"${PARAMETER_GROUP}" is reserved for query-template parameters; properties cannot be defined in it.`);
  }
  const name = `${groupSlug}:${localName}`;
  const label = parseLocalizedText(def.label);
  let datatype = String(def.datatype ?? 'text').trim() || 'text';
  // A collection's own properties (membership.ts): an admin may name and
  // describe them, never define one or change its datatype.
  if (groupSlug === MEMBERSHIP_PROPERTY_GROUP) {
    const [existing] = await db<{ datatype: string }[]>`select datatype from property_definitions where name = ${name}`;
    if (!existing) throw new CodedError('reserved_group', `"${MEMBERSHIP_PROPERTY_GROUP}" holds a collection's own properties; properties cannot be defined in it.`);
    datatype = existing.datatype;
  }
  const description = parseLocalizedText(def.description);
  const [row] = await db<PropertyDefinitionRow[]>`
    insert into property_definitions (name, group_slug, label, datatype, description)
    values (${name}, ${groupSlug}, ${localizedJson(db, label)}, ${datatype}, ${localizedJson(db, description)})
    on conflict (name) do update
      set group_slug = excluded.group_slug, label = excluded.label,
          datatype = excluded.datatype, description = excluded.description
    returning name, group_slug, label, datatype, description`;
  return row;
}

export async function deletePropertyDefinition(name: string) {
  await db`delete from property_definitions where name = ${name}`;
}

// Every definition, plus names in use without one (no label, no datatype). A
// name in use comes only from nodes the user may read.
export interface PropertySuggestionRow {
  name: string;
  label: LocalizedText;
  datatype: string;
}

export async function getPropertySuggestions(user: { id: string; role: string } | null): Promise<PropertySuggestionRow[]> {
  const defs = await db<PropertySuggestionRow[]>`select name, label, datatype from property_definitions`;
  const used = await db<{ name: string }[]>`
    select distinct p.name from node_properties p join nodes n on n.id = p.node_id
    where ${readableNodes(user, 'n')}`;
  const map = new Map<string, PropertySuggestionRow>();
  for (const d of defs) map.set(d.name, { name: d.name, label: d.label, datatype: d.datatype });
  for (const u of used) if (!map.has(u.name)) map.set(u.name, { name: u.name, label: {}, datatype: '' });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// An ad hoc name is its own label.
export async function listPropertySuggestionOptions(user: { id: string; role: string } | null): Promise<PropertySuggestion[]> {
  return (await getPropertySuggestions(user)).map(localizeSuggestion);
}
