// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { collectTemplateParams } from './tiptap';

// A stand-in for the live ProseMirror Node API collectTemplateParams reads.
type FakeText = { isText: true; marks: { type: { name: string }; attrs: Record<string, unknown> }[] };
type FakeHtmlBlock = { isText: false; type: { name: string }; attrs: Record<string, unknown> };
type FakeNode = FakeText | FakeHtmlBlock;
const fakeNode = (nodes: FakeNode[]) => ({
  descendants(cb: (n: FakeNode) => boolean) {
    for (const t of nodes) cb(t);
  }
});
const paramText = (propName: string, paramType?: string): FakeText => ({
  isText: true,
  marks: [{ type: { name: 'semanticProperty' }, attrs: paramType ? { propName, paramType } : { propName } }]
});
const plainText = (): FakeText => ({ isText: true, marks: [] });
const htmlBlock = (html: string): FakeHtmlBlock => ({ isText: false, type: { name: 'htmlBlock' }, attrs: { html } });

describe('collectTemplateParams()', () => {
  it('returns each distinct key once, with its declared type (null for a legacy mark without one)', () => {
    const node = fakeNode([paramText('parameter:pkg', 'text'), plainText(), paramText('core:deadline'), paramText('parameter:pkg', 'text')]);
    expect(collectTemplateParams(node)).toEqual([
      { key: 'parameter:pkg', declaredType: 'text' },
      { key: 'core:deadline', declaredType: null }
    ]);
  });

  it('lets the first mark that declares a type win when the same key is marked more than once', () => {
    const node = fakeNode([paramText('parameter:when'), paramText('parameter:when', 'date'), paramText('parameter:when', 'number')]);
    expect(collectTemplateParams(node)).toEqual([{ key: 'parameter:when', declaredType: 'date' }]);
  });

  it('returns an empty list for a block with no marked text', () => {
    expect(collectTemplateParams(fakeNode([plainText()]))).toEqual([]);
    expect(collectTemplateParams(undefined)).toEqual([]);
  });

  it('detects {{{key}}} / {{{key:type}}} tokens inside an htmlBlock, flagged as HTML-declared', () => {
    const node = fakeNode([htmlBlock('<a href="{{{url}}}">{{{title}}}</a><time>{{{core:when:date}}}</time>')]);
    expect(collectTemplateParams(node)).toEqual([
      { key: 'url', declaredType: null, inHtml: true },
      { key: 'title', declaredType: null, inHtml: true },
      { key: 'core:when', declaredType: 'date', inHtml: true }
    ]);
  });

  it('merges a mark and an HTML token that share a key into one row (one mapping entry serves both)', () => {
    const node = fakeNode([paramText('core:status'), htmlBlock('<p>{{{core:status:text}}}</p>')]);
    expect(collectTemplateParams(node)).toEqual([{ key: 'core:status', declaredType: 'text', inHtml: true }]);
  });

  it('keeps a mark parameter and a same-named token as distinct rows — their binding keys differ', () => {
    const node = fakeNode([paramText('parameter:title', 'text'), htmlBlock('<h2>{{{title}}}</h2>')]);
    expect(collectTemplateParams(node)).toEqual([
      { key: 'parameter:title', declaredType: 'text' },
      { key: 'title', declaredType: null, inHtml: true }
    ]);
  });

  it('ignores a non-html, non-text node', () => {
    const node = fakeNode([{ isText: false, type: { name: 'paragraph' }, attrs: {} }]);
    expect(collectTemplateParams(node)).toEqual([]);
  });
});
