// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { unique } from '$tests/e2e/api';
import { authState } from '$tests/e2e/seed-data';

// The external address is never visited: redirects are read with maxRedirects: 0.

test.describe.configure({ mode: 'parallel' });
test.use({ storageState: authState('editorA') });

const DOI_URL = 'https://doi.org/10.1000/e2e-linked';

function externalLink(page: Page) {
  return page.getByRole('link', { name: /^Open: / });
}

// Returns the Open action's href.
async function expectOpensExternally(page: Page, host: string, href?: string): Promise<string> {
  const link = externalLink(page);
  await expect(link).toHaveAccessibleName(`Open: ${host} (new tab)`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  if (href) await expect(link).toHaveAttribute('href', href);
  else await expect(link).toHaveAttribute('href', /^\/api\/documents\/[0-9a-f-]+\/content$/);
  return (await link.getAttribute('href'))!;
}

async function expectRedirectsTo(request: APIRequestContext, path: string, url: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toBe(url);
  expect(res.headers()['referrer-policy']).toBe('no-referrer');
  expect(res.headers()['cache-control']).toContain('no-store');
}

test('Create → Document → Link creates a link document whose page links out', async ({ page }) => {
  const { name } = unique('Linked paper');
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Create' });
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create' }).click();
  await dialog.getByRole('button', { name: 'Document' }).click();
  await expect(dialog.getByRole('heading', { name: 'Add a document' })).toBeVisible();

  await dialog.getByRole('radio', { name: 'Link', exact: true }).click();
  await dialog.getByLabel('Address', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByLabel('Title').fill(name);
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByText('Enter a web address starting with https:// or http://.')).toBeVisible();

  await dialog.getByLabel('Address', { exact: true }).fill('doi:10.1000/e2e-linked');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await waitForHydration(page);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Link', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Source', exact: true })).toHaveAccessibleDescription(/Not the link to the document itself/);

  await page.goto(page.url().replace(/\/edit$/, ''));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await expect(page.getByText('External document')).toBeVisible();
  const href = await expectOpensExternally(page, 'doi.org');
  await expectRedirectsTo(page.request, href, DOI_URL);
  await expect(page.getByRole('link', { name: 'Download' })).toHaveCount(0);
});
