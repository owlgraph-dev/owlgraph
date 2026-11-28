// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fresh registry each test: its state is the module's own.
let registry: typeof import('./spaceRegistry');
beforeEach(async () => {
  vi.resetModules();
  registry = await import('./spaceRegistry');
});

describe('the space registry', () => {
  it('in the browser routes every slug it is given as itself, and names no restricted space', () => {
    registry.setKnownSpaceSlugs(['handbook', 'board']);
    expect(registry.spaceOfParam('handbook')).toBe('handbook');
    expect(registry.spaceOfParam('board')).toBe('board');
    expect(registry.spaceOfParam('elsewhere')).toBeUndefined();
    expect(registry.restrictedSpaceOf('board')).toBeNull();
  });

  it('on the server routes a public or internal space by its slug, a restricted one only under its stamp', () => {
    registry.setServerSpaceSlugs(['handbook', 'board'], ['board']);
    expect(registry.spaceOfParam('handbook')).toBe('handbook');
    expect(registry.spaceOfParam('board')).toBeUndefined();
    expect(registry.spaceOfParam(registry.stampedSpace('board'))).toBe('board');
    // The stamp opens a restricted space only, and no stamp but its own does.
    expect(registry.spaceOfParam(registry.stampedSpace('handbook'))).toBeUndefined();
    expect(registry.spaceOfParam(registry.stampedSpace('elsewhere'))).toBeUndefined();
    expect(registry.spaceOfParam('~00000000-0000-4000-8000-000000000000~board')).toBeUndefined();
  });

  it('on the server names the restricted space a path’s first segment holds, as SvelteKit decodes it', () => {
    registry.setServerSpaceSlugs(['handbook', 'board'], ['board']);
    expect(registry.restrictedSpaceOf('board')).toBe('board');
    expect(registry.restrictedSpaceOf('%62oard')).toBe('board');
    expect(registry.restrictedSpaceOf('handbook')).toBeNull();
    expect(registry.restrictedSpaceOf('elsewhere')).toBeNull();
    expect(registry.restrictedSpaceOf('%E0%A4%A')).toBeNull();
  });

  it('keeps its stamp when the spaces change, and routes a space by its level now', () => {
    registry.setServerSpaceSlugs(['board'], ['board']);
    const stamped = registry.stampedSpace('board');
    registry.setServerSpaceSlugs(['board'], []);
    expect(registry.spaceOfParam('board')).toBe('board');
    registry.setServerSpaceSlugs(['board'], ['board']);
    expect(registry.stampedSpace('board')).toBe(stamped);
    expect(registry.spaceOfParam('board')).toBeUndefined();
  });
});
