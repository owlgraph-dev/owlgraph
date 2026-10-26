// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, formAction, unique } from '$tests/e2e/api';
import { doc, para, cell } from '$tests/e2e/doc';
import { db } from '../../../platform/db.server';
import { blockSettings } from '$tests/e2e/editor';

const TWO = { desktop: [1, 1], tablet: [1, 1], phone: [1] };

/** A page already on a layout: its values copied, its id and label recorded, content in both columns. */
const pageOn = (preset: string, presetLabel: string) => ({
  type: 'doc',
  attrs: { layout: { mode: 'columns', template: TWO, preset, presetLabel, sectionDefaults: { width: 'wide' } } },
  content: [{ type: 'pageSection', attrs: { blockId: 's1', width: 'wide' }, content: [cell(para('left')), cell(para('right'))] }],
});

/** Creates a two-column page layout; returns the id the server gave it (derived from the label). */
async function createPreset(page: Page, label: string): Promise<string> {
  const result = await formAction(page.request, '/settings/page-layouts?/createPreset', {
    'label.en': label,
    description: '',
    template: JSON.stringify(TWO),
    gap: '{}',
    sectionDefaults: JSON.stringify({ width: 'wide' }),
  });
  expect(result.type).toBe('success');
  const [row] = await db<{ id: string }[]>`select id from page_layout_presets where scope_kind = 'site' and label ->> 'en' = ${label}`;
  return row.id;
}

async function selectPage(page: Page, blockText: string) {
  await page.getByText(blockText, { exact: true }).first().click();
  const breadcrumb = page.getByRole('navigation', { name: 'Block ancestry' });
  for (let i = 0; i < 5; i++) {
    const pageCrumb = breadcrumb.getByRole('button', { name: 'Page', exact: true });
    if ((await pageCrumb.count()) && (await pageCrumb.getAttribute('aria-current')) === 'true') return;
    await page.keyboard.press('Escape');
  }
  await expect(breadcrumb.getByRole('button', { name: 'Page', exact: true })).toHaveAttribute('aria-current', 'true');
}

async function openSettings(page: Page) {
  await page.goto('/settings/page-layouts');
}

const picker = (page: Page) => blockSettings(page).getByRole('combobox', { name: 'Page layout' });
const cells = (page: Page) => page.locator('.page-section').first().locator('.grid-cell');
const row = (page: Page, label: string) => page.getByRole('row').filter({ hasText: label });

test.describe('page layouts', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });

  test('an admin adds a page layout, which the editor offers with its picture and applies to a flow page', async ({ page }) => {
    // A name of its own, so the test can run twice against the same seed.
    const { name } = unique('Four columns');
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'New page layout' });
    await page.getByRole('button', { name: 'New page layout' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('textbox', { name: 'Name English', exact: true }).fill(name);
    const desktop = dialog.getByRole('spinbutton', { name: 'Number of columns (Desktop)' });
    await desktop.fill('4');
    await desktop.press('Tab');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(row(page, name)).toBeVisible();

    const { slug } = await createPage(page.request, { doc: doc(para('one'), para('two')) });
    await page.goto(`/${slug}/edit`);
    await selectPage(page, 'one');
    await picker(page).click();
    const option = page.getByRole('option', { name: name });
    // Its picture, drawn from its template.
    await expect(option.locator('svg')).toHaveCount(1);
    await option.click();
    await page.getByRole('dialog', { name: 'Convert into sections?' }).getByRole('button', { name: 'Convert' }).click();
    await expect(cells(page)).toHaveCount(4);
    // The conversion puts the caret into the content: back to the page.
    await selectPage(page, 'one');
    await expect(picker(page)).toContainText(name);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 15000 });

    // Stored with its provenance: the page still names its layout after a reload.
    await page.reload();
    await selectPage(page, 'one');
    await expect(picker(page)).toContainText(name);
    await expect(blockSettings(page).getByText('customized')).toHaveCount(0);
  });

  test('editing a page layout never touches a page that uses it; the page shows it drifted and applies it again on request', async ({ page }) => {
    const { name: drift } = unique('Drift A');
    const driftId = await createPreset(page, drift);
    const { slug } = await createPage(page.request, { doc: pageOn(driftId, drift) });

    // The layout goes down to one column.
    await openSettings(page);
    const dialog = page.getByRole('dialog', { name: 'Edit page layout' });
    await row(page, drift).getByRole('button', { name: 'Edit page layout' }).click();
    await expect(dialog).toBeVisible();
    const desktop = dialog.getByRole('spinbutton', { name: 'Number of columns (Desktop)' });
    await desktop.fill('1');
    await desktop.press('Tab');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    // The page is as it was: two columns, on the page and in the editor.
    await page.goto(`/${slug}`);
    await expect(cells(page)).toHaveCount(2);
    await page.goto(`/${slug}/edit`);
    await expect(cells(page)).toHaveCount(2);
    await selectPage(page, 'left');
    const panel = blockSettings(page);
    await expect(picker(page)).toContainText(drift);
    await expect(panel.getByText('customized')).toBeVisible();

    // Applied again: its values, the merge said out loud.
    await panel.getByRole('button', { name: 'Apply the layout again' }).click();
    await expect(cells(page)).toHaveCount(1);
    // The toast, not the live region that announces it a moment later with the same words.
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText('Content from column 2 was merged into column 1 (1 sections).')).toBeVisible();
    await expect(cells(page).first()).toContainText('right');
    await expect(panel.getByText('customized')).toHaveCount(0);
  });
});
