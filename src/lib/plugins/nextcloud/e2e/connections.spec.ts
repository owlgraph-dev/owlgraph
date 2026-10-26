// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: the approval page opens in a window of its own, and the row turns
// connected as it polls.
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { test, expect } from '$tests/e2e/fixtures';
import { throwawayUserState } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';
import { db } from '$lib/platform/db.server';
import { startMockNextcloud, type MockNextcloud } from './mockNextcloud';
import { configure } from './settings';

let mock: MockNextcloud;

test.beforeAll(async () => {
  mock = await startMockNextcloud({}, { alice: { loginName: 'alice@example.com', displayName: 'Alice Example', tree: { name: '', files: {} } } });
});
test.afterAll(async () => {
  await mock.close();
});
test.beforeEach(() => {
  mock.mode = 'ok';
  mock.flowServer = null;
});

test.use({ lock: 'integration-settings', storageState: authState('admin') });

async function person(browser: Browser): Promise<{ userId: string; context: BrowserContext; page: Page }> {
  const { userId, storageState } = await throwawayUserState('editor');
  const context = await browser.newContext({ storageState });
  return { userId, context, page: await context.newPage() };
}

const connectionsOf = (userId: string) =>
  db<{ id: string; status: string; account_id: string; account_label: string; sealed_credential: string }[]>`
    select id, status, account_id, account_label, sealed_credential from user_connections where user_id = ${userId} and plugin = 'nextcloud'`;

test.describe("a person's Nextcloud connection", () => {
  test('is made through the approval page from the connections page, which the account menu links', async ({ page, browser }) => {
    await configure(page.request, mock.origin);
    const alice = await person(browser);
    await alice.page.goto('/');
    await alice.page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Account' }).click();
    const menu = alice.page.getByRole('menu', { name: 'Menu' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Profile', 'Connections', 'Settings', 'Sign out']);
    await menu.getByRole('menuitem', { name: 'Connections' }).click();
    await expect(alice.page).toHaveURL(/\/settings\/connections$/);

    const row = alice.page.getByRole('group', { name: 'Nextcloud' });
    await expect(row).toContainText('Not connected');
    const [approval] = await Promise.all([alice.context.waitForEvent('page'), row.getByRole('button', { name: 'Connect Nextcloud' }).click()]);
    await expect(row).toContainText('Waiting for you to approve');
    await approval.getByRole('button', { name: 'Zugriff gewähren als Alice Example' }).click();
    await expect(row).toContainText('Connected as Alice Example', { timeout: 20_000 });

    const [connection] = await connectionsOf(alice.userId);
    expect(connection).toMatchObject({ status: 'active', account_id: 'alice', account_label: 'Alice Example' });
    // The app password is named after this app; the server was asked as the new account.
    expect(mock.requests.find((r) => r.path === '/index.php/login/v2')?.userAgent).toMatch(/^owlgraph \(.+\)$/);
    expect(mock.requests.some((r) => r.path === '/index.php/login/v2/poll')).toBe(true);
    expect(mock.requests.filter((r) => r.path === '/ocs/v1.php/cloud/user').map((r) => r.authUser)).toContain('alice');
    await alice.context.close();
  });
});
