// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { styleWarnings } from './warnings';

describe('styleWarnings — literal colours', () => {
  it('says nothing about a style written entirely in content tokens', () => {
    expect(styleWarnings('background: var(--content-accent-soft); color: var(--content-fg)', 'inline')).toEqual([]);
  });

  it('flags a hex literal, because it cannot follow the colour scheme', () => {
    expect(styleWarnings('color: #ff0000', 'inline')).toEqual([{ kind: 'literal-color', values: ['#ff0000'] }]);
  });

  it('flags rgb(), a named colour, and reports each literal once', () => {
    expect(styleWarnings('color: rgb(255, 0, 0); border-color: red; outline-color: red', 'inline')).toEqual([
      { kind: 'literal-color', values: ['rgb(255, 0, 0)', 'red'] },
    ]);
  });

  it('does not mistake a non-colour property or a var() fallback for a literal', () => {
    expect(styleWarnings('padding: 0.3em; font-weight: 700', 'inline')).toEqual([]);
    expect(styleWarnings('color: var(--content-fg, #123456)', 'inline')).toEqual([]);
  });

  it('picks the colour out of a shorthand', () => {
    expect(styleWarnings('border: 1px solid #cccccc', 'inline')).toEqual([{ kind: 'literal-color', values: ['#cccccc'] }]);
  });
});

describe('styleWarnings — contrast', () => {
  it('warns that a light literal background leaves dark-scheme page text unreadable', () => {
    const warnings = styleWarnings('background: #ffffcc', 'inline');
    const contrast = warnings.find((w) => w.kind === 'contrast-scheme');
    expect(contrast).toEqual({ kind: 'contrast-scheme', background: '#ffffcc', schemes: ['dark'] });
  });

  it('warns the other way round for a dark literal background', () => {
    const warnings = styleWarnings('background: #101010', 'inline');
    const contrast = warnings.find((w) => w.kind === 'contrast-scheme');
    expect(contrast).toEqual({ kind: 'contrast-scheme', background: '#101010', schemes: ['light'] });
  });

  it('warns about both schemes for a mid tone that neither reads on', () => {
    const warnings = styleWarnings('background: #7a7a7a', 'inline');
    const contrast = warnings.find((w) => w.kind === 'contrast-scheme');
    expect(contrast).toEqual({ kind: 'contrast-scheme', background: '#7a7a7a', schemes: ['light', 'dark'] });
  });

  it('checks the style\'s own pair when it sets both, and stays quiet when that pair reads', () => {
    expect(styleWarnings('background: #ffffcc; color: #111111', 'inline').some((w) => w.kind.startsWith('contrast'))).toBe(false);
    expect(styleWarnings('background: #ffffcc; color: #eeeeee', 'inline')).toContainEqual({
      kind: 'contrast-pair',
      background: '#ffffcc',
      text: '#eeeeee',
    });
  });

  it('leaves a background written as a token alone — it resolves per scheme', () => {
    expect(styleWarnings('background: var(--content-accent-soft)', 'inline')).toEqual([]);
  });

  it('only checks inline styles: a block style is a band with its own text', () => {
    expect(styleWarnings('background: #7a7a7a', 'block').some((w) => w.kind.startsWith('contrast'))).toBe(false);
  });

  it('says nothing about CSS that does not parse — the compiler reports that', () => {
    expect(styleWarnings('color: red } .x {', 'inline')).toEqual([]);
  });

  it('says nothing about an empty body', () => {
    expect(styleWarnings('   ', 'inline')).toEqual([]);
  });
});
