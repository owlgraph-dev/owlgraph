// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The source picker's labels and groups per context: a condition row (every
// kind), sorting (fields and properties) and a template parameter's mapping.
import * as m from '$lib/paraglide/messages';
import type { WirePropertyOperator, WireIntrinsicField, WireTagOperator } from '../nodeFilter';
import { labelWithKey, type RelationshipTypeOption } from '$lib/features/semantic';

export interface PropertyOption {
  name: string;
  label: string;
  datatype: string;
}

export interface SourceItem {
  value: string;
  label: string;
}
export interface SourceGroup {
  label: string;
  items: SourceItem[];
}

export type SourceKind = 'fields' | 'properties' | 'tags' | 'class' | 'edges';
export const ALL_SOURCE_KINDS: readonly SourceKind[] = ['fields', 'properties', 'tags', 'class', 'edges'];

export const OPERATOR_LABELS: Record<WirePropertyOperator, () => string> = {
  EQ: m.editor_query_operator_eq,
  NEQ: m.editor_query_operator_neq,
  CONTAINS: m.editor_query_operator_contains,
  EXISTS: m.editor_query_operator_exists,
  NOT_EXISTS: m.editor_query_operator_not_exists,
  IN: m.editor_query_operator_in,
  GT: m.editor_query_operator_gt,
  GTE: m.editor_query_operator_gte,
  LT: m.editor_query_operator_lt,
  LTE: m.editor_query_operator_lte,
  STARTS_WITH: m.editor_query_operator_starts_with
};

// A node "is a" work package: "is equal to" reads wrong for a classification.
export const CLASS_OPERATOR_LABELS: Partial<Record<WirePropertyOperator, () => string>> = {
  EQ: m.editor_class_operator_eq,
  NEQ: m.editor_class_operator_neq,
  IN: m.editor_class_operator_in
};

export const TAG_OPERATOR_LABELS: Record<WireTagOperator, () => string> = {
  HAS: m.editor_tag_operator_has,
  HAS_ANY: m.editor_tag_operator_has_any,
  HAS_ALL: m.editor_tag_operator_has_all,
  HAS_NONE: m.editor_tag_operator_has_none
};

const FIELD_LABELS: Record<WireIntrinsicField, () => string> = {
  SLUG: m.editor_intrinsic_condition_field_slug,
  TITLE: m.editor_intrinsic_condition_field_title,
  CREATED_AT: m.editor_intrinsic_condition_field_created_at,
  UPDATED_AT: m.editor_intrinsic_condition_field_updated_at,
  TYPE: m.editor_intrinsic_condition_field_type,
  CLASS_ID: m.editor_intrinsic_condition_field_class_id,
  NAMESPACE_ID: m.editor_intrinsic_condition_field_namespace_id,
  CREATED_BY: m.editor_intrinsic_condition_field_created_by,
  EXTERNAL_URL: m.editor_intrinsic_condition_field_external_url,
  LOCALE: m.editor_intrinsic_condition_field_locale
};

// CLASS_ID is a group of its own.
const CONDITION_FIELDS: readonly WireIntrinsicField[] = ['TITLE', 'SLUG', 'CREATED_AT', 'UPDATED_AT', 'TYPE', 'NAMESPACE_ID', 'CREATED_BY', 'EXTERNAL_URL', 'LOCALE'];

// By camelCase name (WireOrderByInput.name), not the condition tokens.
const SORT_FIELDS: readonly { name: string; label: () => string }[] = [
  { name: 'title', label: m.editor_intrinsic_condition_field_title },
  { name: 'slug', label: m.editor_intrinsic_condition_field_slug },
  { name: 'createdAt', label: m.editor_intrinsic_condition_field_created_at },
  { name: 'updatedAt', label: m.editor_intrinsic_condition_field_updated_at },
  { name: 'type', label: m.editor_intrinsic_condition_field_type },
  { name: 'namespaceId', label: m.editor_intrinsic_condition_field_namespace_id },
  { name: 'createdBy', label: m.editor_intrinsic_condition_field_created_by },
  { name: 'locale', label: m.editor_intrinsic_condition_field_locale }
];

