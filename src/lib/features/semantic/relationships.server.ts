// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The properties an edge of a type carries are an explicit mapping to property
// definitions, not a group: a type may want properties from several groups. The
// edges and their values live in features/graph/edges.server.ts.
import { db } from '$lib/platform/db.server';
import { hasText, type LocalizedText } from '$lib/platform/i18n/localizedText';
import { localizedJson, parseLocalizedText } from '$lib/platform/i18n/localizedText.server';
import { NAME_RE } from './properties.server';
import { CodedError } from '$lib/platform/codedError';

// Stored LocalizedText, resolved by each channel (docs/architecture/languages.md). A null
// inverse_label means none, never an empty map.
export interface RelationshipType {
  slug: string;
  label: LocalizedText;
  description: LocalizedText;
  inverse_label: LocalizedText | null;
}

// A property mapped onto a relationship type, its label still stored.
export interface RelationshipTypeProperty {
  name: string;
  label: LocalizedText;
  datatype: string;
}

export async function listRelationshipTypes(): Promise<RelationshipType[]> {
  return db<RelationshipType[]>`
    select slug, label, description, inverse_label
    from relationship_types order by slug`;
}

// One round trip for every slug a filter references.
export async function getExistingRelationshipTypeSlugs(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await db<{ slug: string }[]>`select slug from relationship_types where slug in ${db(slugs)}`;
  return new Set(rows.map((r) => r.slug));
}

export async function upsertRelationshipType(def: {
  slug: string;
  label?: LocalizedText;
  description?: LocalizedText;
  inverseLabel?: LocalizedText | null;
}): Promise<RelationshipType> {
  const slug = String(def.slug ?? '').trim();
  if (!NAME_RE.test(slug)) {
    throw new CodedError('invalid_key', 'Slug may only contain letters, numbers, underscores and hyphens (no spaces).');
  }
  const label = parseLocalizedText(def.label);
  const description = parseLocalizedText(def.description);
  const inverseLabel = parseLocalizedText(def.inverseLabel);
  const [row] = await db<RelationshipType[]>`
    insert into relationship_types (slug, label, description, inverse_label)
    values (${slug}, ${localizedJson(db, label)}, ${localizedJson(db, description)},
            ${hasText(inverseLabel) ? localizedJson(db, inverseLabel) : null})
    on conflict (slug) do update
      set label = excluded.label, description = excluded.description,
          inverse_label = excluded.inverse_label,
          updated_at = now()
    returning slug, label, description, inverse_label`;
  return row;
}

// on delete restrict raises a foreign-key violation while edges use the type.
export async function deleteRelationshipType(slug: string) {
  try {
    await db`delete from relationship_types where slug = ${slug}`;
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === '23503') {
      throw new CodedError('relationship_type_in_use', 'Cannot delete a relationship type that is still used by existing edges.');
    }
    throw e;
  }
}

// Every type's mapping in one round trip.
export async function getAllRelationshipTypeProperties(): Promise<Map<string, RelationshipTypeProperty[]>> {
  const rows = await db<(RelationshipTypeProperty & { slug: string })[]>`
    select rtp.relationship_type_slug as slug, pd.name, pd.label, pd.datatype
    from relationship_type_properties rtp
    join property_definitions pd on pd.name = rtp.property_name
    order by rtp.relationship_type_slug, pd.name`;
  const map = new Map<string, RelationshipTypeProperty[]>();
  for (const r of rows) {
    const list = map.get(r.slug) ?? [];
    list.push({ name: r.name, label: r.label, datatype: r.datatype });
    map.set(r.slug, list);
  }
  return map;
}

// Replaced wholesale: mapping rows have no identity worth keeping. Both FKs are
// real here, unlike edge_properties.name, so an unknown name fails, never no-ops.
export async function setRelationshipTypeProperties(slug: string, propertyNames: string[]): Promise<void> {
  await db.begin(async (sql) => {
    await sql`delete from relationship_type_properties where relationship_type_slug = ${slug}`;
    for (const name of propertyNames) {
      await sql`insert into relationship_type_properties (relationship_type_slug, property_name) values (${slug}, ${name})`;
    }
  });
}

