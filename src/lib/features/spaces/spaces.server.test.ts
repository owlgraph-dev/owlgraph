// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Every query parks until the test answers it, so the test decides the order
// in which overlapping refreshes finish.
const pending: Array<(rows: { slug: string }[]) => void> = [];
vi.mock('#lib/platform/db.server.ts', () => ({
  db: () => new Promise((resolve) => pending.push(resolve)),
}));

import { refreshSpaceCache } from './spaces.server';
import { isKnownSpaceSlug } from './spaceRegistry';

const rows = (...slugs: string[]) => slugs.map((slug) => ({ slug }));

describe('refreshSpaceCache', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('keeps a newer read when an older one finishes after it', async () => {
    const older = refreshSpaceCache();
    const newer = refreshSpaceCache();
    pending[1](rows('kept', 'created'));
    await newer;
    pending[0](rows('kept'));
    await older;
    expect(isKnownSpaceSlug('created')).toBe(true);
  });

  it('applies reads that finish in order', async () => {
    const first = refreshSpaceCache();
    const second = refreshSpaceCache();
    pending[0](rows('first'));
    await first;
    expect(isKnownSpaceSlug('first')).toBe(true);
    pending[1](rows('second'));
    await second;
    expect(isKnownSpaceSlug('first')).toBe(false);
    expect(isKnownSpaceSlug('second')).toBe(true);
  });
});
