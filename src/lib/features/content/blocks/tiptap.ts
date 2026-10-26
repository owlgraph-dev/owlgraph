// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Every block's Tiptap extensions, as the one list the editor mounts. Order is
// the schema's node order: the paragraph stays first, since a document's
// default block is the first one.
import type { AnyExtension } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { lowlight } from './code/highlight';
import { Paragraph } from './paragraph/tiptap';
import { Heading } from './heading/tiptap';
import { Placeholder, PlaceholderAutoParagraph } from './placeholder/tiptap';
import { Grid, GridCell } from './grid/tiptap';
import { PageSection, PageSectionGuard } from './section/tiptap';
import { FlexContainer, FlexCell } from './flex/tiptap';
import { Callout } from './callout/tiptap';
import { ListFormatting } from './list/tiptap';
import { HtmlBlock } from './html/tiptap';
import { QuickLink } from './quickLink/tiptap';
import { Table, TableRow, TableCell } from './table/tiptap';
import { Diagram } from './diagram/tiptap';
import { ImageNode } from './image/tiptap';
import { QueryBlock } from './query/tiptap';
import { CollectionBlockNode } from './collection/tiptap';
import { DocumentBlockNode } from './document/tiptap';
import { UnknownBlockNode } from './unknown/tiptap';
import type { EmbedSource } from './embeds';
import type { CollectionBlockData } from './collection/model';
import type { DocumentBlockData } from './document/model';

export interface BlockExtensionOptions {
  /** false in the phone editor: no pointer-drag construction chrome (docs/architecture/editor.md). */
  interactive: boolean;
  /** A load-time snapshot. */
  resolvePageHref: (id: string) => string;
  resolveDocHref: (id: string) => string;
  embeds?: { collections: EmbedSource<CollectionBlockData>; documents: EmbedSource<DocumentBlockData> };
}

export function blockExtensions(options: BlockExtensionOptions): AnyExtension[] {
  return [
    Paragraph,
    Heading,
    Placeholder.configure({ interactive: options.interactive }),
    PlaceholderAutoParagraph,
    Grid.configure({ interactive: options.interactive }),
    PageSection.configure({ interactive: options.interactive }),
    PageSectionGuard,
    GridCell,
    FlexContainer,
    FlexCell,
    CodeBlockLowlight.configure({ lowlight }),
    Callout,
    ListFormatting,
    HtmlBlock,
    QuickLink.configure({ resolvePageHref: options.resolvePageHref, resolveDocHref: options.resolveDocHref }),
    CollectionBlockNode.configure({ source: options.embeds?.collections ?? null }),
    DocumentBlockNode.configure({ source: options.embeds?.documents ?? null }),
    Table.configure({ interactive: options.interactive }),
    TableRow,
    TableCell,
    Diagram,
    ImageNode.configure({ interactive: options.interactive }),
    QueryBlock,
    UnknownBlockNode,
  ];
}
