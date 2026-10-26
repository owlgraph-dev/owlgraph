// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The query builder's draft of every filter it edits. The draft is a tree that
// mirrors WireNodeFilter's and/or nesting, so a nested filter round-trips. Every
// edit returns a new tree, so one root `$state` stays the owner.
import type {
  WireNodeFilter,
  WirePropertyCondition,
  WireEdgeCondition,
  WireIntrinsicCondition,
  WireTagCondition,
  WirePropertyOperator,
  WireEdgeDirection,
  WireIntrinsicField,
  WireClassMatch,
  WireTagOperator
} from './nodeFilter';
import { WIRE_OPERATORS_BY_DATATYPE, WIRE_INTRINSIC_OPERATORS_BY_CATEGORY, INTRINSIC_FIELD_CATEGORY, INTRINSIC_FIELD_FROM_WIRE } from './nodeFilter';
import type { WireTraversalStep } from './traversal';

export type PropertyRow = { kind: 'property'; id: string; name: string; operator: WirePropertyOperator; value: string; valuesText: string };
export type EdgeRow = {
  kind: 'edge';
  id: string;
  type: string;
  direction: WireEdgeDirection;
  hasProperty: boolean;
  propName: string;
  propOperator: WirePropertyOperator;
  propValue: string;
  propValuesText: string;
};
// classMatch: CLASS_ID only; absent means IS_A.
export type IntrinsicRow = { kind: 'intrinsic'; id: string; field: WireIntrinsicField; operator: WirePropertyOperator; value: string; valuesText: string; classMatch?: WireClassMatch };
// Tags are a list (chips), not comma text: a tag may itself contain a comma.
export type TagRow = { kind: 'tag'; id: string; operator: WireTagOperator; values: string[] };

export type ConditionRow = PropertyRow | EdgeRow | IntrinsicRow | TagRow;

export interface ConditionGroupDraft {
  kind: 'group';
  id: string;
  combinator: 'and' | 'or';
  items: ConditionItem[];
}
export type ConditionItem = ConditionRow | ConditionGroupDraft;

const newRowId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `row-${Math.random().toString(36).slice(2)}`;

function newPropertyRow(firstOption: string, firstOperator: WirePropertyOperator, id = newRowId()): PropertyRow {
  return { kind: 'property', id, name: firstOption, operator: firstOperator, value: '', valuesText: '' };
}

function newEdgeRow(firstType: string, id = newRowId()): EdgeRow {
  return { kind: 'edge', id, type: firstType, direction: 'OUTGOING', hasProperty: false, propName: '', propOperator: 'EQ', propValue: '', propValuesText: '' };
}

export function newIntrinsicRow(firstField: WireIntrinsicField, firstOperator: WirePropertyOperator, id = newRowId()): IntrinsicRow {
  return { kind: 'intrinsic', id, field: firstField, operator: firstOperator, value: '', valuesText: '' };
}

export function newTagRow(operator: WireTagOperator = 'HAS', id = newRowId()): TagRow {
  return { kind: 'tag', id, operator, values: [] };
}

export function newGroup(combinator: 'and' | 'or' = 'and', items: ConditionItem[] = [], id = newRowId()): ConditionGroupDraft {
  return { kind: 'group', id, combinator, items };
}

// STARTS_WITH's value is the row's name, the prefix.
export function needsValue(op: WirePropertyOperator): boolean {
  return op !== 'EXISTS' && op !== 'NOT_EXISTS' && op !== 'IN' && op !== 'STARTS_WITH';
}

// An intrinsic STARTS_WITH is a value prefix, so unlike a property's it takes a value.
export function intrinsicNeedsValue(op: WirePropertyOperator): boolean {
  return op !== 'IN' && op !== 'EXISTS' && op !== 'NOT_EXISTS';
}

export function tagTakesList(op: WireTagOperator): boolean {
  return op !== 'HAS';
}

export function intrinsicOperatorsFor(field: WireIntrinsicField): readonly WirePropertyOperator[] {
  return WIRE_INTRINSIC_OPERATORS_BY_CATEGORY[INTRINSIC_FIELD_CATEGORY[INTRINSIC_FIELD_FROM_WIRE[field]]];
}

export function propertyOperatorsFor(datatype: string): readonly WirePropertyOperator[] {
  return WIRE_OPERATORS_BY_DATATYPE[datatype] ?? WIRE_OPERATORS_BY_DATATYPE.text;
}

// One string per source picker option: `field:TITLE`, `class` (CLASS_ID, its own
// group), `tag`, `prop:core:status` or `edge:author-of`. Picking a source builds
// a fresh row of that kind under the same id.
export type SourceKey = string;

export function sourceKeyOfRow(row: ConditionRow): SourceKey {
  switch (row.kind) {
    case 'property':
      return `prop:${row.name}`;
    case 'edge':
      return `edge:${row.type}`;
    case 'tag':
      return 'tag';
    case 'intrinsic':
      return row.field === 'CLASS_ID' ? 'class' : `field:${row.field}`;
  }
}

