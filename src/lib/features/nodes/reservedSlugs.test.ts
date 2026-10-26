// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { isReservedSlug } from './nodes.server';

// RESERVED_SLUGS is kept by hand; a static route missing from it shadows a
// page's URL. A reserved word with no route is allowed ('p', 'd').
describe('RESERVED_SLUGS covers every static top-level route', () => {
  it('reserves each src/routes/<segment> that is not a dynamic or file entry', () => {
    const entries = readdirSync(join(process.cwd(), 'src', 'routes'), { withFileTypes: true });
    const staticDirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('[') && !e.name.startsWith('+') && !e.name.startsWith('('))
      .map((e) => e.name);
    expect(staticDirs.length).toBeGreaterThan(0);
    for (const dir of staticDirs) expect(isReservedSlug(dir), `src/routes/${dir} is not in RESERVED_SLUGS`).toBe(true);
  });

  it('does not reserve words whose routes moved under /settings', () => {
    for (const slug of ['admin', 'properties', 'account']) expect(isReservedSlug(slug)).toBe(false);
    expect(isReservedSlug('settings')).toBe(true);
  });
});
