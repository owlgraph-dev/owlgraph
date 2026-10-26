// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  applyParagraphStyle,
  bodyDefaults,
  defaultParagraphStyleFor,
  headingLevelOf,
  mergeTokenOverDefaults,
  nodeTag,
  resolveParagraphStyle,
  sortParagraphStyles,
  tagRole,
  type ResolvedParagraphStyle,
} from './paragraphStyles';
import { BUILTIN_ELEMENT_DEFAULTS } from './roles';

function style(id: string, renderAs: ResolvedParagraphStyle['renderAs'], extra: Partial<ResolvedParagraphStyle> = {}): ResolvedParagraphStyle {
  const baseRole = extra.baseRole ?? tagRole(renderAs);
  return { id, label: id, renderAs, baseRole, isDefault: false, position: 0, defaults: BUILTIN_ELEMENT_DEFAULTS[baseRole], ...extra };
}

// The baseline's seed rows of paragraph_styles, by their English names, minus tokens.
const SEED: ResolvedParagraphStyle[] = [
  style('body', 'p', { label: 'Body text', isDefault: true, position: 0 }),
  style('h1', 'h1', { label: 'Title', isDefault: true, position: 1 }),
  style('h2', 'h2', { label: 'Subtitle', isDefault: true, position: 2 }),
  style('h3', 'h3', { isDefault: true, position: 3 }),
  style('display', 'h1', { label: 'Display', baseRole: 'display', position: 7 }),
  style('label', 'p', { label: 'Label', baseRole: 'label', position: 8 }),
];

describe('tags and roles', () => {
  it('a paragraph starts from body, a heading from its level', () => {
    expect(tagRole('p')).toBe('body');
    expect(tagRole('h4')).toBe('h4');
    expect(headingLevelOf('p')).toBeNull();
    expect(headingLevelOf('h6')).toBe(6);
  });

  it('reads the tag off a node, clamping a heading level', () => {
    expect(nodeTag('paragraph', {})).toBe('p');
    expect(nodeTag('heading', { level: 2 })).toBe('h2');
    expect(nodeTag('heading', { level: 9 })).toBe('h6');
    expect(nodeTag('heading', {})).toBe('h1');
    expect(nodeTag('callout', {})).toBeNull();
  });
});

describe('mergeTokenOverDefaults', () => {
  it("a token's set fields lay over the built-in, unset ones fall through", () => {
    const merged = mergeTokenOverDefaults({ family: null, size: 40, weight: 'bold', lineHeight: null, letterSpacing: null }, BUILTIN_ELEMENT_DEFAULTS.display);
    expect(merged).toEqual({ family: undefined, size: 40, weight: 'bold', lineHeight: undefined, letterSpacing: undefined });
  });

  it('no token is exactly the built-in bundle', () => {
    expect(mergeTokenOverDefaults(null, BUILTIN_ELEMENT_DEFAULTS.h2)).toBe(BUILTIN_ELEMENT_DEFAULTS.h2);
  });
});

