// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One public renderer per block kind. Keyed by BlockKindName, so the compiler
// refuses a table that misses a kind of catalog.ts or names an unknown one.
import type { BlockKindName } from './catalog';
import { PLUGIN_RENDERERS } from '$lib/plugins/renderers';
import type { BlockRenderer } from './blockRenderer';
import { renderParagraph } from './paragraph/render';
import { renderHeading } from './heading/render';
import { renderCodeBlock } from './code/render';
import { renderBlockquote } from './quote/render';
import { renderHorizontalRule } from './rule/render';
import { renderCallout } from './callout/render';
import { renderBulletList, renderOrderedList, renderListItem } from './list/render';
import { renderImage } from './image/render';
import { renderHtmlBlock } from './html/render';
import { renderQuickLinkBlock } from './quickLink/render';
import { renderCollectionBlock } from './collection/render';
import { renderDocumentBlock } from './document/render';
import { renderDiagramBlock } from './diagram/render';
import { renderTable, renderTableRow, renderTableCell } from './table/render';
import { renderGridBlock, renderGridCellBlock } from './grid/render';
import { renderPageSectionBlock } from './section/render';
import { renderFlexContainerBlock, renderFlexCellBlock } from './flex/render';
import { renderQueryBlock } from './query/render';
import { renderPlaceholder } from './placeholder/render';
import { renderUnknownBlock } from './unknown/render';

export const BLOCK_RENDERERS: Readonly<Record<BlockKindName, BlockRenderer>> = {
  paragraph: renderParagraph,
  heading: renderHeading,
  codeBlock: renderCodeBlock,
  callout: renderCallout,
  bulletList: renderBulletList,
  orderedList: renderOrderedList,
  listItem: renderListItem,
  blockquote: renderBlockquote,
  horizontalRule: renderHorizontalRule,
  image: renderImage,
  htmlBlock: renderHtmlBlock,
  quickLink: renderQuickLinkBlock,
  collectionBlock: renderCollectionBlock,
  documentBlock: renderDocumentBlock,
  diagram: renderDiagramBlock,
  table: renderTable,
  tableRow: renderTableRow,
  tableCell: renderTableCell,
  grid: renderGridBlock,
  gridCell: renderGridCellBlock,
  pageSection: renderPageSectionBlock,
  flexContainer: renderFlexContainerBlock,
  flexCell: renderFlexCellBlock,
  queryBlock: renderQueryBlock,
  placeholder: renderPlaceholder,
  unknownBlock: renderUnknownBlock,
  ...PLUGIN_RENDERERS,
};

export function blockRenderer(type: string): BlockRenderer | undefined {
  return Object.prototype.hasOwnProperty.call(BLOCK_RENDERERS, type) ? BLOCK_RENDERERS[type as BlockKindName] : undefined;
}
