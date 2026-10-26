// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Placement capability (docs/architecture/blocks/layout.md, "Placement"): how a boxed block sits in
// its column. start / center / end make it fit-content and move it by its
// inline margins; a top-level block's edge is its column's, not the canvas's
// (`--placement-edge`, app.css). Three host kinds:
//   box    the block's outermost element sizes and moves
//   card   its link must also fill it when stretched; Auto is where the cell's
//          text alignment puts it
//   image  has a width of its own, so only its margins move: no stretch, and
//          Auto is the middle
import { resolveCapability, type Tier, TIERS, TIER_CHAR } from '../cascade';
import type { OverrideSet } from '../overrides';

export type PlacementAlign = 'start' | 'center' | 'end' | 'stretch';
export const PLACEMENT_ALIGNS: readonly PlacementAlign[] = ['start', 'center', 'end', 'stretch'];

export interface PlacementValue {
  align?: PlacementAlign;
}
export type PlacementData = Partial<Record<Tier, PlacementValue>>;

export type PlacementKind = 'box' | 'card' | 'image';

/** The alignments a host offers: an image has no stretch. */
export function placementAligns(kind: PlacementKind): readonly PlacementAlign[] {
  return kind === 'image' ? ['start', 'center', 'end'] : PLACEMENT_ALIGNS;
}

function alignOrNull(v: unknown, kind: PlacementKind): PlacementAlign | null {
  return typeof v === 'string' && (placementAligns(kind) as readonly string[]).includes(v) ? (v as PlacementAlign) : null;
}

/** What a tier resolves to through the desktop-first cascade, or null for Auto all the way up. */
export function resolvedAlign(data: PlacementData | null | undefined, bp: Tier, kind: PlacementKind): PlacementAlign | null {
  return alignOrNull(resolveCapability<PlacementValue>(data, bp).align, kind);
}

// Auto's row is what the CSS chain falls back to when a tier emits nothing.
const EDGE = 'var(--placement-edge, 0px)';
type Rendered = Record<string, string>;
const BOX: Record<PlacementAlign | 'auto', Rendered> = {
  auto: { w: 'auto', ml: EDGE, mr: EDGE },
  start: { w: 'fit-content', ml: EDGE, mr: 'auto' },
  center: { w: 'fit-content', ml: 'auto', mr: 'auto' },
  end: { w: 'fit-content', ml: 'auto', mr: EDGE },
  stretch: { w: 'auto', ml: EDGE, mr: EDGE },
};
const card = (a: PlacementAlign | 'auto'): Rendered => ({ ...BOX[a], fill: a === 'stretch' ? '100%' : 'auto' });
const CARD: Record<PlacementAlign | 'auto', Rendered> = { auto: card('auto'), start: card('start'), center: card('center'), end: card('end'), stretch: card('stretch') };
const IMAGE: Record<PlacementAlign | 'auto', Rendered> = {
  auto: { ml: 'auto', mr: 'auto' },
  start: { ml: '0px', mr: 'auto' },
  center: { ml: 'auto', mr: 'auto' },
  end: { ml: 'auto', mr: '0px' },
  stretch: { ml: 'auto', mr: 'auto' },
};
const TABLE: Record<PlacementKind, Record<PlacementAlign | 'auto', Rendered>> = { box: BOX, card: CARD, image: IMAGE };
const VAR: Record<string, string> = { w: '--placement-w', ml: '--placement-ml', mr: '--placement-mr', fill: '--quick-link-fill' };

/** The property names placementVars can emit for a host kind, which a unit test pins. */
export function placementProps(kind: PlacementKind): string[] {
  return Object.keys(TABLE[kind].auto).flatMap((key) => TIERS.map((bp) => `${VAR[key]}-${TIER_CHAR[bp]}`));
}

/** The placement as overrides: per tier, each value that differs from what the tier above renders (desktop: from Auto). */
export function placementVars(data: PlacementData | null | undefined, kind: PlacementKind): OverrideSet {
  const table = TABLE[kind];
  const out: Record<string, string> = {};
  let above = table.auto;
  for (const bp of TIERS) {
    const align = resolvedAlign(data, bp, kind);
    const own = table[align ?? 'auto'];
    for (const [key, value] of Object.entries(own)) {
      if (value !== above[key]) out[`${VAR[key]}-${TIER_CHAR[bp]}`] = value;
    }
    above = own;
  }
  return out;
}

/** The class a host adds for the capability's CSS to apply: only when its placement renders anything. */
export function placementClass(data: PlacementData | null | undefined, kind: PlacementKind): string {
  return Object.keys(placementVars(data, kind)).length > 0 ? 'cap-placement' : '';
}

/** Sanitizes a raw (possibly absent or malformed) value into valid PlacementData. */
export function normalizePlacement(raw: unknown, kind: PlacementKind = 'box'): PlacementData {
  if (!raw || typeof raw !== 'object') return {};
  const out: PlacementData = {};
  for (const bp of TIERS) {
    const align = alignOrNull((raw as Record<string, { align?: unknown } | undefined>)[bp]?.align, kind);
    if (align) out[bp] = { align };
  }
  return out;
}

/** Sets or clears (null) one tier's alignment. */
export function setPlacementAlign(data: PlacementData | null | undefined, bp: Tier, align: PlacementAlign | null): PlacementData {
  const next: PlacementData = { ...(data ?? {}) };
  if (align) next[bp] = { align };
  else delete next[bp];
  return next;
}

/**
 * Stored images may carry a one-value `align` (left / right) instead: it is
 * the desktop placement until the block settings panel writes `placement` and clears it.
 */
export function imagePlacement(attrs: { placement?: unknown; align?: unknown } | null | undefined): PlacementData {
  const own = normalizePlacement(attrs?.placement, 'image');
  if (Object.keys(own).length > 0) return own;
  const legacy = attrs?.align === 'left' ? 'start' : attrs?.align === 'right' ? 'end' : null;
  return legacy ? { desktop: { align: legacy } } : {};
}

/** Margin vars for a placed image; a never-placed one renders its `align` as data-align. */
export function imagePlacementRender(attrs: { placement?: unknown; align?: unknown } | null | undefined): { vars: OverrideSet; align: 'left' | 'right' | null } {
  const own = normalizePlacement(attrs?.placement, 'image');
  if (Object.keys(own).length > 0) return { vars: placementVars(own, 'image'), align: null };
  const align = attrs?.align;
  return { vars: {}, align: align === 'left' || align === 'right' ? align : null };
}

export function placementAttr() {
  return {
    default: null as PlacementData | null,
    parseHTML: (el: HTMLElement) => {
      try {
        const raw = el.getAttribute('data-placement');
        return raw ? normalizePlacement(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const p = attrs.placement as PlacementData | null | undefined;
      return p && Object.keys(p).length ? { 'data-placement': JSON.stringify(p) } : {};
    },
  };
}
