// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The query block's wrapper, its result container, for the editor and the page.
import { mergeOverrides } from '../../capabilities/overrides';
import { placementClass, placementVars } from '../../capabilities/placement/placement';
import type { ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import { queryFormatContainer } from './formats';
import type { QueryBlockNodeAttrs } from './model';

export function queryWrapper(attrs: QueryBlockNodeAttrs, blockDefaults: ResolvedBlockDefaults): BlockWrapper {
  const container = queryFormatContainer(attrs.format, attrs.formatOptions, blockDefaults);
  const placed = placementClass(attrs.placement, 'box');
  const width = attrs.width && attrs.width !== 'normal' ? String(attrs.width) : null;
  return {
    classes: [...container.class.split(' '), ...(placed ? [placed] : [])],
    blockId: attrs.blockId ?? null,
    attrs: {
      // app.css's breakout rules read it.
      'data-width': width,
      'data-bleed-top': attrs.bleedToTop ? '' : null,
      'data-scroll': container.attrs['data-scroll'] ?? null,
    },
    overrides: mergeOverrides(container.overrides, placementVars(attrs.placement, 'box')),
  };
}