describe('sortParagraphStyles', () => {
  it('orders paragraph styles first, then h1 → h6, the default first within a tag', () => {
    const order = sortParagraphStyles([...SEED].reverse()).map((s) => s.id);
    expect(order).toEqual(['body', 'label', 'h1', 'display', 'h2', 'h3']);
  });

  it('breaks a tie by the name in the viewer’s language, for stored styles too', () => {
    const stored = [
      { id: 'b', renderAs: 'p' as const, isDefault: false, position: 1, label: { en: 'Quote', de: 'Anmerkung' } },
      { id: 'a', renderAs: 'p' as const, isDefault: false, position: 1, label: { en: 'Note', de: 'Zitat' } },
    ];
    expect(sortParagraphStyles(stored).map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('finds the default for a tag', () => {
    expect(defaultParagraphStyleFor('h2', SEED)?.id).toBe('h2');
    expect(defaultParagraphStyleFor('h5', SEED)).toBeNull();
  });
});

describe('resolveParagraphStyle', () => {
  it("a block's own style wins, whatever the tag's default is", () => {
    const r = resolveParagraphStyle('heading', { level: 1, paragraphStyle: 'display' }, SEED);
    expect(r.style?.id).toBe('display');
    expect(r.defaults.size).toBe('scale:6xl');
    expect(r.tag).toBe('h1');
  });

  it("a style that renders as another tag is ignored — the node's tag wins (toggleHeading copies attrs across types)", () => {
    const r = resolveParagraphStyle('heading', { level: 2, paragraphStyle: 'label' }, SEED);
    expect(r.style?.id).toBe('h2');
  });

  it('a deleted style falls back to the tag default', () => {
    const r = resolveParagraphStyle('paragraph', { paragraphStyle: 'gone' }, SEED);
    expect(r.style?.id).toBe('body');
    expect(r.defaults.size).toBe('scale:m');
  });

  it('a legacy role override resolves to the style with the same tag and base role', () => {
    expect(resolveParagraphStyle('heading', { level: 1, typographyRole: 'display' }, SEED).style?.id).toBe('display');
    expect(resolveParagraphStyle('paragraph', { typographyRole: 'label' }, SEED).style?.id).toBe('label');
  });

  it('a legacy role override with no matching style for the tag falls back to the tag default', () => {
    expect(resolveParagraphStyle('heading', { level: 3, typographyRole: 'display' }, SEED).style?.id).toBe('h3');
    expect(resolveParagraphStyle('paragraph', { typographyRole: 'display' }, SEED).style?.id).toBe('body');
  });

  it('no style at all resolves the tag default; no registry resolves the built-in bundle', () => {
    expect(resolveParagraphStyle('heading', { level: 2 }, SEED).style?.id).toBe('h2');
    const bare = resolveParagraphStyle('heading', { level: 4 }, []);
    expect(bare.style).toBeNull();
    expect(bare.defaults).toBe(BUILTIN_ELEMENT_DEFAULTS.h4);
    expect(bodyDefaults({ customStacks: {}, paragraphStyles: [] })).toBe(BUILTIN_ELEMENT_DEFAULTS.body);
  });

  it('a tag whose default was deleted resolves the built-in bundle for that tag', () => {
    const r = resolveParagraphStyle('heading', { level: 5 }, SEED);
    expect(r.style).toBeNull();
    expect(r.defaults).toBe(BUILTIN_ELEMENT_DEFAULTS.h5);
  });
});

describe('applyParagraphStyle', () => {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: {
        group: 'block',
        content: 'inline*',
        attrs: { blockId: { default: null }, typography: { default: {} }, paragraphStyle: { default: null }, typographyRole: { default: null } },
      },
      heading: {
        group: 'block',
        content: 'inline*',
        attrs: { level: { default: 1 }, blockId: { default: null }, typography: { default: {} }, paragraphStyle: { default: null }, typographyRole: { default: null } },
      },
      bulletList: { group: 'block', content: 'listItem+' },
      listItem: { content: 'paragraph block*' },
      placeholder: { group: 'block', content: 'inline*', attrs: { blockId: { default: null } } },
    },
    marks: { bold: {} },
  });

  function state(content: unknown[]) {
    return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: 'doc', content }) });
  }

  it('turns a heading into a paragraph, keeping id, typography bag, text and marks, clearing the legacy role', () => {
    const s = state([
      {
        type: 'heading',
        attrs: { level: 2, blockId: 'b1', typography: { desktop: { size: 20 } }, typographyRole: 'display' },
        content: [{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }],
      },
    ]);
    const tr = s.tr;
    expect(applyParagraphStyle(tr, 1, 2, { id: 'body', renderAs: 'p' })).toBe(true);
    const node = tr.doc.child(0);
    expect(node.type.name).toBe('paragraph');
    expect(node.attrs).toEqual({ blockId: 'b1', typography: { desktop: { size: 20 } }, paragraphStyle: 'body', typographyRole: null });
    expect(node.textContent).toBe('Hi');
    expect(node.firstChild?.marks.map((m) => m.type.name)).toEqual(['bold']);
  });

  it('turns a paragraph into a heading at the style level', () => {
    const s = state([{ type: 'paragraph', attrs: { blockId: 'b1' }, content: [{ type: 'text', text: 'Hi' }] }]);
    const tr = s.tr;
    applyParagraphStyle(tr, 1, 2, { id: 'h3', renderAs: 'h3' });
    const node = tr.doc.child(0);
    expect(node.type.name).toBe('heading');
    expect(node.attrs.level).toBe(3);
    expect(node.attrs.paragraphStyle).toBe('h3');
  });

  it('covers every text block in the range and leaves one its parent cannot hold', () => {
    const s = state([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'c' }] },
    ]);
    const tr = s.tr;
    applyParagraphStyle(tr, 0, s.doc.content.size, { id: 'h2', renderAs: 'h2' });
    expect(tr.doc.child(0).type.name).toBe('heading');
    expect(tr.doc.child(1).firstChild?.firstChild?.type.name).toBe('paragraph');
    expect(tr.doc.child(2).type.name).toBe('heading');
  });

  it("turns an empty page's placeholder into the style's block, keeping its id", () => {
    const s = state([{ type: 'placeholder', attrs: { blockId: 'p1' } }]);
    const tr = s.tr;
    expect(applyParagraphStyle(tr, 1, 1, { id: 'h1', renderAs: 'h1' })).toBe(true);
    expect(tr.doc.child(0).type.name).toBe('heading');
    expect(tr.doc.child(0).attrs).toMatchObject({ blockId: 'p1', level: 1, paragraphStyle: 'h1' });
  });

  it('reports no change when the range holds no text block', () => {
    const s = state([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }]);
    expect(applyParagraphStyle(s.tr, 0, 0, { id: 'h2', renderAs: 'h2' })).toBe(false);
  });
});
