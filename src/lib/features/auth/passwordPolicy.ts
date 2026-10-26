// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Enforced in createUser/setUserPassword (auth.server.ts), so every caller shares
// one policy. Length is what resists guessing (NIST SP 800-63B), so there are no
// composition rules; only the obvious non-passwords are refused.
export const MIN_PASSWORD_LENGTH = 12;
// scrypt hashes any length, but an unbounded password is a free CPU lever.
export const MAX_PASSWORD_LENGTH = 1024;

// Long enough to pass the length rule, still first in any guessing list.
const COMMON = new Set([
  'password1234', 'passwort1234', '123456789012', '1234567890123', 'qwertyuiop12',
  'qwertzuiop12', 'changeme1234', 'administrator', 'letmein12345', 'iloveyou1234',
]);

export type PasswordProblem = 'too-short' | 'too-long' | 'too-common';

export function passwordProblem(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too-short';
  if (password.length > MAX_PASSWORD_LENGTH) return 'too-long';
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1*$/.test(password)) return 'too-common';
  return null;
}

export function passwordProblemMessage(problem: PasswordProblem): string {
  switch (problem) {
    case 'too-short':
      return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'too-long':
      return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    case 'too-common':
      return 'That password is too easy to guess — choose another.';
  }
}
