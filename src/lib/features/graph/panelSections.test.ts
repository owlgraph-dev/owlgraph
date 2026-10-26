// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SECTIONS, parseOpenSections } from './panelSections';

describe('parseOpenSections', () => {
  it('opens View and Filter when nothing is stored', () => {
    expect(parseOpenSections(null)).toEqual(['view', 'filter']);
    expect(DEFAULT_OPEN_SECTIONS).toEqual(['view', 'filter']);
  });

  it('restores what was stored, including nothing open', () => {
    expect(parseOpenSections('["forces","display"]')).toEqual(['forces', 'display']);
    expect(parseOpenSections('[]')).toEqual([]);
  });

  it('drops unknown sections and falls back on anything unreadable', () => {
    expect(parseOpenSections('["view","bogus",3]')).toEqual(['view']);
    expect(parseOpenSections('not json')).toEqual(['view', 'filter']);
    expect(parseOpenSections('{"view":true}')).toEqual(['view', 'filter']);
  });
});
