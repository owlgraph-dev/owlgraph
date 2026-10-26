// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An image's fitted box. On 'auto' the box is the image's own ratio, so
// object-fit has nothing to do; a box mode gives object-fit/position a box to
// govern. Fit and position apply only in a box mode, enforced here for the
// editor and the page.

import { pinnedScheme } from '../../color/contentScheme';
import { NO_OVERRIDES, type OverrideSet } from '../../capabilities/overrides';

export type BoxMode = 'auto' | 'height' | 'aspect' | 'fill';
export type ObjectFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
export type ObjectPosition =
  | 'center'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface ImageBoxAttrs {
  boxMode?: string | null;
  boxHeight?: number | null;
  boxAspect?: string | null;
  objectFit?: string | null;
  objectPosition?: string | null;
}

const BOX_MODES = new Set<string>(['height', 'aspect', 'fill']);
const FIT_VALUES = new Set<string>(['cover', 'contain', 'fill', 'none', 'scale-down']);
const ASPECT_RE = /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/;

// The stored attr is the preset token, not the CSS. Also a surface image's focus.
export const POSITION_CSS: Record<ObjectPosition, string> = {
  center: 'center',
  top: 'center top',
  bottom: 'center bottom',
  left: 'left center',
  right: 'right center',
  'top-left': 'left top',
  'top-right': 'right top',
  'bottom-left': 'left bottom',
  'bottom-right': 'right bottom',
};
const POSITION_VALUES = new Set<string>(Object.keys(POSITION_CSS));

const DEFAULT_BOX_HEIGHT = 300; // px — used when boxMode is 'height' but no height was chosen yet
const DEFAULT_BOX_ASPECT = '16/9'; // used when boxMode is 'aspect' but no ratio was chosen yet
const DEFAULT_FIT: ObjectFit = 'cover';
const DEFAULT_POSITION: ObjectPosition = 'center';

export function normalizeBoxMode(v: unknown): BoxMode {
  return typeof v === 'string' && BOX_MODES.has(v) ? (v as BoxMode) : 'auto';
}

export function normalizeBoxHeight(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? Math.max(20, Math.min(2000, Math.round(v))) : null;
}

export function normalizeAspect(v: unknown): string | null {
  return typeof v === 'string' && ASPECT_RE.test(v.trim()) ? v.trim() : null;
}

export function normalizeFit(v: unknown): ObjectFit | null {
  return typeof v === 'string' && FIT_VALUES.has(v) ? (v as ObjectFit) : null;
}

export function normalizePosition(v: unknown): ObjectPosition | null {
  return typeof v === 'string' && POSITION_VALUES.has(v) ? (v as ObjectPosition) : null;
}

// Null outside a box mode.
export function effectiveFit(attrs: ImageBoxAttrs): ObjectFit | null {
  if (normalizeBoxMode(attrs.boxMode) === 'auto') return null;
  return normalizeFit(attrs.objectFit) ?? DEFAULT_FIT;
}

export function effectivePosition(attrs: ImageBoxAttrs): ObjectPosition | null {
  if (normalizeBoxMode(attrs.boxMode) === 'auto') return null;
  return normalizePosition(attrs.objectPosition) ?? DEFAULT_POSITION;
}

export function boxDataAttr(attrs: ImageBoxAttrs): BoxMode | null {
  const mode = normalizeBoxMode(attrs.boxMode);
  return mode === 'auto' ? null : mode;
}

// What parseHTML reads the preset back from: the CSS value isn't reversible.
export function positionDataAttr(attrs: ImageBoxAttrs): ObjectPosition | null {
  return effectivePosition(attrs);
}

// Empty on 'auto', so an image without a box mode carries nothing.
export function boxImgOverrides(attrs: ImageBoxAttrs): OverrideSet {
  const mode = normalizeBoxMode(attrs.boxMode);
  if (mode === 'auto') return NO_OVERRIDES;
  const out: Record<string, string> = {};
  if (mode === 'height') {
    out.height = `${normalizeBoxHeight(attrs.boxHeight) ?? DEFAULT_BOX_HEIGHT}px`;
  } else if (mode === 'aspect') {
    out['aspect-ratio'] = normalizeAspect(attrs.boxAspect) ?? DEFAULT_BOX_ASPECT;
  } else if (mode === 'fill') {
    out.width = '100%';
    out.height = '100%';
  }
  const fit = effectiveFit(attrs);
  if (fit) out['object-fit'] = fit;
  const pos = effectivePosition(attrs);
  if (pos) out['object-position'] = POSITION_CSS[pos];
  return out;
}

export function parseBoxHeight(style: CSSStyleDeclaration | null): number | null {
  const raw = style?.height ?? '';
  const m = /^(\d+(?:\.\d+)?)px$/.exec(raw.trim());
  return m ? normalizeBoxHeight(Number(m[1])) : null;
}

export function parseBoxAspect(style: CSSStyleDeclaration | null): string | null {
  const raw = (style?.getPropertyValue('aspect-ratio') ?? '').trim();
  return normalizeAspect(raw);
}

// The named scheme's content ground behind a transparent image. The pin sits
// on the childless <img>, so nothing else takes the scheme (docs/architecture/theming.md, "Scheme regions").
export function backdropAttrs(attrs: { backdrop?: unknown } | undefined): Record<string, string> {
  const scheme = pinnedScheme(attrs?.backdrop);
  return scheme ? { 'data-backdrop': '', 'data-scheme': scheme } : {};
}
