// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { readFileSync } from 'node:fs';

const FILE = new URL('./.seed.json', import.meta.url);

// Written by global-setup before any test runs.
export const seed: Seed = JSON.parse(readFileSync(FILE, 'utf8'));

type Seed = {
  publicSlug: string;
  publicTitle: string;
  publicId: string;
  internalSlug: string;
  internalTitle: string;
  internalId: string;
  restrictedId: string;
  restrictedSlug: string;
  restrictedTitle: string;
  publicBody: string;
  internalBody: string;
  restrictedBody: string;
  propStatus: string;
  propPriority: string;
  queryTestSlug: string;
  queryBlockId: string;
  docId: string;
  docSlug: string;
  publicDocId: string;
  publicDocSlug: string;
  restrictedDocId: string;
  restrictedDocSlug: string;
  mdDocId: string;
  mdDocSlug: string;
  publicAssetId: string;
  restrictedAssetId: string;
  graphPageId: string;
  graphPageSlug: string;
  relCrossPageId: string;
  crossRelationshipTypeSlug: string;
  relationshipTypeSlug: string;
  relationshipTypeLabel: string;
  edgePropYear: string;
  tokens: Record<'admin' | 'editorA' | 'editorB' | 'editorC' | 'viewer', string>;
};

export const authState = (role: 'admin' | 'editorA' | 'editorB' | 'editorC' | 'viewer') =>
  `tests/e2e/.auth/${role}.json`;
