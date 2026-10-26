// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { createRawSnippet } from 'svelte';
import { page } from '$app/state';
import Layout from './+layout.svelte';
import { SETTINGS_TREE } from '$lib/shell/settings/tree';
import { requiredActions } from '$lib/shell/settings/treeModel';
import type { LayoutData } from './$types';

// At a desktop width, since below the breakpoint the nav moves into a sheet;
// for an admin, who holds every section's action.

const navigation = vi.hoisted(() => ({ goto: [] as string[] }));
vi.mock('$app/navigation', async (original) => ({
  ...(await original<typeof import('$app/navigation')>()),
  goto: async (url: string | URL) => {
    navigation.goto.push(String(url));
  },
}));

const section = createRawSnippet(() => ({ render: () => '<p>The section</p>' }));

// The address the router leaves the page at.
function at(pathname: string) {
  page.url = new URL(pathname, 'http://localhost') as typeof page.url;
}

function settings(pathname: string) {
  at(pathname);
  render(Layout, { data: { permissions: requiredActions(SETTINGS_TREE) } as unknown as LayoutData, children: section });
  return screen.getByRole('navigation', { name: 'Settings sections' });
}

beforeEach(async () => {
  navigation.goto = [];
  await screen.viewport(1280, 800);
});

afterEach(() => {
  at('/');
});

describe('the settings sidebar', () => {
  it('lists the four schema areas as one Semantic schema group, the current one marked as the current page', async () => {
    const nav = settings('/settings/schema/properties');
    const schema = nav.getByRole('list', { name: 'Semantic schema' });
    await expect.element(schema).toBeVisible();
    expect(schema.getByRole('link').elements().map((a) => a.textContent?.trim())).toEqual(['Properties', 'Property groups', 'Relationship types', 'Classes']);
    await expect.element(nav.getByRole('link', { name: 'Properties', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect.element(nav.getByRole('link', { name: 'Classes', exact: true })).not.toHaveAttribute('aria-current');
    await expect.element(nav.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute('href', '/settings/schema/classes');

    // On the Classes section, Classes is the one marked.
    at('/settings/schema/classes');
    await expect.element(nav.getByRole('link', { name: 'Classes', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect.element(nav.getByRole('link', { name: 'Properties', exact: true })).not.toHaveAttribute('aria-current');
  });

  it('finds a schema area by a word of its name, and Enter opens it', async () => {
    const nav = settings('/settings/schema/properties');
    const search = nav.getByRole('searchbox', { name: 'Search settings …' });
    await search.fill('groups');
    // A hit is named "<group> <section>", unlike the sidebar's own link.
    const hit = nav.getByRole('link', { name: /Semantic schema.*Property groups/ });
    await expect.element(hit).toBeVisible();
    await expect.element(hit).toHaveAttribute('href', '/settings/schema/groups');
    await userEvent.keyboard('{Enter}');
    await vi.waitFor(() => expect(navigation.goto).toEqual(['/settings/schema/groups']));
    await expect.element(search).toHaveValue('');
  });
});
