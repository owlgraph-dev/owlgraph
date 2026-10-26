// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./graphql/nodes.server', () => ({ getNodes: vi.fn() }));
// Partial: the semantic barrel also feeds traverse.server.ts; only the lookup
// this test drives is stubbed.
vi.mock('$lib/features/semantic/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/features/semantic/server')>()),
  getNodeProperties: vi.fn(),
}));
vi.mock('$lib/features/namespaces/server', () => ({ resolveNamespaceLabels: vi.fn() }));
vi.mock('$lib/features/auth/server', () => ({ resolveUserLabels: vi.fn() }));

import { getNodes } from './graphql/nodes.server';
import { getNodeProperties } from '$lib/features/semantic/server';
import { resolveNamespaceLabels } from '$lib/features/namespaces/server';
import { resolveUserLabels } from '$lib/features/auth/server';
import { collectQueryBlocks, resolveQueryBlocks } from './queryBlockExec.server';

const mockedGetNodes = vi.mocked(getNodes);
const mockedGetNodeProperties = vi.mocked(getNodeProperties);
const mockedResolveNamespaceLabels = vi.mocked(resolveNamespaceLabels);
const mockedResolveUserLabels = vi.mocked(resolveUserLabels);

const nodeHit = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  type: 'page' as const,
  title: 'Page One',
  url: '/p/one',
  slug: 'one',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  namespaceId: 'ns-1',
  createdBy: 'user-1',
  classId: 'class-1',
  className: 'Work package',
  externalUrl: null,
  locale: 'en',
  ...overrides
});

const PAGE_ID = 'page-1';

// The stored wire format; resolveQueryBlocks converts it before calling getNodes.
const defaultFilter = { property: { name: 'status', operator: 'EQ', value: 'active' } };

const queryBlockNode = (blockId: string, filter: unknown = defaultFilter, extra: Record<string, unknown> = {}) => ({
  type: 'queryBlock',
  attrs: { blockId, filter, first: 20, ...extra }
});

describe('collectQueryBlocks()', () => {
  it('finds a top-level query block', () => {
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    const found = collectQueryBlocks(doc);
    expect(found).toHaveLength(1);
    expect(found[0].blockId).toBe('a');
    expect(found[0].attrs.filter).toEqual(defaultFilter);
  });

  it('finds query blocks nested inside a grid cell', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'grid',
          content: [{ type: 'gridCell', content: [queryBlockNode('cell-a')] }]
        }
      ]
    };
    expect(collectQueryBlocks(doc).map((b) => b.blockId)).toEqual(['cell-a']);
  });

  it('ignores non-queryBlock nodes and blocks with no blockId', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }, { type: 'queryBlock', attrs: { filter: defaultFilter } }]
    };
    expect(collectQueryBlocks(doc)).toEqual([]);
  });
});

