// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';

const WOFF2_BYTES = Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]);

test.describe('custom font family in the Typography picker (admin)', () => {
  test.use({ storageState: authState('admin') });

  test('an uploaded family appears in the font picker and applies to a paragraph', async ({ page }) => {
    await page.goto('/settings/fonts');
    const familyName = `Picker Test Font ${Date.now()}`;
    // `.first()`: the open dialog's footer carries a same-named button.
    const dialog = page.getByRole('dialog');
    await page.getByRole('button', { name: 'Add family' }).first().click();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Family name').fill(familyName);
    await dialog.getByRole('button', { name: 'Add family' }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
    const familyHeading = page.getByRole('heading', { name: familyName });
    await expect(familyHeading).toBeVisible();
    const familyCard = page.locator('.family', { has: familyHeading });

    await familyCard.locator('input[type="file"]').setInputFiles({ name: 'v.woff2', mimeType: 'font/woff2', buffer: WOFF2_BYTES });
    await familyCard.getByRole('button', { name: 'Add variant' }).click();
    await expect(familyCard.getByText('400 · Normal')).toBeVisible();

    // A caret-only selection scopes the toolbar to the block.
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    const proseMirror = page.locator('.ProseMirror');
    await proseMirror.click();
    // A blank page starts on a placeholder, which takes no typography: typing makes it a paragraph.
    await page.keyboard.type('Hello world');

    const familyTrigger = page.getByRole('button', { name: 'Font family' });
    // Exact: the toolbar's "Font size" Combobox shares the combobox role.
    const select = page.getByRole('combobox', { name: 'Font', exact: true });
    await familyTrigger.click();
    await expect(select).toBeVisible();

    // Opened with Enter: a click on a Select nested in the toolbar's Popover
    // races the Popover's outside-click check against the portal mount.
    await select.focus();
    await select.press('Enter');
    const option = page.getByRole('option', { name: familyName });
    await expect(option).toBeVisible();
    await option.click();

    // The paragraph itself is styled, not just the Select's display value.
    await expect(async () => {
      const html = await proseMirror.innerHTML();
      expect(html).toContain(familyName);
    }).toPass({ timeout: 5000 });
  });
});
