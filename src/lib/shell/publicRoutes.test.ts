// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_ROUTES } from './publicRoutes';

// Kept by hand: widening what anonymous visitors may reach must be a
// deliberate change, not a side effect of a feature declaration.
const EXPECTED = [
  '/login',
  '/',
  '/[[namespace=namespace]]/[slug]',
  '/api/media/[id]',
  '/api/documents/[id]/content',
  '/share/[id]',
  '/share/[id]/content',
  '/api/media/branding/logo/[id]',
  '/api/media/avatar/[userId]',
  '/api/media/fonts/[id]',
  // The Mermaid render frame: a public page's diagrams are drawn in it.
  '/api/embed/mermaid',
  // The compiled custom stylesheet a public page needs: one artifact, identical
  // for everyone, nothing viewer-scoped.
  '/api/styles/site/[hash]',
  '/api/graphql',
  '/api/health',
  // Browsers post CSP reports without a session.
  '/api/csp-report',
  '/api/namespaces/slugs',
  // Anonymous visitors pick the interface language too; it writes only their
  // choice cookie, for an enabled language.
  '/api/locale',
  // Lists only what the viewer may read, filters only from readable content.
  '/search',
  // The same viewer-scoped count the search page shows.
  '/api/search-count',
  // A public page's blocks call them for anonymous readers; each plugin route
  // declares who may call it, and the dispatcher enforces that.
  '/api/plugins/[plugin]/[...path]',
  // AGPL-3.0 §13. The about page's admin half is decided in its own load, never
  // by this gate.
  '/-/about',
  '/-/license',
];

describe('public routes', () => {
  it('compose to exactly the known anonymous-reachable set', () => {
    expect([...PUBLIC_ROUTES].sort()).toEqual([...EXPECTED].sort());
  });

  it('every declared id is a real route (a typo would silently gate nothing)', () => {
    for (const id of PUBLIC_ROUTES) {
      const dir = join(process.cwd(), 'src', 'routes', id);
      expect(existsSync(dir), id).toBe(true);
      const files = readdirSync(dir);
      expect(files.some((f) => /^\+(server|page\.server|page)\.(ts|svelte)$/.test(f)), id).toBe(true);
    }
  });
});
