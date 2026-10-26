// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEMES } from '$lib/design-system/theme/tokens';
import { MERMAID_TOKENS, mermaidThemeVariables } from './mermaidTheme';

// The palette as a browser would compute it: aliases resolved to their chrome value.
function computed(scheme: 'light' | 'dark') {
  const tokens = DEFAULT_SCHEMES[scheme] as Record<string, string>;
  const resolve = (value: string): string => {
    const alias = value.match(/^var\((--[\w-]+)\)$/);
    return alias ? resolve(tokens[alias[1]]) : value;
  };
  return Object.fromEntries(MERMAID_TOKENS.map((t) => [t, resolve(tokens[t])])) as Record<(typeof MERMAID_TOKENS)[number], string>;
}

describe('mermaidThemeVariables', () => {
  it('draws a light diagram from the light content palette', () => {
    const vars = mermaidThemeVariables(computed('light'), 'system-ui');
    expect(vars).toMatchObject({ darkMode: false, background: '#fff', textColor: '#1d1d1f', primaryBorderColor: '#2563eb' });
  });

  it('draws a dark diagram from the dark content palette', () => {
    const vars = mermaidThemeVariables(computed('dark'), 'system-ui');
    expect(vars).toMatchObject({ darkMode: true, background: '#1c1c1b', textColor: '#ecebe8', primaryBorderColor: '#7aabff' });
  });

  it('hands Mermaid only concrete colours, never var() references', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const value of Object.values(mermaidThemeVariables(computed(scheme), 'system-ui'))) {
        expect(String(value)).not.toContain('var(');
      }
    }
  });
});
