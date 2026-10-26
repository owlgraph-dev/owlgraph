// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage } from '$tests/e2e/api';
import { blockSettings } from '$tests/e2e/editor';

function proseMirror(page: Page) {
  return page.locator('.ProseMirror');
}

// "Title" is the seeded h1 paragraph style; the run is in English.
function headingTrigger(page: Page) {
  return page.getByRole('button', { name: 'Paragraph style' });
}
const titleItem = (page: Page) => page.getByRole('menuitem', { name: /^Title\b/ });

test.describe('editor overlay focus/Escape conventions (editorA)', () => {
  test.use({ storageState: authState('editorA') });

  test('applying a heading level returns focus to the editor', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    await headingTrigger(page).click();
    await expect(titleItem(page)).toBeVisible();
    await titleItem(page).click();

    await expect(proseMirror(page)).toBeFocused();
  });

  test('closing the heading menu via Escape does not return focus to the editor', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    // Opened by keyboard: Bits UI's trigger takes no focus on pointerdown, so
    // a clicked menu would restore focus to ProseMirror on Escape, which is
    // indistinguishable from the bug this test catches.
    await headingTrigger(page).focus();
    await headingTrigger(page).press('Enter');
    await expect(titleItem(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(titleItem(page)).toBeHidden();
    await expect(proseMirror(page)).not.toBeFocused();
    await expect(headingTrigger(page)).toBeFocused();
  });

  test('Escape with no panel open steps block selection up to the parent', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    // Typing into a cell's placeholder promotes it to a paragraph.
    const insertTrigger = page.getByRole('button', { name: 'Insert', exact: true });
    const layoutItem = page.getByRole('menuitem', { name: 'Grid', exact: true });
    await insertTrigger.click();
    await expect(layoutItem).toBeVisible();
    await layoutItem.click();

    await page.locator('.grid-cell .ph-content').first().click();
    await page.keyboard.type('x');

    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await expect(breadcrumb.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');

    await proseMirror(page).click();
    await page.locator('.grid-cell p').first().click();
    // The selection chain follows the click a tick later; step up from the
    // paragraph, not from whatever the click before it selected.
    await expect(breadcrumb.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Escape');

    await expect(breadcrumb.getByRole('button', { name: 'Cell', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('Escape with a panel open only closes the panel, without also stepping up selection', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    const insertTrigger = page.getByRole('button', { name: 'Insert', exact: true });
    const layoutItem = page.getByRole('menuitem', { name: 'Grid', exact: true });
    await insertTrigger.click();
    await expect(layoutItem).toBeVisible();
    await layoutItem.click();

    await page.locator('.grid-cell .ph-content').first().click();
    await page.keyboard.type('x');
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await expect(breadcrumb.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');

    // Opened by keyboard, as in the Escape test above.
    await headingTrigger(page).focus();
    await headingTrigger(page).press('Enter');
    await expect(titleItem(page)).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(titleItem(page)).toBeHidden();
    await expect(breadcrumb.getByRole('button', { name: 'Paragraph', exact: true })).toHaveAttribute('aria-current', 'true');
  });

  test('Escape inside a block settings popover closes it without stepping selection up', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    const insertTrigger = page.getByRole('button', { name: 'Insert', exact: true });
    const layoutItem = page.getByRole('menuitem', { name: 'Grid', exact: true });
    await insertTrigger.click();
    await expect(layoutItem).toBeVisible();
    await layoutItem.click();

    await page.locator('.grid-cell .ph-content').first().click();
    await page.keyboard.type('x');
    const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
    await breadcrumb.getByRole('button', { name: 'Cell', exact: true }).click();
    await expect(breadcrumb.getByRole('button', { name: 'Cell', exact: true })).toHaveAttribute('aria-current', 'true');

    const panel = blockSettings(page);
    await panel.getByRole('button', { name: 'Background', exact: true }).click();
    await expect(page.getByTitle('#2563eb')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByTitle('#2563eb')).toBeHidden();
    await expect(breadcrumb.getByRole('button', { name: 'Cell', exact: true })).toHaveAttribute('aria-current', 'true');
  });
});

test.describe('block settings shell (editorA)', () => {
  test.use({ storageState: authState('editorA') });

  test('the tier switcher lives in the block settings panel and falls back to the toolbar when collapsed', async ({ page }) => {
    const { slug } = await createPage(page.request);
    await page.goto(`/${slug}/edit`);
    await proseMirror(page).click();

    const panel = blockSettings(page);
    const toolbar = page.getByRole('toolbar');
    await expect(panel.getByRole('radio', { name: 'Tablet preview' })).toBeVisible();
    await expect(toolbar.getByRole('radio', { name: 'Tablet preview' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Toggle block settings' }).click();
    await expect(panel).toHaveCount(0);
    await toolbar.getByRole('radio', { name: 'Tablet preview' }).click();
    await expect(page.locator('.vp-tablet')).toHaveCount(1);

    await page.getByRole('button', { name: 'Toggle block settings' }).click();
    await expect(panel.getByRole('radio', { name: 'Tablet preview' })).toHaveAttribute('aria-pressed', 'true');
    await expect(toolbar.getByRole('radio', { name: 'Tablet preview' })).toHaveCount(0);
  });
});
