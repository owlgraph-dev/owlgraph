// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { createDocument, createPage, unique } from '$tests/e2e/api';
import { horizontalOverflow, touchTargets } from '$tests/e2e/responsive';
import { authState } from '$tests/e2e/seed-data';
import { db } from '../../../platform/db.server';

type Member = { id: string; title: string; position: number; label: string | null };
type Members = { members: Member[]; basis: string };

/** In the default namespace, which is public. */
async function curated(request: APIRequestContext, title = unique('curated').name): Promise<{ id: string; slug: string; title: string }> {
  const res = await request.post('/api/collections', { data: { title } });
  expect(res.status(), await res.text()).toBe(201);
  return { ...((await res.json()) as { id: string; slug: string }), title };
}

const members = (request: APIRequestContext, id: string): Promise<APIResponse> => request.get(`/api/collections/${id}/members`);
const add = (request: APIRequestContext, id: string, nodeId: string): Promise<APIResponse> => request.post(`/api/collections/${id}/members`, { data: { nodeId } });
const ids = async (res: APIResponse): Promise<string[]> => ((await res.json()) as Members).members.map((m) => m.id);
const body = async (res: APIResponse): Promise<Members> => (await res.json()) as Members;

const publicPage = async (request: APIRequestContext, title = unique('page').name) => ({ ...(await createPage(request, { visibility: null, title })), title });

/** The members' ids in the order the server holds them. */
const order = async (request: APIRequestContext, id: string) => ids(await members(request, id));

/** Returns the members' section of the hydrated editor. */
async function openEditor(page: Page, slug: string) {
  await page.goto(`/${slug}/edit`);
  await waitForHydration(page);
  return page.getByRole('region', { name: 'Contents' });
}

const handle = (page: Page, title: string) => page.getByRole('button', { name: `Move ${title}`, exact: true });

test.describe('a curated collection in its editor', () => {
  test.use({ storageState: authState('admin') });

  test('is made from the Create menu and filled from the picker, a member offered once', async ({ page }) => {
    const docTitle = unique('picked document').name;
    await createDocument(page.request, { title: docTitle });
    const pg = await publicPage(page.request, unique('picked page').name);
    const nested = await curated(page.request, unique('picked collection').name);
    const [{ name: namespace }] = await db<{ name: string }[]>`select name from namespaces where is_default`;

    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create' }).click();
    await page.getByRole('dialog', { name: 'Create' }).getByRole('button', { name: /^Collection/ }).click();
    await expect(page).toHaveURL(/\/edit$/);
    await waitForHydration(page);
    const section = page.getByRole('region', { name: 'Contents' });
    await expect(section).toContainText('Nothing in this collection yet.');

    for (const [title, type] of [
      [docTitle, 'Document'],
      [pg.title, 'Page'],
      [nested.title, 'Collection'],
    ] as const) {
      await section.getByRole('button', { name: 'Add entry' }).click();
      const picker = page.getByRole('dialog', { name: 'Add to collection' });
      await picker.getByPlaceholder('Search pages, documents and collections').fill(title);
      const option = picker.getByRole('option', { name: new RegExp(`^${title}`) });
      await expect(option).toContainText(type);
      await expect(option).toContainText(namespace);
      await option.click();
      await expect(picker).toBeHidden();
      await expect(section.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(section).toContainText('3 entries');

    await section.getByRole('button', { name: 'Add entry' }).click();
    const picker = page.getByRole('dialog', { name: 'Add to collection' });
    await picker.getByPlaceholder('Search pages, documents and collections').fill(pg.title);
    const again = picker.getByRole('option', { name: new RegExp(`^${pg.title}`) });
    await expect(again).toContainText('In this collection');
    await again.click();
    await expect(page.getByRole('region', { name: 'Notifications' }).getByText(`“${pg.title}” is in this collection already.`)).toBeVisible();
    await expect(section).toContainText('3 entries');
  });

  test('is rearranged by a drag and by the keyboard, and keeps the order across a reload', async ({ page }) => {
    const c = await curated(page.request);
    const [a, b, d] = [await publicPage(page.request), await publicPage(page.request), await publicPage(page.request)];
    for (const p of [a, b, d]) await add(page.request, c.id, p.id);
    await openEditor(page, c.slug);

    const from = await handle(page, a.title).boundingBox();
    const to = await handle(page, d.title).boundingBox();
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height + 4, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => order(page.request, c.id)).toEqual([b.id, d.id, a.id]);

    await handle(page, a.title).focus();
    await page.keyboard.press('ArrowUp');
    await expect(handle(page, a.title)).toBeFocused();
    await expect(page.getByText(`${a.title}, position 2 of 3`)).toBeAttached();
    await expect.poll(() => order(page.request, c.id)).toEqual([b.id, a.id, d.id]);

    // The second move is sent before the first is answered: neither may be lost.
    await handle(page, d.title).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => order(page.request, c.id)).toEqual([d.id, b.id, a.id]);

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByRole('region', { name: 'Contents' }).locator('.title')).toHaveText([d.title, b.title, a.title]);
  });
});

