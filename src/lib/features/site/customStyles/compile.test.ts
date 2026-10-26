// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { CONTENT_ROOT, compileFreeCss, compileStyleCss, compileStylesheets, type CompileSheet } from './compile';
import { baseLocale, overwriteGetLocale } from '$lib/paraglide/runtime';

const SELF = `${CONTENT_ROOT}${CONTENT_ROOT}`;

const free = (css: string) => compileFreeCss(css, 'abc123');
const style = (css: string, slug = 'highlight') => compileStyleCss(css, slug);

function messages(result: { issues: { message: string }[] }): string {
  return result.issues.map((i) => i.message).join(' | ');
}

describe('compileFreeCss — content scoping', () => {
  it('nests an ordinary rule under the content root', () => {
    expect(free('.lead { font-size: 1.2rem }').css).toBe(`${CONTENT_ROOT} .lead{font-size:1.2rem}`);
  });

  it('turns :root, html and body into the content root itself, so they paint the canvas rather than the document', () => {
    expect(free(':root { --x: 1 }').css).toBe(`${SELF}{--x:1}`);
    expect(free('html { background: var(--content-bg) }').css).toBe(`${SELF}{background:var(--content-bg)}`);
    expect(free('body { color: var(--content-fg) }').css).toBe(`${SELF}{color:var(--content-fg)}`);
    expect(free('html body { color: var(--content-fg) }').css).toBe(`${SELF}{color:var(--content-fg)}`);
  });

  it('doubles the class for a canvas-level rule, so it outranks app.css rather than tying with it', () => {
    // app.css styles .page-canvas at (0,1,0): a plain prefix would tie.
    const css = free('body { background: var(--content-warning-soft) }').css;
    expect(css).toBe(`${SELF}{background:var(--content-warning-soft)}`);
    expect(css.startsWith(`${CONTENT_ROOT}${CONTENT_ROOT}{`)).toBe(true);
  });

  it('keeps an explicit combinator after a dropped root, so body > .lead is a top-level block', () => {
    expect(free('body > .lead { margin: 0 }').css).toBe(`${CONTENT_ROOT} .canvas-blocks >.lead{margin:0}`);
  });

  it('cannot reach the app chrome: a chrome selector is still bounded by the content root', () => {
    expect(free('.app-bar { display: none }').css).toBe(`${CONTENT_ROOT} .app-bar{display:none}`);
    expect(free('.ds-dialog { opacity: 0 }').css).toBe(`${CONTENT_ROOT} .ds-dialog{opacity:0}`);
  });

  it('bounds a universal selector', () => {
    expect(free('* { color: var(--content-fg) }').css).toBe(`${CONTENT_ROOT} *{color:var(--content-fg)}`);
  });

  it('bounds a selector that hides html or the app bar inside :is()', () => {
    expect(free(':is(html, .app-bar) { display: none }').css).toBe(`${CONTENT_ROOT} :is(html,.app-bar){display:none}`);
  });

  it('scopes every selector of a list', () => {
    expect(free('.a, body, .b { color: red }').css).toBe(`${CONTENT_ROOT} .a,${SELF},${CONTENT_ROOT} .b{color:red}`);
  });

  it('collapses a list whose halves both land on the canvas', () => {
    expect(free('html, body { display: none }').css).toBe(`${SELF}{display:none}`);
  });

  it('scopes rules inside @media and @container, which is where a scoping bug would hide', () => {
    expect(free('@media (min-width: 100px) { body .app-bar { display: none } }').css).toBe(
      `@media (min-width: 100px){${CONTENT_ROOT} .app-bar{display:none}}`
    );
    expect(free('@container canvas (width > 900px) { :root { --x: 2 } }').css).toBe(
      `@container canvas (width > 900px){${SELF}{--x:2}}`
    );
    expect(free('@supports (display: grid) { * { gap: 1rem } }').css).toBe(
      `@supports (display: grid){${CONTENT_ROOT} *{gap:1rem}}`
    );
  });

  it('scopes rules nested two at-rules deep', () => {
    expect(free('@media print { @supports (color: red) { html { color: red } } }').css).toBe(
      `@media print{@supports (color: red){${SELF}{color:red}}}`
    );
  });

  it('rejects a selector that starts with a combinator or uses & at the top level', () => {
    expect(messages(free('> div { color: red }'))).toMatch(/cannot start with a combinator/);
    expect(messages(free('& .x { color: red }'))).toMatch(/cannot use "&"/);
  });

  it('rejects a declaration outside a rule', () => {
    expect(messages(free('color: red'))).toMatch(/must sit inside a rule/);
  });
});

