// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A quick link: a card or a button to a page, a document or an address. One
// to a page or a document is an edge of the knowledge graph (docs/architecture/overview.md).
import { safeTargetHref } from '../../render/linkTarget';
import type { SpacingData } from '../../capabilities/spacing/spacing';
import type { SurfaceData } from '../../capabilities/surface/surface';
import type { PlacementData } from '../../capabilities/placement/placement';
import type { TypographyData } from '../../capabilities/typography/typography';
import { defaultsFor } from '../../capabilities/defaults/blockDefaults';
import type { Attrs, JsonNode } from '../../doc/doc';
import type { BlockFacets, BlockEdge } from '../facets';
import { quickLinkDefaults, quickLinkSurface, quickLinkVariant, type QuickLinkVariant } from './variants';

export interface QuickLinkAttrs {
  blockId?: string | null;
  /** The card's own space above it (blockSpacing.ts). */
  spacing?: SpacingData | null;
  refType?: string;
  targetPageId?: string | null;
  targetDocId?: string | null;
  url?: string;
  /** The page target's slug, denormalized at write time for the editor's href. */
  targetSlug?: string;
  label?: string;
  /** The look: link · outlined · button (variants.ts); inferred when absent. */
  variant?: QuickLinkVariant | string | null;
  surface?: SurfaceData | null;
  typography?: TypographyData | null;
  /** Where the card sits in its column (capabilities/placement). */
  placement?: PlacementData | null;
  icon?: string | null;
  iconPosition?: string;
  underline?: boolean;
  /** An opt-in typed edge: a relationship_types slug (the semantic feature). */
  relationshipType?: string | null;
  /** { [propertyName]: value } — only meaningful with a relationshipType. */
  properties?: Record<string, string>;
}

/** What a picker hands over when a card is placed or retargeted. */
export type QuickLinkTarget =
  | { refType: 'page'; targetPageId: string; targetSlug: string; label: string }
  | { refType: 'document'; targetDocId: string; label: string }
  | { refType: 'url'; url: string; label: string };

/** The other kinds' fields are cleared, so a retarget leaves nothing behind. */
export function quickLinkTargetAttrs(target: QuickLinkTarget): Pick<QuickLinkAttrs, 'refType' | 'targetPageId' | 'targetDocId' | 'url' | 'targetSlug'> {
  return {
    refType: target.refType,
    targetPageId: target.refType === 'page' ? target.targetPageId : null,
    targetDocId: target.refType === 'document' ? target.targetDocId : null,
    url: target.refType === 'url' ? target.url : '',
    targetSlug: target.refType === 'page' ? target.targetSlug : '',
  };
}

/** What the Insert menu places before a target is chosen. */
export function newQuickLink(blockId: string): JsonNode {
  return {
    type: 'quickLink',
    attrs: { refType: 'page', targetPageId: null, targetDocId: null, url: '', targetSlug: '', label: 'Untitled link', icon: null, iconPosition: 'left', blockId },
  };
}

const POSITIONS = new Set(['left', 'top']);

export function refIconPosition(attrs: QuickLinkAttrs | undefined): string {
  const p = attrs?.iconPosition;
  return typeof p === 'string' && POSITIONS.has(p) ? p : 'left';
}

// Only the link variant draws it (quickLink.css); unset means true.
export function refUnderline(attrs: QuickLinkAttrs | undefined): boolean {
  return attrs?.underline !== false;
}

export function quickLinkLabel(attrs: QuickLinkAttrs | undefined): string {
  return attrs?.label || attrs?.targetSlug || attrs?.url || 'link';
}

/**
 * The RAW href (the renderer escapes it) and whether it opens in a new tab.
 * An address opens in a new tab unless it is a site path, which the target
 * policy lets through only as `/…`, never `//host`.
 */
export function quickLinkTarget(attrs: QuickLinkAttrs | undefined, nodeHref: (id: string, slug: string) => string): { href: string; external: boolean } {
  const type = attrs?.refType ?? (attrs?.url ? 'url' : attrs?.targetDocId ? 'document' : 'page');
  if (type === 'url') {
    const href = safeTargetHref(attrs?.url);
    return { href, external: !href.startsWith('/') };
  }
  if (type === 'document') return { href: nodeHref(attrs?.targetDocId ?? '', ''), external: false };
  return { href: nodeHref(attrs?.targetPageId ?? '', attrs?.targetSlug ?? ''), external: false };
}

/** One edge per node target the card carries; property values only when typed. */
export function quickLinkEdges(attrs: QuickLinkAttrs): BlockEdge[] {
  const relationshipType = attrs.relationshipType ? String(attrs.relationshipType) : null;
  const properties = relationshipType
    ? Object.entries(attrs.properties && typeof attrs.properties === 'object' ? attrs.properties : {})
        .filter(([name]) => name)
        .map(([name, value]) => ({ name, value: String(value ?? '') }))
    : [];
  const out: BlockEdge[] = [];
  if (attrs.targetPageId) out.push({ targetId: String(attrs.targetPageId), relationshipType, properties });
  if (attrs.targetDocId) out.push({ targetId: String(attrs.targetDocId), relationshipType, properties });
  return out;
}

const asQuickLink = (attrs: Attrs) => attrs as QuickLinkAttrs;

export const quickLinkFacets: BlockFacets = {
  // A card's label is its text; the target is no text of this page.
  text: (attrs) => String(asQuickLink(attrs).label ?? '').trim(),
  summary: (attrs) => {
    const a = asQuickLink(attrs);
    return `→ ${a.label || a.url || a.targetSlug || a.targetPageId || a.targetDocId || ''}`;
  },
  edges: (attrs) => quickLinkEdges(asQuickLink(attrs)),
  ground: {
    // Only its variant's fields: a link's stored border is no border.
    surface: (attrs) => quickLinkSurface(asQuickLink(attrs)),
    // Only a button is a ground.
    defaultBg: (attrs, blockDefaults) => quickLinkDefaults(quickLinkVariant(asQuickLink(attrs)), defaultsFor('quickLink', blockDefaults)).bg,
    fill: 'card',
  },
};
