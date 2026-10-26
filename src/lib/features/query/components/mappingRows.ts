// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The template-parameter mapping as the builder edits it, one row per parameter.
import type { TemplateParam, WrapperMapping, TransformCategory, TransformId } from '$lib/features/content';
import { INTRINSIC_SOURCE_CATEGORY, categoryForDatatype, transformIdsForCategory, isTransformAllowed } from '$lib/features/content';
import type { PropertyOption } from './sourceOptions';

export interface MappingRow {
  key: string;
  // Null when the parameter declares none. Picks the transforms offered and is
  // checked against the bound source (warn-but-allow).
  declaredType: string | null;
  // A {{{x}}} token in an HTML block, not a `parameter:x` mark: both display as
  // "x", so a badge tells them apart.
  inHtml: boolean;
  source: string;
  // A plain string: a stored retired or newer id must round-trip, not turn into
  // no transform on the next save.
  transformId: string;
  params: Record<string, string>;
}

export function seedMappingRows(params: TemplateParam[], mapping: WrapperMapping | null | undefined): MappingRow[] {
  return params.map(({ key, declaredType, inHtml }) => {
    const mp = mapping?.[key];
    return {
      key,
      declaredType,
      inHtml: !!inHtml,
      source: mp?.source ?? key,
      transformId: mp?.transform?.id ?? '',
      params: { ...(mp?.transform?.params ?? {}) }
    };
  });
}

// Pure direct matches (source === key, no transform) are not stored — a
// key with no mapping entry direct-matches at render time anyway.
export function mappingFromRows(rows: MappingRow[]): WrapperMapping {
  const mapping: WrapperMapping = {};
  for (const mr of rows) {
    if (!mr.transformId && mr.source === mr.key) continue;
    mapping[mr.key] = {
      source: mr.source,
      transform: mr.transformId ? { id: mr.transformId as TransformId, params: mr.params } : undefined
    };
  }
  return mapping;
}

// A property without a registered datatype counts as text.
function sourceCategory(source: string, propertyOptions: readonly PropertyOption[]): TransformCategory {
  return INTRINSIC_SOURCE_CATEGORY[source] ?? categoryForDatatype(propertyOptions.find((p) => p.name === source)?.datatype || 'text');
}

// Null for an unknown type, so the declared-type check doesn't read it as text
// and raise a false mismatch.
export function knownSourceCategory(source: string, propertyOptions: readonly PropertyOption[]): TransformCategory | null {
  const intrinsic = INTRINSIC_SOURCE_CATEGORY[source];
  if (intrinsic) return intrinsic;
  const datatype = propertyOptions.find((p) => p.name === source)?.datatype;
  return datatype ? categoryForDatatype(datatype) : null;
}

// The declared type when there is one, meaningful before anything is bound;
// else the bound source's.
function rowCategory(row: Pick<MappingRow, 'declaredType' | 'source'>, propertyOptions: readonly PropertyOption[]): TransformCategory {
  return row.declaredType ? categoryForDatatype(row.declaredType) : sourceCategory(row.source, propertyOptions);
}

// A stored id outside the list is appended, so it stays visible and round-trips;
// only a source change clears an incompatible transform.
export function transformOptionIds(row: MappingRow, propertyOptions: readonly PropertyOption[]): string[] {
  const ids: string[] = [...transformIdsForCategory(rowCategory(row, propertyOptions))];
  if (row.transformId && !ids.includes(row.transformId)) ids.push(row.transformId);
  return ids;
}

export function withMappingSource(row: MappingRow, source: string, propertyOptions: readonly PropertyOption[]): MappingRow {
  const keep = !!row.transformId && isTransformAllowed(row.transformId, rowCategory({ declaredType: row.declaredType, source }, propertyOptions));
  return { ...row, source, transformId: keep ? row.transformId : '', params: keep ? row.params : {} };
}