describe('compileFreeCss — forbidden constructs', () => {
  it('rejects @import, @font-face and the other escape-hatch at-rules', () => {
    for (const source of [
      '@import url("/x.css");',
      '@font-face { font-family: X; src: url(/f.woff2) }',
      '@charset "utf-8";',
      '@namespace svg url(http://www.w3.org/2000/svg);',
      '@layer base { .x { color: red } }',
      '@scope (.x) { .y { color: red } }',
      '@page { margin: 0 }',
    ]) {
      expect(messages(free(source)), source).toMatch(/is not allowed/);
      expect(free(source).css, source).toBe('');
    }
  });

  it('rejects position: fixed but allows sticky', () => {
    expect(messages(free('.x { position: fixed }'))).toMatch(/position: fixed is not allowed/);
    expect(free('.x { position: sticky }').css).toBe(`${CONTENT_ROOT} .x{position:sticky}`);
  });

  it('rejects an extreme or unreadable z-index and allows a modest one', () => {
    expect(messages(free('.x { z-index: 99999 }'))).toMatch(/z-index must be/);
    expect(messages(free('.x { z-index: -50 }'))).toMatch(/z-index must be/);
    expect(messages(free('.x { z-index: var(--z) }'))).toMatch(/z-index must be/);
    expect(free('.x { z-index: 2 }').css).toBe(`${CONTENT_ROOT} .x{z-index:2}`);
    expect(free('.x { z-index: auto }').css).toBe(`${CONTENT_ROOT} .x{z-index:auto}`);
  });

  it('rejects the legacy script-execution properties', () => {
    expect(messages(free('.x { behavior: url(/x.htc) }'))).toMatch(/not allowed/);
    expect(messages(free('.x { -moz-binding: url(/x.xml) }'))).toMatch(/not allowed/);
    expect(messages(free('.x { width: expression(alert(1)) }'))).toMatch(/expression\(\) is not allowed/);
  });

  it('allows only same-origin url() paths and fragment references', () => {
    expect(free('.x { background-image: url(/api/media/1) }').css).toBe(`${CONTENT_ROOT} .x{background-image:url(/api/media/1)}`);
    expect(free('.x { filter: url(#blur) }').css).toBe(`${CONTENT_ROOT} .x{filter:url(#blur)}`);
    expect(messages(free('.x { background: url(https://evil.example/x.png) }'))).toMatch(/not a same-origin path/);
    expect(messages(free('.x { background: url(//evil.example/x.png) }'))).toMatch(/another origin/);
    expect(messages(free('.x { background: url("data:image/svg+xml;base64,AAAA") }'))).toMatch(/not a same-origin path/);
  });

  it('reports an issue in the interface language, naming the settings as the admin sees them', () => {
    expect(messages(free('@import url(/x.css);'))).toMatch(/Fonts belong in Settings → Fonts/);
    overwriteGetLocale(() => 'de');
    try {
      expect(messages(free('@import url(/x.css);'))).toMatch(/Schriften gehören unter Einstellungen → Schriften/);
      expect(messages(free('.x { position: fixed }'))).toMatch(/position: fixed ist nicht erlaubt/);
    } finally {
      overwriteGetLocale(() => baseLocale);
    }
  });

  it('reports a syntax error with a line number instead of emitting anything', () => {
    const result = free('.x { color: red\n.y { color: blue }');
    expect(result.css).toBe('');
    expect(result.issues[0].line).toBeGreaterThan(0);
  });
});

describe('compileFreeCss — keyframes', () => {
  it('namespaces a keyframe name and rewrites the references to it', () => {
    const result = free('@keyframes fade { from { opacity: 0 } to { opacity: 1 } } .x { animation: fade 1s ease-in-out }');
    expect(result.css).toContain('@keyframes cs-abc123-fade{from{opacity:0}to{opacity:1}}');
    expect(result.css).toContain(`${CONTENT_ROOT} .x{animation:cs-abc123-fade 1s ease-in-out}`);
  });

  it('keeps a shorthand timing function intact while rewriting the name', () => {
    const result = free('@keyframes fade { to { opacity: 1 } } .x { animation: fade 1s cubic-bezier(0, .7, 1, .1) }');
    expect(result.css).toContain('animation:cs-abc123-fade 1s cubic-bezier(0, .7, 1, .1)');
  });

  it('cannot retarget a design-system animation: ds-spin from content gets its own name', () => {
    const result = free('@keyframes ds-spin { to { transform: none } }');
    expect(result.css).toBe('@keyframes cs-abc123-ds-spin{to{transform:none}}');
    expect(result.css).not.toContain('@keyframes ds-spin{');
  });

  it('gives two stylesheets separate names for the same animation', () => {
    const source = '@keyframes fade { to { opacity: 1 } } .x { animation-name: fade }';
    expect(compileFreeCss(source, 'one').css).toContain('cs-one-fade');
    expect(compileFreeCss(source, 'two').css).toContain('cs-two-fade');
  });
});

