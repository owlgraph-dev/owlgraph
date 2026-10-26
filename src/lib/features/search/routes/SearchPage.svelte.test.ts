// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import type { ComponentProps } from 'svelte';
import { EMPTY_SEARCH, type SearchParams, type SearchResultCard } from '$lib/features/search';
import type { NodeClassOption } from '$lib/features/semantic';
import SearchPage from './SearchPage.svelte';

// Every control navigates, so the test observes the address asked for; after
// a navigation it hands the page the next load's data, as the router would.

type Data = ComponentProps<typeof SearchPage>['data'];

const navigation = vi.hoisted(() => ({ goto: [] as string[] }));
vi.mock('$app/navigation', async (original) => ({
  ...(await original<typeof import('$app/navigation')>()),
  goto: async (url: string | URL) => {
    navigation.goto.push(String(url));
  },
}));

const CONCEPT: NodeClassOption = { id: 'c-concept', slug: 'concept', label: 'Concept', description: '', kind: 'domain', parentId: 'c-page', nodeType: 'page', depth: 2 };
const PAGE_TYPE: NodeClassOption = { id: 'c-page', slug: 'page', label: 'Page', description: '', kind: 'type', parentId: 'c-root', nodeType: 'page', depth: 1 };

function card(i: number): SearchResultCard {
  return { id: `n-${i}`, type: 'page', title: `Sheet ${i}`, url: `/sheet-${i}`, locale: 'en', className: null, documentKind: null, linkHost: '', excerpt: '', highlighted: false, updatedAt: '2026-10-01T10:00:00.000Z', namespaceName: '', tags: ['sheet'] };
}

function data(applied: Partial<SearchParams>, total: number, extra: Partial<Data> = {}): Data {
  return {
    applied: { ...EMPTY_SEARCH, ...applied },
    results: Array.from({ length: total }, (_, i) => card(i)),
    total,
    pageCount: 1,
    classLabel: null,
    namespaceName: null,
    classOptions: [PAGE_TYPE, CONCEPT],
    tagOptions: ['sheet', 'other'],
    namespaces: [],
    ...extra,
  };
}

// /api/search-count answers each pending state's count; the test says how many.
function counts(answer: (url: URL) => number) {
  const asked: URL[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/api/search-count') return new Response('not found', { status: 404 });
      asked.push(url);
      return Response.json({ total: answer(url) });
    })
  );
  return asked;
}

