// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A file block's attrs as drawn, shared by the editor (tiptap.ts) and the page
// (render.ts) so the two cannot disagree.
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
  type PlacementData,
  type ResolvedBlockDefaults,
  type SpacingData,
  type SurfaceData,
  type TypographyData,
  type TypographyRegistry,
} from '$lib/features/content';
import type { DocumentView } from '../../server/documents.server';
import { FILE_BLOCK, fileConfig, type FileConfig } from './model';
import type { FileTexts } from './texts';
import type { TreeChoice } from '../tree';

type CapabilityAttrs = { spacing?: SpacingData | null; surface?: SurfaceData | null; typography?: TypographyData | null; placement?: PlacementData | null };

/** The wrapper: the block id, its space above and its placement. */
export function fileWrapper(attrs: Readonly<Record<string, unknown>> | undefined): BlockWrapper {
  const a = (attrs ?? {}) as CapabilityAttrs & { blockId?: string | null };
  return {
    classes: ['nc-file-block', placementClass(a.placement, 'box')].filter(Boolean),
    blockId: a.blockId ?? null,
    overrides: mergeOverrides(spaceAboveOverrides(a), placementVars(a.placement, 'box')),
  };
}

/** The box's surface against the cards group's defaults, its typography against the default paragraph style's. */
export function fileBoxOverrides(attrs: Readonly<Record<string, unknown>> | undefined, registry: TypographyRegistry, blockDefaults: ResolvedBlockDefaults): OverrideSet {
  const a = (attrs ?? {}) as CapabilityAttrs;
  return mergeOverrides(
    surfaceVars(a.surface, defaultsFor(FILE_BLOCK, blockDefaults), 'surface', 'card'),
    typographyVars(a.typography, bodyDefaults(registry), 'typography', registry)
  );
}

/** The editor's store (documents.ts) and repairs; the page never has them. */
export interface FileEditing {
  /** Calls back once the document is known, and on every change; returns the way to stop. */
  watch(listener: (view: DocumentView | null) => void): () => void;
  /** Looks the file up again; false when that could not be done. */
  check(): Promise<boolean>;
  /** Binds another file, keeping the node and its edges; false when that failed. */
  rebind(choice: TreeChoice): Promise<boolean>;
}

export interface FileProps extends Record<string, unknown> {
  mode: 'editor' | 'page';
  documentId: string | null;
  config: FileConfig;
  /** `null` for a document the viewer may not read; `undefined` when nothing was resolved. */
  initial: DocumentView | null | undefined;
  texts: FileTexts;
  /** Numbers and dates are written in it. */
  locale: string;
  class: string;
  editing: FileEditing | null;
}

export function fileProps(
  attrs: Readonly<Record<string, unknown>> | undefined,
  opts: {
    mode: 'editor' | 'page';
    initial: DocumentView | null | undefined;
    texts: FileTexts;
    locale: string;
    ruleId: string;
    editing: FileEditing | null;
  }
): FileProps {
  const config = fileConfig(attrs);
  return {
    mode: opts.mode,
    documentId: config.documentId,
    config,
    initial: opts.initial,
    texts: opts.texts,
    locale: opts.locale,
    class: [groupClass(FILE_BLOCK), 'cap-surface', 'cap-typography'].filter(Boolean).join(' '),
    editing: opts.editing,
    ...(opts.ruleId ? { 'data-b': opts.ruleId } : {}),
  };
}