// templateBinding.ts's bindingMap() keys: `namespace`, `creator` and `class`
// resolve to labels there, unlike the id-valued condition fields.
const MAPPING_FIELDS: readonly { name: string; label: () => string }[] = [
  { name: 'title', label: m.editor_intrinsic_condition_field_title },
  { name: 'url', label: m.editor_query_modal_mapping_field_url },
  { name: 'slug', label: m.editor_intrinsic_condition_field_slug },
  { name: 'createdAt', label: m.editor_intrinsic_condition_field_created_at },
  { name: 'updatedAt', label: m.editor_intrinsic_condition_field_updated_at },
  { name: 'type', label: m.editor_intrinsic_condition_field_type },
  { name: 'class', label: m.editor_intrinsic_condition_field_class_id },
  { name: 'namespace', label: m.editor_intrinsic_condition_field_namespace_id },
  { name: 'creator', label: m.editor_intrinsic_condition_field_created_by },
  { name: 'externalUrl', label: m.editor_intrinsic_condition_field_external_url },
  { name: 'locale', label: m.editor_intrinsic_condition_field_locale }
];

// A label that resolved to the name itself (ad hoc, untranslated) shows just the name.
export function propertyLabel(p: PropertyOption): string {
  return labelWithKey(p.label, p.name);
}

/** A property's datatype among those offered; text for one that isn't. */
export function propertyDatatype(propertyOptions: readonly PropertyOption[], name: string): string {
  return propertyOptions.find((p) => p.name === name)?.datatype || 'text';
}

function propertyItems(propertyOptions: readonly PropertyOption[], prefix = 'prop:'): SourceItem[] {
  return propertyOptions.map((p) => ({ value: `${prefix}${p.name}`, label: propertyLabel(p) }));
}

export function conditionSourceGroups(
  kinds: readonly SourceKind[],
  ctx: { propertyOptions: readonly PropertyOption[]; relationshipTypes: readonly RelationshipTypeOption[] }
): SourceGroup[] {
  const groups: SourceGroup[] = [];
  for (const kind of kinds) {
    switch (kind) {
      case 'fields':
        groups.push({ label: m.editor_query_modal_source_group_fields(), items: CONDITION_FIELDS.map((f) => ({ value: `field:${f}`, label: FIELD_LABELS[f]() })) });
        break;
      case 'properties':
        groups.push({ label: m.editor_query_modal_source_group_properties(), items: propertyItems(ctx.propertyOptions) });
        break;
      case 'tags':
        groups.push({ label: m.editor_query_modal_source_group_tags(), items: [{ value: 'tag', label: m.editor_query_modal_source_group_tags() }] });
        break;
      case 'class':
        groups.push({ label: m.editor_query_modal_source_group_class(), items: [{ value: 'class', label: m.editor_intrinsic_condition_field_class_id() }] });
        break;
      case 'edges':
        groups.push({ label: m.editor_query_modal_source_group_edges(), items: ctx.relationshipTypes.map((t) => ({ value: `edge:${t.slug}`, label: t.label })) });
        break;
    }
  }
  return groups;
}

// A stored value the catalogue no longer has stays visible in its own group, so
// it round-trips instead of leaving the picker empty.
export function withStaleValue(groups: SourceGroup[], value: string, groupLabel: string): SourceGroup[] {
  if (!value || groups.some((g) => g.items.some((i) => i.value === value))) return groups;
  const label = value.replace(/^(prop|edge|field):/, '');
  return [...groups, { label: groupLabel, items: [{ value, label }] }];
}

export function sortSourceGroups(propertyOptions: readonly PropertyOption[]): SourceGroup[] {
  return [
    { label: m.editor_query_modal_source_group_fields(), items: SORT_FIELDS.map((f) => ({ value: `field:${f.name}`, label: f.label() })) },
    { label: m.editor_query_modal_source_group_properties(), items: propertyItems(propertyOptions) }
  ];
}

const MAPPING_AUTO = 'auto';

export function mappingSourceGroups(propertyOptions: readonly PropertyOption[]): SourceGroup[] {
  return [
    { label: m.editor_query_modal_mapping_group_auto(), items: [{ value: MAPPING_AUTO, label: m.editor_query_modal_mapping_auto() }] },
    { label: m.editor_query_modal_source_group_fields(), items: MAPPING_FIELDS.map((f) => ({ value: `field:${f.name}`, label: f.label() })) },
    { label: m.editor_query_modal_source_group_properties(), items: propertyItems(propertyOptions) }
  ];
}

// A stored `source` is a bare binding key; the picker's keys are prefixed, and
// `auto` is the direct match (source === parameter key).
export function mappingSourceToKey(source: string, paramKey: string): string {
  if (source === paramKey) return MAPPING_AUTO;
  if (MAPPING_FIELDS.some((f) => f.name === source)) return `field:${source}`;
  return `prop:${source}`;
}

export function mappingKeyToSource(key: string, paramKey: string): string {
  if (key === MAPPING_AUTO) return paramKey;
  return key.replace(/^(field|prop):/, '');
}
