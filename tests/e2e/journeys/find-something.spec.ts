// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures';
import { authState } from '../seed-data';
import { classId, createClass, createDocument, createPage, deleteClass, patchPage, unique } from '../api';
import { db } from '../../../src/lib/platform/db.server';

const results = (page: Page) => page.getByTestId('search-result');
const count = (page: Page) => page.getByTestId('search-count');
const titles = (page: Page) => results(page).getByRole('heading').allTextContents();

/** A Select's choice: its trigger, then the option in its portalled list. */
async function choose(page: Page, select: string, option: RegExp) {
  await page.getByRole('combobox', { name: select, exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}

// One more report than a page of results holds (24), so the list pages on.
const REPORTS = 26;

test.describe('finding something', () => {
  test.use({ storageState: authState('editorA') });

  test('Ctrl-K finds documents, the search page narrows them by class, sorts and pages them, Back returns, and a result opens', async ({ page, browser }) => {
    test.setTimeout(120_000);
    // A word the full-text index keeps as one token, in no other row's text.
    const term = `zq${Math.random().toString(36).slice(2, 8)}`;
    const cls = unique('Journey report');
    const admin = await browser.newContext({ storageState: authState('admin') });
    try {
      await createClass(admin.request, { slug: cls.slug, label: cls.name, parent: 'document' });
      const reportClass = await classId(cls.slug);
      // Two memos are documents outside the class, and two pages say the term
      // most, so they lead an unfiltered list. Every row is the editor's alone.
      const reports = Array.from({ length: REPORTS }, (_, i) => `${term} Report ${String(i).padStart(2, '0')}`);
      const memos = [`${term} Memo one`, `${term} Memo two`];
      const pages = [`${term} Handbook`, `${term} Guide`];
      await Promise.all([
        ...reports.map(async (title) => {
          const { id } = await createDocument(page.request, { title });
          expect((await page.request.patch(`/api/documents/${id}`, { data: { visibility: 'restricted', nodeClassId: reportClass } })).ok()).toBe(true);
        }),
        ...memos.map(async (title) => {
          const { id } = await createDocument(page.request, { title });
          expect((await page.request.patch(`/api/documents/${id}`, { data: { visibility: 'restricted' } })).ok()).toBe(true);
        }),
        ...pages.map(async (title) => {
          const { id } = await createPage(page.request, { doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `${term}, ${term} and ${term} again.` }] }] } });
          await patchPage(page.request, id, { title });
        }),
      ]);

      const dialog = page.getByRole('dialog', { name: 'Search' });

      await test.step('Ctrl-K opens the search, and typing finds pages and documents', async () => {
        await page.goto('/');
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await dialog.getByPlaceholder('Search…').fill(term);
        for (const title of pages) await expect(dialog.getByRole('option').filter({ hasText: title })).toBeVisible();
        await expect(dialog.getByRole('option').filter({ hasText: reports[0].replace(/ \d+$/, '') }).first()).toBeVisible();
      });

      await test.step('they narrow it to documents, and Show all results takes the term to the search page', async () => {
        await dialog.getByRole('radio', { name: 'Documents' }).click();
        for (const title of pages) await expect(dialog.getByRole('option').filter({ hasText: title })).toHaveCount(0);
        await expect(dialog.getByRole('option').filter({ hasText: `${term} Report` }).first()).toBeVisible();
        await dialog.getByRole('option', { name: 'Show all results' }).click();
        await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}&type=document$`));
        await expect(page.getByRole('searchbox', { name: 'Search term' })).toHaveValue(term);
        await expect(page.getByRole('combobox', { name: 'Type' })).toContainText('Document');
        await expect(count(page)).toHaveText(`${REPORTS + memos.length} documents for “${term}”`);
        const listed = await titles(page);
        for (const title of pages) expect(listed).not.toContain(title);
      });

      await test.step('they filter by class: the reports alone, more than a page of them', async () => {
        await choose(page, 'Class', new RegExp(`${cls.name}$`));
        await expect(page).toHaveURL(new RegExp(`[?&]class=${cls.slug}(&|$)`));
        await expect(count(page)).toHaveText(`${REPORTS} documents for “${term}” · class ${cls.name} (incl. subclasses)`);
        await expect(results(page)).toHaveCount(24);
        await expect(page.getByText('Page 1 of 2')).toBeVisible();
        expect((await titles(page)).filter((t) => t.includes('Memo'))).toEqual([]);
      });

      await test.step('they sort by title and page on to the rest', async () => {
        await choose(page, 'Sort', /^Title A–Z$/);
        await expect(page).toHaveURL(/[?&]sort=title(&|$)/);
        await expect.poll(() => titles(page)).toEqual(reports.slice(0, 24));
        await page.getByRole('navigation', { name: 'Pages of results' }).getByRole('link', { name: 'Next' }).click();
        await expect(page).toHaveURL(/[?&]page=2(&|$)/);
        await expect(page.getByText('Page 2 of 2')).toBeVisible();
        await expect.poll(() => titles(page)).toEqual(reports.slice(24));
      });

      await test.step('Back returns to the first page, still filtered and sorted', async () => {
        await page.goBack();
        await expect(page).not.toHaveURL(/page=/);
        await expect(page).toHaveURL(new RegExp(`class=${cls.slug}.*sort=title|sort=title.*class=${cls.slug}`));
        await expect(page.getByText('Page 1 of 2')).toBeVisible();
        await expect.poll(() => titles(page)).toEqual(reports.slice(0, 24));
      });

      await test.step('they open a result', async () => {
        await results(page).first().getByRole('link', { name: reports[0], exact: true }).click();
        await expect(page.getByRole('heading', { level: 1, name: reports[0] })).toBeVisible();
        await expect(page).not.toHaveURL(/\/search/);
      });
    } finally {
      // The class goes again once nothing carries it: the reports return to plain documents.
      await db`update nodes set class_id = (select id from node_classes where slug = 'document') where class_id = (select id from node_classes where slug = ${cls.slug})`;
      await deleteClass(admin.request, cls.slug);
      await admin.close();
    }
  });
});
