// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { logger } from '$lib/platform/logger.server';
import { can } from '$lib/features/auth/server';
import { createCollection, renameCollection } from '$lib/features/collections/server';
import { setNodeVisibility } from '$lib/features/nodes/server';
import { createPluginHost, dispatchPluginRequest, savePluginSettings } from '$lib/features/pluginHost/server';
import { createPage, getPage, saveDoc } from '$lib/features/pages/server';
import { load as searchPage } from '$lib/features/search/routes/searchPage.server';
import { pluginServer } from '$lib/plugins/server';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { connectAs, textOf, userOf, type Role } from '$tests/integration/mcp';
import { nextcloud } from './index';
import { startMockNextcloud, type MockNextcloud } from './e2e/mockNextcloud';

// The plugin as an agent meets it, through the real MCP server in-process,
// against the mock (docs/architecture/mcp.md). The settings are this module copy's, saved
// before the first call; collections and documents are made through the
// plugin's routes, dispatched as the API route does.

const PDF = '%PDF-1.4\n';
let mock: MockNextcloud;
let shares = 0;

beforeAll(async () => {
  mock = await startMockNextcloud();
  await savePluginSettings(nextcloud, { enabled: true, values: { origin: mock.origin, cacheSeconds: 0 } });
});
afterAll(async () => {
  await mock.close();
});

