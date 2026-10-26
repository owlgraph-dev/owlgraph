// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { themeColorShortfalls } from './themeColorContrast';

describe('themeColorShortfalls', () => {
  it('finds none in the built-in schemes', () => {
    expect(themeColorShortfalls()).toEqual([]);
  });
});
