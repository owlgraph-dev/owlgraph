// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// An image's width per tier, as a % of its container: a smaller tier
// inherits the next larger one; null everywhere is its natural size, capped
// at the container.
import type { OverrideSet } from '../../capabilities/overrides';
import type { Tier } from '../../capabilities/cascade';

export interface ImageWidthAttrs {
  width?: number | null;
  widthTablet?: number | null;
  widthPhone?: number | null;
}

// One mapping, so the block settings panel and the NodeView can't disagree.
export const WIDTH_ATTR: Record<Tier, 'width' | 'widthTablet' | 'widthPhone'> = {
  desktop: 'width',
  tablet: 'widthTablet',
  phone: 'widthPhone',
};

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && v > 0 ? Math.max(1, Math.min(100, Math.round(v))) : null;
}

// Null: the natural width.
export function effectiveWidth(attrs: ImageWidthAttrs, vp: Tier): number | null {
  const d = numOrNull(attrs.width);
  const t = numOrNull(attrs.widthTablet);
  const p = numOrNull(attrs.widthPhone);
  if (vp === 'phone') return p ?? t ?? d;
  if (vp === 'tablet') return t ?? d;
  return d;
}

// Only set widths; app.css's @container rules do the cascade.
export function widthVars(attrs: ImageWidthAttrs): OverrideSet {
  const out: Record<string, string> = {};
  const d = numOrNull(attrs.width);
  const t = numOrNull(attrs.widthTablet);
  const p = numOrNull(attrs.widthPhone);
  if (d != null) out['--image-width-d'] = `${d}%`;
  if (t != null) out['--image-width-t'] = `${t}%`;
  if (p != null) out['--image-width-p'] = `${p}%`;
  return out;
}

export function parseWidthVar(style: CSSStyleDeclaration | null, prop: string): number | null {
  const raw = style?.getPropertyValue(prop) ?? '';
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  return m ? numOrNull(Number(m[1])) : null;
}
