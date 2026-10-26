// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Cached for the session: many rows of a query builder need the same catalogue,
// and only the first fetches it.
export interface RelationshipTypeOption {
  slug: string;
  label: string;
  inverseLabel: string | null;
  properties: { name: string; label: string; datatype: string }[];
}

let cached: Promise<RelationshipTypeOption[]> | null = null;

export function getRelationshipTypeCatalog(): Promise<RelationshipTypeOption[]> {
  if (!cached) {
    cached = fetch('/api/relationship-types')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((body) => body.results ?? [])
      .catch(() => []);
  }
  return cached;
}
