// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import TreeBrowser from './TreeBrowser.svelte';
import { PLUGIN_ROUTES } from './routes';
import type { TreeSource } from './tree';

// The plugin's routes are a stand-in, answering as own.server.ts and
// collections.server.ts do while off.

afterEach(() => {
  vi.unstubAllGlobals();
});

function turnedOff() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith(`${PLUGIN_ROUTES}/own/listing?`)) return Response.json({ state: 'unavailable', reason: 'disabled', path: '', folder: null, entries: [], total: 0, offset: 0 });
      if (url.startsWith(`${PLUGIN_ROUTES}/collections?`)) {
        return Response.json({ collections: [{ id: 'c0000000-0000-4000-8000-0000000000b1', title: 'Unterlagen', href: '/unterlagen', name: '', status: 'disabled', own: false }], reason: 'disabled' });
      }
      return new Response('not found', { status: 404 });
    })
  );
}

const browser = (source: TreeSource) =>
  render(TreeBrowser, { open: true, source, select: 'folder', title: 'Choose a folder', description: 'Where to start.', chooseLabel: 'Choose', onOpenChange: vi.fn(), onChoose: vi.fn() });

describe('the tree browser while the plugin is turned off', () => {
  it.each([
    ['the editor’s own Nextcloud', { kind: 'own' } as const],
    ['the plugin’s collections', { kind: 'collection', collectionId: null } as const],
  ])('says so at once over %s, and nothing can be chosen', async (_, source) => {
    turnedOff();
    browser(source);

    const dialog = screen.getByRole('dialog', { name: 'Choose a folder' });
    await expect.element(dialog.getByText('The Nextcloud integration is turned off.')).toBeVisible();
    await expect.element(dialog.getByText('Connect your Nextcloud account to choose from it.')).not.toBeInTheDocument();
    await expect.element(dialog.getByRole('combobox', { name: 'Collection' })).not.toBeInTheDocument();
    await expect.element(dialog.getByRole('button', { name: 'Choose', exact: true })).toBeDisabled();
  });
});
