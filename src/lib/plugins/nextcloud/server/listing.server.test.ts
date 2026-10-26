// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { listingQuery, sortEntries, MAX_PAGE_SIZE } from './listing.server';
import type { DavEntry } from './propfind.server';

const entry = (path: string, folder: boolean, size: number | null, modified: string | null): DavEntry => ({
  path,
  name: path,
  folder,
  size,
  mime: folder ? null : 'application/pdf',
  modified,
  etag: null,
  fileid: '1',
});

const entries = [
  entry('b.pdf', false, 300, '2026-10-03T00:00:00.000Z'),
  entry('Zeta', true, 10, '2026-10-01T00:00:00.000Z'),
  entry('a10.pdf', false, 100, '2026-10-05T00:00:00.000Z'),
  entry('a9.pdf', false, 200, null),
  entry('Alpha', true, 20, '2026-10-02T00:00:00.000Z'),
];

const names = (list: DavEntry[]) => list.map((e) => e.path);

describe('a listing', () => {
  it('sorts folders first, then by name in natural order', () => {
    expect(names(sortEntries(entries, 'name', 'asc'))).toEqual(['Alpha', 'Zeta', 'a9.pdf', 'a10.pdf', 'b.pdf']);
    expect(names(sortEntries(entries, 'name', 'desc'))).toEqual(['Zeta', 'Alpha', 'b.pdf', 'a10.pdf', 'a9.pdf']);
  });

  it('sorts by size or by when it changed, folders still first', () => {
    expect(names(sortEntries(entries, 'size', 'desc'))).toEqual(['Alpha', 'Zeta', 'b.pdf', 'a9.pdf', 'a10.pdf']);
    expect(names(sortEntries(entries, 'modified', 'asc'))).toEqual(['Zeta', 'Alpha', 'a9.pdf', 'b.pdf', 'a10.pdf']);
  });

  it('breaks a tie by name from A to Z, whichever way it sorts', () => {
    const tied = [entry('b.pdf', false, 5, '2026-10-01T00:00:00.000Z'), entry('a.pdf', false, 5, '2026-10-01T00:00:00.000Z'), entry('c.pdf', false, 9, '2026-10-03T00:00:00.000Z')];
    expect(names(sortEntries(tied, 'size', 'desc'))).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
    expect(names(sortEntries(tied, 'modified', 'desc'))).toEqual(['c.pdf', 'a.pdf', 'b.pdf']);
    expect(names(sortEntries(tied, 'size', 'asc'))).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
  });

  it('reads its query: a checked path, a known sort, page numbers clamped', () => {
    expect(listingQuery(new URLSearchParams(''))).toEqual({ path: '', sort: 'name', dir: 'asc', offset: 0, limit: 50 });
    expect(listingQuery(new URLSearchParams('p=Q3&sort=size&dir=desc&offset=20&limit=10'))).toEqual({ path: 'Q3', sort: 'size', dir: 'desc', offset: 20, limit: 10 });
    expect(listingQuery(new URLSearchParams('sort=drop&dir=up&offset=-1&limit=100000'))).toEqual({ path: '', sort: 'name', dir: 'asc', offset: 0, limit: MAX_PAGE_SIZE });
    expect(listingQuery(new URLSearchParams('limit=0'))?.limit).toBe(1);
    expect(listingQuery(new URLSearchParams('p=../secret'))).toBeNull();
    expect(listingQuery(new URLSearchParams('p=/etc'))).toBeNull();
  });
});
