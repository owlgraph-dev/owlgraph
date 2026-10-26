// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen } from '@vitest/browser/context';
import { page } from '$app/state';
import AppBar from './AppBar.svelte';
import { createDialog } from './appbar/createDialog.svelte';
import type { Role } from '$lib/features/auth';

// The Create button is UX only: the routes refuse the creates themselves
// (create.http.test.ts).

const user = (role: Role) => ({ id: `u-${role}`, email: `${role}@example.test`, name: '', role, avatarVersion: null });

const appbar = () => screen.getByRole('navigation', { name: 'Primary' });

beforeEach(async () => {
  // On a phone Create is in the menu sheet.
  await screen.viewport(1280, 800);
});

afterEach(() => {
  page.data = {};
  createDialog.open = false;
});

describe('the app bar’s Create button', () => {
  it('is not drawn without a signed-in user, and is for an editor', async () => {
    const { rerender } = render(AppBar, { user: null });
    await expect.element(appbar()).toBeVisible();
    await expect.element(appbar().getByRole('button', { name: 'Create' })).not.toBeInTheDocument();

    await rerender({ user: user('editor') });
    await expect.element(appbar().getByRole('button', { name: 'Create' })).toBeVisible();
  });

  it('is not drawn for a viewer', async () => {
    render(AppBar, { user: user('viewer') });
    await expect.element(appbar()).toBeVisible();
    await expect.element(appbar().getByRole('button', { name: 'Account' })).toBeVisible();
    await expect.element(appbar().getByRole('button', { name: 'Create' })).not.toBeInTheDocument();
  });
});
