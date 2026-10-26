// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { safeDbName } from './dbSetup.server';

describe('safeDbName', () => {
  it('takes a plain identifier of up to 63 bytes', () => {
    expect(safeDbName('owlgraph_test')).toBe('owlgraph_test');
    expect(safeDbName('d'.repeat(63))).toBe('d'.repeat(63));
  });

  it('refuses anything else a statement would have to quote', () => {
    expect(() => safeDbName('owl-graph')).toThrow(/unsafe-looking/);
    expect(() => safeDbName('a"; drop database x; --')).toThrow(/unsafe-looking/);
  });

  it('refuses a name Postgres would cut short', () => {
    expect(() => safeDbName('d'.repeat(64))).toThrow(/longer than 63 bytes/);
  });
});
