// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { styleRouteKind, MERMAID_FRAME_ROUTE } from './cspRoutes';

describe('styleRouteKind', () => {
  it('is strict for the reader pages and by default', () => {
    for (const id of ['/', '/login', '/logout', '/[[namespace=namespace]]/[slug]', '/share/[id]', '/graph', '/search', '/api/graphql']) {
      expect(styleRouteKind(id), id).toBe('strict');
    }
    // An unmatched URL (a 404 rendered by +error.svelte) has no route id.
    expect(styleRouteKind(null)).toBe('strict');
    expect(styleRouteKind(undefined)).toBe('strict');
  });

  it('is loose only where an authenticated tool still writes style attributes', () => {
    for (const id of ['/[[namespace=namespace]]/[slug]/edit', '/settings', '/settings/profile', '/settings/schema/relationships', '/dev/design-system']) {
      expect(styleRouteKind(id), id).toBe('loose');
    }
  });

  it('does not loosen a route that merely resembles one', () => {
    expect(styleRouteKind('/settingsx')).toBe('strict');
    expect(styleRouteKind('/dev')).toBe('strict');
    expect(styleRouteKind('/[[namespace=namespace]]/[slug]/editor')).toBe('strict');
  });

  it('classes the Mermaid render frame as a frame', () => {
    expect(styleRouteKind(MERMAID_FRAME_ROUTE)).toBe('frame');
  });
});