export function rowForSourceKey(key: SourceKey, datatypeOf: (name: string) => string, id = newRowId()): ConditionRow | null {
  if (key === 'tag') return newTagRow('HAS', id);
  if (key === 'class') return newIntrinsicRow('CLASS_ID', 'EQ', id);
  if (key.startsWith('field:')) {
    const field = key.slice('field:'.length) as WireIntrinsicField;
    return newIntrinsicRow(field, intrinsicOperatorsFor(field)[0] ?? 'EQ', id);
  }
  if (key.startsWith('prop:')) {
    const name = key.slice('prop:'.length);
    return newPropertyRow(name, propertyOperatorsFor(datatypeOf(name))[0] ?? 'EQ', id);
  }
  if (key.startsWith('edge:')) return newEdgeRow(key.slice('edge:'.length), id);
  return null;
}

function propertyConditionFromRow(row: PropertyRow): WirePropertyCondition {
  const cond: WirePropertyCondition = { name: row.name, operator: row.operator };
  if (row.operator === 'IN') cond.values = row.valuesText.split(',').map((v) => v.trim()).filter(Boolean);
  else if (needsValue(row.operator)) cond.value = row.value;
  return cond;
}

function intrinsicConditionFromRow(row: IntrinsicRow): WireIntrinsicCondition {
  const cond: WireIntrinsicCondition = { field: row.field, operator: row.operator };
  if (row.operator === 'IN') cond.values = row.valuesText.split(',').map((v) => v.trim()).filter(Boolean);
  else if (intrinsicNeedsValue(row.operator)) cond.value = row.value;
  // Only EXACT is stored, so an IS_A row round-trips unchanged.
  if (row.field === 'CLASS_ID' && row.classMatch === 'EXACT') cond.classMatch = 'EXACT';
  return cond;
}

function tagConditionFromRow(row: TagRow): WireTagCondition {
  const values = row.values.map((v) => v.trim()).filter(Boolean);
  return row.operator === 'HAS' ? { operator: 'HAS', value: values[0] ?? '' } : { operator: row.operator, values };
}

// Also a traversal step's edge, which is an edge row.
function edgeConditionFromRow(row: EdgeRow): WireEdgeCondition {
  const edge: WireEdgeCondition = { type: row.type, direction: row.direction };
  if (row.hasProperty && row.propName) {
    const prop: WirePropertyCondition = { name: row.propName, operator: row.propOperator };
    if (row.propOperator === 'IN') prop.values = row.propValuesText.split(',').map((v) => v.trim()).filter(Boolean);
    else if (needsValue(row.propOperator)) prop.value = row.propValue;
    edge.property = prop;
  }
  return edge;
}

function rowIsUsable(r: ConditionRow): boolean {
  switch (r.kind) {
    case 'property':
      return !!r.name;
    case 'intrinsic':
      return !!r.field;
    case 'edge':
      return !!r.type;
    case 'tag':
      return true;
  }
}

function rowToFilter(r: ConditionRow): WireNodeFilter {
  switch (r.kind) {
    case 'property':
      return { property: propertyConditionFromRow(r) };
    case 'intrinsic':
      return { intrinsic: intrinsicConditionFromRow(r) };
    case 'tag':
      return { tag: tagConditionFromRow(r) };
    case 'edge':
      return { edge: edgeConditionFromRow(r) };
  }
}

// Null when nothing is left to filter on. One member collapses to itself
// (`{and:[x]}` selects what `x` does); an empty nested group drops out.
export function groupToFilter(group: ConditionGroupDraft): WireNodeFilter | null {
  const conditions: WireNodeFilter[] = [];
  for (const item of group.items) {
    if (item.kind === 'group') {
      const nested = groupToFilter(item);
      if (nested) conditions.push(nested);
    } else if (rowIsUsable(item)) {
      conditions.push(rowToFilter(item));
    }
  }
  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];
  return { [group.combinator]: conditions } as WireNodeFilter;
}

function leafToRow(f: WireNodeFilter): ConditionRow | null {
  if (f.property) {
    const c = f.property;
    return { kind: 'property', id: newRowId(), name: c.name, operator: c.operator, value: c.value ?? '', valuesText: (c.values ?? []).join(', ') };
  }
  if (f.edge) {
    const c = f.edge;
    return {
      kind: 'edge',
      id: newRowId(),
      type: c.type,
      direction: c.direction,
      hasProperty: !!c.property,
      propName: c.property?.name ?? '',
      propOperator: c.property?.operator ?? 'EQ',
      propValue: c.property?.value ?? '',
      propValuesText: (c.property?.values ?? []).join(', ')
    };
  }
  if (f.intrinsic) {
    const c = f.intrinsic;
    return {
      kind: 'intrinsic',
      id: newRowId(),
      field: c.field,
      operator: c.operator,
      value: c.value ?? '',
      valuesText: (c.values ?? []).join(', '),
      ...(c.classMatch ? { classMatch: c.classMatch } : {})
    };
  }
  if (f.tag) {
    const c = f.tag;
    return { kind: 'tag', id: newRowId(), operator: c.operator, values: c.operator === 'HAS' ? (c.value ? [c.value] : []) : [...(c.values ?? [])] };
  }
  return null;
}

