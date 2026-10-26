// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { sourceHref, sourceInfo, UPSTREAM_SOURCE_URL } from './source.server';

describe('sourceInfo: where the running code is offered', () => {
  it('names the upstream repository and a dev revision when nothing is configured', () => {
    expect(sourceInfo({})).toEqual({ url: UPSTREAM_SOURCE_URL, revision: 'dev' });
  });

  it('offers an operator’s own repository and the commit the build was made from', () => {
    expect(sourceInfo({ SOURCE_URL: ' https://git.example.org/acme/owlgraph-fork ', SOURCE_REVISION: '85936eb' })).toEqual({
      url: 'https://git.example.org/acme/owlgraph-fork',
      revision: '85936eb',
    });
  });

  it('falls back to the upstream repository for an address that is not an http(s) URL', () => {
    for (const bad of ['javascript:alert(1)', 'git@example.org:acme/owlgraph.git', 'https://example.org/"><script>', '']) {
      expect(sourceInfo({ SOURCE_URL: bad }).url, bad).toBe(UPSTREAM_SOURCE_URL);
    }
  });

  it('prints a revision only when it looks like one', () => {
    expect(sourceInfo({ SOURCE_REVISION: 'v0.1.0' }).revision).toBe('v0.1.0');
    expect(sourceInfo({ SOURCE_REVISION: '<b>x</b>' }).revision).toBe('dev');
    expect(sourceInfo({ SOURCE_REVISION: 'a'.repeat(65) }).revision).toBe('dev');
  });
});

describe('sourceHref: the source of exactly this version', () => {
  it('is the repository itself for a dev build', () => {
    expect(sourceHref({ url: UPSTREAM_SOURCE_URL, revision: 'dev' })).toBe(UPSTREAM_SOURCE_URL);
  });

  it('is the repository’s tree at the commit or tag the build was made from', () => {
    expect(sourceHref({ url: UPSTREAM_SOURCE_URL, revision: '85936eb' })).toBe(`${UPSTREAM_SOURCE_URL}/tree/85936eb`);
    expect(sourceHref({ url: 'https://git.example.org/acme/fork.git', revision: 'v0.1.0' })).toBe('https://git.example.org/acme/fork/tree/v0.1.0');
    expect(sourceHref({ url: 'https://git.example.org/acme/fork/', revision: 'v0.1.0' })).toBe('https://git.example.org/acme/fork/tree/v0.1.0');
  });
});
