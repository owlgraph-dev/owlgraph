// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { parseColor } from './color';
import { readableScheme } from './readableScheme';

describe('readableScheme', () => {
  it("picks the scheme whose text reads better on the ground, by that scheme's own text colour", () => {
    expect(readableScheme(parseColor('#0f172a')!, '--ds-color-fg').scheme).toBe('dark');
    expect(readableScheme(parseColor('#fef3c7')!, '--content-fg').scheme).toBe('light');
  });

  it('reports the winning ratio', () => {
    expect(readableScheme(parseColor('#ffffff')!, '--ds-color-fg').ratio).toBeGreaterThan(15);
  });
});
