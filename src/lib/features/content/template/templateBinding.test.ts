// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { bindTemplate, type ResultProperties } from './templateBinding';
import { sanitizeFragment } from '../render/sanitize.server';

const item = (overrides: Partial<ResultProperties> = {}): ResultProperties => ({
  id: 'p1',
  title: 'Result Title',
  url: '/p/result',
  slug: 'result',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  type: 'page',
  namespaceLabel: 'Default',
  creatorLabel: 'Alex',
  classLabel: 'Page',
  externalUrl: '',
  locale: 'en',
  properties: [{ name: 'status', value: 'active' }],
  ...overrides
});

const textWithMark = (text: string, propName: string) => ({
  type: 'text',
  text,
  marks: [{ type: 'semanticProperty', attrs: { propName } }]
});

describe('bindTemplate()', () => {
  it('substitutes a semanticProperty-marked text node whose key matches', () => {
    const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
    const bound = bindTemplate(subtree, item());
    expect(bound.content![0].text).toBe('active');
  });

  it('keeps the placeholder text when no result value matches the key', () => {
    const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'unknownKey')] };
    const bound = bindTemplate(subtree, item());
    expect(bound.content![0].text).toBe('placeholder');
  });

  it('binds a lightweight parameter (reserved group + declared type) purely by key — the declared type is a mapping-time contract, not an apply-time input', () => {
    const paramText = { type: 'text', text: 'pkg', marks: [{ type: 'semanticProperty', attrs: { propName: 'parameter:pkg', paramType: 'date' } }] };
    const subtree = { type: 'paragraph', content: [paramText] };
    // Unmapped: no result field is literally named "parameter:pkg", so the placeholder stays.
    expect(bindTemplate(subtree, item()).content![0].text).toBe('pkg');
    // Mapped to a real field: substitutes exactly like any other key, mark attrs untouched.
    const bound = bindTemplate(subtree, item(), { 'parameter:pkg': { source: 'status' } });
    expect(bound.content![0].text).toBe('active');
    expect(bound.content![0].marks![0].attrs).toEqual({ propName: 'parameter:pkg', paramType: 'date' });
  });

  it('leaves plain text nodes (no semanticProperty mark) untouched', () => {
    const subtree = { type: 'paragraph', content: [{ type: 'text', text: 'static copy' }] };
    const bound = bindTemplate(subtree, item());
    expect(bound.content![0].text).toBe('static copy');
  });

  it('preserves other marks alongside a bound semanticProperty mark', () => {
    const node = { type: 'text', text: 'placeholder', marks: [{ type: 'bold' }, { type: 'semanticProperty', attrs: { propName: 'status' } }] };
    const subtree = { type: 'paragraph', content: [node] };
    const bound = bindTemplate(subtree, item());
    expect(bound.content![0].text).toBe('active');
    expect(bound.content![0].marks).toEqual(node.marks);
  });

  it('exposes title/url as reserved synthetic parameter keys', () => {
    const subtree = {
      type: 'paragraph',
      content: [textWithMark('placeholder title', 'title'), textWithMark('placeholder url', 'url')]
    };
    const bound = bindTemplate(subtree, item({ title: 'Real Title', url: '/p/real' }));
    expect(bound.content![0].text).toBe('Real Title');
    expect(bound.content![1].text).toBe('/p/real');
  });

  it('exposes slug/createdAt/updatedAt/type/namespace/creator/class as reserved synthetic parameter keys', () => {
    const subtree = {
      type: 'paragraph',
      content: [
        textWithMark('', 'slug'),
        textWithMark('', 'createdAt'),
        textWithMark('', 'updatedAt'),
        textWithMark('', 'type'),
        textWithMark('', 'namespace'),
        textWithMark('', 'creator'),
        textWithMark('', 'class')
      ]
    };
    const bound = bindTemplate(
      subtree,
      item({ slug: 'my-page', createdAt: '2026-02-01', updatedAt: '2026-02-02', type: 'document', namespaceLabel: 'Marketing', creatorLabel: 'Jamie', classLabel: 'Invoice' })
    );
    expect(bound.content!.map((n) => n.text)).toEqual(['my-page', '2026-02-01', '2026-02-02', 'document', 'Marketing', 'Jamie', 'Invoice']);
  });

  it('a real property literally named "title" takes precedence over the synthetic title', () => {
    const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'title')] };
    const bound = bindTemplate(
      subtree,
      item({ title: 'Synthetic Title', properties: [{ name: 'title', value: 'Property Title' }] })
    );
    expect(bound.content![0].text).toBe('Property Title');
  });

  it('recurses through nested grid/gridCell structure', () => {
    const subtree = {
      type: 'grid',
      content: [
        {
          type: 'gridCell',
          content: [{ type: 'paragraph', content: [textWithMark('placeholder', 'status')] }]
        }
      ]
    };
    const bound = bindTemplate(subtree, item());
    expect(bound.content![0].content![0].content![0].text).toBe('active');
  });

  it('does not mutate the original subtree', () => {
    const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
    bindTemplate(subtree, item());
    expect(subtree.content[0].text).toBe('placeholder');
  });

  describe('htmlBlock {{{key}}} substitution', () => {
    it('substitutes a matching token with the escaped value', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>Status: {{{status}}}</p>' } };
      const bound = bindTemplate(subtree, item());
      expect(bound.attrs!.html).toBe('<p>Status: active</p>');
    });

    it('HTML-escapes the substituted value — literal text, never live markup', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{status}}}</p>' } };
      const bound = bindTemplate(subtree, item({ properties: [{ name: 'status', value: '<script>alert(1)</script>' }] }));
      expect(bound.attrs!.html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    });

    it('leaves an unmatched token as literal text', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{unknownKey}}}</p>' } };
      const bound = bindTemplate(subtree, item());
      expect(bound.attrs!.html).toBe('<p>{{{unknownKey}}}</p>');
    });

    it('substitutes multiple tokens, including the reserved url key', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<a href="{{{url}}}">{{{status}}}</a>' } };
      const bound = bindTemplate(subtree, item({ url: '/p/real' }));
      expect(bound.attrs!.html).toBe('<a href="/p/real">active</a>');
    });

    it('substitutes the reserved externalUrl key (the address of a link document, distinct from url)', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<a href="{{{externalUrl}}}">{{{title}}}</a> <a href="{{{url}}}">#</a>' } };
      const bound = bindTemplate(subtree, item({ url: '/doc/paper', externalUrl: 'https://doi.org/10.1000/x?a=1&b=2' }));
      expect(bound.attrs!.html).toBe('<a href="https://doi.org/10.1000/x?a=1&amp;b=2">Result Title</a> <a href="/doc/paper">#</a>');
    });

    it('substitutes the reserved class key with the escaped class label', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<span class="chip">{{{class}}}</span>' } };
      const bound = bindTemplate(subtree, item({ classLabel: 'R&D <Report>' }));
      expect(bound.attrs!.html).toBe('<span class="chip">R&amp;D &lt;Report&gt;</span>');
    });

    it('a typed token {{{key:type}}} binds purely by key — the declared type is a mapping-time contract', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<a href="{{{url:url}}}">{{{status:date}}}</a>' } };
      const bound = bindTemplate(subtree, item({ url: '/p/real' }));
      expect(bound.attrs!.html).toBe('<a href="/p/real">active</a>');
    });

    it('a namespaced property key keeps working, with or without a type suffix', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{core:status}}} {{{core:status:text}}}</p>' } };
      const bound = bindTemplate(subtree, item({ properties: [{ name: 'core:status', value: 'ok' }] }));
      expect(bound.attrs!.html).toBe('<p>ok ok</p>');
    });

    it('a mapping entry keyed by the raw key applies to a typed token too', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{when:date}}}</p>' } };
      const bound = bindTemplate(subtree, item({ createdAt: '2024-03-15T10:00:00.000Z' }), { when: { source: 'createdAt', transform: { id: 'year' } } });
      expect(bound.attrs!.html).toBe('<p>2024</p>');
    });
  });

  describe('explicit mapping (dynamic-rendering Phase 4)', () => {
    it('redirects a parameter to a different source field', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'displayStatus')] };
      const bound = bindTemplate(subtree, item(), { displayStatus: { source: 'status' } });
      expect(bound.content![0].text).toBe('active');
    });

    it('applies a transform to the mapped value', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
      const bound = bindTemplate(subtree, item(), { status: { source: 'status', transform: { id: 'uppercase' } } });
      expect(bound.content![0].text).toBe('ACTIVE');
    });

    it('falls back to direct key-match when mapping is absent entirely', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
      const bound = bindTemplate(subtree, item(), undefined);
      expect(bound.content![0].text).toBe('active');
    });

    it('falls back to direct key-match when mapping has no entry for this key', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
      const bound = bindTemplate(subtree, item(), { otherKey: { source: 'title' } });
      expect(bound.content![0].text).toBe('active');
    });

    it('applies mapping + transform inside htmlBlock token substitution too', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{status}}}</p>' } };
      const bound = bindTemplate(subtree, item(), { status: { source: 'status', transform: { id: 'uppercase' } } });
      expect(bound.attrs!.html).toBe('<p>ACTIVE</p>');
    });

    it('maps a parameter to the class intrinsic source with a text transform', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'parameter:kind')] };
      const bound = bindTemplate(subtree, item({ classLabel: 'Work package' }), { 'parameter:kind': { source: 'class', transform: { id: 'uppercase' } } });
      expect(bound.content![0].text).toBe('WORK PACKAGE');
    });

    it('a type-aware date transform on the createdAt intrinsic source binds the localized date', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'when')] };
      const bound = bindTemplate(
        subtree,
        item({ createdAt: '2024-03-15T10:00:00.000Z' }),
        { when: { source: 'createdAt', transform: { id: 'dateMonthDay' } } }
      );
      expect(bound.content![0].text).toBe('March 15'); // base locale en in the test env
    });

    it('a date transform over a non-date value degrades to the raw value — never a render error', () => {
      const subtree = { type: 'paragraph', content: [textWithMark('placeholder', 'status')] };
      const bound = bindTemplate(subtree, item(), { status: { source: 'status', transform: { id: 'dateMonthDay' } } });
      expect(bound.content![0].text).toBe('active'); // raw property value unchanged
    });
  });

  describe('full render pipeline: bindTemplate (substitute) then sanitizeFragment (sanitize)', () => {
    // Substitute-then-sanitize: reordered, a query value's markup would survive the sanitizer.
    it('a substituted value containing "<script>" stays inert end-to-end', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<p>{{{status}}}</p>' } };
      const malicious = '<script>alert(document.cookie)</script>';
      const bound = bindTemplate(subtree, item({ properties: [{ name: 'status', value: malicious }] }));
      const rendered = sanitizeFragment(bound.attrs!.html as string);
      // Inert text may still contain the words; no live element may appear.
      expect(rendered).not.toContain('<script');
      expect(rendered).not.toContain('</script>');
    });

    it('a typed token in an href resolves to a javascript: value that the sanitizer then strips', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<a href="{{{link:url}}}">x</a>' } };
      const bound = bindTemplate(subtree, item({ properties: [{ name: 'link', value: 'javascript:alert(1)' }] }));
      const rendered = sanitizeFragment(bound.attrs!.html as string);
      expect(rendered).not.toContain('javascript:');
    });

    it('a substituted value containing an event handler stays inert end-to-end', () => {
      const subtree = { type: 'htmlBlock', attrs: { html: '<div>{{{status}}}</div>' } };
      const malicious = '"><img src=x onerror=alert(1)>';
      const bound = bindTemplate(subtree, item({ properties: [{ name: 'status', value: malicious }] }));
      const rendered = sanitizeFragment(bound.attrs!.html as string);
      // Inert text may still say "onerror"; no live <img> may appear.
      expect(rendered).not.toContain('<img');
    });
  });
});
