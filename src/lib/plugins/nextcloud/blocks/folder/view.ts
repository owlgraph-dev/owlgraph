// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A folder block's attrs as drawn, shared by the editor (tiptap.ts) and the
// page (render.ts) so the two cannot disagree. The props travel as JSON in the
// island's attribute: node ids and share paths, never a token or WebDAV address.
import {
  bodyDefaults,
  defaultsFor,
  groupClass,
  mergeOverrides,
  placementClass,
  placementVars,
  spaceAboveOverrides,
  surfaceVars,
  typographyVars,
  type BlockWrapper,
  type OverrideSet,
  type ResolvedBlockDefaults,
  type SpacingData,
  type SurfaceData,
  type TypographyData,
  type TypographyRegistry,
  type PlacementData,
} from '$lib/features/content';
import type { ListingView } from '../../server/listing.server';
import { FOLDER_BLOCK, folderConfig, type FolderConfig } from './model';
import type { FolderTexts } from './texts';

type CapabilityAttrs = { spacing?: SpacingData | null; surface?: SurfaceData | null; typography?: TypographyData | null; placement?: PlacementData | null };

/** The wrapper: the block id, its space above and its placement. */
export function folderWrapper(attrs: Readonly<Record<string, unknown>> | undefined): BlockWrapper {
  const a = (attrs ?? {}) as CapabilityAttrs & { blockId?: string | null };
  return {
    classes: ['nc-folder-block', placementClass(a.placement, 'box')].filter(Boolean),
    blockId: a.blockId ?? null,
    overrides: mergeOverrides(spaceAboveOverrides(a), placementVars(a.placement, 'box')),
  };
}

/** The box's surface against the cards group's defaults, its typography against the default paragraph style's. */
export function folderBoxOverrides(attrs: Readonly<Record<string, unknown>> | undefined, registry: TypographyRegistry, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return mergeOverrides(
    surfaceVars(a.surface, defaultsFor(FOLDER_BLOCK, blockDefaults), 'surface', 'card'),
    typographyVars(a.typography, bodyDefaults(registry), 'typography', registry)
  );
}

/** The editor's actions; the page never has them. */
export interface FolderEditing {
  /** Makes a document of the collection's file; null when that failed. */
  createDocument(path: string, fileid: string): Promise<{ id: string; href: string } | null>;
}

export interface FolderProps extends Record<string, unknown> {
  mode: 'editor' | 'page';
  collectionId: string | null;
  config: FolderConfig;
  /** `null` for a collection the viewer may not read; `undefined` when nothing was resolved. */
  initial: ListingView | null | undefined;
  texts: FolderTexts;
  /** Numbers and dates are written in it. */
  locale: string;
  /** In ms: what "40 s ago" counts from until the island takes over. */
  renderedAt: number;
  /** The plugin's routes. */
  base: string;
  class: string;
  editing: FolderEditing | null;
  /** Only on a collection's own page: the footer's "read as …" or "via share"; never in a block. */
  provenance?: { user: string; node: string } | null;
}

export function folderProps(
  attrs: Readonly<Record<string, unknown>> | undefined,
  opts: {
    mode: 'editor' | 'page';
    initial: ListingView | null | undefined;
    texts: FolderTexts;
    locale: string;
    renderedAt: number;
    ruleId: string;
    base: string;
    editing: FolderEditing | null;
  }
): FolderProps {
  const config = folderConfig(attrs);
  return {
    mode: opts.mode,
    collectionId: config.collectionId,
    config,
    initial: opts.initial,
    texts: opts.texts,
    locale: opts.locale,
    renderedAt: opts.renderedAt,
    base: opts.base,
    class: [groupClass(FOLDER_BLOCK), 'cap-surface', 'cap-typography'].filter(Boolean).join(' '),
    editing: opts.editing,
    ...(opts.ruleId ? { 'data-b': opts.ruleId } : {}),
  };
}
