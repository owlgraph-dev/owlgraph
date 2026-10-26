// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { CredentialChecks } from './credentialChecks.server';

describe('the budget of credential checks', () => {
  it('lets a person fail a few times, then makes them wait the window out', () => {
    let t = 0;
    const checks = new CredentialChecks(3, 1000, () => t);
    for (let i = 0; i < 3; i++) {
      expect(checks.allowed('alice').allowed).toBe(true);
      checks.failed('alice');
    }
    expect(checks.allowed('alice')).toEqual({ allowed: false, retryAfterMs: 1000 });
    expect(checks.allowed('bob').allowed).toBe(true);
    t = 400;
    expect(checks.allowed('alice')).toEqual({ allowed: false, retryAfterMs: 600 });
    t = 1000;
    expect(checks.allowed('alice').allowed).toBe(true);
  });

  it('costs nothing for a check that succeeds', () => {
    const checks = new CredentialChecks(1, 1000, () => 0);
    for (let i = 0; i < 5; i++) expect(checks.allowed('alice').allowed).toBe(true);
  });
});