/** As a seeded role, through the dispatcher the API route hands requests to. */
async function plugin(as: Role, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<Response> {
  const user = await userOf(as);
  const [rawPath, search = ''] = path.split('?');
  const allowed = () => ({ allowed: true, retryAfterMs: 0 });
  return dispatchPluginRequest(
    {
      method,
      pluginId: nextcloud.id,
      rawPath,
      query: new URLSearchParams(search),
      contentType: body === undefined ? null : 'application/json',
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    },
    {
      server: pluginServer,
      signedIn: true,
      canManage: can(user, 'integration:manage'),
      rateLimit: allowed,
      credentialBudget: allowed,
      credentialFailed: () => {},
      host: (pluginId) => createPluginHost(pluginId, { user, locale: 'en', log: logger }),
      refused: (kind) => new Response(JSON.stringify({ error: kind }), { status: kind === 'session' ? 401 : kind === 'manage' ? 403 : 429 }),
    }
  );
}

/** A fresh share's collection and a document of its file, both in the public default namespace. */
async function connectShare() {
  const token = `AgentShare${++shares}`;
  mock.shares.set(token, {
    name: 'Agentenablage',
    files: { 'Bericht.pdf': { content: PDF, mime: 'application/pdf', fileid: 701, modified: new Date('2026-10-02T09:30:00Z') } },
    folders: ['Q3'],
  });
  const anchor = await createPage(`Anchor ${shares}`, await userOf('admin'));
  const connected = await plugin('admin', 'POST', 'collections', { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` });
  expect(connected.status, await connected.clone().text()).toBe(201);
  const { collection } = (await connected.json()) as { collection: { id: string } };
  const made = await plugin('admin', 'POST', 'documents', { collectionId: collection.id, path: 'Bericht.pdf', fileid: '701' });
  expect(made.status, await made.clone().text()).toBe(201);
  const { document } = (await made.json()) as { document: { id: string } };
  return { collectionId: collection.id, documentId: document.id, token };
}

type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const storedBlocks = async (pageId: string) => (((await getPage(pageId))!.doc as Node).content ?? []);
const blockIdOf = (text: string) => /Appended block (\S+)/.exec(text)![1];

describe('the Nextcloud blocks, authored by an agent', () => {
  it('are appended over a collection and a document the agent may read, named by get_page and stored as the nodes a person inserts', async () => {
    const { collectionId, documentId } = await connectShare();
    const page = await createPage('Agent blocks', await userOf('admin'));
    const agent = await connectAs('admin');
    const folder = textOf(await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'nextcloud-folder', collectionId, pageSize: 2, density: 'compact' } } }));
    expect(folder).toMatch(/Appended block \S+/);
    const file = textOf(await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'nextcloud-file', documentId, variant: 'card' } } }));
    expect(file).toMatch(/Appended block \S+/);

    const read = textOf(await agent.callTool({ name: 'get_page', arguments: { pageId: page.id } }));
    expect(read).toContain(`Nextcloud folder: collection ${collectionId}`);
    expect(read).toContain(`Nextcloud file: document ${documentId}`);

    // Sparse, as the editor's insert makes them: what the agent left out stays the default.
    const [folderNode, fileNode] = (await storedBlocks(page.id)).filter((n) => n.type !== 'paragraph');
    expect(folderNode).toEqual({ type: 'nextcloudFolder', attrs: { blockId: blockIdOf(folder), collectionId, pageSize: 2, density: 'compact', startPath: '' } });
    expect(fileNode).toEqual({ type: 'nextcloudFile', attrs: { blockId: blockIdOf(file), documentId, variant: 'card' } });
  });

  it("refuses what is not the plugin's or not the agent's to read, and the plugin's nodes as core blocks — naming the kind that shows them", async () => {
    const { collectionId, documentId } = await connectShare();
    const admin = await userOf('admin');
    const curated = await createCollection({ title: 'Not a share', createdBy: admin.id, user: admin });
    const page = await createPage('Agent refusals', admin);
    const agent = await connectAs('admin');

    const notOurs = await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'nextcloud-folder', collectionId: curated.id } } });
    expect(notOurs.isError).toBe(true);
    expect(textOf(notOurs)).toContain(`Nextcloud collection ${curated.id} not found`);
    const mirrored = textOf(await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'collection', nodeId: collectionId } } }));
    expect(mirrored).toContain("mirrored by an integration (nextcloud) — embed it with kind 'nextcloud-folder'");
    const kept = textOf(await agent.callTool({ name: 'append_block', arguments: { pageId: page.id, block: { kind: 'document', nodeId: documentId } } }));
    expect(kept).toContain("kept by an integration (nextcloud) — embed it with kind 'nextcloud-file'");
    expect((await storedBlocks(page.id)).filter((n) => n.type !== 'paragraph')).toEqual([]);
  });

  it('are taken by update_block and set_cell where the core’s kinds are, in a grid’s cells too, and refused there over nodes the agent may not read, as append_block refuses them', async () => {
    const visible = await connectShare();
    const hidden = await connectShare();
    await setNodeVisibility(hidden.collectionId, 'restricted', { touch: true });
    await setNodeVisibility(hidden.documentId, 'restricted', { touch: true });
    const page = await createPage('Agent cells', await userOf('editorA'));
    const agent = await connectAs('editorA');
    const call = (name: string, args: Record<string, unknown>) => agent.callTool({ name, arguments: { pageId: page.id, ...args } });

    const paragraph = blockIdOf(textOf(await call('append_block', { block: { kind: 'paragraph', text: 'Soon a folder.' } })));
    expect(textOf(await call('update_block', { blockId: paragraph, block: { kind: 'nextcloud-folder', collectionId: visible.collectionId, startPath: 'Q3' } }))).toBe(`Updated block ${paragraph}`);

    const layout = blockIdOf(textOf(await call('append_block', { block: { kind: 'grid', columns: 2, cells: [[], []] } })));
    expect(textOf(await call('set_cell', { gridBlockId: layout, cellIndex: 0, blocks: [{ kind: 'nextcloud-file', documentId: visible.documentId }] }))).toBe(`Updated cell 0 of grid ${layout}`);
    expect(textOf(await call('set_cell', { gridBlockId: layout, cellIndex: 1, blocks: [{ kind: 'nextcloud-folder', collectionId: visible.collectionId }] }))).toBe(`Updated cell 1 of grid ${layout}`);
    const cellsOf = async () => {
      const container = (await storedBlocks(page.id)).find((n) => n.type === 'grid')!;
      return container.content!.map((cell) => cell.content!.map((n) => ({ type: n.type, node: n.attrs?.collectionId ?? n.attrs?.documentId })));
    };
    expect(await cellsOf()).toEqual([[{ type: 'nextcloudFile', node: visible.documentId }], [{ type: 'nextcloudFolder', node: visible.collectionId }]]);
    const replaced = { kind: 'grid', columns: 2, cells: [[{ kind: 'nextcloud-folder', collectionId: visible.collectionId }], [{ kind: 'nextcloud-file', documentId: visible.documentId, variant: 'card' }]] };
    expect(textOf(await call('update_block', { blockId: layout, block: replaced }))).toBe(`Updated block ${layout}`);
    expect(await cellsOf()).toEqual([[{ type: 'nextcloudFolder', node: visible.collectionId }], [{ type: 'nextcloudFile', node: visible.documentId }]]);

    const before = await storedBlocks(page.id);
    expect(before.map((n) => n.type)).toEqual(['nextcloudFolder', 'grid']);
    expect(before[0].attrs).toMatchObject({ collectionId: visible.collectionId, startPath: 'Q3' });

    // Over nodes only the admin may read: every tool refuses alike, nothing changes.
    const notFoundCollection = `Nextcloud collection ${hidden.collectionId} not found`;
    const notFoundDocument = `Nextcloud document ${hidden.documentId} not found`;
    const folder = before[0].attrs!.blockId as string;
    const refusals: [string, Record<string, unknown>, string][] = [
      ['append_block', { block: { kind: 'nextcloud-folder', collectionId: hidden.collectionId } }, notFoundCollection],
      ['append_block', { block: { kind: 'nextcloud-file', documentId: hidden.documentId } }, notFoundDocument],
      ['update_block', { blockId: folder, block: { kind: 'nextcloud-folder', collectionId: hidden.collectionId } }, notFoundCollection],
      ['update_block', { blockId: folder, block: { kind: 'nextcloud-file', documentId: hidden.documentId } }, notFoundDocument],
      ['update_block', { blockId: layout, block: { kind: 'grid', columns: 2, cells: [[{ kind: 'nextcloud-folder', collectionId: hidden.collectionId }], []] } }, notFoundCollection],
      ['set_cell', { gridBlockId: layout, cellIndex: 0, blocks: [{ kind: 'nextcloud-file', documentId: hidden.documentId }] }, notFoundDocument],
      ['set_cell', { gridBlockId: layout, cellIndex: 1, blocks: [{ kind: 'nextcloud-folder', collectionId: hidden.collectionId }], mode: 'append' }, notFoundCollection],
    ];
    for (const [tool, args, refusal] of refusals) {
      const res = await call(tool, args);
      expect(res.isError, `${tool} ${JSON.stringify(args)}`).toBe(true);
      expect(textOf(res)).toContain(refusal);
    }
    expect(await storedBlocks(page.id)).toEqual(before);
  });
});

describe('the Nextcloud file block, read by an agent', () => {
  it('is listed for an agent reading the page — its document, nothing of the share', async () => {
    const { documentId, token } = await connectShare();
    const page = await createPage('Agent reads a file', await userOf('admin'));
    await saveDoc(page.id, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Above the file.' }] }, { type: 'nextcloudFile', attrs: { blockId: 'file-1', documentId } }] });
    const agent = await connectAs('admin');
    const read = textOf(await agent.callTool({ name: 'get_page', arguments: { pageId: page.id } }));
    expect(read).toContain(`Nextcloud file: document ${documentId}`);
    // Nothing is resolved for an agent: the neutral placeholder.
    const html = textOf(await agent.callTool({ name: 'get_page_html', arguments: { pageId: page.id } }));
    expect(html).toContain('Currently unavailable');
    for (const text of [read, html]) expect(text).not.toContain(token);
  });
});

describe('search over a share', () => {
  /** As the admin. */
  async function searched(q: string): Promise<string[]> {
    const loaded = (await searchPage({ url: new URL(`http://owlgraph.test/search?${new URLSearchParams({ q })}`), locals: { user: await userOf('admin') } } as unknown as ServerLoadEvent)) as unknown as {
      results: { title: string }[];
    };
    return loaded.results.map((r) => r.title);
  }

  it('finds a collection by its share’s name, and a document by its folders and its file — the new file’s once bound to another', async () => {
    // A suffix no other node carries.
    const n = '4711';
    const token = `AgentSearch${n}`;
    mock.shares.set(token, {
      name: `Zettelkasten${n}`,
      files: {
        [`Quartal${n}/Bericht${n}.pdf`]: { content: PDF, mime: 'application/pdf', fileid: 501 },
        [`Quartal${n}/Anhang${n}.txt`]: { content: 'attached', mime: 'text/plain', fileid: 502 },
      },
    });
    const anchor = await createPage('Search anchor', await userOf('admin'));
    const connected = await plugin('admin', 'POST', 'collections', { pageId: anchor.id, shareUrl: `${mock.origin}/s/${token}` });
    expect(connected.status, await connected.clone().text()).toBe(201);
    const { collection } = (await connected.json()) as { collection: { id: string; title: string } };
    expect(collection.title).toBe(`Zettelkasten${n}`);

    // Renamed, still found by its share's name and the integration's.
    const renamed = `Ablage ${n}`;
    expect((await renameCollection(collection.id, { title: renamed }))?.title).toBe(renamed);
    expect(await searched(`Zettelkasten${n}`)).toContain(renamed);
    expect(await searched(`Nextcloud Zettelkasten${n}`)).toContain(renamed);

    // By its folder and its file's name without the extension, not by a sibling's.
    const made = await plugin('admin', 'POST', 'documents', { collectionId: collection.id, path: `Quartal${n}/Bericht${n}.pdf`, fileid: '501' });
    expect(made.status, await made.clone().text()).toBe(201);
    const { document } = (await made.json()) as { document: { id: string; title: string } };
    expect(document.title).toBe(`Bericht${n}.pdf`);
    expect(await searched(`Quartal${n}`)).toContain(`Bericht${n}.pdf`);
    expect(await searched(`Bericht${n}`)).toContain(`Bericht${n}.pdf`);
    expect(await searched(`Anhang${n}`)).not.toContain(`Bericht${n}.pdf`);

    // Rebound: the title stays, and the new file's name finds it.
    const rebound = await plugin('admin', 'PATCH', `documents/${document.id}`, { path: `Quartal${n}/Anhang${n}.txt`, fileid: '502' });
    expect(rebound.status, await rebound.clone().text()).toBe(200);
    expect(await searched(`Anhang${n}`)).toContain(`Bericht${n}.pdf`);
  });
});
