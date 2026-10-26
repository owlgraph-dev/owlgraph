// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The built-in looks a paragraph style starts from (docs/architecture/typography.md). An
// author never picks a role, only a style. One distinct type-scale step per
// heading level, so the hierarchy holds at every canvas width.
import type { WeightToken } from './typography';
import type { TypeSize } from './typeScale';
import type { ResolvedParagraphStyle } from './paragraphStyles';

export type TypographyRoleKey = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'display' | 'label';

export const TYPOGRAPHY_ROLE_KEYS: readonly TypographyRoleKey[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'body', 'display', 'label'];

export interface ElementDefaults {
  family?: string;
  size?: TypeSize;
  weight?: WeightToken;
  lineHeight?: number;
  letterSpacing?: number;
}

export const BUILTIN_ELEMENT_DEFAULTS: Record<TypographyRoleKey, ElementDefaults> = {
  h1: { size: 'scale:4xl' },
  h2: { size: 'scale:2xl' },
  h3: { size: 'scale:xl' },
  h4: { size: 'scale:l' },
  h5: { size: 'scale:m' },
  h6: { size: 'scale:s' },
  body: { size: 'scale:m' },
  // The seeded Display (h1) and Label (p) styles' looks.
  display: { size: 'scale:6xl', weight: 'semibold' },
  label: { size: 'scale:s', weight: 'medium' },
};

export interface TypographyRegistry {
  customStacks: Record<string, string>;
  paragraphStyles: readonly ResolvedParagraphStyle[];
}

export const EMPTY_TYPOGRAPHY_REGISTRY: TypographyRegistry = {
  customStacks: {},
  paragraphStyles: [],
};

export function isTypographyRoleKey(v: unknown): v is TypographyRoleKey {
  return typeof v === 'string' && (TYPOGRAPHY_ROLE_KEYS as readonly string[]).includes(v);
}

// Stored content may carry this per-block look; it resolves to the style with
// the same tag and base role. Nothing writes it, and applying a style clears it.
export type TypographyRoleOverride = 'display' | 'label';

export function typographyRoleOverrideOrNull(v: unknown): TypographyRoleOverride | null {
  return v === 'display' || v === 'label' ? v : null;
}

// Not kept on split: Enter starts from the tag's default style.
export function typographyRoleAttr() {
  return {
    default: null as TypographyRoleOverride | null,
    keepOnSplit: false,
    parseHTML: (el: HTMLElement) => typographyRoleOverrideOrNull(el.getAttribute('data-typography-role')),
    renderHTML: (attrs: Record<string, unknown>) => {
      const r = typographyRoleOverrideOrNull(attrs.typographyRole);
      return r ? { 'data-typography-role': r } : {};
    },
  };
}
