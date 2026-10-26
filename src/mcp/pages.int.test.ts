// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { setNodeTags } from '$lib/features/semantic/server';
import { connectAs, jsonOf, textOf, type Role } from '$tests/integration/mcp';

const seed = inject('seed');
const MISSING = '00000000-0000-4000-8000-000000000000';

const createdPageId = (text: string) => /Created page (\S+)/.exec(text)![1];

describe('reading a page', () => {
  it('a restricted page the viewer is not shared on answers exactly as one that does not exist', async () => {
    const viewer = await connectAs('viewer');
    const res = await viewer.callTool({ name: 'get_page', arguments: { pageId: seed.restrictedId } });
    const missing = await viewer.callTool({ name: 'get_page', arguments: { pageId: MISSING } });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toBe('Page not found');
    expect(textOf(res)).toBe(textOf(missing));
  });

  it('the editor the restricted page is shared with reads it', async () => {
    const shared = await connectAs('editorB');
    const res = await shared.callTool({ name: 'get_page', arguments: { pageId: seed.restrictedId } });
    expect(res.isError).toBeFalsy();
    expect(jsonOf<{ title: string }>(res).title).toBe(seed.restrictedTitle);
  });

  it('a viewer reads an internal page', async () => {
    const viewer = await connectAs('viewer');
    const res = await viewer.callTool({ name: 'get_page', arguments: { pageId: seed.internalId } });
    expect(res.isError).toBeFalsy();
    expect(jsonOf<{ title: string }>(res).title).toBe(seed.internalTitle);
  });
});

// The seeded restricted page, owned by editorA and shared with editorB, carries
// the only "secret" status, a tag of its own and a link to the public page.
describe('an agent’s listings and lookups', () => {
  beforeAll(async () => {
    await setNodeTags(seed.restrictedId, ['only-restricted']);
    await db`insert into edges (source_id, target_id) values (${seed.restrictedId}, ${seed.publicId})`;
  });

  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  const lookups: Record<string, { item: string; ids: (role: Role) => Promise<string[]> }> = {
    list_pages: { item: seed.restrictedId, ids: async (role) => ids(jsonOf(await (await connectAs(role)).callTool({ name: 'list_pages', arguments: {} }))) },
    list_documents: {
      item: seed.restrictedDocId,
      ids: async (role) => ids(jsonOf(await (await connectAs(role)).callTool({ name: 'list_documents', arguments: {} }))),
    },
    find_pages_by_property: {
      item: seed.restrictedId,
      ids: async (role) => ids(jsonOf(await (await connectAs(role)).callTool({ name: 'find_pages_by_property', arguments: { name: seed.propStatus, value: 'secret' } }))),
    },
    find_pages_by_tag: {
      item: seed.restrictedId,
      ids: async (role) => ids(jsonOf(await (await connectAs(role)).callTool({ name: 'find_pages_by_tag', arguments: { tag: 'only-restricted' } }))),
    },
    get_incoming_edges: {
      item: seed.restrictedId,
      ids: async (role) => ids(jsonOf(await (await connectAs(role)).callTool({ name: 'get_incoming_edges', arguments: { pageId: seed.publicId } }))),
    },
  };

  describe.each(Object.entries(lookups))('%s', (_, { item, ids }) => {
    it.each(['viewer', 'editorC'] as const)('leaves the restricted node out for %s, who may not read it', async (role) => {
      expect(await ids(role)).not.toContain(item);
    });

    it('lists it for the editor it is shared with', async () => {
      expect(await ids('editorB')).toContain(item);
    });
  });
});

describe('a page written as typed blocks', () => {
  // A Svelte-drawn block (blocks/scaffold/ssrBlock.ts) through the reader's renderer.
  it('renders a Svelte-drawn block as the page does', async () => {
    const admin = await connectAs('admin');
    const pageId = createdPageId(textOf(await admin.callTool({ name: 'create_page', arguments: { title: 'MCP island' } })));
    const appended = await admin.callTool({
      name: 'append_block',
      arguments: { pageId, block: { kind: 'quickLink', url: 'https://example.com/', label: 'Island', variant: 'button' } },
    });
    expect(appended.isError).toBeFalsy();
    const html = textOf(await admin.callTool({ name: 'get_page_html', arguments: { pageId } }));
    expect(html).toMatch(/data-island="quickLink"[^>]*><!--\[-->.*?class="quick-link quick-link--button/s);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('an appended flex row reads back cell by cell, renders as the page does, is replaced whole, and refuses a container in a cell', async () => {
    const admin = await connectAs('admin');
    const pageId = createdPageId(textOf(await admin.callTool({ name: 'create_page', arguments: { title: 'MCP flex' } })));
    const row = {
      kind: 'flex',
      placement: { desktop: { align: 'center' } },
      layout: { desktop: { gap: 12, flexWrap: 'wrap' } },
      cells: [[{ kind: 'quickLink', url: 'https://example.com/', label: 'Start', variant: 'button' }], [{ kind: 'paragraph', text: 'Beside it' }]],
      cellStyles: [{}, { flexItem: { desktop: { size: 'fill' } } }],
    };
    const appended = await admin.callTool({ name: 'append_block', arguments: { pageId, block: row } });
    expect(appended.isError).toBeFalsy();
    const blockId = /Appended block (\S+)/.exec(textOf(appended))![1];
    const page = jsonOf<{ blocks: unknown[] }>(await admin.callTool({ name: 'get_page', arguments: { pageId } }));
    expect(page.blocks[0]).toMatchObject({ blockId, type: 'flexContainer', cells: 2, cellContents: [{ index: 0, blocks: 1 }, { index: 1, blocks: 1, preview: 'Beside it' }] });

    const html = textOf(await admin.callTool({ name: 'get_page_html', arguments: { pageId } }));
    expect(html).toMatch(new RegExp(`<div class="flex-block [^"]*cap-placement"[^>]*data-block-id="${blockId}"[^>]*>.*?<div class="flex grp-containers cap-layout`, 's'));
    expect(html).toContain('data-island="quickLink"');
    expect(html).not.toMatch(/\sstyle=/);

    const updated = await admin.callTool({ name: 'update_block', arguments: { pageId, blockId, block: { ...row, cells: [...row.cells, []] } } });
    expect(updated.isError).toBeFalsy();
    const again = jsonOf<{ blocks: unknown[] }>(await admin.callTool({ name: 'get_page', arguments: { pageId } }));
    expect(again.blocks[0]).toMatchObject({ blockId, cells: 3, cellContents: [{}, {}, { blocks: 0 }] });

    // Validation is the SDK's: a refusal comes back as a tool error, or as a rejected call.
    const nested = await admin.callTool({ name: 'append_block', arguments: { pageId, block: { kind: 'flex', cells: [[row]] } } }).catch(() => ({ isError: true }));
    expect(nested.isError).toBe(true);
  });
});
