// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: a collection's own page in the browser: a new page per
// collection, its sort and tabs under the strict style policy, on a phone too.
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { createPage, throwawayUserState } from '$tests/e2e/api';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import { db } from '$lib/platform/db.server';
import { addMember } from '$lib/features/collections/server';
import { startMockNextcloud, type MockNextcloud, type MockShare, type MockUser } from './mockNextcloud';
import { configure } from './settings';

const API = '/api/plugins/nextcloud';
const ROOT = 530;
const files = {
  'a.txt': { content: 'A', mime: 'text/plain', fileid: 531 },
  'b.txt': { content: 'B', mime: 'text/plain', fileid: 532 },
  'Bericht.pdf': { content: '%PDF-1.4 533', mime: 'application/pdf', fileid: 533 },
};

// Alice holds the team folder the shares are of.
const users = (): Record<string, MockUser> => ({
  alice: { loginName: 'alice@example.com', displayName: 'Alice Example', tree: { name: '', files: Object.fromEntries(Object.entries(files).map(([name, file]) => [`Projekte/Team/${name}`, file])), folderIds: { 'Projekte/Team': ROOT } } },
});

let mock: MockNextcloud;
let shares = 0;

function newShare(share: MockShare = { name: 'Team', files, folderIds: { '': ROOT } }): string {
  const token = `E2eNodePage${process.pid}x${++shares}`;
  mock.shares.set(token, share);
  return token;
}

test.beforeAll(async () => {
  mock = await startMockNextcloud({}, users());
});
test.afterAll(async () => {
  await mock.close();
});
test.beforeEach(() => {
  mock.mode = 'ok';
  mock.requests.length = 0;
});

test.use({ lock: 'integration-settings', storageState: authState('admin') });

/** In the public default namespace. */
async function shareCollection(request: APIRequestContext, token = newShare()) {
  const anchor = await createPage(request, { visibility: null });
  const res = await request.post(`${API}/collections`, { data: { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` } });
  expect(res.status(), await res.text()).toBe(201);
  const { collection } = (await res.json()) as { collection: { id: string; href: string; title: string } };
  return { ...collection, token };
}

interface Person {
  context: BrowserContext;
  page: Page;
  request: APIRequestContext;
  violations: string[];
}

/** Keeps CSP violations: the fixture watches only its own page. */
async function person(browser: Browser): Promise<Person> {
  const { storageState } = await throwawayUserState('editor');
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  return { context, page, request: context.request, violations };
}

const header = (page: Page) => page.locator('header.node-head');
const rows = (page: Page) => page.getByRole('tabpanel').locator('.el-row .el-name-text');
const provenance = (page: Page) => page.getByRole('tabpanel').locator('.el-provenance');

test.describe("a Nextcloud collection's own page", () => {

  test('is a new page for each collection, followed from one to another', async ({ page }) => {
    await configure(page.request, mock.origin);
    const first = await shareCollection(page.request);
    const second = await shareCollection(page.request, newShare({ name: 'Archiv', files: { 'z.txt': { content: 'Z', mime: 'text/plain', fileid: 539 } } }));
    await db.begin((sql) => addMember(sql, first.id, second.id));

    await page.goto(first.href);
    await expect(rows(page)).toHaveText(['a.txt', 'b.txt', 'Bericht.pdf']);
    await page.getByRole('tab', { name: 'Linked documents (1)' }).click();
    await page.getByRole('tabpanel').getByRole('link', { name: second.title }).click();

    await expect(page).toHaveURL(new RegExp(`${second.href}$`));
    await expect(header(page).getByRole('heading', { level: 1 })).toHaveText(second.title);
    await expect(page.getByRole('tab', { name: 'Contents' })).toHaveAttribute('aria-selected', 'true');
    await expect(rows(page)).toHaveText(['z.txt']);
  });

  test('opens its sort as a menu, its tabs and its rows under the strict policy', async ({ page }) => {
    await configure(page.request, mock.origin);
    const collection = await shareCollection(page.request);
    await page.goto(collection.href);
    await expect(rows(page)).toHaveText(['a.txt', 'b.txt', 'Bericht.pdf']);
    await page.getByRole('tabpanel').getByRole('button', { name: 'Sorted by Name, ascending' }).click();
    await page.getByRole('menuitem', { name: 'Size' }).click();
    // Largest first; equal sizes by name.
    await expect(rows(page)).toHaveText(['Bericht.pdf', 'a.txt', 'b.txt']);
    await page.getByRole('tab', { name: /Linked documents/ }).click();
    await page.getByRole('tab', { name: 'Contents' }).click();
    await expect(rows(page).first()).toBeVisible();
  });
});

test.describe("a Nextcloud collection's own page on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('folds its rows to two lines, sorts in a sheet, and nothing scrolls sideways', async ({ page }) => {
    await configure(page.request, mock.origin);
    const collection = await shareCollection(page.request);
    await page.goto(collection.href);
    await expect(rows(page)).toHaveText(['a.txt', 'b.txt', 'Bericht.pdf']);
    const first = page.getByRole('tabpanel').locator('.el-row').first();
    await expect(first.locator('.el-meta')).toBeVisible();
    await expect(page.getByRole('tabpanel').locator('.el-cols')).toBeHidden();

    await page.getByRole('tabpanel').locator('.el-sort-compact').getByRole('button').click();
    const sheet = page.getByRole('dialog', { name: 'Sort' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Cancel' }).click();
    await expect(sheet).toBeHidden();

    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await touchTargets(page, 'main')).toEqual([]);
  });
});
