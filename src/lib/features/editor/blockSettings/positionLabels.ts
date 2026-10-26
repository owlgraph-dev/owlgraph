// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The names of PositionGrid's nine cells, for the focus-point rows.
import * as m from '$lib/paraglide/messages';
import type { Position } from '$lib/design-system';

export function positionLabels(): Record<Position, string> {
  return {
    'top-left': m.editor_block_settings_image_position_top_left(),
    top: m.editor_block_settings_image_position_top(),
    'top-right': m.editor_block_settings_image_position_top_right(),
    left: m.editor_block_settings_image_position_left(),
    center: m.editor_block_settings_image_position_center(),
    right: m.editor_block_settings_image_position_right(),
    'bottom-left': m.editor_block_settings_image_position_bottom_left(),
    bottom: m.editor_block_settings_image_position_bottom(),
    'bottom-right': m.editor_block_settings_image_position_bottom_right(),
  };
}
