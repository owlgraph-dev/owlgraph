// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { CodedError, isCodedError } from './codedError';

describe('a coded refusal', () => {
  it('carries its code, its details and an English message for the log', () => {
    const e = new CodedError('lock_lost', 'edit lock lost', { status: 'held' });
    expect(e).toBeInstanceOf(Error);
    expect([e.code, e.message, e.details]).toEqual(['lock_lost', 'edit lock lost', { status: 'held' }]);
    expect(new CodedError('not_found', 'Not found').details).toEqual({});
  });

  it('is told apart from any other error, and by its code when asked', () => {
    const e = new CodedError('slug_taken', 'That URL is already taken');
    expect(isCodedError(e)).toBe(true);
    expect(isCodedError(e, 'slug_reserved', 'slug_taken')).toBe(true);
    expect(isCodedError(e, 'slug_reserved')).toBe(false);
    expect(isCodedError(Object.assign(new Error('x'), { code: 'slug_taken' }))).toBe(false);
    expect(isCodedError(null)).toBe(false);
  });
});
