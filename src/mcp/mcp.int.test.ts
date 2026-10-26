// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import pino from 'pino';
import { db } from '$lib/platform/db.server';
import { loggerOptions, type Logger } from '$lib/platform/logger.server';
import { getUserByToken } from '$lib/features/auth/server';
import { connectAs, textOf, userOf } from '$tests/integration/mcp';

// The real MCP server for a seeded user, over the SDK's in-memory transport
// (tests/integration/mcp.ts).

const seed = inject('seed');
const MISSING = '00000000-0000-4000-8000-000000000000';

// The tool surface is a contract with agents, so the exact set is pinned.
const EXPECTED_TOOLS = [
  'append_block',
  'create_document_link',
  'create_page',
  'delete_block',
  'find_pages_by_property',
  'find_pages_by_tag',
  'get_collection',
  'get_document',
  'get_document_text',
  'get_edges',
  'get_incoming_edges',
  'get_node_properties',
  'get_node_tags',
  'get_page',
  'get_page_html',
  'get_relationships',
  'graphql',
  'list_brand_colors',
  'list_custom_styles',
  'list_documents',
  'list_page_layout_presets',
  'list_pages',
  'list_paragraph_styles',
  'list_property_definitions',
  'list_property_names',
  'list_tags',
  'move_block',
  'schema',
  'search',
  'set_cell',
  'set_node_tags',
  'set_page_content_scheme',
  'set_page_layout',
  'set_page_locale',
  'style_grid',
  'traverse',
  'update_block',
];

async function restrictedPageText(): Promise<string> {
  const [row] = await db<{ doc: unknown }[]>`select doc from pages where id = ${seed.restrictedId}`;
  return JSON.stringify(row.doc);
}

const append = (client: Awaited<ReturnType<typeof connectAs>>, pageId: string, text: string) =>
  client.callTool({ name: 'append_block', arguments: { pageId, block: { kind: 'paragraph', text } } });

describe('the server and who it acts for', () => {
  it('a seeded viewer’s API token resolves to the viewer, a made-up one to no one', async () => {
    expect((await userOf('viewer')).role).toBe('viewer');
    expect(await getUserByToken('cms_not_a_real_token')).toBeNull();
  });

  it('names itself owlgraph at its version and offers the source code of the version it runs (AGPL-3.0 §13)', async () => {
    const info = (await connectAs('viewer')).getServerVersion();
    expect(info?.name).toBe('owlgraph');
    expect(info?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(info?.websiteUrl).toMatch(/^https?:\/\//);
    expect(info?.description).toContain(`Source code: ${info?.websiteUrl}`);
  });
});

describe('the tool surface', () => {
  it('every role lists exactly the known tools, each with a description', async () => {
    for (const role of ['viewer', 'editorA', 'admin'] as const) {
      const { tools } = await (await connectAs(role)).listTools();
      expect(tools.map((t) => t.name).sort(), role).toEqual(EXPECTED_TOOLS);
      for (const t of tools) expect(t.description, `${role}: ${t.name}`).toBeTruthy();
    }
  });

  it('offers documents to read, search and add as a link, never to upload, share, change visibility or delete', async () => {
    const names = (await (await connectAs('admin')).listTools()).tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_documents', 'search', 'get_document', 'get_document_text', 'create_document_link']));
    for (const n of names.filter((n) => n !== 'create_document_link')) {
      expect(n).not.toMatch(/upload|create_document|set_document|delete_document|visibility|share/i);
    }
  });

  it('a viewer’s agent lists the read tools, but create_page answers a forbidden tool error', async () => {
    const viewer = await connectAs('viewer');
    const names = (await viewer.listTools()).tools.map((t) => t.name);
    expect(names).toContain('list_pages');
    expect(names).toContain('get_document_text');
    const res = await viewer.callTool({ name: 'create_page', arguments: { title: 'Nope' } });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toMatch(/forbidden/i);
  });

  it('an editor’s agent creates a page, owned by the editor, and is told its id', async () => {
    const res = await (await connectAs('editorA')).callTool({ name: 'create_page', arguments: { title: 'From an agent' } });
    expect(res.isError).toBeFalsy();
    const pageId = /Created page (\S+)/i.exec(textOf(res))![1];
    const [node] = await db<{ title: string; created_by: string }[]>`select title, created_by from nodes where id = ${pageId}`;
    expect(node).toEqual({ title: 'From an agent', created_by: (await userOf('editorA')).id });
  });
});

describe('the tool-call log', () => {
  const capture = () => {
    const lines: Record<string, unknown>[] = [];
    const log = pino({ ...loggerOptions, level: 'info' }, { write: (line: string) => void lines.push(JSON.parse(line)) }) as Logger;
    return { log, lines, of: (event: string) => lines.filter((l) => l.event === event) };
  };

  it('logs a call once as mcp.tool_call with its tool and duration, not denied', async () => {
    const { log, of } = capture();
    await (await connectAs('editorA', log)).callTool({ name: 'get_page', arguments: { pageId: seed.publicId } });
    expect(of('mcp.tool_call')).toEqual([expect.objectContaining({ tool: 'get_page', durationMs: expect.any(Number), denied: false })]);
    expect(of('authz.denied')).toEqual([]);
  });

  it('logs a refused call as denied with its reason, and an authz.denied line beside it', async () => {
    const { log, of } = capture();
    await (await connectAs('viewer', log)).callTool({ name: 'create_page', arguments: { title: 'Nope' } });
    await (await connectAs('editorC', log)).callTool({ name: 'get_page', arguments: { pageId: seed.restrictedId } });
    expect(of('mcp.tool_call')).toEqual([
      expect.objectContaining({ tool: 'create_page', denied: true, denyReason: 'role' }),
      expect.objectContaining({ tool: 'get_page', denied: true, denyReason: 'visibility' }),
    ]);
    expect(of('authz.denied')).toEqual([
      expect.objectContaining({ via: 'mcp', resourceType: 'tool', resourceId: 'create_page' }),
      expect.objectContaining({ via: 'mcp', resourceType: 'page', resourceId: seed.restrictedId }),
    ]);
  });
});

describe('an agent writes a page only where its user may', () => {
  it('a restricted page its user may not read answers a write as a missing page, and is left as it was', async () => {
    const before = await restrictedPageText();
    const outsider = await connectAs('editorC');
    const res = await append(outsider, seed.restrictedId, 'written by an outsider');
    const missing = await append(outsider, MISSING, 'written nowhere');
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toBe('Page not found');
    expect(textOf(res)).toBe(textOf(missing));
    expect(await restrictedPageText()).toBe(before);
  });

  it('the editor the page is shared with writes to it', async () => {
    const res = await append(await connectAs('editorB'), seed.restrictedId, 'written by the shared editor');
    expect(res.isError).toBeFalsy();
    expect(await restrictedPageText()).toContain('written by the shared editor');
  });

  it('a viewer’s role writes no page, not even a public one', async () => {
    const res = await append(await connectAs('viewer'), seed.publicId, 'written by a viewer');
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toMatch(/your role "viewer" cannot write pages/);
  });
});