describe('compileStyleCss — a named style is a declaration body', () => {
  it('wraps declarations in the style class under the content root', () => {
    expect(style('background: var(--content-accent-soft); padding: 0.1em 0.3em').css).toBe(
      `${CONTENT_ROOT} .cs-highlight{background:var(--content-accent-soft);padding:0.1em 0.3em}`
    );
  });

  it('refuses a body that tries to close its own rule and reach the chrome', () => {
    const result = style('color: red } .app-bar { display: none ');
    expect(result.css).toBe('');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('refuses a body that closes its rule and opens an @media escape', () => {
    expect(style('color: red } @media screen { .app-bar { display: none } ').css).toBe('');
  });

  it('flattens a nested rule against the style class', () => {
    expect(style('color: red; & strong { font-weight: 700 }').css).toBe(
      `${CONTENT_ROOT} .cs-highlight{color:red}${CONTENT_ROOT} .cs-highlight strong{font-weight:700}`
    );
  });

  it('treats a nested selector without & as a descendant', () => {
    expect(style('em { font-style: normal }').css).toBe(`${CONTENT_ROOT} .cs-highlight em{font-style:normal}`);
  });

  it('keeps source order when declarations surround a nested rule', () => {
    expect(style('color: red; & b { color: blue } padding: 0').css).toBe(
      `${CONTENT_ROOT} .cs-highlight{color:red}${CONTENT_ROOT} .cs-highlight b{color:blue}${CONTENT_ROOT} .cs-highlight{padding:0}`
    );
  });

  it('scopes a nested @media', () => {
    expect(style('color: red; @media (min-width: 100px) { color: blue }').css).toBe(
      `${CONTENT_ROOT} .cs-highlight{color:red}@media (min-width: 100px){${CONTENT_ROOT} .cs-highlight{color:blue}}`
    );
  });

  it('refuses @keyframes in a named style, pointing at the free CSS instead', () => {
    expect(messages(style('@keyframes fade { to { opacity: 1 } }'))).toMatch(/cannot be nested/);
  });

  it('compiles an empty body to nothing', () => {
    expect(style('   ').css).toBe('');
    expect(style('   ').issues).toEqual([]);
  });

  it('applies the same declaration rules as free CSS', () => {
    expect(messages(style('position: fixed'))).toMatch(/position: fixed is not allowed/);
    expect(messages(style('background: url(https://evil.example/x.png)'))).toMatch(/not a same-origin path/);
  });

  it('reports the line the admin wrote, not the wrapper line', () => {
    const result = style('color: red;\nbackground: url(https://evil.example/x.png);');
    expect(result.issues[0].line).toBe(2);
  });
});

describe('compileStylesheets — the artifact', () => {
  const sheet = (over: Partial<CompileSheet>): CompileSheet => ({
    id: 'aaaaaaaa1111',
    position: 0,
    enabled: true,
    freeCss: '',
    styles: [],
    ...over,
  });

  it('emits enabled sheets in position order, each style then its free CSS', () => {
    const result = compileStylesheets([
      sheet({
        id: 'second00',
        position: 2,
        freeCss: '.late { color: blue }',
        styles: [{ id: 's2', slug: 'chip', kind: 'inline', css: 'color: green', position: 0 }],
      }),
      sheet({
        id: 'first000',
        position: 1,
        styles: [
          { id: 's1b', slug: 'b', kind: 'inline', css: 'color: black', position: 1 },
          { id: 's1a', slug: 'a', kind: 'inline', css: 'color: red', position: 0 },
        ],
      }),
    ]);
    expect(result.css).toBe(
      `${CONTENT_ROOT} .cs-a{color:red}` +
        `${CONTENT_ROOT} .cs-b{color:black}` +
        `${CONTENT_ROOT} .cs-chip{color:green}` +
        `${CONTENT_ROOT} .late{color:blue}`
    );
    expect(result.issues.size).toBe(0);
  });

  it('leaves a disabled sheet out entirely', () => {
    const result = compileStylesheets([
      sheet({ enabled: false, freeCss: '.x { color: red }', styles: [{ id: 's', slug: 'a', kind: 'inline', css: 'color: red', position: 0 }] }),
    ]);
    expect(result.css).toBe('');
  });

  it('keeps the rest of the artifact when one entry fails, and says which one', () => {
    const result = compileStylesheets([
      sheet({
        freeCss: '.ok { color: blue }',
        styles: [
          { id: 'bad', slug: 'bad', kind: 'inline', css: 'position: fixed', position: 0 },
          { id: 'good', slug: 'good', kind: 'inline', css: 'color: red', position: 1 },
        ],
      }),
    ]);
    expect(result.css).toBe(`${CONTENT_ROOT} .cs-good{color:red}${CONTENT_ROOT} .ok{color:blue}`);
    expect([...result.issues.keys()]).toEqual(['style:bad']);
  });

  it('reports a broken free-CSS block against its sheet', () => {
    const result = compileStylesheets([sheet({ id: 'sheet1', freeCss: '@import url("/x.css");' })]);
    expect([...result.issues.keys()]).toEqual(['sheet:sheet1']);
  });

  it('produces nothing for an empty registry', () => {
    expect(compileStylesheets([]).css).toBe('');
  });
});
