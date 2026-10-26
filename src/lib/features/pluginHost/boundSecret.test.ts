// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { bindSecret, openBoundSecret } from './boundSecret';

const VALUE = '{"token":"T","password":"p"}';
const FOR = { node: '11111111-1111-4111-8111-111111111111', origin: 'https://cloud.example' };

describe('a node credential bound to its node and address', () => {
  it('opens for the node and the address it was sealed for', () => {
    expect(openBoundSecret(bindSecret(VALUE, FOR), FOR)).toBe(VALUE);
  });

  it('opens as nothing for another node or another address', () => {
    const sealed = bindSecret(VALUE, FOR);
    expect(openBoundSecret(sealed, { ...FOR, node: '22222222-2222-4222-8222-222222222222' })).toBeNull();
    expect(openBoundSecret(sealed, { ...FOR, origin: 'https://elsewhere.example' })).toBeNull();
  });

  it('opens a value of any other shape as nothing, whatever it holds', () => {
    for (const plaintext of [
      VALUE,
      'plain',
      'null',
      JSON.stringify({ v: 1, origin: FOR.origin, value: VALUE }),
      JSON.stringify({ v: 2, node: FOR.node, origin: FOR.origin, value: 42 }),
      JSON.stringify({ v: 3, node: FOR.node, origin: FOR.origin, value: VALUE }),
    ]) {
      expect(openBoundSecret(plaintext, FOR), plaintext).toBeNull();
    }
  });
});
