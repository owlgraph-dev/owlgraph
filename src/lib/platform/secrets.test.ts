// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { urlPassword, weakSecretReason } from './secrets';

describe('weakSecretReason', () => {
  it('rejects missing values', () => {
    expect(weakSecretReason(undefined)).toBe('is not set');
    expect(weakSecretReason('')).toBe('is not set');
  });

  it('rejects the .env.example placeholders regardless of case', () => {
    expect(weakSecretReason('change-me')).toBe('is still a placeholder value');
    expect(weakSecretReason('Password')).toBe('is still a placeholder value');
  });

  it('rejects short values', () => {
    expect(weakSecretReason('Tr0ub4dor&3')).toBe('is shorter than 16 characters');
  });

  it('accepts a long, non-placeholder value', () => {
    expect(weakSecretReason('correct-horse-battery-staple')).toBeNull();
  });
});

describe('urlPassword', () => {
  it('extracts and percent-decodes the password', () => {
    expect(urlPassword('postgres://user:p%40ss%2Fword@postgres:5432/owlgraph')).toBe('p@ss/word');
  });

  it('returns null without a password or a parseable URL', () => {
    expect(urlPassword('postgres://user@postgres:5432/owlgraph')).toBeNull();
    expect(urlPassword('not a url')).toBeNull();
    expect(urlPassword(undefined)).toBeNull();
  });
});
