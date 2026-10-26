// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { test, expect, waitForHydration } from '../fixtures';
import { authState } from '../seed-data';
import { deleteNamespace, throwawayUserState, unique } from '../api';
import { db } from '../../../src/lib/platform/db.server';
import { posting } from '../api';

const BODY = 'Notes the project team writes for itself.';
const RESTRICTED = /^Restricted — this namespace's members/;
const PUBLIC = 'Public — anyone, even signed-out';

test.describe("a namespace's life", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an admin makes a namespace and adds a member, the member writes a page there, and a visitor reads it only while the namespace is public', async ({ page: visitor, browser }) => {
    test.setTimeout(120_000);
    const ns = unique('Project space');
    const member = await throwawayUserState('editor');
    const [{ name: memberName }] = await db<{ name: string }[]>`select name from users where id = ${member.userId}`;
    const adminContext = await browser.newContext({ storageState: authState('admin'), viewport: { width: 1280, height: 900 } });
    const memberContext = await browser.newContext({ storageState: member.storageState, viewport: { width: 1280, height: 900 } });
    const admin = await adminContext.newPage();
    const row = admin.getByRole('row').filter({ hasText: `/${ns.slug}` });
    let namespaceId = '';
    let pageId = '';
    let address = '';

    /** The admin sets the namespace's default access in its Edit dialog. */
    async function setAccess(option: string | RegExp, warning?: string) {
      await row.getByRole('button', { name: 'Edit', exact: true }).click();
      const dialog = admin.getByRole('dialog', { name: 'Edit namespace' });
      await dialog.getByRole('combobox', { name: 'Default access' }).click();
      await admin.getByRole('option', { name: option }).click();
      if (warning) await expect(dialog.getByText(warning)).toBeVisible();
      await posting(admin, 'update', () => dialog.getByRole('button', { name: 'Save', exact: true }).click());
      await expect(dialog).toBeHidden();
    }

    try {
      await test.step('an admin makes a namespace — Internal unless they choose — for its members alone, and adds a member', async () => {
        await admin.goto('/settings/namespaces');
        await admin.getByRole('button', { name: 'Add namespace' }).click();
        const dialog = admin.getByRole('dialog', { name: 'Add namespace' });
        await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(ns.name);
        await dialog.getByRole('textbox', { name: 'URL prefix', exact: true }).fill(ns.slug);
        const access = dialog.getByRole('combobox', { name: 'Default access' });
        await expect(access).toHaveText('Internal — any signed-in user');
        // Members are a restricted namespace's: its content is theirs.
        await access.click();
        await admin.getByRole('option', { name: RESTRICTED }).click();
        await posting(admin, 'create', () => dialog.getByRole('button', { name: 'Create namespace' }).click());
        await expect(dialog).toBeHidden();
        await expect(row).toContainText('Restricted');
        [{ id: namespaceId }] = await db<{ id: string }[]>`select id from namespaces where slug = ${ns.slug}`;

        await row.getByRole('button', { name: /^Manage members/ }).click();
        const members = admin.getByRole('dialog', { name: `Members of "${ns.name}"` });
        await members.getByRole('checkbox', { name: memberName, exact: true }).click();
        await posting(admin, 'setMembers', () => members.getByRole('button', { name: 'Save members' }).click());
        await expect(members).toBeHidden();
        await expect(row.getByRole('button', { name: /^Manage members/ })).toHaveText('Manage members (1)');
      });

      const writer = await memberContext.newPage();
      await test.step('the member makes a page in the namespace from Create, writes it and saves', async () => {
        await writer.goto('/');
        await writer.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Create' }).click();
        const create = writer.getByRole('dialog', { name: 'Create' });
        await create.getByRole('combobox', { name: 'Namespace' }).click();
        await writer.getByRole('option', { name: ns.name, exact: true }).click();
        await create.getByRole('button', { name: 'Page' }).click();
        // The editor opens under the namespace's prefix.
        await expect(writer).toHaveURL(new RegExp(`/${ns.slug}/[^/]+/edit$`));
        await waitForHydration(writer);
        address = new URL(writer.url()).pathname.replace(/\/edit$/, '');
        const slug = address.split('/').at(-1)!;
        [{ id: pageId }] = await db<{ id: string }[]>`select id from nodes where slug = ${slug} and namespace_id = ${namespaceId} and type = 'page'`;

        const canvas = writer.locator('.ProseMirror[contenteditable="true"]');
        await expect(async () => {
          await canvas.click();
          await expect(canvas).toBeFocused({ timeout: 1000 });
        }).toPass({ timeout: 10_000 });
        await writer.keyboard.type(BODY);
        await expect(canvas.locator('p').first()).toHaveText(BODY);
        const saved = writer.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/pages/${pageId}`);
        await writer.getByRole('button', { name: 'Save', exact: true }).click();
        expect((await saved).ok()).toBe(true);
        await expect(writer.getByText(/^Saved /)).toBeVisible();
      });

      await test.step("the page's access panel shows the level it inherits from the namespace and names its members", async () => {
        await writer.getByRole('button', { name: 'Access control' }).click();
        const panel = writer.getByRole('dialog', { name: 'Access control' });
        await expect(panel.getByRole('combobox', { name: 'Who can view this page' })).toHaveText('Same as namespace (restricted: its members)');
        await expect(panel.getByText('Follows the namespace, also when an admin changes its access level later.')).toBeVisible();
        await expect(panel.getByRole('listitem').filter({ hasText: memberName })).toBeVisible();
        await expect(panel.getByText('This namespace has no members yet.')).toHaveCount(0);
        await panel.getByRole('button', { name: 'Cancel' }).click();
        await expect(panel).toBeHidden();
      });

      await test.step('the admin opens the namespace to the public, and a signed-out visitor reads the page', async () => {
        // Back at Namespaces, which now counts the member's page: the Edit dialog says it opens with the namespace.
        await admin.goto('/settings/namespaces');
        await setAccess(PUBLIC, "1 pages and documents take this namespace's access level and become public with it — visible to signed-out visitors too.");
        await expect(row).toContainText('Public');
        const read = await visitor.goto(address);
        expect(read?.status()).toBe(200);
        await expect(visitor.getByText(BODY)).toBeVisible();
      });

      await test.step('the admin narrows it again, and the visitor is turned away: the page answers as one that does not exist', async () => {
        await setAccess(RESTRICTED);
        await expect(row).toContainText('Restricted');
        const turned = await visitor.reload();
        expect(turned?.status()).toBe(404);
        await expect(visitor.getByText('Page not found')).toBeVisible();
        await expect(visitor.getByText(BODY)).toHaveCount(0);
      });
    } finally {
      await memberContext.close();
      // Closed first: its content moves to the default namespace, public in the
      // test database, and must not turn up in another test's lists.
      if (pageId) await db`update nodes set visibility = 'restricted' where id = ${pageId}`;
      if (namespaceId) await deleteNamespace(admin.request, namespaceId);
      await adminContext.close();
    }
  });
});
