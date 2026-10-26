// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import { CollectionNodeView } from '$lib/features/collections/components';
import type { CollectionMember } from '$lib/features/collections';
import { PLUGIN_ROUTES } from '../blocks/routes';
import type { ListingView } from '../server/listing.server';
import type { CollectionBodyData } from '../server/nodeView.server';

// The core's collection body around the plugin's (docs/architecture/plugins.md, "Node
// views"), the plugin's routes a stand-in; invalidateAll is played back by
// re-rendering with the members the load would give next.

const navigation = vi.hoisted(() => ({ invalidated: 0, onInvalidate: async () => {} }));
vi.mock('$app/navigation', async (original) => ({
  ...(await original<typeof import('$app/navigation')>()),
  invalidateAll: async () => {
    navigation.invalidated++;
    await navigation.onInvalidate();
  },
}));

const COLLECTION = { id: 'c0000000-0000-4000-8000-0000000000d1', title: 'Team', href: '/team' };
const DOCUMENT = { id: 'd0000000-0000-4000-8000-0000000000d2', href: '/bericht-pdf' };

const LISTING: ListingView = {
  state: 'ready',
  via: 'node',
  collection: { title: 'Team', href: COLLECTION.href, count: 3, checkedAt: '2026-10-20T08:00:00.000Z', own: false },
  root: 'Team',
  path: '',
  entries: [
    { path: 'a.txt', name: 'a.txt', folder: false, size: 1, mime: 'text/plain', modified: null, fileid: '531', linked: null },
    { path: 'b.txt', name: 'b.txt', folder: false, size: 1, mime: 'text/plain', modified: null, fileid: '532', linked: null },
    { path: 'Bericht.pdf', name: 'Bericht.pdf', folder: false, size: 12, mime: 'application/pdf', modified: null, fileid: '533', linked: null },
  ],
  total: 3,
  offset: 0,
  checkedAt: '2026-10-20T08:00:00.000Z',
};

const BODY: CollectionBodyData = { view: LISTING, renderedAt: Date.now(), base: PLUGIN_ROUTES, readAs: null };

/** As the route's load describes a Nextcloud collection. */
const source = { pluginId: 'nextcloud', label: 'Nextcloud', readsVia: 'Share', detail: '3 entries', actions: [], data: BODY };

const linkedDocument: CollectionMember = {
  id: DOCUMENT.id,
  type: 'document',
  title: 'Bericht.pdf',
  url: DOCUMENT.href,
  position: 1,
  label: null,
  labelText: null,
  plugin: 'nextcloud',
  pluginLabel: 'Nextcloud',
};

type Call = { method: string; url: string; body: unknown };

function api() {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { method: init?.method ?? 'GET', url: String(input), body: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      calls.push(call);
      if (call.url.startsWith(`${PLUGIN_ROUTES}/listing?`)) return Response.json(LISTING);
      if (call.method === 'POST' && call.url === `${PLUGIN_ROUTES}/documents`) return Response.json({ document: { ...DOCUMENT, title: 'Bericht.pdf' } }, { status: 201 });
      return new Response('not found', { status: 404 });
    })
  );
  return calls;
}

beforeEach(() => {
  navigation.invalidated = 0;
  navigation.onInvalidate = async () => {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a Nextcloud collection's own page", () => {
  it('lets a writer make a document of a file, and counts it among the linked documents', async () => {
    const calls = api();
    const view = render(CollectionNodeView, { collection: COLLECTION, members: [], source, canWrite: true });
    navigation.onInvalidate = () => view.rerender({ members: [linkedDocument] });

    await expect.element(screen.getByRole('tab', { name: 'Contents' })).toHaveAttribute('aria-selected', 'true');
    await expect.element(screen.getByRole('tab', { name: 'Linked documents (0)' })).toBeVisible();
    const row = screen.getByRole('tabpanel').getByRole('listitem').filter({ hasText: 'Bericht.pdf' });
    await row.hover();
    await row.getByRole('button', { name: 'Create as document' }).click();

    await expect.element(row.getByText('Document', { exact: true })).toBeVisible();
    await expect.element(row.getByRole('link', { name: 'Open document Bericht.pdf' })).toHaveAttribute('href', DOCUMENT.href);
    await expect.element(row.getByRole('button', { name: 'Create as document' })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toEqual([
      { method: 'POST', url: `${PLUGIN_ROUTES}/documents`, body: { collectionId: COLLECTION.id, path: 'Bericht.pdf', fileid: '533' } },
    ]);
    expect(navigation.invalidated).toBe(1);

    const linked = screen.getByRole('tab', { name: 'Linked documents (1)' });
    await expect.element(linked).toBeVisible();
    await linked.click();
    const rows = screen.getByRole('tabpanel').getByRole('listitem');
    await vi.waitFor(() => expect(rows.elements()).toHaveLength(1));
    await expect.element(rows).toHaveTextContent('Bericht.pdf');
    await expect.element(rows).toHaveTextContent('Document · Nextcloud');
  });

  it('offers a reader who may not write no way to make a document', async () => {
    api();
    render(CollectionNodeView, { collection: COLLECTION, members: [], source, canWrite: false });
    const row = screen.getByRole('tabpanel').getByRole('listitem').filter({ hasText: 'Bericht.pdf' });
    await expect.element(row).toBeVisible();
    await expect.element(row.getByRole('button', { name: 'Create as document' })).not.toBeInTheDocument();
  });
});
