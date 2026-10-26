// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { page } from '$app/state';
import NodePickerPanel from './NodePickerPanel.svelte';

const NAMESPACE = { id: 'ns-1', name: 'Default', slug: null };

function api() {
  const calls: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (url.startsWith('/api/node-search')) return Response.json({ results: [], more: false, exact: [] });
      if (url === '/api/pages' && init?.method === 'POST') return Response.json({ id: 'page-1', slug: 'field-notes', namespaceSlug: null });
      return new Response('not found', { status: 404 });
    })
  );
  return calls;
}

function picker(onPick = vi.fn()) {
  render(NodePickerPanel, {
    title: 'Link a page',
    placeholder: 'Search pages…',
    types: ['page'],
    rowAction: 'Link',
    create: { types: ['page'], namespace: NAMESPACE },
    onPick,
  });
  return onPick;
}

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the node picker’s create row', () => {
  it('offers a term nobody’s title is as a new page, makes it in the consumer’s namespace and picks it', async () => {
    page.data = { user: { id: 'u-1', role: 'editor' } };
    const calls = api();
    const onPick = picker();

    await userEvent.type(screen.getByPlaceholder('Search pages…'), 'Field notes');
    const row = screen.getByRole('option', { name: /New page “Field notes”/ });
    await expect.element(row).toBeVisible();
    await row.click();

    await vi.waitFor(() => expect(onPick).toHaveBeenCalledOnce());
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ type: 'page', id: 'page-1', title: 'Field notes', slug: 'field-notes', href: '/field-notes' }));
    expect(calls.find((c) => c.url === '/api/pages')?.body).toEqual({ namespaceId: NAMESPACE.id, title: 'Field notes' });
  });

  it('offers no new page to a viewer, who may not make one', async () => {
    page.data = { user: { id: 'u-2', role: 'viewer' } };
    api();
    picker();

    await userEvent.type(screen.getByPlaceholder('Search pages…'), 'Field notes');
    await expect.element(screen.getByText('No title contains “Field notes”.')).toBeVisible();
    await expect.element(screen.getByRole('option', { name: /New page/ })).not.toBeInTheDocument();
  });
});
