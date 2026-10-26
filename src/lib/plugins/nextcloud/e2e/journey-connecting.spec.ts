// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// E2E because: the flow is the point. A page asks a reader to connect, they
// approve through Connections, and come back to their own files.
import type { APIRequestContext, Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { test, expect, waitForHydration } from '$tests/e2e/fixtures';
import { authState } from '$tests/e2e/seed-data';
import { createPage, formAction, throwawayUserState } from '$tests/e2e/api';
import { doc, txt } from '$tests/e2e/doc';
import { startMockNextcloud, type MockNextcloud, type MockUser } from './mockNextcloud';

const API = '/api/plugins/nextcloud';
// Ids no other spec's mock uses.
const TEAM = 720;
const files = { 'a.txt': { content: 'A', mime: 'text/plain', fileid: 721 }, 'b.txt': { content: 'B', mime: 'text/plain', fileid: 722 }, 'geheim.txt': { content: 'S', mime: 'text/plain', fileid: 723 } };

// Alice owns Projekte/Team; Carol has it shared with her as Team, geheim.txt kept from her.
const users = (): Record<string, MockUser> => ({
  alice: {
    loginName: 'alice@example.com',
    displayName: 'Alice Example',
    tree: { name: '', files: Object.fromEntries(Object.entries(files).map(([name, file]) => [`Projekte/Team/${name}`, file])), folderIds: { 'Projekte/Team': TEAM } },
  },
  carol: {
    loginName: 'carol',
    displayName: 'Carol Example',
    tree: { name: '', files: Object.fromEntries(Object.entries(files).map(([name, file]) => [`Team/${name}`, file])), folderIds: { Team: TEAM } },
    hidden: ['Team/geheim.txt'],
  },
});

let mock: MockNextcloud;
test.beforeAll(async () => {
  mock = await startMockNextcloud({}, users());
});
test.afterAll(async () => {
  await mock.close();
});
test.beforeEach(() => {
  mock.requests.length = 0;
});

const pollState = async (request: APIRequestContext) => ((await (await request.post('/api/connections/nextcloud/poll', { data: {} })).json()) as { state: string }).state;

/** The owner connects through the API; the journey walks through the reader's connection. */
async function connectAs(request: APIRequestContext, uid: string): Promise<void> {
  const begun = await request.post('/api/connections/nextcloud', { data: {} });
  expect(begun.status(), await begun.text()).toBe(200);
  const { approveUrl } = (await begun.json()) as { approveUrl: string };
  expect(mock.approve(approveUrl.split('/').at(-1)!, uid)).toBeTruthy();
  await expect.poll(() => pollState(request), { intervals: [3200], timeout: 20_000 }).toBe('connected');
}

interface Reader {
  context: BrowserContext;
  page: Page;
  /** CSP violations: the fixture does not watch a context of the test's own. */
  violations: string[];
  folder: Locator;
  /** The connections page's Nextcloud row. */
  row: Locator;
}

/** Alice's team folder on a page anyone may read, each reader seeing it from their own Nextcloud. */
async function setUp(admin: APIRequestContext, browser: Browser): Promise<{ slug: string; carol: Reader }> {
  const configured = await formAction(admin, '/settings/integrations/nextcloud?/save', { enabled: 'on', origin: mock.origin, cacheSeconds: '0' });
  expect(configured.type, JSON.stringify(configured)).toBe('success');

  const { storageState: aliceState } = await throwawayUserState('editor');
  const aliceContext = await browser.newContext({ storageState: aliceState });
  await connectAs(aliceContext.request, 'alice');
  const anchor = await createPage(aliceContext.request, { visibility: null });
  const made = await aliceContext.request.post(`${API}/collections`, { data: { pageId: anchor.id, own: { path: 'Projekte/Team', fileid: String(TEAM) } } });
  expect(made.status(), await made.text()).toBe(201);
  const { collection } = (await made.json()) as { collection: { id: string } };
  const { slug } = await createPage(aliceContext.request, {
    visibility: null,
    doc: doc({ type: 'paragraph', content: [txt('The team folder:')] }, { type: 'nextcloudFolder', attrs: { blockId: 'team-folder', collectionId: collection.id, startPath: '' } }),
  });
  await aliceContext.close();

  const { storageState } = await throwawayUserState('editor');
  const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(`${page.url()}: ${message.text().slice(0, 300)}`);
  });
  return { slug, carol: { context, page, violations, folder: page.locator('[data-block-id="team-folder"] .el'), row: page.getByRole('group', { name: 'Nextcloud' }) } };
}

