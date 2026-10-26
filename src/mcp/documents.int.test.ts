// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { connectAs, jsonOf, textOf } from '$tests/integration/mcp';

const seed = inject('seed');
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('a link document made by an agent', () => {
  it('stores a doi: address as its https://doi.org URL, with no type, size or stored text', async () => {
    const editor = await connectAs('editorA');
    const res = await editor.callTool({ name: 'create_document_link', arguments: { title: 'MCP linked paper', url: 'doi:10.1000/mcp-e2e' } });
    expect(res.isError).toBeFalsy();
    const created = jsonOf<{ id: string }>(res);
    expect(created).toMatchObject({ sourceKind: 'link', externalUrl: 'https://doi.org/10.1000/mcp-e2e' });

    const doc = jsonOf(await editor.callTool({ name: 'get_document', arguments: { documentId: created.id } }));
    expect(doc).toMatchObject({ sourceKind: 'link', externalUrl: 'https://doi.org/10.1000/mcp-e2e', mime: null, size: null });
    expect(textOf(await editor.callTool({ name: 'get_document_text', arguments: { documentId: created.id } }))).toMatch(/no stored text/i);
  });

  it('is refused for a javascript: address as an invalid URL, and for a viewer as forbidden', async () => {
    const editor = await connectAs('editorA');
    const bad = await editor.callTool({ name: 'create_document_link', arguments: { title: 'Bad link', url: 'javascript:alert(1)' } });
    expect(bad.isError).toBeTruthy();
    expect(textOf(bad)).toMatch(/invalid url/i);

    const viewer = await connectAs('viewer');
    const denied = await viewer.callTool({ name: 'create_document_link', arguments: { title: 'Nope', url: 'https://example.org/' } });
    expect(denied.isError).toBeTruthy();
    expect(textOf(denied)).toMatch(/forbidden/i);
  });
});

describe('reading a document', () => {
  it('an uploaded document reports sourceKind upload with no external URL', async () => {
    const editor = await connectAs('editorA');
    expect(jsonOf(await editor.callTool({ name: 'get_document', arguments: { documentId: seed.mdDocId } }))).toMatchObject({ sourceKind: 'upload', externalUrl: null });
  });

  it('a viewer reads the public and the internal document; the restricted one answers exactly as one that does not exist', async () => {
    const viewer = await connectAs('viewer');
    expect((await viewer.callTool({ name: 'get_document', arguments: { documentId: seed.publicDocId } })).isError).toBeFalsy();
    expect((await viewer.callTool({ name: 'get_document', arguments: { documentId: seed.docId } })).isError).toBeFalsy();
    const restricted = await viewer.callTool({ name: 'get_document', arguments: { documentId: seed.restrictedDocId } });
    const missing = await viewer.callTool({ name: 'get_document', arguments: { documentId: MISSING } });
    expect(restricted.isError).toBeTruthy();
    expect(textOf(restricted)).toBe('Document not found');
    expect(textOf(restricted)).toBe(textOf(missing));
  });

  it('the editor the restricted document is shared with reads it', async () => {
    const shared = await connectAs('editorB');
    expect((await shared.callTool({ name: 'get_document', arguments: { documentId: seed.restrictedDocId } })).isError).toBeFalsy();
  });

  it('an admin reads the restricted document', async () => {
    const admin = await connectAs('admin');
    expect((await admin.callTool({ name: 'get_document', arguments: { documentId: seed.restrictedDocId } })).isError).toBeFalsy();
  });

  it('get_document_text answers the Markdown document’s extracted body text', async () => {
    const editor = await connectAs('editorA');
    const res = await editor.callTool({ name: 'get_document_text', arguments: { documentId: seed.mdDocId } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('Searchable body text');
  });

  it('the search tool finds the public document but not the restricted one for an editor it is not shared with', async () => {
    const outsider = await connectAs('editorC');
    const text = textOf(await outsider.callTool({ name: 'search', arguments: { query: 'Document' } }));
    expect(text).toContain('Public Document');
    expect(text).not.toContain('Restricted Document');
  });
});
