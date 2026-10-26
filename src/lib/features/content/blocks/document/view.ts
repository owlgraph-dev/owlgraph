// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// How a document block's attrs become what is drawn, shared by the editor and
// the page so the two cannot disagree.
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
import { DOCUMENT_BLOCK, documentConfig, type DocumentBlockConfig, type DocumentBlockData } from './model';

type CapabilityAttrs = { blockId?: string | null; spacing?: SpacingData | null; surface?: SurfaceData | null; typography?: TypographyData | null; placement?: PlacementData | null };

export function documentWrapper(attrs: Readonly<Record<string, unknown>> | undefined): BlockWrapper {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return {
    classes: ['document-block', placementClass(a.placement, 'box')].filter(Boolean),
    blockId: a.blockId ?? null,
    overrides: mergeOverrides(spaceAboveOverrides(a), placementVars(a.placement, 'box')),
  };
}

/** Surface against the cards group's defaults, typography against the default paragraph style. */
export function documentBoxOverrides(attrs: Readonly<Record<string, unknown>> | undefined, registry: TypographyRegistry, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return mergeOverrides(
    surfaceVars(a.surface, defaultsFor(DOCUMENT_BLOCK, blockDefaults), 'surface', 'card'),
    typographyVars(a.typography, bodyDefaults(registry), 'typography', registry)
  );
}

/** In the content's language on the page, the interface's in the editor. */
export interface DocumentBlockTexts {
  download: string;
  openNode: string;
  unavailable: string;
  /** The chip the editor shows after its title. */
  chip: string;
  /** A file's type when its name says none; a link's, on a card's tile. */
  genericType: string;
  linkType: string;
  external: string;
  editor: { unconfigured: string; hidden: string; provided: string } | null;
}

export function documentBlockTexts(forEditor: boolean): DocumentBlockTexts {
  return {
    download: m.document_download(),
    openNode: m.document_block_open_node(),
    unavailable: m.embed_block_unavailable(),
    chip: m.node_type_document(),
    genericType: m.document_file_label(),
    linkType: m.document_source_link(),
    external: m.document_external_label(),
    editor: forEditor ? { unconfigured: m.document_block_unconfigured(), hidden: m.document_block_hidden(), provided: m.document_block_provided() } : null,
  };
}

export interface DocumentBlockProps extends Record<string, unknown> {
  mode: 'editor' | 'page';
  config: DocumentBlockConfig;
  /** Undefined when nothing was resolved: an agent's view, a version's preview, or the editor, which loads it. */
  initial: DocumentBlockData | undefined;
  /** Null on the page. */
  source: EmbedSource<DocumentBlockData> | null;
  texts: DocumentBlockTexts;
  locale: string;
  class: string;
}

export function documentBlockProps(
  attrs: Readonly<Record<string, unknown>> | undefined,
  opts: { mode: 'editor' | 'page'; initial: DocumentBlockData | undefined; source: EmbedSource<DocumentBlockData> | null; texts: DocumentBlockTexts; locale: string; ruleId: string }
): DocumentBlockProps {
  return {
    mode: opts.mode,
    config: documentConfig(attrs),
    initial: opts.initial,
    source: opts.source,
    texts: opts.texts,
    locale: opts.locale,
    class: [groupClass(DOCUMENT_BLOCK), 'cap-surface', 'cap-typography'].filter(Boolean).join(' '),
    ...(opts.ruleId ? { 'data-b': opts.ruleId } : {}),
  };
}