/** A full load, under the settings pages' own style policy. */
async function toConnections(page: Page) {
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menu', { name: 'Menu' }).getByRole('menuitem', { name: 'Connections' }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await waitForHydration(page);
}

async function connectThroughTheAccountMenu(carol: Reader) {
  await toConnections(carol.page);
  await expect(carol.row).toContainText('Not connected');
  const [approval] = await Promise.all([carol.context.waitForEvent('page'), carol.row.getByRole('button', { name: 'Connect Nextcloud' }).click()]);
  await expect(carol.row).toContainText('Waiting for you to approve');
  await approval.getByRole('button', { name: 'Zugriff gewähren als Carol Example' }).click();
  await expect(approval.getByText('Konto verbunden.')).toBeVisible();
  await approval.close();
  // The row asks every two seconds, and the server asks Nextcloud at most every few.
  await expect(carol.row).toContainText('Connected as Carol Example', { timeout: 20_000 });
}

const PLACEHOLDER = 'Connect your Nextcloud to see this folder';
const HERS = ['a.txt', 'b.txt'];

test.describe("connecting one's own Nextcloud", () => {
  // The lock: the integration's settings point at this file's mock (tests/e2e/fixtures.ts).
  test.use({ lock: 'integration-settings', storageState: authState('admin') });

  test('a page asks a reader to connect; they connect through the account menu and see their own files there, and once disconnected are asked again', async ({ page: admin, browser }) => {
    test.setTimeout(120_000);
    const { slug, carol } = await setUp(admin.request, browser);
    try {
      await test.step('the page shows the reader the connect placeholder', async () => {
        await carol.page.goto(`/${slug}`);
        await expect(carol.folder).toContainText(PLACEHOLDER);
        await expect(carol.folder.getByRole('link', { name: 'Connect Nextcloud' })).toBeVisible();
        expect(await carol.page.content()).not.toContain('geheim.txt');
      });

      await test.step('they go through the account menu to Connections and approve in the popup', async () => {
        await connectThroughTheAccountMenu(carol);
      });

      await test.step('they go Back to the page and see the folder as their own Nextcloud shows it to them', async () => {
        // A page sent to a signed-in reader is never stored (hooks.server.ts), so Back
        // asks the server again; the island takes the answer it was rendered with as final.
        await carol.page.goBack();
        await expect(carol.page).toHaveURL(new RegExp(`/${slug}$`));
        await waitForHydration(carol.page);
        await expect(carol.folder.locator('.el-row .el-name-text')).toHaveText(HERS);
        await expect(carol.folder).not.toContainText(PLACEHOLDER);
        // Read with her own app password.
        expect(mock.requests.some((r) => r.path.startsWith('/remote.php/dav/files/carol/') && r.authUser === 'carol')).toBe(true);
      });

      await test.step('they disconnect, and the page asks them to connect again', async () => {
        await toConnections(carol.page);
        await expect(carol.row).toContainText('Connected as Carol Example');
        const gone = carol.page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === '/api/connections/nextcloud');
        await carol.row.getByRole('button', { name: 'Disconnect' }).click();
        expect((await gone).ok()).toBe(true);
        await expect(carol.row).toContainText('Not connected');

        await carol.page.goto(`/${slug}`);
        await expect(carol.folder).toContainText(PLACEHOLDER);
        await expect(carol.folder.locator('.el-row')).toHaveCount(0);
      });

      expect(carol.violations, 'content security policy violations').toEqual([]);
    } finally {
      await carol.context.close();
    }
  });
});
