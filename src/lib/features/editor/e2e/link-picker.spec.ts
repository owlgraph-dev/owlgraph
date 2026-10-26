// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// docs/architecture/search.md, "The node picker".
import { test, expect } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, unique } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { horizontalOverflow } from '$tests/e2e/responsive';
import { db } from '../../../platform/db.server';

test.describe('the link picker', () => {
  test.use({ storageState: authState('editorA') });

  test('links the selected text to a page found by its title, opens on recent nodes, and gives the caret back on Escape', async ({ page }) => {
    const target = await createPage(page.request, { visibility: null, title: unique('Link target').name });
    const targetTitle = (await db<{ title: string }[]>`select title from nodes where id = ${target.id}`)[0].title;
    const { slug } = await createPage(page.request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Hello world')] }) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Hello world').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');

    await page.getByRole('button', { name: 'Link', exact: true }).click();
    const field = page.getByPlaceholder('Search pages & documents…');
    await expect(field).toBeFocused();
    await expect(page.getByText('Recent', { exact: true })).toBeVisible();
    await expect(page.getByRole('listbox', { name: 'Recent' }).getByRole('option').first()).toBeVisible();

    await field.fill(targetTitle);
    await page.getByRole('option', { name: new RegExp(`^${targetTitle}`) }).click();
    await expect(field).toBeHidden();
    await expect(page.locator(`.ProseMirror a[data-page-id="${target.id}"]`)).toHaveText('Hello world');

    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await field.fill('nothing like it');
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
    await expect(page.locator('.ProseMirror')).toBeFocused();
  });

  test("makes the page it is asked for, in the page's namespace, and links to it", async ({ page }) => {
    const title = unique('Made from a link').name;
    const { slug } = await createPage(page.request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Before ')] }) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Before').click();
    await page.keyboard.press('End');

    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await page.getByPlaceholder('Search pages & documents…').fill(title);
    const make = page.getByRole('option', { name: /^New page “/ });
    await expect(make).toContainText(`New page “${title}”`);
    await make.click();
    await expect(page.getByPlaceholder('Search pages & documents…')).toBeHidden();
    const made = async () =>
      (await db<{ id: string; is_default: boolean }[]>`
        select n.id, ns.is_default from nodes n join namespaces ns on ns.id = n.namespace_id where n.title = ${title} and n.type = 'page'`)[0];
    await expect.poll(made).toMatchObject({ is_default: true });
    await expect(page.locator(`.ProseMirror a[data-page-id="${(await made()).id}"]`)).toHaveText(title);
  });
});

test.describe('the link picker on a phone', () => {
  test.use({ storageState: authState('editorA'), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('is a sheet of its own that finds a page and links the selected text', async ({ page }) => {
    const target = await createPage(page.request, { visibility: null, title: unique('Phone target').name });
    const targetTitle = (await db<{ title: string }[]>`select title from nodes where id = ${target.id}`)[0].title;
    const { slug } = await createPage(page.request, { visibility: null, doc: doc({ type: 'paragraph', content: [txt('Tap here')] }) });
    await page.goto(`/${slug}/edit`);
    await page.getByText('Tap here').tap();
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Home');
    await page.getByRole('button', { name: 'Link', exact: true }).tap();
    const sheet = page.getByRole('dialog', { name: 'Link to a page or document' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('combobox').fill(targetTitle);
    const option = sheet.getByRole('option', { name: new RegExp(`^${targetTitle}`) });
    await expect(option).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    await option.tap();
    await expect(sheet).toBeHidden();
    await expect(page.locator(`.ProseMirror a[data-page-id="${target.id}"]`)).toHaveText('Tap here');
  });
});
