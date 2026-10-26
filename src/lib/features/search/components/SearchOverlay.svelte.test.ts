// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { get } from 'svelte/store';
import { searchOverlayOpen } from '../searchOverlayStore';
import SearchOverlay from './SearchOverlay.svelte';

const navigation = vi.hoisted(() => ({ goto: [] as string[] }));
vi.mock('$app/navigation', async (original) => ({
  ...(await original<typeof import('$app/navigation')>()),
  goto: async (url: string | URL) => {
    navigation.goto.push(String(url));
  },
}));

const HIT = { id: 'p-1', type: 'page', title: 'E2E Public Page', url: '/e2e-public-page', snippet: '' };

function api() {
  const asked: { text: string; types: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== '/api/graphql') return new Response('not found', { status: 404 });
      const { variables } = JSON.parse(String(init?.body));
      asked.push(variables);
      return Response.json({ data: { search: String(variables.text).toLowerCase().includes('public') ? [HIT] : [] } });
    })
  );
  return asked;
}

beforeEach(() => {
  navigation.goto = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  searchOverlayOpen.set(false);
});

describe('the search overlay’s results', () => {
  it('closes the overlay and goes to a result’s address when it is clicked', async () => {
    const asked = api();
    render(SearchOverlay);
    searchOverlayOpen.set(true);
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    await expect.element(dialog).toBeVisible();

    await userEvent.type(dialog.getByPlaceholder('Search…'), 'Public');
    const result = dialog.getByRole('option').filter({ hasText: HIT.title });
    await expect.element(result).toBeVisible();
    expect(asked.at(-1)).toEqual({ text: 'Public', types: null });
    await result.click();

    await expect.element(dialog).not.toBeInTheDocument();
    expect(get(searchOverlayOpen)).toBe(false);
    expect(navigation.goto).toEqual([HIT.url]);
  });
});
