// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The block taxonomy: one row per node type a page document can contain. What
// a block IS (addressable, structural, transient) is declared once here and
// every type set derives from it, so a new kind is added here first. A
// plugin's kinds join after the core's (docs/architecture/plugins.md).
import { PLUGIN_BLOCK_KINDS } from '$lib/plugins';

/**
 * The block-type groups capability defaults are set for: a default is per
 * group, never per block (docs/architecture/blocks/capabilities.md, "Groups").
 */
export type BlockGroup = 'text' | 'containers' | 'media' | 'cards';
export const BLOCK_GROUPS: readonly BlockGroup[] = ['text', 'containers', 'media', 'cards'];

/** The kinds of node a block can embed (docs/architecture/blocks/node-embeds.md, "One family in the editor"): a collection's entries, or a document. */
export type EmbedFamily = 'collection' | 'document';

export interface BlockKind {
  /** ProseMirror node type name. */
  name: string;
  /** Required: a kind without one does not compile. */
  group: BlockGroup;
  /** Carries a `blockId` attr, so the overlay/block settings panel and the MCP tools can target it. */
  addressable?: boolean;
  /** Declares `blockId` in its own addAttributes(), so the BlockId extension must not add it again. */
  ownBlockIdAttr?: boolean;
  /**
   * Its editing chrome is construction/layout, which the phone editor hides
   * (docs/architecture/editor.md); leaf content inside stays editable.
   */
  structural?: boolean;
  /** Client-only: stripped before persist, so the server never backfills an id for it. */
  transient?: boolean;
  /** A block in a flow, so it can carry a `spaceAbove` of its own (docs/architecture/blocks/capabilities.md, "Block spacing"). */
  spaced?: boolean;
  /**
   * Declares `spacing` itself or keeps it elsewhere (the query block: on its
   * format's options), so the BlockSpacing extension must not add it again.
   */
  ownSpacingAttr?: boolean;
  /** Blocks sit inside it, so it carries a rhythm (`blockSpace`) they read. */
  flow?: boolean;
  /** It shows one node of a family on the page, held in `nodeAttr` (blocks/embeds.ts). */
  embeds?: { family: EmbedFamily; nodeAttr: string };
}

const CORE_BLOCK_KINDS = [
  { name: 'paragraph', group: 'text', addressable: true, spaced: true },
  { name: 'heading', group: 'text', addressable: true, spaced: true },
  { name: 'codeBlock', group: 'text', addressable: true, spaced: true },
  { name: 'callout', group: 'text', addressable: true, spaced: true },
  // Not `spaced` only because a list's `attrs.spacing` is already its item gap
  // (list/listStyle.ts); taking the key would need a migration of every stored
  // list. The flow still spaces a list; it lacks only an override of its own.
  { name: 'bulletList', group: 'text', addressable: true },
  { name: 'orderedList', group: 'text', addressable: true },
  // Nothing inside a list item carries an id: both backfills skip its paragraph.
  { name: 'listItem', group: 'text', addressable: true },
  // Addressable because the spacing rule selects blocks by data-block-id.
  { name: 'blockquote', group: 'text', addressable: true, spaced: true },
  { name: 'horizontalRule', group: 'text', addressable: true, spaced: true },
  { name: 'image', group: 'media', addressable: true, spaced: true },
  { name: 'htmlBlock', group: 'media', addressable: true, ownBlockIdAttr: true, spaced: true },
  { name: 'quickLink', group: 'cards', addressable: true, ownBlockIdAttr: true, spaced: true },
  { name: 'collectionBlock', group: 'cards', addressable: true, ownBlockIdAttr: true, spaced: true, embeds: { family: 'collection', nodeAttr: 'nodeId' } },
  { name: 'documentBlock', group: 'cards', addressable: true, ownBlockIdAttr: true, spaced: true, embeds: { family: 'document', nodeAttr: 'nodeId' } },
  { name: 'diagram', group: 'media', addressable: true, ownBlockIdAttr: true, spaced: true },
  { name: 'table', group: 'containers', addressable: true, ownBlockIdAttr: true, structural: true, spaced: true },
  { name: 'tableRow', group: 'containers' },
  { name: 'tableCell', group: 'containers', ownSpacingAttr: true, flow: true },
  { name: 'grid', group: 'containers', addressable: true, structural: true, spaced: true, ownSpacingAttr: true, flow: true },
  // Structural for parity with the selection chain (shared/blockOps.ts).
  { name: 'gridCell', group: 'containers', structural: true, ownSpacingAttr: true, flow: true },
  // A columns page's row (page/pageSections.ts), top level only.
  { name: 'pageSection', group: 'containers', addressable: true, structural: true, spaced: true, ownSpacingAttr: true, flow: true },
  { name: 'flexContainer', group: 'containers', addressable: true, structural: true, spaced: true, ownSpacingAttr: true, flow: true },
  { name: 'flexCell', group: 'containers', structural: true, ownSpacingAttr: true, flow: true },
  // Structural: a template you fill in.
  { name: 'queryBlock', group: 'containers', addressable: true, ownBlockIdAttr: true, structural: true, spaced: true, ownSpacingAttr: true, flow: true },
  // Addressable only for the live overlay's hover and select.
  { name: 'placeholder', group: 'text', addressable: true, transient: true },
  // The stand-in for a stored node the editor cannot draw (doc/unknownBlocks.ts);
  // what persists is the node it stands for, as it was.
  { name: 'unknownBlock', group: 'text', addressable: true, ownBlockIdAttr: true, transient: true },
] as const satisfies readonly BlockKind[];

