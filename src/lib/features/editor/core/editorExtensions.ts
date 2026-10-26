// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every extension a page editor mounts. A test builds the schema from this
// list to hold the server's known types (content/doc/unknownBlocks.ts) to the
// editor's, so a type the server calls known is one the editor can load.
import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import { blockExtensions, BlockId, BlockSpacing, CellBoundaries, SchemeRegions, PageLink, DocLink, LinkMark, SemanticProperty, CustomStyle } from '$lib/features/content/editor';
import { TypographyFamilyMark, TypographySizeMark, TypographyColorMark, TypographyWeightMark, TypographyLineHeightMark, TypographyLetterSpacingMark } from '$lib/features/content/editor';
import { spacingAttr, pageLayoutAttr, pageSurfaceAttr, type CollectionBlockData, type DocumentBlockData, type EmbedSource } from '$lib/features/content';
import { pluginBlockExtensions } from '$lib/plugins/editor';

export interface EditorExtensionOptions {
  /** The page being edited (a plugin block's sections create what the block needs beside it). */
  pageId: string | null;
  /** false in the phone editor: no pointer-drag construction chrome (docs/architecture/editor.md). */
  interactive: boolean;
  resolvePageHref: (id: string) => string;
  resolveDocHref: (id: string) => string;
  /** A property's label by its name, for the property pills. */
  propLabel: (name: string) => string | null;
  /** Where the embedding blocks read their node from. */
  embeds?: { collections: EmbedSource<CollectionBlockData>; documents: EmbedSource<DocumentBlockData> };
}

export function editorExtensions(o: EditorExtensionOptions): AnyExtension[] {
  return [
    // No Bold: it and the typography weight mark both set font-weight and
    // fought over ProseMirror's DOM nesting. Paragraph and heading come as
    // capability-aware variants.
    StarterKit.configure({ codeBlock: false, document: false, bold: false, paragraph: false, heading: false }),
    ...blockExtensions({ interactive: o.interactive, resolvePageHref: o.resolvePageHref, resolveDocHref: o.resolveDocHref, embeds: o.embeds }),
    // Mounted here, not in content's list: a plugin's NodeView imports
    // content's editor entry, which re-exports that list.
    ...pluginBlockExtensions({ pageId: o.pageId, interactive: o.interactive, resolvePageHref: o.resolvePageHref, resolveDocHref: o.resolveDocHref }),
    // The doc's attrs are the page's own settings (pageAttrs.ts), always
    // serialized, `{}` for Auto, so a save tells "cleared" from "not
    // mentioned" (pageAttrsForWrite). Page sections sit at the top level only.
    Document.extend({
      content: '(block | grid | flexContainer | pageSection)+',
      addAttributes() {
        return { spacing: spacingAttr(), layout: pageLayoutAttr(), surface: pageSurfaceAttr() };
      },
    }),
    BlockId,
    BlockSpacing,
    CellBoundaries,
    SchemeRegions,
    PageLink.configure({ resolveHref: o.resolvePageHref }),
    DocLink.configure({ resolveHref: o.resolveDocHref }),
    // A plain web link the API wrote, kept as it is.
    LinkMark,
    SemanticProperty.configure({ getLabel: o.propLabel }),
    TypographyFamilyMark,
    TypographySizeMark,
    TypographyColorMark,
    TypographyWeightMark,
    TypographyLineHeightMark,
    TypographyLetterSpacingMark,
    CustomStyle,
  ];
}
