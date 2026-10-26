// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { parseSettings, DEFAULT_SETTINGS } from './settings';
import { FORCE_RANGES } from './layout/forceParams';

describe('parseSettings', () => {
  it('returns the defaults for garbage input', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and drops unknown keys', () => {
    const parsed = parseSettings({
      mode: 'standard',
      labels: 'never',
      edgeLabels: false,
      colorBy: 'namespace',
      nodeSize: 'uniform',
      forces: { center: 0.001, repel: 0.05, link: 0.02, linkDistance: 200 },
      filters: { classIds: ['stale'] },
      somethingElse: 1,
    });
    expect(parsed).toEqual({
      mode: 'standard',
      labels: 'never',
      edgeLabels: false,
      colorBy: 'namespace',
      nodeSize: 'uniform',
      forces: { center: 0.001, repel: 0.05, link: 0.02, linkDistance: 200 },
    });
    expect('filters' in parsed).toBe(false);
  });

  it('falls back per field on invalid values', () => {
    const parsed = parseSettings({ mode: 'radial', labels: 3, edgeLabels: 'yes', colorBy: null, nodeSize: 'huge' });
    expect(parsed.mode).toBe(DEFAULT_SETTINGS.mode);
    expect(parsed.labels).toBe(DEFAULT_SETTINGS.labels);
    expect(parsed.edgeLabels).toBe(DEFAULT_SETTINGS.edgeLabels);
    expect(parsed.colorBy).toBe(DEFAULT_SETTINGS.colorBy);
    expect(parsed.nodeSize).toBe(DEFAULT_SETTINGS.nodeSize);
  });

  it('clamps force values into their slider ranges and rejects non-numbers', () => {
    const parsed = parseSettings({ forces: { center: 99, repel: -1, link: 'x', linkDistance: Number.NaN } });
    expect(parsed.forces.center).toBe(FORCE_RANGES.center.max);
    expect(parsed.forces.repel).toBe(FORCE_RANGES.repel.min);
    expect(parsed.forces.link).toBe(DEFAULT_SETTINGS.forces.link);
    expect(parsed.forces.linkDistance).toBe(DEFAULT_SETTINGS.forces.linkDistance);
  });

  it('respects consumer-specific defaults', () => {
    const defaults = { ...DEFAULT_SETTINGS, labels: 'always' as const };
    expect(parseSettings({}, defaults).labels).toBe('always');
  });
});
