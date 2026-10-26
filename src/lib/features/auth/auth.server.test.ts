// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Count the password work a sign-in does: the same scryptSync, wrapped.
const scrypt = vi.hoisted(() => ({ calls: 0 }));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    scryptSync: (...args: Parameters<typeof actual.scryptSync>) => {
      scrypt.calls++;
      return actual.scryptSync(...args);
    },
  };
});

const { judgeLogin, hashPassword } = await import('./auth.server');

describe('a sign-in is judged after the same password work, whatever the address', () => {
  const hash = hashPassword('correct horse battery staple');
  beforeEach(() => {
    // Makes the lazy stand-in hash now, so each case counts only its own check.
    judgeLogin(null, 'warm-up');
    scrypt.calls = 0;
  });

  it('checks a password even when there is no such account', () => {
    expect(judgeLogin(null, 'guess')).toBe('no_such_user');
    expect(scrypt.calls).toBe(1);
  });

  it('checks a password for an inactive account, and refuses it as inactive even when it is right', () => {
    expect(judgeLogin({ is_active: false, password_hash: hash }, 'correct horse battery staple')).toBe('inactive');
    expect(scrypt.calls).toBe(1);
  });

  it('checks a password for an account without one, and refuses it', () => {
    expect(judgeLogin({ is_active: true, password_hash: null }, 'anything')).toBe('bad_password');
    expect(scrypt.calls).toBe(1);
  });

  it('refuses a wrong password and accepts the right one, each after one check', () => {
    expect(judgeLogin({ is_active: true, password_hash: hash }, 'wrong')).toBe('bad_password');
    expect(judgeLogin({ is_active: true, password_hash: hash }, 'correct horse battery staple')).toBeNull();
    expect(scrypt.calls).toBe(2);
  });
});
