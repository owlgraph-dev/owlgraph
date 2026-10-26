// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { applyWrapper } from './blockWrapper';
import type { LiveStyles } from '../../capabilities/liveStyles';

// A live sheet that names a set by its size — enough to see the rule id land.
const styles = { add: (set: Record<string, string>) => (Object.keys(set).length ? 'b1' : '') } as unknown as LiveStyles;

describe("the editor's half of the block wrapper", () => {
  it('writes the classes, the block id, the further attributes and the rule id, and takes back what a value no longer sets', () => {
    const el = document.createElement('div');
    applyWrapper(el, { classes: ['flex-block', 'cap-placement'], blockId: 'b', attrs: { 'data-width': 'full', 'data-bleed-top': '' }, overrides: { '--x': '1' } }, styles);
    expect(el.className).toBe('flex-block cap-placement');
    expect([el.dataset.blockId, el.getAttribute('data-width'), el.getAttribute('data-bleed-top'), el.getAttribute('data-b')]).toEqual(['b', 'full', '', 'b1']);
    applyWrapper(el, { classes: ['flex-block'], blockId: 'b', attrs: { 'data-width': null, 'data-bleed-top': null }, overrides: {} }, styles);
    expect(el.className).toBe('flex-block');
    expect(['data-width', 'data-bleed-top', 'data-b'].map((a) => el.hasAttribute(a))).toEqual([false, false, false]);
  });

  it("keeps ProseMirror's class on a selected node through an update", () => {
    const el = document.createElement('div');
    applyWrapper(el, { classes: ['page-image-frame'], overrides: {} }, styles);
    el.classList.add('ProseMirror-selectednode');
    applyWrapper(el, { classes: ['page-image-frame'], attrs: { 'data-box': 'height' }, overrides: {} }, styles);
    expect(el.className).toBe('page-image-frame ProseMirror-selectednode');
  });
});
