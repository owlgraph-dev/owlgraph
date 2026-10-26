// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import { page } from '$app/state';
import HomePage from './+page.svelte';
import AppBar from '$lib/shell/AppBar.svelte';
import { createDialog } from '$lib/shell/appbar/createDialog.svelte';
import type { PageData } from './$types';

// Beside the app bar, which hosts the shared Create dialog, as the root layout draws them.

const ADMIN = { id: 'u-admin', email: 'admin@example.test', name: 'Admin', role: 'admin' as const, avatarVersion: null };

// The page's own share of its data; the root layout's is not read here.
const data = {
  welcome: false,
  pages: [{ id: 'p-1', title: 'Field notes', slug: 'field-notes', namespace_slug: null }],
  canCreate: true,
  canSetHome: true,
} as unknown as PageData;

beforeEach(async () => {
  await screen.viewport(1280, 800);
});

afterEach(() => {
  page.data = {};
  createDialog.open = false;
});

describe('the empty home page, for an admin', () => {
  it('asks for a home page, lists the pages, and its Create page opens the shared Create dialog', async () => {
    render(AppBar, { user: ADMIN });
    render(HomePage, { data });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'No home page yet' })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Choose home page' })).toHaveAttribute('href', '/settings/home');
    await expect.element(screen.getByRole('heading', { level: 2, name: 'Pages' })).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Field notes' })).toHaveAttribute('href', '/field-notes');

    const dialog = screen.getByRole('dialog', { name: 'Create' });
    await expect.element(dialog).not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Create page' }).click();
    await expect.element(dialog).toBeVisible();
    expect(createDialog.open).toBe(true);
  });
});
