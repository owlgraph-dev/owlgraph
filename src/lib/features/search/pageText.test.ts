// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { extractSearchText } from './pageText.server';
import { txt } from '$tests/e2e/doc';

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const heading = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [txt(text)] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('extractSearchText', () => {
  it('routes heading text to the headings bucket, body elsewhere', () => {
    const r = extractSearchText(doc(heading(2, 'Overview'), para(txt('Hello world'))));
    expect(r.headings).toBe('Overview');
    expect(r.body).toBe('Hello world');
  });

  it('expands semantic-property marks to "name value"', () => {
    const r = extractSearchText(
      doc(para(txt('Status: '), txt('approved', [{ type: 'semanticProperty', attrs: { propName: 'status' } }])))
    );
    expect(r.body).toBe('Status: status approved');
  });

  it('reads the text as a reader sees it, without property names, when asked', () => {
    const r = extractSearchText(doc(para(txt('Status: '), txt('approved', [{ type: 'semanticProperty', attrs: { propName: 'status' } }]))), { propertyNames: false });
    expect(r.body).toBe('Status: approved');
  });

  it('keeps inline link label text (no special handling needed)', () => {
    const r = extractSearchText(
      doc(para(txt('see '), txt('the policy', [{ type: 'pageLink', attrs: { targetSlug: 'policy', targetPageId: 'abc' } }])))
    );
    expect(r.body).toBe('see the policy');
  });

  it('extracts every table-block-table cell (header row + body rows) via the generic recursive walk', () => {
    const cell = (text: string, isHeader: boolean) => ({ type: 'tableCell', attrs: { isHeader }, content: [txt(text)] });
    const table = {
      type: 'table',
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [cell('Name', true), cell('Role', true)] },
        { type: 'tableRow', attrs: { isHeader: false }, content: [cell('Alice', false), cell('Dev', false)] },
        { type: 'tableRow', attrs: { isHeader: false }, content: [cell('Bob', false), cell('PM', false)] },
      ],
    };
    const r = extractSearchText(doc(table));
    expect(r.body).toBe('Name Role Alice Dev Bob PM');
  });

  it("uses the quick link's label, not its target ids/urls", () => {
    const ref = { type: 'quickLink', attrs: { label: 'See docs', targetPageId: 'xyz', url: 'https://x' } };
    expect(extractSearchText(doc(ref)).body).toBe('See docs');
  });

  it('strips an html block down to text', () => {
    const html = { type: 'htmlBlock', attrs: { html: "<div style='margin:0'>Hi <b>there</b> &amp; bye</div>" } };
    expect(extractSearchText(doc(html)).body).toBe('Hi there & bye');
  });

  it('skips mermaid diagram source', () => {
    const m = { type: 'diagram', attrs: { code: 'graph TD; A-->B' } };
    expect(extractSearchText(doc(m)).body).toBe('');
  });

  it('indexes code-block text', () => {
    const code = { type: 'codeBlock', attrs: { language: 'ts' }, content: [txt('const x = 1')] };
    expect(extractSearchText(doc(code)).body).toBe('const x = 1');
  });

  it('routes headings nested inside a grid cell to the headings bucket', () => {
    const cell = { type: 'gridCell', content: [heading(3, 'Side'), para(txt('note'))] };
    const layout = { type: 'grid', content: [cell] };
    const r = extractSearchText(doc(layout));
    expect(r.headings).toBe('Side');
    expect(r.body).toBe('note');
  });

  it('pulls image alt text', () => {
    const img = { type: 'image', attrs: { src: 'x.png', alt: 'a wiring diagram' } };
    expect(extractSearchText(doc(img)).body).toBe('a wiring diagram');
  });

  it('handles an empty / missing doc', () => {
    expect(extractSearchText(null)).toEqual({ headings: '', body: '' });
    expect(extractSearchText({ type: 'doc', content: [] })).toEqual({ headings: '', body: '' });
  });
});

describe('extractSearchText — unknown blocks (docs/architecture/blocks/anatomy.md, "Unknown blocks")', () => {
  it('says nothing of a node this build cannot read, inside or out — and finds text under a mark it cannot', () => {
    const r = extractSearchText(doc(para(txt('kept')), { type: 'retiredTabs', content: [para(txt('hidden inside'))] }, para(txt('marked', [{ type: 'retiredHighlight' }]))));
    expect(r.body).toContain('kept');
    expect(r.body).toContain('marked');
    expect(r.body).not.toContain('hidden inside');
  });
});
