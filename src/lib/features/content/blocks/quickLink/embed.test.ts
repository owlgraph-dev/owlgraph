// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Document from '@tiptap/extension-document';
import { Paragraph } from '../paragraph/tiptap';
import { DocumentBlockNode } from '../document/tiptap';
import { BlockId } from '../shared/blockId';
import { BlockSpacing } from '../shared/blockSpacing';
import { embedKindOf } from '../embeds';
import { QuickLink } from './tiptap';
import { embedQuickLink, quickLinkDocument } from './embed';
import { LiveStyles, setLiveStyles } from '../../capabilities/liveStyles';

// The NodeViews mount with Svelte's client half, which Vitest doesn't resolve under jsdom.
vi.mock('svelte', async () => {
  const { resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  return import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/svelte/src/index-client.js')).href);
});
setLiveStyles(new LiveStyles(document));

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function make(...content: JSONContent[]): Editor {
  editor = new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false, document: false, bold: false, paragraph: false, heading: false }),
      Paragraph,
      Document.extend({ content: 'block+' }),
      QuickLink,
      DocumentBlockNode,
      BlockId,
      BlockSpacing,
    ],
    content: { type: 'doc', content },
  });
  return editor;
}

const DOC = '33333333-3333-4333-8333-333333333333';
const DOCUMENT_KIND = embedKindOf('documentBlock')!;
const surface = { desktop: { bg: 'token:accent', border: 'token:border-strong', radius: 12 } };
const card = (attrs: Record<string, unknown>): JSONContent => ({
  type: 'quickLink',
  attrs: { blockId: 'card-1', refType: 'document', targetDocId: DOC, label: 'Minutes', surface, ...attrs },
});
const p = (text: string): JSONContent => ({ type: 'paragraph', attrs: { blockId: text }, content: [{ type: 'text', text }] });
const at = (e: Editor) => e.getJSON().content![1];

describe('a quick link to a document', () => {
  it('names its document — and no link to a page or an address does', () => {
    expect(quickLinkDocument({ refType: 'document', targetDocId: DOC })).toBe(DOC);
    expect(quickLinkDocument({ refType: 'document', targetDocId: null })).toBeNull();
    expect(quickLinkDocument({ refType: 'page', targetPageId: DOC })).toBeNull();
    expect(quickLinkDocument({ refType: 'url', url: 'https://example.org' })).toBeNull();
  });

  it('becomes a document block of the same id showing its document, its spacing, typography and placement kept', () => {
    const spacing = { desktop: { spaceAbove: 48 } };
    const typography = { desktop: { size: 'scale:lg' } };
    const placement = { desktop: { align: 'end' } };
    const e = make(p('before'), card({ variant: 'button', spacing, typography, placement }));
    expect(embedQuickLink(e, 'card-1', DOCUMENT_KIND)).toBe(true);
    expect(at(e)).toMatchObject({ type: 'documentBlock', attrs: { blockId: 'card-1', nodeId: DOC, spacing, typography, placement, variant: 'row' } });
    expect(at(e).attrs).not.toHaveProperty('label');
    expect(at(e).attrs).not.toHaveProperty('targetDocId');
  });

  it('keeps of its surface what its variant draws', () => {
    const outlined = make(p('before'), card({ variant: 'outlined' }));
    embedQuickLink(outlined, 'card-1', DOCUMENT_KIND);
    expect(at(outlined).attrs?.surface).toEqual({ desktop: { border: 'token:border-strong', radius: 12 } });
    outlined.destroy();

    const link = make(p('before'), card({ variant: 'link', surface: { desktop: { bg: 'token:accent' } } }));
    embedQuickLink(link, 'card-1', DOCUMENT_KIND);
    // A link draws no fill: the block starts at its own default, no surface.
    expect(at(link).attrs?.surface).toEqual({});
  });

  it('is undone in one step', () => {
    const e = make(p('before'), card({ variant: 'button' }));
    embedQuickLink(e, 'card-1', DOCUMENT_KIND);
    e.commands.undo();
    expect(at(e)).toMatchObject({ type: 'quickLink', attrs: { blockId: 'card-1', refType: 'document', targetDocId: DOC, variant: 'button', surface } });
  });

  it('is the only card that becomes one', () => {
    const e = make(p('before'), card({ refType: 'page', targetDocId: null, targetPageId: DOC }));
    expect(embedQuickLink(e, 'card-1', DOCUMENT_KIND)).toBe(false);
    expect(at(e).type).toBe('quickLink');
    expect(embedQuickLink(e, 'before', DOCUMENT_KIND)).toBe(false);
  });
});
