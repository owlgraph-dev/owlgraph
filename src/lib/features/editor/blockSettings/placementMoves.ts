// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// One list of a block's moves for the block tools and the block settings panel's
// placement section, so their icons and words agree. Moves at an edge stay,
// disabled, so the row doesn't jump as the block moves.
import type { SectionMove } from '$lib/features/content';
import * as m from '$lib/paraglide/messages';

export interface PlacementMoveItem {
  move: SectionMove;
  icon: string;
  label: () => string;
  /** What a disabled move says instead: why it has nowhere to go. */
  none?: () => string;
}

export const PLACEMENT_MOVES: readonly PlacementMoveItem[] = [
  { move: 'cell-prev', icon: 'arrow-left', label: m.editor_block_tools_move_cell_prev, none: m.editor_block_tools_move_cell_prev_none },
  { move: 'cell-next', icon: 'arrow-right', label: m.editor_block_tools_move_cell_next, none: m.editor_block_tools_move_cell_next_none },
  { move: 'section-prev', icon: 'section-up', label: m.editor_block_tools_move_section_prev, none: m.editor_block_tools_move_section_prev_none },
  { move: 'section-next', icon: 'section-down', label: m.editor_block_tools_move_section_next, none: m.editor_block_tools_move_section_next_none },
  { move: 'extract', icon: 'section-extract', label: m.editor_block_tools_move_extract },
];

/** No column moves without a second cell. */
export function shownMoves(moves: Record<SectionMove, boolean>): PlacementMoveItem[] {
  const columns = moves['cell-prev'] || moves['cell-next'];
  return PLACEMENT_MOVES.filter((item) => columns || (item.move !== 'cell-prev' && item.move !== 'cell-next'));
}

/** A move's title: its name, or why it is disabled. */
export function moveTitle(item: PlacementMoveItem, enabled: boolean): string {
  return enabled || !item.none ? item.label() : item.none();
}
