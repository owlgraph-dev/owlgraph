// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A tree entry's fields as the navigation and footer settings forms post them.
import type { TreeCreateInput, TreeUpdateInput } from '$lib/features/site/server';

export function readTreeCreateInput(f: FormData): TreeCreateInput {
  const kind: 'group' | 'link' = String(f.get('kind') ?? 'link') === 'group' ? 'group' : 'link';
  const targetType = String(f.get('targetType') ?? 'page') === 'url' ? 'url' : 'page';
  return {
    kind,
    label: String(f.get('label') ?? ''),
    targetType,
    targetPageId: targetType === 'page' ? String(f.get('targetPageId') ?? '') || null : null,
    url: targetType === 'url' ? String(f.get('url') ?? '') || null : null,
    parentId: String(f.get('parentId') ?? '') || null,
  };
}

export function readTreeUpdateInput(f: FormData): TreeUpdateInput {
  const targetType = String(f.get('targetType') ?? 'page') === 'url' ? 'url' : 'page';
  return {
    label: String(f.get('label') ?? ''),
    targetType,
    targetPageId: targetType === 'page' ? String(f.get('targetPageId') ?? '') || null : null,
    url: targetType === 'url' ? String(f.get('url') ?? '') || null : null,
  };
}
