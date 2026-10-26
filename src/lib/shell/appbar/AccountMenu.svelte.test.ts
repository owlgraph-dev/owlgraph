// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, type Locator } from '@vitest/browser/context';
import AccountMenu from './AccountMenu.svelte';
import { canEdit, type Role } from '$lib/features/auth';

// At a desktop width: the phone's menu is a sheet. The open state is held as
// the app bar holds it.

const user = (role: Role) => ({ id: `u-${role}`, email: `${role}@example.test`, name: `${role} person`, role, avatarVersion: null });

function accountMenu(role: Role) {
  const signedIn = user(role);
  const view = render(AccountMenu, {
    user: signedIn,
    navEntries: [],
    canEdit: canEdit(signedIn),
    open: false,
    onOpenChange: (open: boolean) => void view.rerender({ open }),
    onCreateClick: vi.fn(),
  });
  return view;
}

async function open() {
  await screen.getByRole('button', { name: 'Account' }).click();
  const menu = screen.getByRole('menu', { name: 'Menu' });
  await expect.element(menu).toBeVisible();
  return menu;
}

const itemTexts = (menu: Locator) => menu.getByRole('menuitem').elements().map((el) => el.textContent?.trim());

beforeEach(async () => {
  await screen.viewport(1280, 800);
});

describe('the account menu', () => {
  it('is an identity header with the Admin badge, then exactly Profile, Settings and Sign out, with no language picker', async () => {
    accountMenu('admin');
    const menu = await open();

    await expect.element(menu.getByText('admin@example.test')).toBeVisible();
    await expect.element(menu.getByText('Admin', { exact: true })).toBeVisible();
    expect(itemTexts(menu)).toEqual(['Profile', 'Settings', 'Sign out']);
    await expect.element(menu.getByRole('combobox', { name: 'Language' })).not.toBeInTheDocument();
  });

  it('shows an editor the Editor badge and the same Profile, Settings and Sign out', async () => {
    accountMenu('editor');
    const menu = await open();

    await expect.element(menu.getByText('Editor', { exact: true })).toBeVisible();
    expect(itemTexts(menu)).toEqual(['Profile', 'Settings', 'Sign out']);
  });
});
