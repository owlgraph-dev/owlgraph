// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A block kind's name in the breadcrumb; the block settings panel's block sections title
// themselves with these words too.
import * as m from '$lib/paraglide/messages';
import { pluginEditorBlock } from '$lib/plugins/editor';

const BLOCK_TYPE_LABELS: Record<string, () => string> = {
  page: m.editor_breadcrumb_page,
  paragraph: m.editor_breadcrumb_paragraph,
  heading: m.editor_breadcrumb_heading,
  codeBlock: m.editor_breadcrumb_code_block,
  blockquote: m.editor_breadcrumb_quote,
  horizontalRule: m.editor_breadcrumb_divider,
  callout: m.editor_breadcrumb_callout,
  bulletList: m.editor_breadcrumb_list,
  orderedList: m.editor_breadcrumb_list,
  listItem: m.editor_breadcrumb_list_item,
  image: m.editor_breadcrumb_image,
  htmlBlock: m.editor_breadcrumb_html_embed,
  quickLink: m.editor_breadcrumb_quick_link,
  collectionBlock: m.editor_breadcrumb_collection,
  documentBlock: m.editor_breadcrumb_document,
  table: m.editor_breadcrumb_table,
  diagram: m.editor_breadcrumb_diagram,
  grid: m.editor_breadcrumb_grid,
  gridCell: m.editor_breadcrumb_cell,
  pageSection: m.editor_breadcrumb_section,
  flexContainer: m.editor_breadcrumb_flex_row,
  flexCell: m.editor_breadcrumb_flex_cell,
  tableCell: m.editor_breadcrumb_table_cell,
  queryBlock: m.editor_breadcrumb_query,
  unknownBlock: m.editor_breadcrumb_unknown,
};

// A plugin block names itself in its editor half.
export function labelFor(type: string): string {
  return (BLOCK_TYPE_LABELS[type] ?? pluginEditorBlock(type)?.label ?? m.editor_breadcrumb_element)();
}
