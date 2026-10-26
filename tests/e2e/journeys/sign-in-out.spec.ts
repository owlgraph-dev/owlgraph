// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect, waitForHydration } from '../fixtures';
import { authState } from '../seed-data';
import { createPage, unique } from '../api';
import { doc, txt } from '../doc';

// Signed in through the form: tests/support/seed.ts gives every seeded account this password.
const VIEWER = { email: 'viewer@test', password: 'e2e-seed-password' };

test.describe('signing in and out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an internal page sends a visitor to the sign-in, takes them back once signed in, and sends them to the sign-in again once signed out', async ({ page, browser }) => {
    const { name: title } = unique('Members only');
    const body = `${title}: for signed-in readers only.`;
    const admin = await browser.newContext({ storageState: authState('admin') });
    const { slug } = await createPage(admin.request, { title, visibility: 'internal', doc: doc({ type: 'paragraph', content: [txt(body)] }) });
    await admin.close();
    const toSignIn = new RegExp(`/login\\?redirect=${encodeURIComponent(`/${slug}`)}$`);
    const signInHeading = page.getByRole('heading', { name: 'Sign in', exact: true });

    await test.step('an anonymous visitor opening the page is sent to the sign-in', async () => {
      await page.goto(`/${slug}`);
      await expect(page).toHaveURL(toSignIn);
      await expect(signInHeading).toBeVisible();
      await expect(page.getByText(body)).toHaveCount(0);
    });

    await test.step('they sign in and land back on the page', async () => {
      await page.getByLabel('Email', { exact: true }).fill(VIEWER.email);
      await page.getByLabel('Password', { exact: true }).fill(VIEWER.password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      // A sign-in starts a fresh document (login/+page.svelte).
      await page.waitForURL(new RegExp(`/${slug}$`));
      await waitForHydration(page);
      await expect(page.getByText(body)).toBeVisible();
      await expect(page).toHaveTitle(new RegExp(title));
    });

    await test.step('they sign out from the page and are sent to the sign-in', async () => {
      await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Account' }).click();
      await page.getByRole('menu', { name: 'Menu' }).getByRole('menuitem', { name: 'Sign out' }).click();
      await page.waitForURL(/\/login$/);
      await waitForHydration(page);
      await expect(signInHeading).toBeVisible();
    });

    await test.step("Back does not show the page they read signed in: the browser kept no copy, so it asks again and is sent to the sign-in", async () => {
      await page.goBack();
      await expect(page).toHaveURL(toSignIn);
      await expect(signInHeading).toBeVisible();
      await expect(page.getByText(body)).toHaveCount(0);
    });

    await test.step('the same page sends them to the sign-in again', async () => {
      await page.goto(`/${slug}`);
      await expect(page).toHaveURL(toSignIn);
      await expect(signInHeading).toBeVisible();
      await expect(page.getByText(body)).toHaveCount(0);
    });
  });
});
