// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { editorSelection } from '$tests/e2e/editor';
import { createPage } from '$tests/e2e/api';
import { txt, doc } from '$tests/e2e/doc';
import { db } from '../../../platform/db.server';

// Replaces the site's stylesheets with class rules no other page uses, so it
// needs no lock (tests/e2e/fixtures.ts). The mark stores the style's id; the
// class is looked up at render time (docs/architecture/custom-styles.md).

const SHEET = '11111111-aaaa-4aaa-8aaa-111111111111';
const INLINE = '22222222-aaaa-4aaa-8aaa-222222222222';
const BLOCK = '33333333-aaaa-4aaa-8aaa-333333333333';

async function seedStyles() {
  await db`delete from stylesheets`;
  await db`insert into stylesheets (id, scope_kind, name, position, free_css) values (${SHEET}, 'site', 'E2E sheet', 0, '')`;
  await db`
    insert into custom_styles (id, stylesheet_id, slug, label, kind, css, position) values
      (${INLINE}, ${SHEET}, 'e2e-lead', 'E2E lead', 'inline', 'font-weight: 700;', 0),
      (${BLOCK}, ${SHEET}, 'e2e-band', 'E2E band', 'block', 'padding: 1rem;', 1)`;
}

const STYLED = doc({ type: 'paragraph', content: [txt('Styled text for the mark')] });

/**
 * Confirmed on the editor's own selection: the editor settles a click's
 * selection late and can overwrite keys pressed meanwhile (tests/e2e/editor.ts).
 */
async function selectWord(page: Page) {
  const editor = page.locator('.ProseMirror');
  await expect(async () => {
    await editor.locator('p').first().click();
    await expect(editor).toBeFocused({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
  await expect(async () => {
    await page.keyboard.press('Home');
    expect(await editorSelection(editor)).toMatchObject({ text: '', atLineStart: true });
  }).toPass({ timeout: 10000 });
  await page.keyboard.down('Shift');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect.poll(async () => (await editorSelection(editor)).text).toBe('Styled');
}

async function applyStyle(page: Page, label: string) {
  await page.getByRole('button', { name: 'Text style', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
}

test.describe('custom style mark', () => {
  test.use({ storageState: authState('admin') });

  test.beforeEach(async () => {
    await seedStyles();
  });

  test.afterEach(async () => {
    // Through the database, so a failed test cannot strand a stylesheet.
    await db`delete from stylesheets`;
  });

  test('applies a style in the editor and renders it on the public page', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: STYLED });
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.ProseMirror')).toBeVisible();
    await selectWord(page);
    await applyStyle(page, 'E2E lead');

    await expect(page.locator('.ProseMirror .cs-e2e-lead')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText(/Saved|Gespeichert/)).toBeVisible({ timeout: 10000 });

    await page.goto(`/${slug}`);
    const styled = page.locator('.page-canvas .cs-e2e-lead');
    await expect(styled).toHaveCount(1);
    expect(await styled.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
  });

  test('the html block offers both kinds and inserts the class at the caret', async ({ page }) => {
    const { slug } = await createPage(page.request, { doc: STYLED });
    await page.goto(`/${slug}/edit`);
    await expect(page.locator('.ProseMirror')).toBeVisible();

    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('menuitem', { name: /HTML/i }).first().click();
    await page.locator('.html-block').first().click();
    await page.getByRole('button', { name: 'Edit block', exact: true }).click();

    const area = page.locator('.edit-textarea');
    await area.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('<p class="">hi</p>');
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');

    await page.getByRole('button', { name: 'Insert class' }).click();
    const classes = page.getByRole('listbox', { name: 'Insert class' }).getByRole('option');
    // A block-kind class is legitimate on an author's own markup.
    await expect(classes).toHaveCount(2);
    await page.locator('[data-popover-content]').getByRole('combobox').fill('E2E band');
    await expect(classes).toHaveCount(1);
    await classes.filter({ hasText: 'E2E band' }).click();
    await expect(area).toHaveValue('<p class="cs-e2e-band">hi</p>');
  });
});
