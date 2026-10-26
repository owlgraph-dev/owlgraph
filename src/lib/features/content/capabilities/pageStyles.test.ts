// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { StyleCollector, ruleIdAttribute, RULE_ID_ATTR } from './pageStyles';

describe('StyleCollector', () => {
  it('returns one id per distinct set and one rule per id', () => {
    const c = new StyleCollector();
    const a = c.add({ '--pad-d': '24px', '--surface-radius-d': '0px' });
    const b = c.add({ '--surface-radius-d': '0px', '--pad-d': '24px' }); // same set, other order
    const d = c.add({ '--pad-d': '16px' });
    expect(a).toMatch(/^b[0-9a-z]+$/);
    expect(b).toBe(a);
    expect(d).not.toBe(a);
    expect(c.css()).toBe(`[data-b="${a}"]{--pad-d:24px;--surface-radius-d:0px}[data-b="${d}"]{--pad-d:16px}`);
  });

  it('retains the named rules and gives a dropped set its id back', () => {
    const c = new StyleCollector();
    const a = c.add({ '--pad-d': '24px' });
    const b = c.add({ '--pad-d': '16px' });
    expect(c.retain(new Set([a]))).toBe(true);
    expect(c.css()).toBe(`[data-b="${a}"]{--pad-d:24px}`);
    expect(c.retain(new Set([a]))).toBe(false);
    expect(c.add({ '--pad-d': '16px' })).toBe(b);
    expect(c.css()).toBe(`[data-b="${a}"]{--pad-d:24px}[data-b="${b}"]{--pad-d:16px}`);
  });

  it('is deterministic across renders', () => {
    const one = new StyleCollector().add({ '--typography-size-d': 'var(--type-5xl)', color: '#2563eb' });
    const two = new StyleCollector().add({ color: '#2563eb', '--typography-size-d': 'var(--type-5xl)' });
    expect(one).toBe(two);
  });

  it('registers nothing for an empty or absent set', () => {
    const c = new StyleCollector();
    expect(c.add({})).toBe('');
    expect(c.add(null)).toBe('');
    expect(c.add(undefined)).toBe('');
    expect(c.isEmpty).toBe(true);
    expect(c.css()).toBe('');
    expect(ruleIdAttribute(c, {})).toBe('');
  });

  it('drops a declaration that could break out of the rule or the element', () => {
    const c = new StyleCollector();
    const id = c.add({
      color: 'red',
      '--x': 'a;b',
      '--y': 'a}b',
      '--z': '</style><script>',
      '--w': 'a/*b',
      '--v': 'a\\7d',
      'bad prop': 'x',
      '--empty': '',
    });
    expect(c.css()).toBe(`[data-b="${id}"]{color:red}`);
  });

  it('keeps the values emitters actually produce', () => {
    const c = new StyleCollector();
    const set = {
      '--typography-family-d': "'Custom Font', ui-serif, Georgia, serif",
      '--table-header-bg-d': 'color-mix(in oklab, #eef2ff 90%, var(--content-mix-target))',
      '--surface-border-d': '1px solid rgba(0, 0, 0, 0.2)',
      'grid-column': '1 / span 2',
      'aspect-ratio': '16 / 9',
    };
    const id = c.add(set);
    for (const [property, value] of Object.entries(set)) expect(c.css()).toContain(`${property}:${value}`);
    expect(id).toBeTruthy();
  });

  it('gives distinct sets distinct ids across a large sample', () => {
    const c = new StyleCollector();
    const ids = new Set<string>();
    for (let i = 0; i < 2000; i++) ids.add(c.add({ '--pad-d': `${i}px`, '--space-above-d': `${(i * 7) % 97}px` }));
    expect(ids.size).toBe(2000);
    // Whatever the hash did, every id selects exactly one rule.
    expect((c.css().match(/\[data-b=/g) ?? []).length).toBe(2000);
  });

  it('carries selector rules ahead of the id rules, deduplicated', () => {
    const c = new StyleCollector();
    c.addRule('.appbar .logo', { '--logo-size': '40px' });
    c.addRule('.appbar .logo', { '--logo-size': '40px' });
    c.addRule('.footer .brand-logo', { height: '32px' });
    c.addRule('.x{}', { color: 'red' }); // refused selector
    c.addRule('.y', {}); // nothing to say
    const id = c.add({ '--pad-d': '8px' });
    expect(c.css()).toBe(`.appbar .logo{--logo-size:40px}.footer .brand-logo{height:32px}[data-b="${id}"]{--pad-d:8px}`);
  });

  it('ruleIdAttribute renders the attribute text', () => {
    const c = new StyleCollector();
    const attr = ruleIdAttribute(c, { '--pad-d': '8px' });
    expect(attr).toMatch(new RegExp(`^ ${RULE_ID_ATTR}="b[0-9a-z]+"$`));
  });
});
