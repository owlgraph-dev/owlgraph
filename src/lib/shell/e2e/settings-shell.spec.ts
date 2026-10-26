// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';

test.describe('settings — phone viewport', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 375, height: 667 } });

  test('the sidebar collapses into a sheet that navigates and closes', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('aside.settings-side')).toBeHidden();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await page.getByRole('button', { name: 'Sections' }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(sheet).toBeHidden();
  });
});