describe('resolveQueryBlocks()', () => {
  beforeEach(() => {
    mockedGetNodes.mockReset();
    mockedGetNodeProperties.mockReset();
    mockedResolveNamespaceLabels.mockReset();
    mockedResolveUserLabels.mockReset();
    // Every result row's properties are fetched; none unless a test says so.
    mockedGetNodeProperties.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof getNodeProperties>>);
    mockedResolveNamespaceLabels.mockResolvedValue(new Map());
    mockedResolveUserLabels.mockResolvedValue(new Map());
  });

  it('unconfigured: filter null skips execution entirely', async () => {
    const doc = { type: 'doc', content: [queryBlockNode('a', null)] };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.a).toEqual({ state: 'unconfigured' });
    expect(mockedGetNodes).not.toHaveBeenCalled();
  });

  it('empty: getNodes resolves with no rows', async () => {
    mockedGetNodes.mockResolvedValue([]);
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.a).toEqual({ state: 'empty' });
  });

  it('ok: maps getNodes rows to the full intrinsic-field item shape, with the full (here empty) property set always fetched', async () => {
    mockedGetNodes.mockResolvedValue([nodeHit()]);
    mockedResolveNamespaceLabels.mockResolvedValue(new Map([['ns-1', 'Marketing']]));
    mockedResolveUserLabels.mockResolvedValue(new Map([['user-1', 'Alex']]));
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.a).toEqual({
      state: 'ok',
      items: [
        {
          id: 'p1',
          title: 'Page One',
          url: '/p/one',
          slug: 'one',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          type: 'page',
          namespaceLabel: 'Marketing',
          creatorLabel: 'Alex',
          classLabel: 'Work package',
          externalUrl: '',
          locale: 'en',
          properties: []
        }
      ]
    });
    expect(mockedGetNodeProperties).toHaveBeenCalledWith('p1');
    expect(mockedResolveNamespaceLabels).toHaveBeenCalledWith(['ns-1']);
    expect(mockedResolveUserLabels).toHaveBeenCalledWith(['user-1']);
  });

  it('a null createdBy resolves to an empty creatorLabel, without calling resolveUserLabels for it', async () => {
    mockedGetNodes.mockResolvedValue([nodeHit({ createdBy: null })]);
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.a).toMatchObject({ state: 'ok', items: [{ creatorLabel: '' }] });
    expect(mockedResolveUserLabels).toHaveBeenCalledWith([]);
  });

  it('translates the stored wire-format operator (EQ) to the internal lowercase form (eq) before calling getNodes', async () => {
    mockedGetNodes.mockResolvedValue([]);
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(mockedGetNodes).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ filter: { property: { name: 'status', operator: 'eq', value: 'active' } } })
    );
  });

  it('translates a stored wire-format orderBy (DESC) to lowercase before calling getNodes', async () => {
    mockedGetNodes.mockResolvedValue([]);
    const doc = {
      type: 'doc',
      content: [queryBlockNode('a', defaultFilter, { orderBy: { name: 'priority', direction: 'DESC' } })]
    };
    await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(mockedGetNodes).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ orderBy: { kind: 'property', name: 'priority', direction: 'desc' } })
    );
  });

  it('omitting orderBy passes null through (today\'s default ordering, unchanged)', async () => {
    mockedGetNodes.mockResolvedValue([]);
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(mockedGetNodes).toHaveBeenCalledWith(null, expect.objectContaining({ orderBy: null }));
  });

  it('error is generic — never surfaces the underlying message (public-facing security property)', async () => {
    mockedGetNodes.mockRejectedValue(new Error('operator "gt" is not valid for property "status" (datatype "text")'));
    const doc = { type: 'doc', content: [queryBlockNode('a')] };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.a).toEqual({ state: 'error' });
  });

  it('a getNodes call that never resolves degrades to a timeout state', async () => {
    vi.useFakeTimers();
    try {
      mockedGetNodes.mockReturnValue(new Promise(() => {})); // never settles
      const doc = { type: 'doc', content: [queryBlockNode('a')] };
      const pending = resolveQueryBlocks(doc, null, PAGE_ID);
      await vi.advanceTimersByTimeAsync(3100);
      const result = await pending;
      expect(result.a).toEqual({ state: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('caps at 10 query blocks per page — extras get a contained error state without executing', async () => {
    mockedGetNodes.mockResolvedValue([]);
    const blocks = Array.from({ length: 12 }, (_, i) => queryBlockNode(`b${i}`));
    const doc = { type: 'doc', content: blocks };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(Object.keys(result)).toHaveLength(12);
    for (let i = 0; i < 10; i++) expect(result[`b${i}`]).toEqual({ state: 'empty' });
    for (let i = 10; i < 12; i++) expect(result[`b${i}`]).toEqual({ state: 'error' });
    expect(mockedGetNodes).toHaveBeenCalledTimes(10);
  });

  it('one failing block does not affect the others', async () => {
    mockedGetNodes.mockImplementation(async (_user, args) => {
      const filter = args.filter as { property: { name: string } };
      if (filter.property.name === 'bad') throw new Error('boom');
      return [];
    });
    const doc = {
      type: 'doc',
      content: [
        queryBlockNode('good', { property: { name: 'ok', operator: 'EQ', value: 'x' } }),
        queryBlockNode('bad', { property: { name: 'bad', operator: 'EQ', value: 'x' } })
      ]
    };
    const result = await resolveQueryBlocks(doc, null, PAGE_ID);
    expect(result.good).toEqual({ state: 'empty' });
    expect(result.bad).toEqual({ state: 'error' });
  });
});
