// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { isWoff2, isValidFamilyName, isValidWeight, isValidStyle } from './fonts.server';

describe('isWoff2', () => {
  it('accepts bytes starting with the wOF2 signature', () => {
    expect(isWoff2(Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0]))).toBe(true);
  });

  it('rejects other formats (e.g. woff1, ttf, or arbitrary bytes)', () => {
    expect(isWoff2(Buffer.from([0x77, 0x4f, 0x46, 0x46]))).toBe(false); // wOFF (woff1)
    expect(isWoff2(Buffer.from([0x00, 0x01, 0x00, 0x00]))).toBe(false); // sfnt/ttf
    expect(isWoff2(Buffer.from('not a font'))).toBe(false);
  });

  it('rejects buffers shorter than the signature', () => {
    expect(isWoff2(Buffer.from([0x77, 0x4f]))).toBe(false);
    expect(isWoff2(Buffer.alloc(0))).toBe(false);
  });
});

describe('isValidFamilyName', () => {
  it('accepts letters, numbers, spaces, hyphens, apostrophes', () => {
    expect(isValidFamilyName('Be Vietnam Pro')).toBe(true);
    expect(isValidFamilyName("O'Reilly Sans-2")).toBe(true);
  });

  it('rejects characters that could break out of the generated @font-face <style> block', () => {
    expect(isValidFamilyName('</style><script>alert(1)</script>')).toBe(false);
    expect(isValidFamilyName('Bad"Name')).toBe(false);
    expect(isValidFamilyName('Bad;Name')).toBe(false);
    expect(isValidFamilyName('Bad{Name}')).toBe(false);
  });

  it('rejects empty or overlong names', () => {
    expect(isValidFamilyName('')).toBe(false);
    expect(isValidFamilyName('a'.repeat(65))).toBe(false);
    expect(isValidFamilyName('a'.repeat(64))).toBe(true);
  });
});

describe('isValidWeight', () => {
  it('accepts integers 100..900', () => {
    expect(isValidWeight(100)).toBe(true);
    expect(isValidWeight(400)).toBe(true);
    expect(isValidWeight(900)).toBe(true);
  });

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidWeight(50)).toBe(false);
    expect(isValidWeight(950)).toBe(false);
    expect(isValidWeight(450.5)).toBe(false);
  });
});

describe('isValidStyle', () => {
  it('accepts only normal/italic', () => {
    expect(isValidStyle('normal')).toBe(true);
    expect(isValidStyle('italic')).toBe(true);
    expect(isValidStyle('oblique')).toBe(false);
    expect(isValidStyle('')).toBe(false);
  });
});