/** Every block kind: the core's, then the plugins' (src/lib/plugins/index.ts). */
export const BLOCK_KINDS = [...CORE_BLOCK_KINDS, ...PLUGIN_BLOCK_KINDS] as const satisfies readonly BlockKind[];

/** The registered kind names — a table keyed by this type must cover every block (see renderers.ts). */
export type BlockKindName = (typeof BLOCK_KINDS)[number]['name'];

const names = (pick: (k: BlockKind) => boolean | undefined): ReadonlySet<string> =>
  new Set(BLOCK_KINDS.filter(pick).map((k) => k.name));

/** Every type that carries a blockId in the live editor (includes the transient placeholder). */
export const ADDRESSABLE_BLOCK_TYPES = names((k) => k.addressable);
/** The addressable types that reach storage — what the server-side backfill stamps. */
export const PERSISTED_ADDRESSABLE_BLOCK_TYPES = names((k) => k.addressable && !k.transient);
/** Addressable types that get `blockId` from the BlockId extension's global attribute. */
export const GLOBAL_BLOCK_ID_TYPES = names((k) => k.addressable && !k.ownBlockIdAttr);
/** Types whose editing chrome is construction/layout (see docs/architecture/editor.md). */
export const STRUCTURAL_BLOCK_TYPES = names((k) => k.structural);
/** Types that can carry a `spaceAbove` — a block sitting in a flow. */
export const SPACED_BLOCK_TYPES = names((k) => k.spaced);
/** Types that carry a `blockSpace` rhythm — something blocks sit inside. */
export const FLOW_BLOCK_TYPES = names((k) => k.flow);
/** Spaced types that get `spacing` from the BlockSpacing extension's global attribute. */
export const GLOBAL_SPACING_TYPES = names((k) => k.spaced && !k.ownSpacingAttr);

export const BLOCK_GROUP_OF: ReadonlyMap<string, BlockGroup> = new Map(BLOCK_KINDS.map((k) => [k.name, k.group]));

/** The group of a node type, or null for something that is not a block kind (the page, an inline node). */
export function blockGroupOf(type: string): BlockGroup | null {
  return BLOCK_GROUP_OF.get(type) ?? null;
}

/** The class both renderers put on a block's capability-bearing element, so the group's defaults (theme CSS) reach it. */
export function groupClass(type: string): string {
  const group = blockGroupOf(type);
  return group ? `grp-${group}` : '';
}
