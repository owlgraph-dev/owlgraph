// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import { page } from '$app/state';
import { DesktopEditor } from '$lib/features/editor/components';

// The page editor is the smallest surface the Insert menu is drawn in
// (docs/architecture/blocks/node-embeds.md, "One family in the editor"); nothing it asks the server matters here.

const DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

function editor(enabledPlugins: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('not found', { status: 404 }))
  );
  return render(DesktopEditor, {
    doc: DOC,
    pageId: 'p0000000-0000-4000-8000-0000000000b1',
    onSave: async () => ({ ok: true }),
    pages: [],
    documents: [],
    enabledPlugins,
    title: 'Host page',
    slug: 'host-page',
    namespaceSlug: null,
    tags: [],
    manualProperties: [],
    locale: 'en',
    visibility: null,
    namespaceAccessLevel: 'public',
    namespaceId: 'ns-default',
    namespaces: [{ id: 'ns-default', name: 'Default', slug: null, isDefault: true }],
  });
}

/** By their text, which starts with the icon's. */
async function itemsOf(group: string): Promise<string[]> {
  const items = screen.getByRole('group', { name: group }).getByRole('menuitem');
  await expect.element(items.first()).toBeVisible();
  return items.elements().map((e) => e.textContent?.trim() ?? '');
}

async function openInsert() {
  await screen.getByRole('button', { name: 'Insert', exact: true }).click();
  await expect.element(screen.getByRole('menu')).toBeVisible();
}

afterEach(() => {
  vi.unstubAllGlobals();
  page.data = {};
});

describe('the Nextcloud blocks in the embedding family', () => {
  it('are listed under Collection and Document beside the core’s kinds while the plugin is on', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    editor(['nextcloud']);
    await openInsert();

    expect(await itemsOf('Collection')).toEqual([expect.stringMatching(/Curated collection$/), expect.stringMatching(/Nextcloud folder$/)]);
    expect(await itemsOf('Document')).toEqual([expect.stringMatching(/File or link$/), expect.stringMatching(/Nextcloud file$/)]);
    await expect.element(screen.getByRole('group', { name: 'Integrations' })).not.toBeInTheDocument();
  });

  it('are not listed at all while the plugin is off', async () => {
    page.data = { user: { id: 'u-admin', role: 'admin' } };
    editor([]);
    await openInsert();

    expect(await itemsOf('Collection')).toEqual([expect.stringMatching(/Curated collection$/)]);
    expect(await itemsOf('Document')).toEqual([expect.stringMatching(/File or link$/)]);
    await expect.element(screen.getByRole('group', { name: 'Integrations' })).not.toBeInTheDocument();
  });
});
