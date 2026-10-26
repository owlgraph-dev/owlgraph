// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The page section's wrapper and the grid row inside it, for the editor and
// the page. It draws through the grid's component (Grid.svelte).
import { spaceAboveOverrides } from '../../capabilities/spacing/spacing';
import type { OverrideSet } from '../../capabilities/overrides';
import type { ResolvedBlockDefaults } from '../../capabilities/defaults/blockDefaults';
import { groupClass } from '../catalog';
import type { BlockWrapper } from '../scaffold/blockWrapper';
import { widthAttr } from '../grid/view';
import type { SectionAttrs } from './model';
import { sectionStyle } from './sectionStyle';

/** No placement: a section's place is its span. */
export function sectionWrapper(attrs: SectionAttrs | undefined): BlockWrapper {
  return {
    classes: ['grid-block', groupClass('pageSection')],
    blockId: attrs?.blockId ?? null,
    attrs: { 'data-width': widthAttr(attrs?.width), 'data-bleed-top': attrs?.bleedToTop ? '' : null },
    overrides: spaceAboveOverrides(attrs),
  };
}

/** A page section's tracks are the page's, and it has no handles. */
export function sectionRowProps(attrs: SectionAttrs | undefined, rule: (set: OverrideSet) => string, blockDefaults: ResolvedBlockDefaults, cellsHtml: string | null) {
  return {
    section: true,
    ruleId: rule(sectionStyle(attrs, blockDefaults)),
    reflow: '',
    columns: attrs?.columns === 'single' ? 'single' : '',
    cellsHtml,
    editing: null,
    blockId: null,
    cellsKey: '',
  };
}