// The search feature's NodePicker (docs/architecture/search.md, "The node picker").
test.describe("the members editor's picker", () => {
  test.use({ storageState: authState('admin') });

  async function openPicker(page: Page, slug: string) {
    const section = await openEditor(page, slug);
    await section.getByRole('button', { name: 'Add entry' }).click();
    const picker = page.getByRole('dialog', { name: 'Add to collection' });
    await expect(picker).toBeVisible();
    return { section, picker, field: picker.getByRole('combobox') };
  }

  const memberTitles = async (request: APIRequestContext, id: string) => ((await body(await members(request, id))).members as Member[]).map((m) => m.title);

  test('is driven from the keyboard: the arrows and Enter add, Escape clears the term and then closes', async ({ page }) => {
    const c = await curated(page.request);
    const token = unique('keyed').name;
    const titles = [(await publicPage(page.request, `${token} one`)).title, (await publicPage(page.request, `${token} two`)).title];
    const { section, picker, field } = await openPicker(page, c.slug);

    await page.keyboard.type(token);
    await expect(picker.getByRole('option').filter({ hasText: /Page · / })).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    const highlighted = picker.getByRole('option', { selected: true });
    const text = (await highlighted.textContent()) ?? '';
    const picked = titles.find((t) => text.includes(t));
    expect(picked, `the highlighted row (${text}) is one of the pages`).toBeTruthy();
    await page.keyboard.press('Enter');
    await expect(picker).toBeHidden();
    await expect(section.getByText(picked!, { exact: true })).toBeVisible();
    await expect.poll(() => memberTitles(page.request, c.id)).toEqual([picked]);

    await section.getByRole('button', { name: 'Add entry' }).click();
    await expect(field).toBeFocused();
    await page.keyboard.type('nothing like it');
    await page.keyboard.press('Escape');
    await expect(field).toHaveValue('');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await expect(section.getByRole('button', { name: 'Add entry' })).toBeFocused();
  });
});

test.describe('a curated collection in its editor, on a phone', () => {
  test.use({ storageState: authState('admin'), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('picks a member from a sheet of its own, and nothing scrolls sideways', async ({ page }) => {
    const c = await curated(page.request);
    const pg = await publicPage(page.request, unique('phone pick').name);
    const section = await openEditor(page, c.slug);
    await section.getByRole('button', { name: 'Add entry' }).click();
    const picker = page.getByRole('dialog', { name: 'Add to collection' });
    await expect(picker).toBeVisible();
    const box = (await picker.boundingBox())!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(388);
    expect(box.y + box.height).toBeGreaterThanOrEqual(843);
    await picker.getByRole('combobox').fill(pg.title);
    const option = picker.getByRole('option', { name: new RegExp(`^${pg.title}`) });
    await expect(option).toBeVisible();
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await touchTargets(page, '[role="dialog"]')).toEqual([]);
    await option.click();
    await expect(picker).toBeHidden();
    await expect(section.getByText(pg.title, { exact: true })).toBeVisible();
  });

  test('moves a member from its row menu, and nothing scrolls sideways', async ({ page }) => {
    const c = await curated(page.request);
    const [a, b] = [await publicPage(page.request), await publicPage(page.request)];
    for (const p of [a, b]) await add(page.request, c.id, p.id);
    const section = await openEditor(page, c.slug);
    await section.getByRole('button', { name: `Actions for ${b.title}` }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
    await expect.poll(() => order(page.request, c.id)).toEqual([b.id, a.id]);
    expect(await horizontalOverflow(page)).toEqual([]);
    expect(await touchTargets(page, 'section[aria-labelledby^="members-heading"]')).toEqual([]);
  });
});
