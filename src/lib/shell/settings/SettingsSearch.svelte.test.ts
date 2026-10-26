// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page as screen, userEvent } from '@vitest/browser/context';
import { goto } from '$app/navigation';
import SettingsSearch from './SettingsSearch.svelte';
import { SETTINGS_TREE } from './tree';
import { requiredActions, visibleTree } from './treeModel';

// Where the navigation lands is the e2e test's.

// Records where Enter goes; navigation itself does nothing here.
vi.mock('$app/navigation', { spy: true });

// What the layout load hands each role: an admin every action the tree gates
// on, an editor or a viewer none.
const ADMIN = requiredActions(SETTINGS_TREE);
const EDITOR_OR_VIEWER: string[] = [];

function search(permissions: string[]) {
  render(SettingsSearch, { groups: visibleTree(SETTINGS_TREE, new Set(permissions)) });
  return screen.getByRole('searchbox', { name: 'Search settings …' });
}

describe('the settings search', () => {
  it('lists Branding under Appearance for an admin’s “logo”, and Enter goes to /settings/branding', async () => {
    const box = search(ADMIN);

    await userEvent.fill(box, 'logo');
    await expect.element(screen.getByRole('link', { name: /Appearance.*Branding/ })).toBeVisible();
    await userEvent.keyboard('{Enter}');

    expect(goto).toHaveBeenCalledWith('/settings/branding');
  });

  it('finds nothing for “licence” for an editor or a viewer: the About section is not in the tree they are given', async () => {
    const box = search(EDITOR_OR_VIEWER);

    await userEvent.fill(box, 'licence');
    await expect.element(screen.getByText('No matches.')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: /About/ })).not.toBeInTheDocument();
  });

  it('finds the About section for an admin’s “licence”', async () => {
    const box = search(ADMIN);

    await userEvent.fill(box, 'licence');
    await expect.element(screen.getByRole('link', { name: /General.*About/ })).toBeVisible();
  });
});
