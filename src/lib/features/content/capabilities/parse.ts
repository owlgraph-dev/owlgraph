// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The field parsers several capabilities share: a stored value, or nothing when
// it is not one.
import { isColorReference } from '../color/colorTokens';
import type { ShadowToken } from './surface/surface';

// Hex / rgb / rgba only: an arbitrary string could break out of the style or
// inject declarations. For a colour that is computed with, not just painted.
export function safeLiteralColor(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(s)) return s;
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/.test(s)) return s;
  if (/^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/.test(s)) return s;
  return '';
}

// A literal or a theme colour reference (`token:<name>`, colorTokens.ts).
export function safeColor(v: unknown): string {
  const literal = safeLiteralColor(v);
  if (literal) return literal;
  const s = typeof v === 'string' ? v.trim() : '';
  return isColorReference(s) ? s : '';
}

export function colorOrNull(v: unknown): string | null {
  const safe = typeof v === 'string' ? safeColor(v) : '';
  return safe || null;
}

export function shadowOrNull(v: unknown): ShadowToken | null {
  return v === 'none' || v === 'sm' || v === 'md' || v === 'lg' ? v : null;
}
