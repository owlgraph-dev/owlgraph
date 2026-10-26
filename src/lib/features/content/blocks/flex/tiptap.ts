// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The flex row's nodes and NodeView (docs/architecture/blocks/anatomy.md, "Containers without
// chrome"). Both containers sit outside the 'block' group, so a cell's
// content names them directly, as the grid's cell does.
import { Node, mergeAttributes } from '@tiptap/core';
import { spacingAttr } from '../../capabilities/spacing/spacing';
import { surfaceAttr } from '../../capabilities/surface/surface';
import { heightAttr } from '../../capabilities/height/height';
import { typographyAttr } from '../../capabilities/typography/typography';
import { getTypographyRegistry } from '../../capabilities/typography/typographyRegistry';
import { getBlockDefaults } from '../../capabilities/defaults/defaultsRegistry';
import { styleAttr } from '../../capabilities/overrides';
import { placementAttr } from '../../capabilities/placement/placement';
import { layoutAttr } from '../../capabilities/layout/layout';
import { flexItemAttr, flexItemClass } from '../../capabilities/flexItem/flexItem';
import { svelteNodeView } from '../scaffold/svelteNodeView.svelte';
import { flexCellStyle } from './flexStyle';
import { flexRowProps, flexWrapper } from './view';
import FlexRow from './FlexRow.svelte';

export const FlexCell = Node.create({
  name: 'flexCell',
  content: '(block | grid | flexContainer)+',
  isolating: true,
  addAttributes() {
    return {
      spacing: spacingAttr(),
      surface: surfaceAttr(),
      typography: typographyAttr(),
      flexItem: flexItemAttr(),
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-flex-cell]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const style = styleAttr(flexCellStyle(node.attrs, getTypographyRegistry(), getBlockDefaults()));
    const sized = flexItemClass(node.attrs.flexItem);
    return ['div', mergeAttributes(HTMLAttributes, { 'data-flex-cell': '', class: `flex-cell grp-containers cap-spacing cap-surface cap-typography${sized ? ` ${sized}` : ''}`, ...(style ? { style } : {}) }), 0];
  },
  addStorage() {
    return { capabilities: ['spacing', 'surface', 'typography', 'flexItem'] };
  },
});

export const FlexContainer = Node.create({
  name: 'flexContainer',
  group: 'layout',
  content: 'flexCell+',
  draggable: true,
  isolating: true,

  addAttributes() {
    const dataAttr = (key: string, name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => el.getAttribute(name),
      renderHTML: (attrs: Record<string, unknown>) => (attrs[key] ? { [name]: attrs[key] } : {}),
    });
    return {
      layout: layoutAttr(),
      spacing: spacingAttr(),
      surface: surfaceAttr(),
      height: heightAttr(),
      // 'normal' (null) | 'wide' | 'full', as on the grid.
      width: dataAttr('width', 'data-width'),
      placement: placementAttr(),
      // Flush against the page top, only as the page's first block
      // (computeFirstBlockBleeds, app.css's .bleed-top).
      bleedToTop: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-bleed-top'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.bleedToTop ? { 'data-bleed-top': '' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-flex]' }];
  },

  // What the clipboard carries; the live editor draws the NodeView.
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-flex': '' }), 0];
  },

  addStorage() {
    return { capabilities: ['spacing', 'surface', 'layout', 'placement', 'height'] };
  },

  // The row is ProseMirror's (`content`). The wrapper's and the row's override
  // sets go through the editor's live sheet, as on the page; cells keep their
  // renderHTML style.
  addNodeView() {
    return svelteNodeView(FlexRow, {
      wrapper: (node) => flexWrapper(node.attrs),
      props: (node, { styles }) => flexRowProps(node.attrs, (set) => styles.add(set), getBlockDefaults(), null),
      content: (root) => root.firstElementChild as HTMLElement,
    });
  },
});