beforeEach(() => {
  navigation.goto = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const countLine = () => screen.getByTestId('search-count');
const filterButton = (n: number) => screen.getByRole('button', { name: n ? `Filter · ${n}` : 'Filter', exact: true });
const sheet = () => screen.getByRole('dialog', { name: 'Filter' });

describe('the search page’s filter row, on a wide window', () => {
  beforeEach(async () => {
    await screen.viewport(1280, 900);
  });

  it('writes a picked class, its exact match and an added tag to the URL', async () => {
    const view = render(SearchPage, { data: data({}, 2) });
    const filters = screen.getByRole('group', { name: 'Filters' });

    await filters.getByRole('combobox', { name: 'Class' }).click();
    await screen.getByRole('option', { name: /Concept/ }).click();
    await vi.waitFor(() => expect(navigation.goto).toEqual(['/search?class=concept']));

    await view.rerender({ data: data({ class: 'concept' }, 2, { classLabel: 'Concept' }) });
    await filters.getByRole('combobox', { name: 'Which classes match' }).click();
    await screen.getByRole('option', { name: 'Exactly this class' }).click();
    await vi.waitFor(() => expect(navigation.goto.at(-1)).toBe('/search?class=concept&exact=1'));

    await view.rerender({ data: data({}, 2) });
    await filters.getByRole('combobox', { name: 'Tags' }).fill('ai');
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(navigation.goto.at(-1)).toBe('/search?tag=ai'));
  });

  it('offers Relevance only with a term, and picking Title A–Z writes sort=title', async () => {
    const view = render(SearchPage, { data: data({}, 2) });
    const sort = screen.getByRole('group', { name: 'Filters' }).getByRole('combobox', { name: 'Sort' });
    await expect.element(sort).toHaveTextContent('Last updated');
    await sort.click();
    await expect.element(screen.getByRole('option', { name: 'Title A–Z' })).toBeVisible();
    await expect.element(screen.getByRole('option', { name: 'Relevance' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await view.rerender({ data: data({ q: 'graph' }, 2) });
    await expect.element(sort).toHaveTextContent('Relevance');
    await sort.click();
    await expect.element(screen.getByRole('option', { name: 'Relevance' })).toBeVisible();
    await screen.getByRole('option', { name: 'Title A–Z' }).click();
    await vi.waitFor(() => expect(navigation.goto).toEqual(['/search?q=graph&sort=title']));
  });
});

describe('the search page’s compact filters, on a phone', () => {
  beforeEach(async () => {
    await screen.viewport(390, 844);
  });

  it('counts the sheet’s pending filters live, leaves the list and the URL alone, and applies them all on confirm', async () => {
    const asked = counts((url) => (url.searchParams.getAll('tag').length === 2 ? 4 : url.searchParams.get('type') === 'page' ? 3 : 4));
    const view = render(SearchPage, { data: data({ tags: ['sheet'] }, 4) });
    await expect.element(countLine()).toHaveTextContent('4 results · tagged sheet');

    await filterButton(1).click();
    await expect.element(sheet()).toBeVisible();
    await expect.element(sheet().getByRole('button', { name: 'Show 4 results' })).toBeVisible();

    // A type, counted before it applies; the list and the URL stay.
    await sheet().getByRole('radio', { name: 'Page', exact: true }).click();
    await expect.element(sheet().getByRole('button', { name: 'Show 3 results' })).toBeVisible();
    expect(asked.at(-1)?.search).toBe('?tag=sheet&type=page');
    expect(navigation.goto).toEqual([]);
    await expect.element(countLine()).toHaveTextContent('4 results · tagged sheet');

    // A second tag, counted too.
    const entry = sheet().getByLabelText('Tags', { exact: true });
    await entry.fill('other');
    await userEvent.keyboard('{Enter}');
    await expect.element(sheet().getByRole('button', { name: 'Show 4 results' })).toBeVisible();
    expect(asked.at(-1)?.search).toBe('?tag=sheet&tag=other&type=page');
    expect(navigation.goto).toEqual([]);

    await sheet().getByRole('button', { name: 'Show 4 results' }).click();
    await expect.element(sheet()).not.toBeInTheDocument();
    expect(navigation.goto).toEqual(['/search?tag=sheet&tag=other&type=page']);

    await view.rerender({ data: data({ tags: ['sheet', 'other'], type: 'page' }, 4) });
    await expect.element(countLine()).toHaveTextContent('4 pages · tagged sheet or other');
    await expect.element(screen.getByRole('list', { name: 'Active filters' }).getByText('Page', { exact: true })).toBeVisible();
    await expect.element(filterButton(3)).toBeVisible();
  });

  it('drops the sheet’s changes when it closes without confirming, and opens again on the applied state', async () => {
    counts(() => 0);
    render(SearchPage, { data: data({ tags: ['sheet'] }, 1) });
    await filterButton(1).click();
    await sheet().getByRole('radio', { name: 'Document', exact: true }).click();
    await expect.element(sheet().getByRole('radio', { name: 'Document', exact: true })).toHaveAttribute('data-state', 'on');
    await userEvent.keyboard('{Escape}');
    await expect.element(sheet()).not.toBeInTheDocument();
    expect(navigation.goto).toEqual([]);
    await expect.element(filterButton(1)).toBeVisible();

    await filterButton(1).click();
    await expect.element(sheet().getByRole('radio', { name: 'All types' })).toHaveAttribute('data-state', 'on');
  });

  it('clears every filter with Reset and keeps the term', async () => {
    counts(() => 1);
    const view = render(SearchPage, { data: data({ q: 'zqterm', tags: ['sheet'], type: 'page' }, 1) });
    await filterButton(2).click();
    await sheet().getByRole('button', { name: 'Reset' }).click();
    await sheet().getByRole('button', { name: /^Show \d+ results?$/ }).click();
    expect(navigation.goto).toEqual(['/search?q=zqterm']);

    await view.rerender({ data: data({ q: 'zqterm' }, 1) });
    await expect.element(filterButton(0)).toBeVisible();
  });

  it('applies a new sort and layout at once from the compact row’s buttons, and names the current one', async () => {
    const view = render(SearchPage, { data: data({ tags: ['sheet'] }, 1) });
    await screen.getByRole('button', { name: 'Sort: Last updated' }).click();
    await screen.getByRole('dialog', { name: 'Sort' }).getByRole('button', { name: 'Title A–Z' }).click();
    expect(navigation.goto).toEqual(['/search?tag=sheet&sort=title']);
    await view.rerender({ data: data({ tags: ['sheet'], sort: 'title' }, 1) });
    await expect.element(screen.getByRole('button', { name: 'Sort: Title A–Z' })).toBeVisible();

    await screen.getByRole('button', { name: 'Show as grid' }).click();
    expect(navigation.goto.at(-1)).toBe('/search?tag=sheet&sort=title&view=grid');
    await view.rerender({ data: data({ tags: ['sheet'], sort: 'title', view: 'grid' }, 1) });
    await expect.element(screen.getByRole('button', { name: 'Show as list' })).toBeVisible();
  });
});
