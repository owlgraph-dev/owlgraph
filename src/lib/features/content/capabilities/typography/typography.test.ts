// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { familyOrNull, setTypographyField, typographyVars } from './typography';
import { isCustomFontRef, customFontStacksRecord, resolveFontStack } from './fonts';
import { BUILTIN_ELEMENT_DEFAULTS, type TypographyRegistry } from './roles';

const CUSTOM_ID = 'custom:11111111-1111-1111-1111-111111111111';

function registry(overrides: Partial<TypographyRegistry> = {}): TypographyRegistry {
  return { customStacks: {}, paragraphStyles: [], ...overrides };
}

describe('isCustomFontRef', () => {
  it('accepts the custom:<uuid> shape', () => {
    expect(isCustomFontRef(CUSTOM_ID)).toBe(true);
  });

  it('rejects built-ins, malformed refs, and non-strings', () => {
    expect(isCustomFontRef('sans')).toBe(false);
    expect(isCustomFontRef('custom:not-a-uuid')).toBe(false);
    expect(isCustomFontRef('custom:')).toBe(false);
    expect(isCustomFontRef(null)).toBe(false);
    expect(isCustomFontRef(42)).toBe(false);
  });
});

describe('familyOrNull', () => {
  it('accepts built-in ids and custom refs, rejects everything else', () => {
    expect(familyOrNull('sans')).toBe('sans');
    expect(familyOrNull(CUSTOM_ID)).toBe(CUSTOM_ID);
    expect(familyOrNull('made-up')).toBeNull();
    expect(familyOrNull(undefined)).toBeNull();
  });
});

describe('resolveFontStack', () => {
  it('resolves a built-in FontId regardless of customStacks', () => {
    expect(resolveFontStack('serif')).toContain('ui-serif');
  });

  it('resolves a custom ref present in customStacks', () => {
    const customStacks = customFontStacksRecord([{ id: CUSTOM_ID, name: 'Be Vietnam Pro', stack: "'Be Vietnam Pro', sans-serif" }]);
    expect(resolveFontStack(CUSTOM_ID, customStacks)).toBe("'Be Vietnam Pro', sans-serif");
  });

  it('fails soft to undefined for an unresolvable, dangling, or absent family', () => {
    expect(resolveFontStack(CUSTOM_ID, {})).toBeUndefined();
    expect(resolveFontStack(null)).toBeUndefined();
    expect(resolveFontStack(undefined)).toBeUndefined();
  });
});

describe('typographyVars custom family resolution', () => {
  it('emits the registered stack for a resolvable custom family', () => {
    const customStacks = customFontStacksRecord([{ id: CUSTOM_ID, name: 'Be Vietnam Pro', stack: "'Be Vietnam Pro', sans-serif" }]);
    const css = typographyVars({ desktop: { family: CUSTOM_ID } }, BUILTIN_ELEMENT_DEFAULTS.body, 'typography', registry({ customStacks }));
    expect(css['--typography-family-d']).toBe("'Be Vietnam Pro', sans-serif");
  });

  it('fails soft (no family var emitted) when the custom family is no longer registered', () => {
    const css = typographyVars({ desktop: { family: CUSTOM_ID } }, BUILTIN_ELEMENT_DEFAULTS.body, 'typography', registry());
    expect(css).not.toHaveProperty('--typography-family-d');
  });

  it('still resolves built-in families with no registry passed at all', () => {
    const css = typographyVars({ desktop: { family: 'serif' } }, BUILTIN_ELEMENT_DEFAULTS.body, 'typography');
    expect(css['--typography-family-d']).toContain('ui-serif');
  });
});

describe('typographyVars against the style look', () => {
  // The look itself is a rule of the theme stylesheet (emitParagraphStyles.ts);
  // a block emits only its own deviations from it.
  it('emits nothing for a block set entirely in its style', () => {
    expect(typographyVars(null, BUILTIN_ELEMENT_DEFAULTS.h1)).toEqual({});
    expect(typographyVars({}, { size: 40, weight: 'bold', lineHeight: 1.1 })).toEqual({});
    expect(typographyVars({ desktop: { size: 'scale:4xl' } }, BUILTIN_ELEMENT_DEFAULTS.h1)).toEqual({});
    expect(typographyVars({ desktop: { weight: 'bold', family: 'sans' } }, { size: 40, weight: 'bold', family: 'sans' })).toEqual({});
  });

  it("emits a block's own value that deviates, a step as its token and a literal as px", () => {
    expect(typographyVars({ desktop: { size: 22 } }, { size: 40 })).toEqual({ '--typography-size-d': '22px' });
    expect(typographyVars({ desktop: { size: 'scale:2xl', weight: 'medium' } }, BUILTIN_ELEMENT_DEFAULTS.h1)).toEqual({
      '--typography-size-d': 'var(--type-2xl)',
      '--typography-weight-d': '500',
    });
    expect(typographyVars({ desktop: { lineHeight: 1.1, letterSpacing: 0.02 } }, {})).toEqual({
      '--typography-lineheight-d': '1.1',
      '--typography-letterspacing-d': '0.02em',
    });
  });

  it('compares a tablet or phone tier against the tier above', () => {
    const css = typographyVars({ desktop: { size: 'scale:5xl' }, tablet: { size: 20 }, phone: { size: 'scale:2xl' } }, BUILTIN_ELEMENT_DEFAULTS.h1);
    expect(css).toEqual({ '--typography-size-d': 'var(--type-5xl)', '--typography-size-t': '20px', '--typography-size-p': 'var(--type-2xl)' });
    // Tablet repeats desktop: nothing; phone repeats the style look but deviates from tablet: emitted.
    expect(typographyVars({ desktop: { size: 20 }, tablet: { size: 20 }, phone: { size: 'scale:4xl' } }, BUILTIN_ELEMENT_DEFAULTS.h1)).toEqual({
      '--typography-size-d': '20px',
      '--typography-size-p': 'var(--type-4xl)',
    });
  });

  it('drops an unknown step instead of leaking it into CSS', () => {
    const css = typographyVars({ desktop: { size: 'scale:9xl' as never }, tablet: { size: 'scale:huge' as never } }, BUILTIN_ELEMENT_DEFAULTS.body);
    expect(css).toEqual({});
  });
});

describe('setTypographyField size', () => {
  it('stores a step reference as it is and clamps a literal', () => {
    expect(setTypographyField({}, 'desktop', 'size', 'scale:3xl')).toEqual({ desktop: { size: 'scale:3xl' } });
    expect(setTypographyField({}, 'phone', 'size', 400)).toEqual({ phone: { size: 96 } });
  });

  it('clears the field for an invalid value rather than storing it', () => {
    expect(setTypographyField({ desktop: { size: 20 } }, 'desktop', 'size', 'scale:7xl')).toEqual({});
  });
});