// The lossless inverse of groupToFilter. `unsupported` counts leaves of a kind
// this builder doesn't know, for the caller to surface rather than drop on save.
export function filterToGroup(filter: WireNodeFilter | null | undefined): { group: ConditionGroupDraft; unsupported: number } {
  let unsupported = 0;
  const isBranch = (f: WireNodeFilter) => !!(f.and ?? f.or) && !f.property && !f.edge && !f.intrinsic && !f.tag;
  const toGroup = (f: WireNodeFilter): ConditionGroupDraft => {
    if (isBranch(f)) {
      const group = newGroup(f.and ? 'and' : 'or');
      for (const child of f.and ?? f.or ?? []) {
        if (isBranch(child)) {
          group.items.push(toGroup(child));
        } else {
          const row = leafToRow(child);
          if (row) group.items.push(row);
          else unsupported++;
        }
      }
      return group;
    }
    const row = leafToRow(f);
    if (!row) unsupported++;
    return newGroup('and', row ? [row] : []);
  };
  if (!filter) return { group: newGroup(), unsupported: 0 };
  return { group: toGroup(filter), unsupported };
}

export function updateGroupItem(group: ConditionGroupDraft, id: string, next: ConditionItem): ConditionGroupDraft {
  return {
    ...group,
    items: group.items.map((item) => (item.id === id ? next : item.kind === 'group' ? updateGroupItem(item, id, next) : item))
  };
}

export function removeGroupItem(group: ConditionGroupDraft, id: string): ConditionGroupDraft {
  return {
    ...group,
    items: group.items.filter((item) => item.id !== id).map((item) => (item.kind === 'group' ? removeGroupItem(item, id) : item))
  };
}

export function appendGroupItem(group: ConditionGroupDraft, item: ConditionItem): ConditionGroupDraft {
  return { ...group, items: [...group.items, item] };
}

// Structured, so the caller, which owns i18n, formats it.
export type RowValidationError = {
  code: 'needs-property' | 'needs-type' | 'in-needs-value' | 'needs-value' | 'tag-needs-value';
  name: string;
  operator: WirePropertyOperator;
} | null;

function validateRow(r: ConditionRow): RowValidationError {
  if (r.kind === 'property') {
    if (!r.name) return { code: 'needs-property', name: r.name, operator: r.operator };
    if (r.operator === 'IN' && !r.valuesText.trim()) return { code: 'in-needs-value', name: r.name, operator: r.operator };
    if (needsValue(r.operator) && !r.value.trim()) return { code: 'needs-value', name: r.name, operator: r.operator };
  } else if (r.kind === 'intrinsic') {
    if (r.operator === 'IN' && !r.valuesText.trim()) return { code: 'in-needs-value', name: r.field, operator: r.operator };
    if (intrinsicNeedsValue(r.operator) && !r.value.trim()) return { code: 'needs-value', name: r.field, operator: r.operator };
  } else if (r.kind === 'tag') {
    if (r.values.filter((v) => v.trim()).length === 0) return { code: 'tag-needs-value', name: 'tag', operator: 'EQ' };
  } else {
    if (!r.type) return { code: 'needs-type', name: r.type, operator: 'EQ' };
    if (r.hasProperty) {
      if (!r.propName) return { code: 'needs-property', name: r.propName, operator: r.propOperator };
      if (r.propOperator === 'IN' && !r.propValuesText.trim()) return { code: 'in-needs-value', name: r.propName, operator: r.propOperator };
      if (needsValue(r.propOperator) && !r.propValue.trim()) return { code: 'needs-value', name: r.propName, operator: r.propOperator };
    }
  }
  return null;
}

// The first problem anywhere in the tree, depth-first in display order.
export function validateGroup(group: ConditionGroupDraft): RowValidationError {
  for (const item of group.items) {
    const problem = item.kind === 'group' ? validateGroup(item) : validateRow(item);
    if (problem) return problem;
  }
  return null;
}

// The edge is an edge row: its optional edge property is that row's property.
export interface TraversalStepDraft {
  id: string;
  edge: EdgeRow;
  repeat: number;
  targetGroup: ConditionGroupDraft | null;
}

export function newStepDraft(): TraversalStepDraft {
  return { id: newRowId(), edge: newEdgeRow(''), repeat: 1, targetGroup: null };
}

export function stepFromWire(w: WireTraversalStep): { step: TraversalStepDraft; unsupported: number } {
  const edge = (leafToRow({ edge: w.edge }) as EdgeRow | null) ?? newEdgeRow('');
  const target = w.targetFilter ? filterToGroup(w.targetFilter) : null;
  return {
    step: { id: newRowId(), edge, repeat: w.repeat ?? 1, targetGroup: target ? target.group : null },
    unsupported: target?.unsupported ?? 0
  };
}

export function stepToWire(s: TraversalStepDraft): WireTraversalStep {
  return {
    edge: edgeConditionFromRow(s.edge),
    targetFilter: s.targetGroup ? groupToFilter(s.targetGroup) : null,
    repeat: s.repeat
  };
}
