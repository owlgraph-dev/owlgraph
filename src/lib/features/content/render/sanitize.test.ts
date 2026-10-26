// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { sanitizeDoc, sanitizeFragment } from './sanitize.server';
import type { JsonDoc } from '../doc/doc';

describe('sanitizeFragment', () => {
  it('strips script tags, event handlers, and javascript: URLs', () => {
    const dirty = '<p onclick="evil()">hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>';
    const clean = sanitizeFragment(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
  });

  it('strips disallowed style properties (position/clickjacking-capable)', () => {
    const dirty = '<div style="position:fixed;top:0;left:0;z-index:9999;color:red">x</div>';
    const clean = sanitizeFragment(dirty);
    expect(clean).not.toContain('position');
    expect(clean).not.toContain('z-index');
    expect(clean).toContain('color');
  });

  it('preserves allowlisted style properties', () => {
    const clean = sanitizeFragment('<p style="color:#ff0000;font-weight:bold;text-align:center">x</p>');
    expect(clean).toContain('color:#ff0000');
    expect(clean).toContain('font-weight:bold');
    expect(clean).toContain('text-align:center');
  });

  it('allows a type-scale token as a font size, but no other var()', () => {
    expect(sanitizeFragment('<p style="font-size:var(--type-2xl)">x</p>')).toContain('font-size:var(--type-2xl)');
    expect(sanitizeFragment('<p style="font-size:var(--type-9xl)">x</p>')).not.toContain('font-size');
    expect(sanitizeFragment('<p style="font-size:var(--anything)">x</p>')).not.toContain('font-size');
    expect(sanitizeFragment('<p style="font-size:14px">x</p>')).toContain('font-size:14px');
  });

  it('allows the newly broadened structural tags', () => {
    const clean = sanitizeFragment('<details><summary>x</summary>body</details>');
    expect(clean).toContain('<details>');
    expect(clean).toContain('<summary>');
  });

  it('allows table attributes', () => {
    const clean = sanitizeFragment(
      '<table><tr><th scope="col" colspan="2" headers="a">h</th></tr><tr><td colspan="2" rowspan="1" headers="a">d</td></tr></table>'
    );
    expect(clean).toContain('scope="col"');
    expect(clean).toContain('colspan="2"');
    expect(clean).toContain('rowspan="1"');
    expect(clean).toContain('headers="a"');
  });

  it('allows broadened layout/box/transform CSS with valid values', () => {
    const clean = sanitizeFragment(
      '<div style="display:flex;gap:8px;grid-template-columns:repeat(3, 1fr);transform:rotate(15deg) scale(1.2);box-shadow:0 2px 8px rgba(0,0,0,.2)">x</div>'
    );
    expect(clean).toContain('display:flex');
    expect(clean).toContain('gap:8px');
    expect(clean).toContain('grid-template-columns:repeat(3, 1fr)');
    expect(clean).toContain('transform:rotate(15deg) scale(1.2)');
    expect(clean).toContain('box-shadow:0 2px 8px rgba(0,0,0,.2)');
  });

  it('strips url()-bearing background/background-image values', () => {
    const clean = sanitizeFragment(
      '<div style="background:url(javascript:alert(1));background-image:url(https://evil.example/x.png);color:red">x</div>'
    );
    expect(clean).not.toContain('url(');
    expect(clean).not.toContain('background-image');
    expect(clean).toContain('color:red');
  });

  it('strips viewport-cover units (vh/vw) from every length property', () => {
    const clean = sanitizeFragment('<div style="width:100vw;height:100vh;min-height:50vh">x</div>');
    expect(clean).not.toContain('vw');
    expect(clean).not.toContain('vh');
  });

  it('strips malformed/injected transform values', () => {
    const clean = sanitizeFragment('<div style="transform:translate(0,0) url(x);color:blue">x</div>');
    expect(clean).not.toContain('transform');
    expect(clean).toContain('color:blue');
  });

  it('still strips script-capable elements and svg/iframe/object/form regardless of broadened tags', () => {
    const dirty =
      '<svg><script>alert(1)</script></svg><iframe src="x"></iframe><object data="x"></object>' +
      '<style>body{color:red}</style><form><input><button>x</button></form>';
    const clean = sanitizeFragment(dirty);
    expect(clean).not.toContain('<svg');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('<iframe');
    expect(clean).not.toContain('<object');
    expect(clean).not.toContain('<style');
    expect(clean).not.toContain('<form');
    expect(clean).not.toContain('<input');
    expect(clean).not.toContain('<button');
  });
});

describe('sanitizeFragmentInto', () => {
  it('lifts inline styles into the collector and names the rule on the element', async () => {
    const { sanitizeFragmentInto } = await import('./sanitize.server');
    const { StyleCollector } = await import('../capabilities/pageStyles');
    const styles = new StyleCollector();
    const html = sanitizeFragmentInto('<p style="margin:0;color:#dc2626">a <b style="color:#dc2626">b</b></p>', styles);
    expect(html).not.toContain('style=');
    const ids = Array.from(html.matchAll(/data-b="([^"]+)"/g), (m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(styles.css()).toContain(`[data-b="${ids[0]}"]{color:#dc2626;margin:0}`);
    expect(styles.css()).toContain(`[data-b="${ids[1]}"]{color:#dc2626}`);
  });

  it('applies the allowlist first: a forbidden declaration never reaches the stylesheet', async () => {
    const { sanitizeFragmentInto } = await import('./sanitize.server');
    const { StyleCollector } = await import('../capabilities/pageStyles');
    const styles = new StyleCollector();
    const html = sanitizeFragmentInto(
      '<div style="position:fixed;z-index:9999;background-image:url(https://evil/x.png);padding:8px">x</div><span style="behavior:url(x)">y</span>',
      styles
    );
    expect(html).toContain('data-b=');
    expect(styles.css()).toBe(`[data-b="${/data-b="([^"]+)"/.exec(html)![1]}"]{padding:8px}`);
    expect(styles.css()).not.toContain('position');
    expect(styles.css()).not.toContain('url(');
    // The span kept nothing, so it names no rule.
    expect((html.match(/data-b=/g) ?? []).length).toBe(1);
  });

  it('is sanitizeFragment exactly when there is nothing to lift', async () => {
    const { sanitizeFragment, sanitizeFragmentInto } = await import('./sanitize.server');
    const { StyleCollector } = await import('../capabilities/pageStyles');
    const styles = new StyleCollector();
    const input = '<p class="x">plain <a href="https://example.com">link</a><script>1</script></p>';
    expect(sanitizeFragmentInto(input, styles)).toBe(sanitizeFragment(input));
    expect(styles.isEmpty).toBe(true);
  });

  it('never lets a data-b written by the author through', async () => {
    const { sanitizeFragmentInto } = await import('./sanitize.server');
    const { StyleCollector } = await import('../capabilities/pageStyles');
    const styles = new StyleCollector();
    const html = sanitizeFragmentInto('<p data-b="forged" style="color:red">x</p><p data-b="forged2">y</p>', styles);
    expect(html).not.toContain('forged');
    expect(html.match(/data-b=/g)).toHaveLength(1);
  });
});

describe('sanitizeDoc', () => {
  it('rewrites unsafe link hrefs and keeps safe ones, at any depth', () => {
    const text = (t: string, href: string) => ({ type: 'text', text: t, marks: [{ type: 'link', attrs: { href } }] });
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [text('a', 'java\tscript:alert(1)'), text('b', '#section')] },
        { type: 'layoutGrid', content: [{ type: 'gridCell', content: [
          { type: 'paragraph', content: [text('c', 'https://example.org')] },
        ] }] },
      ],
    } as JsonDoc;
    sanitizeDoc(doc);
    const hrefs = JSON.stringify(doc).match(/"href":"[^"]*"/g);
    expect(hrefs).toEqual(['"href":"#"', '"href":"#section"', '"href":"https://example.org"']);
  });

  it('keeps a link mark its href and nothing else', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'a', marks: [{ type: 'link', attrs: { href: 'https://example.org', onclick: 'alert(1)', onmouseover: 'alert(2)' } }] },
      ] }],
    } as JsonDoc;
    sanitizeDoc(doc);
    expect(doc.content![0].content![0].marks![0].attrs).toEqual({ href: 'https://example.org' });
  });

  it('sanitizes html blocks nested in grid cells', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'layoutGrid', content: [{ type: 'gridCell', content: [
        { type: 'htmlBlock', attrs: { html: '<p>ok</p><script>alert(1)</script>' } },
      ] }] }],
    } as JsonDoc;
    sanitizeDoc(doc);
    expect(JSON.stringify(doc)).not.toContain('<script');
    expect(JSON.stringify(doc)).toContain('<p>ok</p>');
  });

  it('drops prototype-reaching attribute keys from nodes and marks', () => {
    // JSON.parse creates `__proto__` as an own key — the shape an API payload has.
    const doc: JsonDoc = JSON.parse(`{
      "type": "doc",
      "content": [{ "type": "paragraph", "attrs": { "__proto__": { "onclick": "alert(1)" }, "constructor": 1, "textAlign": "left" },
        "content": [{ "type": "text", "text": "x", "marks": [{ "type": "bold", "attrs": { "__proto__": { "onmouseover": "alert(1)" } } }] }] }]
    }`);
    sanitizeDoc(doc);
    const para = doc.content![0];
    expect(Object.keys(para.attrs!)).toEqual(['textAlign']);
    expect(Object.hasOwn(para.content![0].marks![0].attrs!, '__proto__')).toBe(false);
  });
});
