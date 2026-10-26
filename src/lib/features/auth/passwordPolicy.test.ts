// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, passwordProblem } from './passwordPolicy';

describe('passwordProblem', () => {
  it('refuses passwords under the minimum length', () => {
    expect(passwordProblem('123')).toBe('too-short');
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('too-short');
  });

  it('refuses unbounded passwords', () => {
    expect(passwordProblem('x'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe('too-long');
  });

  it('refuses common and single-character passwords that pass the length rule', () => {
    expect(passwordProblem('Password1234')).toBe('too-common');
    expect(passwordProblem('aaaaaaaaaaaaaaaa')).toBe('too-common');
  });

  it('accepts a long, uncommon password', () => {
    expect(passwordProblem('correct horse battery staple')).toBeNull();
    expect(passwordProblem('Kx9!mQ2#vL7p')).toBeNull();
  });
});
