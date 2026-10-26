// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { test, expect } from '../fixtures';
import { seed } from '../seed-data';
import { unique } from '../api';

// The real MCP server in the worker, over the SDK's in-memory transport; the
// flag is read when its module loads, so it never listens.
process.env.MCP_DISABLE_LISTEN = '1';

/** An agent's client, connected as the user the seeded API token names. */
async function agent(token: string): Promise<Client> {
  const [{ Client }, { InMemoryTransport }, { getUserByToken }, { buildServer }, { logger }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/inMemory.js'),
    import('../../../src/lib/features/auth/server'),
    import('../../../src/mcp/server'),
    import('../../../src/lib/platform/logger.server'),
  ]);
  // Its tool calls would log to the test's output.
  const quiet = logger.child({}, { level: 'silent' });
  const user = await getUserByToken(token, quiet);
  expect(user, 'the seeded token names a user').not.toBeNull();
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'e2e', version: '0.0.0' });
  await buildServer(user!, quiet).connect(serverSide);
  await client.connect(clientSide);
  return client;
}

type ToolResult = Awaited<ReturnType<Client['callTool']>>;
const textOf = (res: ToolResult) => ((res.content ?? []) as { text?: string }[]).map((c) => c.text ?? '').join('\n');

test.describe('an agent writes, a reader reads', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a page an agent makes with a flex row and a button quick link opens for a reader, the quick link hydrated', async ({ page }) => {
    const { name: title } = unique('Agent page');
    let slug = '';
    let rowId = '';

    await test.step('an agent makes a page with a flex row and a button quick link through the MCP server', async () => {
      const client = await agent(seed.tokens.editorA);
      try {
        // The page follows its namespace: the test database's default one is public.
        const created = textOf(await client.callTool({ name: 'create_page', arguments: { title } }));
        const [, pageId, pageSlug] = /Created page (\S+) \(slug: ([^,]+),/.exec(created) ?? [];
        expect(pageId, created).toBeTruthy();
        slug = pageSlug;
        const appended = await client.callTool({
          name: 'append_block',
          arguments: {
            pageId,
            block: {
              kind: 'flex',
              layout: { desktop: { gap: 12, flexWrap: 'wrap' } },
              cells: [[{ kind: 'quickLink', url: 'https://example.com/docs', label: 'Read the docs', variant: 'button' }], [{ kind: 'paragraph', text: 'Written by an agent.' }]],
            },
          },
        });
        expect(appended.isError, textOf(appended)).toBeFalsy();
        rowId = /Appended block (\S+)/.exec(textOf(appended))![1];
      } finally {
        await client.close();
      }
    });

    await test.step('a reader opens it: the row and its cells, the quick link hydrated', async () => {
      await page.goto(`/${slug}`);
      await expect(page).toHaveTitle(new RegExp(title));
      const row = page.locator(`.canvas-blocks [data-block-id="${rowId}"]`);
      const cells = row.locator('.flex-cell');
      await expect(cells).toHaveCount(2);
      await expect(cells.nth(1)).toHaveText('Written by an agent.');
      const card = cells.nth(0).locator('a.quick-link.quick-link--button');
      await expect(card).toHaveAttribute('data-hydrated', 'true');
      await expect(card.locator('.quick-link-label')).toHaveText('Read the docs');
      await expect(card).toHaveAttribute('href', 'https://example.com/docs');
      // What only the hydrated island does: an off-site destination shown while it is focused.
      await card.focus();
      await expect(cells.nth(0).locator('.quick-link-dest')).toHaveText('example.com');
    });
  });
});
