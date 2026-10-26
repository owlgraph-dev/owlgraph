// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { isValidTokenName, validateTokenInput, type TypographyTokenInput } from './typographyTokens.server';
import type { TypeSize } from './typeScale';

describe('isValidTokenName', () => {
  it('accepts a non-empty name up to 64 characters', () => {
    expect(isValidTokenName('Display')).toBe(true);
    expect(isValidTokenName('a'.repeat(64))).toBe(true);
  });

  it('rejects empty, whitespace-only, or overlong names', () => {
    expect(isValidTokenName('')).toBe(false);
    expect(isValidTokenName('   ')).toBe(false);
    expect(isValidTokenName('a'.repeat(65))).toBe(false);
  });
});

describe('validateTokenInput size', () => {
  const input = (size: TypeSize | null): TypographyTokenInput => ({ name: 'Heading', family: null, size, weight: null, lineHeight: null, letterSpacing: null });

  it('accepts a type-scale step, a px literal in range, and no size', () => {
    expect(() => validateTokenInput(input('scale:3xl'))).not.toThrow();
    expect(() => validateTokenInput(input(44))).not.toThrow();
    expect(() => validateTokenInput(input(null))).not.toThrow();
  });

  it('rejects an unknown step and an out-of-range or fractional px', () => {
    expect(() => validateTokenInput(input('scale:7xl' as TypeSize))).toThrow();
    expect(() => validateTokenInput(input(200))).toThrow();
    expect(() => validateTokenInput(input(14.5))).toThrow();
  });
});
