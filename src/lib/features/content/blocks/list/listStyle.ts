// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// List marker and item spacing for the editor and the page. Values are
// allowlisted, so what they produce is safe as CSS.
import type { OverrideSet } from '../../capabilities/overrides';

export interface ListAttrs {
  listStyle?: unknown;
  spacing?: unknown;
}

const BULLET_TYPES = ['disc', 'circle', 'square', 'none'] as const;
const ORDERED_TYPES = ['decimal', 'lower-alpha', 'upper-alpha', 'lower-roman', 'upper-roman', 'none'] as const;

const LIST_SPACING = { tight: '0', normal: '0.25rem', loose: '0.6rem' } as const;
export type ListSpacingToken = keyof typeof LIST_SPACING;

const ALL_TYPES = new Set<string>([...BULLET_TYPES, ...ORDERED_TYPES]);

function safeListType(typeName: string, v: unknown): string {
  if (typeof v !== 'string') return '';
  const allowed = typeName === 'orderedList' ? ORDERED_TYPES : BULLET_TYPES;
  return (allowed as readonly string[]).includes(v) ? v : '';
}

// A global attribute's renderHTML doesn't know the list kind, so any allowed
// type passes; the block settings panel offers only valid ones.
export function safeListTypeAny(v: unknown): string {
  return typeof v === 'string' && ALL_TYPES.has(v) ? v : '';
}

export function listGap(v: unknown): string {
  return typeof v === 'string' && v in LIST_SPACING ? LIST_SPACING[v as ListSpacingToken] : '';
}

export function listOverrides(typeName: string, attrs: ListAttrs | undefined): OverrideSet {
  const out: Record<string, string> = {};
  const t = safeListType(typeName, attrs?.listStyle);
  if (t) out['list-style-type'] = t;
  const g = listGap(attrs?.spacing);
  if (g) out['--list-gap'] = g;
  return out;
}
