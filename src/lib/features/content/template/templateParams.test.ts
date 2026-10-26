// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { collectHtmlBlockParams, parseHtmlParamToken, replaceHtmlParamTokens } from './templateParams';

describe('parseHtmlParamToken()', () => {
  it('a bare key is untyped (null, not "text" — no spurious mismatch warnings for legacy tokens)', () => {
    expect(parseHtmlParamToken('title')).toEqual({ key: 'title', declaredType: null });
    expect(parseHtmlParamToken('url')).toEqual({ key: 'url', declaredType: null });
  });

  it('recognizes a datatype identifier after the last colon as the declared type', () => {
    expect(parseHtmlParamToken('when:date')).toEqual({ key: 'when', declaredType: 'date' });
    expect(parseHtmlParamToken('link:url')).toEqual({ key: 'link', declaredType: 'url' });
    expect(parseHtmlParamToken('count:number')).toEqual({ key: 'count', declaredType: 'number' });
  });

  it('keeps a namespaced property key intact — ":" was already meaningful inside a token', () => {
    expect(parseHtmlParamToken('core:status')).toEqual({ key: 'core:status', declaredType: null });
    expect(parseHtmlParamToken('core:status:date')).toEqual({ key: 'core:status', declaredType: 'date' });
  });

  it('treats an unknown suffix as part of the key rather than as a type', () => {
    expect(parseHtmlParamToken('status:foo')).toEqual({ key: 'status:foo', declaredType: null });
  });

  it('never yields an empty key', () => {
    expect(parseHtmlParamToken(':date')).toEqual({ key: ':date', declaredType: null });
  });

  it('documented corner: a local name equal to a datatype identifier reads as the type', () => {
    expect(parseHtmlParamToken('core:date')).toEqual({ key: 'core', declaredType: 'date' });
  });
});

describe('collectHtmlBlockParams()', () => {
  it('lists each distinct key once, flagged as an HTML-token parameter', () => {
    const html = '<a href="{{{url}}}">{{{title}}}</a> <span>{{{title}}}</span>';
    expect(collectHtmlBlockParams(html)).toEqual([
      { key: 'url', declaredType: null, inHtml: true },
      { key: 'title', declaredType: null, inHtml: true }
    ]);
  });

  it('lets the first occurrence that declares a type win', () => {
    const html = '{{{when}}} {{{when:date}}} {{{when:number}}}';
    expect(collectHtmlBlockParams(html)).toEqual([{ key: 'when', declaredType: 'date', inHtml: true }]);
  });

  it('returns an empty list for html without tokens', () => {
    expect(collectHtmlBlockParams('<p>static</p>')).toEqual([]);
  });
});

describe('replaceHtmlParamTokens()', () => {
  it('substitutes by parsed key, typed or not, and leaves unresolved tokens literal', () => {
    const values: Record<string, string> = { title: 'T', 'core:status': 'S' };
    const out = replaceHtmlParamTokens('{{{title}}}|{{{core:status:date}}}|{{{missing}}}|{{{missing:date}}}', (k) => values[k]);
    expect(out).toBe('T|S|{{{missing}}}|{{{missing:date}}}');
  });
});
