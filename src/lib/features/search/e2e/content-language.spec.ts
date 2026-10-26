// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { unique, createPage } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';

const text = (s: string) => ({ type: 'paragraph', attrs: { blockId: unique('b').slug }, content: [txt(s)] });

test.describe('content language', () => {
  test.use({ storageState: authState('editorA') });

  test('the properties dialog sets the content language; the editor canvas and the read view follow', async ({ page }) => {
    const created = await createPage(page.request, { title: unique('E2E Locale field').name, doc: doc(text('Ein deutscher Absatz')) });
    await page.goto(`/${created.slug}/edit`);
    await page.getByRole('button', { name: 'Page properties' }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('combobox', { name: 'Content language' });
    await expect(field).toHaveText(/English/); // the site default, for a new page
    await field.click();
    await page.getByRole('option', { name: 'Deutsch', exact: true }).click();
    await expect(field).toHaveText(/Deutsch/);
    await expect(page.locator('.editor[lang="de"]')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Done' }).click();

    await page.goto(`/${created.slug}`);
    await expect(page.locator('article.prose')).toHaveAttribute('lang', 'de');
  });
});
