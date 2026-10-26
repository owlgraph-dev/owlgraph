// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { clipText, documentKindOf, linkHost } from './searchCards';

describe('clipText', () => {
  it('keeps a short text whole, collapsing whitespace', () => {
    expect(clipText('  a   short\n text ')).toBe('a short text');
  });

  it('cuts a long text at a word boundary with an ellipsis', () => {
    const text = 'word '.repeat(80);
    const clipped = clipText(text, 30);
    expect(clipped.endsWith('word…')).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(31);
  });

  it('drops trailing punctuation before the ellipsis', () => {
    expect(clipText('one two three, four five six seven', 15)).toBe('one two three…');
  });

  it('cuts inside a word only when there is no space to cut at', () => {
    expect(clipText('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)}…`);
  });
});

describe('documentKindOf', () => {
  it('names a link, and an upload by its type', () => {
    expect(documentKindOf('link', null)).toBe('link');
    expect(documentKindOf('upload', 'application/pdf')).toBe('pdf');
    expect(documentKindOf('upload', 'text/markdown')).toBe('markdown');
    expect(documentKindOf('upload', 'text/plain')).toBe('text');
    expect(documentKindOf('upload', 'application/zip')).toBe('file');
  });

  it("names a plugin's document by the type its service reported, like an upload", () => {
    expect(documentKindOf('plugin', 'application/pdf')).toBe('pdf');
    expect(documentKindOf('plugin', 'image/png')).toBe('file');
    expect(documentKindOf('plugin', null)).toBe('file');
  });
});

describe('linkHost', () => {
  it('is the host without www, and empty for a non-URL', () => {
    expect(linkHost('https://www.example.org/papers/1.pdf')).toBe('example.org');
    expect(linkHost('https://arxiv.org/abs/1')).toBe('arxiv.org');
    expect(linkHost('not a url')).toBe('');
    expect(linkHost(null)).toBe('');
  });
});
