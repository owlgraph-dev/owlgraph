// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How a collection block's attrs become what is drawn, shared by the editor
// and the page so the two cannot disagree.
import * as m from '$lib/paraglide/messages';
import { spaceAboveOverrides, type SpacingData } from '../../capabilities/spacing/spacing';
import { surfaceVars, type SurfaceData } from '../../capabilities/surface/surface';
import { placementClass, placementVars, type PlacementData } from '../../capabilities/placement/placement';
import { typographyVars, type TypographyData } from '../../capabilities/typography/typography';
import type { TypographyRegistry } from '../../capabilities/typography/roles';
import { bodyDefaults } from '../../capabilities/typography/paragraphStyles';
import { defaultsFor, type ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { mergeOverrides, type OverrideSet } from '../../capabilities/overrides';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import type { EmbedSource } from '../embeds';
import { COLLECTION_BLOCK, collectionConfig, type CollectionBlockConfig, type CollectionBlockData } from './model';
import type { NodeType } from '$lib/features/nodes';

type CapabilityAttrs = { blockId?: string | null; spacing?: SpacingData | null; surface?: SurfaceData | null; typography?: TypographyData | null; placement?: PlacementData | null };

export function collectionWrapper(attrs: Readonly<Record<string, unknown>> | undefined): BlockWrapper {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return {
    classes: ['collection-block', placementClass(a.placement, 'box')].filter(Boolean),
    blockId: a.blockId ?? null,
    overrides: mergeOverrides(spaceAboveOverrides(a), placementVars(a.placement, 'box')),
  };
}

/** Surface against the cards group's defaults, typography against the default paragraph style. */
export function collectionBoxOverrides(attrs: Readonly<Record<string, unknown>> | undefined, registry: TypographyRegistry, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return mergeOverrides(
    surfaceVars(a.surface, defaultsFor(COLLECTION_BLOCK, blockDefaults), 'surface', 'card'),
    typographyVars(a.typography, bodyDefaults(registry), 'typography', registry)
  );
}

/** In the content's language on the page, the interface's in the editor. */
export interface CollectionBlockTexts {
  name: string;
  kind: string;
  types: Record<NodeType, string>;
  /** A mirrored member's kind: "{type} · {source}". */
  memberKind: string;
  countOne: string;
  countOther: string;
  shownOf: string;
  /** The link to the collection's own page. */
  all: string;
  empty: string;
  unavailable: string;
  editor: { unconfigured: string; hidden: string; provided: string } | null;
}

export function collectionBlockTexts(forEditor: boolean): CollectionBlockTexts {
  return {
    name: m.collection_column_name(),
    kind: m.collection_column_kind(),
    types: { page: m.node_type_page(), document: m.node_type_document(), collection: m.node_type_collection() },
    memberKind: m.collection_member_kind({ type: '{type}', source: '{source}' }),
    countOne: m.collection_members_count_one({ count: '{count}' }),
    countOther: m.collection_members_count_other({ count: '{count}' }),
    shownOf: m.collection_block_shown_of({ shown: '{shown}', total: '{total}' }),
    all: m.collection_block_all({ count: '{count}' }),
    empty: m.collection_members_empty(),
    unavailable: m.embed_block_unavailable(),
    editor: forEditor ? { unconfigured: m.collection_block_unconfigured(), hidden: m.collection_block_hidden(), provided: m.collection_block_provided() } : null,
  };
}

export interface CollectionBlockProps extends Record<string, unknown> {
  mode: 'editor' | 'page';
  config: CollectionBlockConfig;
  /** Undefined when nothing was resolved: an agent's view, a version's preview, or the editor, which loads it. */
  initial: CollectionBlockData | undefined;
  /** Null on the page. */
  source: EmbedSource<CollectionBlockData> | null;
  texts: CollectionBlockTexts;
  locale: string;
  class: string;
}

export function collectionBlockProps(
  attrs: Readonly<Record<string, unknown>> | undefined,
  opts: { mode: 'editor' | 'page'; initial: CollectionBlockData | undefined; source: EmbedSource<CollectionBlockData> | null; texts: CollectionBlockTexts; locale: string; ruleId: string }
): CollectionBlockProps {
  return {
    mode: opts.mode,
    config: collectionConfig(attrs),
    initial: opts.initial,
    source: opts.source,
    texts: opts.texts,
    locale: opts.locale,
    class: [groupClass(COLLECTION_BLOCK), 'cap-surface', 'cap-typography'].filter(Boolean).join(' '),
    ...(opts.ruleId ? { 'data-b': opts.ruleId } : {}),
  };
}
