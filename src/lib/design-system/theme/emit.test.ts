// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEME_CSS, emitSchemeBlock, emitSchemeCss } from './emit';
import { DEFAULT_SCHEMES } from './tokens';

// selector → declarations, for every rule in the emitted text (a rule inside
// an at-rule keyed with the at-rule's condition in front).
function blocks(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const nested = /@(?:media|container canvas) ([^{]+)\{((?:[^{}]+\{[^{}]*\})+)\}/g;
  for (const at of css.matchAll(nested)) {
    for (const m of at[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.set(`${at[1].trim()} ${m[1]}`, m[2]);
  }
  for (const m of css.replace(nested, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.set(m[1], m[2]);
  return out;
}

describe('emitSchemeCss', () => {
  const rules = blocks(DEFAULT_SCHEME_CSS);

  it('applies light at the root and to a subtree pinned light', () => {
    expect(rules.get(':root,[data-scheme="light"]')?.startsWith('color-scheme:light;')).toBe(true);
  });

  it('applies dark for a dark preference and to a subtree pinned dark', () => {
    expect(rules.get(':root[data-color-pref="dark"],[data-scheme="dark"]')?.startsWith('color-scheme:dark;')).toBe(true);
  });

  it('follows the device for a system preference', () => {
    expect(rules.get('(prefers-color-scheme: dark) :root[data-color-pref="system"]')?.startsWith('color-scheme:dark;')).toBe(true);
  });

  it("pins a scheme region per tier within that tier's canvas width only", () => {
    for (const [attribute, range] of [
      ['data-scheme-d', '(width > 900px)'],
      ['data-scheme-t', '(640px < width <= 900px)'],
      ['data-scheme-p', '(width <= 640px)'],
    ]) {
      expect(rules.get(`${range} [${attribute}="light"]`)?.startsWith('color-scheme:light;')).toBe(true);
      expect(rules.get(`${range} [${attribute}="dark"]`)?.startsWith('color-scheme:dark;')).toBe(true);
    }
  });

  it('prints light, whatever the document or a pinned subtree renders in', () => {
    const declarations = rules.get('print :root,[data-scheme],[data-scheme-d],[data-scheme-t],[data-scheme-p]');
    expect(declarations?.startsWith('color-scheme:light;')).toBe(true);
    expect(declarations).toContain(`--ds-color-bg:${DEFAULT_SCHEMES.light['--ds-color-bg']};`);
  });

  it('declares every token of the scheme exactly once in each of its rules', () => {
    const expectations = [
      [':root,[data-scheme="light"]', DEFAULT_SCHEMES.light],
      [':root[data-color-pref="dark"],[data-scheme="dark"]', DEFAULT_SCHEMES.dark],
      ['(prefers-color-scheme: dark) :root[data-color-pref="system"]', DEFAULT_SCHEMES.dark],
      ['print :root,[data-scheme],[data-scheme-d],[data-scheme-t],[data-scheme-p]', DEFAULT_SCHEMES.light],
      ...(['d', 't', 'p'] as const).flatMap((bp) => {
        const range = { d: '(width > 900px)', t: '(640px < width <= 900px)', p: '(width <= 640px)' }[bp];
        return [
          [`${range} [data-scheme-${bp}="light"]`, DEFAULT_SCHEMES.light],
          [`${range} [data-scheme-${bp}="dark"]`, DEFAULT_SCHEMES.dark],
        ] as const;
      }),
    ] as const;
    expect(rules.size).toBe(expectations.length);
    for (const [selector, tokens] of expectations) {
      const declarations = rules.get(selector)!;
      for (const [name, value] of Object.entries(tokens)) {
        expect(declarations.split(`${name}:${value};`).length - 1, `${selector} ${name}`).toBe(1);
      }
    }
  });

  it('gives every scheme the same token names', () => {
    expect(Object.keys(DEFAULT_SCHEMES.dark).sort()).toEqual(Object.keys(DEFAULT_SCHEMES.light).sort());
  });

  it('is deterministic for the same input', () => {
    expect(emitSchemeCss(DEFAULT_SCHEMES)).toBe(DEFAULT_SCHEME_CSS);
  });

  it('rejects a value that could escape its declaration or the style element', () => {
    for (const value of ['red;--x:1', 'red}body{', '</style><script>']) {
      expect(() => emitSchemeBlock(':root', 'light', { ...DEFAULT_SCHEMES.light, '--ds-color-bg': value })).toThrow();
    }
  });
});
