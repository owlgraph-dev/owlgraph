// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { acquireLock, applyPicksToPage, captureStandaloneVersion, createPage, saveDoc } from '$lib/features/pages/server';
import { connectAs, textOf, userOf } from '$tests/integration/mcp';

// The page write boundary (sanitizeDoc, run by pages.server.ts's persistDocTx),
// through every write path that reaches it and the lost-draft path that
// doesn't. GraphQL writes no page: its schema has no mutations.

/** Script, an event handler and a javascript: URL, beside markup that stays. */
const DIRTY_HTML =
  '<p>kept</p><script>alert(1)</script><p onclick="alert(2)">handler</p><a href="javascript:alert(3)">script link</a><img src="https://example.org/x.png" onerror="alert(4)">';
const CLEAN_HTML = '<p>kept</p><p>handler</p><a rel="noopener noreferrer">script link</a><img src="https://example.org/x.png" />';

/** What none of it may leave anywhere in what is stored. */
const SCRIPTED = /<script|on(?:click|error)|script:|alert\(/i;

type Node = { type: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: Node[]; text?: string };

const htmlBlock = (blockId: string): Node => ({ type: 'htmlBlock', attrs: { blockId, html: DIRTY_HTML } });
const linked = (text: string, attrs: Record<string, unknown>): Node => ({ type: 'text', text, marks: [{ type: 'link', attrs }] });
/** Link marks with a script-capable href however spelled, a script in a data: URL, and a web link that stays. */
const links = (): Node[] => [
  linked('plain ', { href: 'javascript:alert(5)' }),
  linked('cased ', { href: ' JaVaScRiPt:alert(6)' }),
  linked('tabbed ', { href: 'java\tscript:alert(7)' }),
  linked('data ', { href: 'data:text/html,<script>alert(8)</script>' }),
  linked('web', { href: 'https://example.org/' }),
];
const LINKS_STORED = ['#', '#', '#', '#', 'https://example.org/'];
const linkedParagraph = (blockId: string): Node => ({ type: 'paragraph', attrs: { blockId }, content: links() });
const cell = (isHeader: boolean, content: Node[]): Node => ({ type: 'tableCell', attrs: { isHeader }, content });

/** A page with both kinds at every depth: on the page, in a grid cell, in a table cell. */
const dirtyDoc = () => ({
  type: 'doc',
  content: [
    htmlBlock('top-html'),
    linkedParagraph('top-links'),
    {
      type: 'grid',
      attrs: { blockId: 'grid', columnWidths: [1] },
      content: [{ type: 'gridCell', content: [htmlBlock('cell-html'), linkedParagraph('cell-links')] }],
    },
    {
      type: 'table',
      attrs: { blockId: 'table', columnWidths: [1, 1] },
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [cell(true, [{ type: 'text', text: 'Links' }]), cell(true, [{ type: 'text', text: 'Markup' }])] },
        // A table cell holds inline content, so an HTML block in one is only what a crafted request could send.
        { type: 'tableRow', attrs: { isHeader: false }, content: [cell(false, links()), cell(false, [htmlBlock('table-html')])] },
      ],
    },
  ],
});

/** Every value `pick` finds in the document, depth first. */
function collect<T>(node: Node, pick: (n: Node) => T | undefined): T[] {
  const found: T[] = [];
  const walk = (n: Node) => {
    const value = pick(n);
    if (value !== undefined) found.push(value);
    for (const child of n.content ?? []) walk(child);
  };
  walk(node);
  return found;
}
const htmlsOf = (doc: Node) => collect(doc, (n) => (n.type === 'htmlBlock' ? n.attrs?.html : undefined));
const linkMarksOf = (doc: Node) => collect(doc, (n) => n.marks?.find((m) => m.type === 'link')?.attrs);
const hrefsOf = (doc: Node) => linkMarksOf(doc).map((attrs) => attrs?.href);

/** The page's document as stored, and the one its latest version holds. */
async function storedDocs(pageId: string): Promise<{ page: Node; version: Node }> {
  const [{ doc }] = await db<{ doc: Node }[]>`select doc from pages where id = ${pageId}`;
  const [latest] = await db<{ doc: Node }[]>`
    select pv.doc from page_versions pv join node_versions v on v.id = pv.version_id
    where v.node_id = ${pageId} order by v.version_no desc limit 1`;
  return { page: doc, version: latest?.doc };
}

let n = 0;
const newPage = async () => (await createPage(`Saved markup ${++n}`, await userOf('editorA'))).id;

describe('a page saved with script-capable markup', () => {
  it('is stored without its scripts, event handlers and javascript: URLs, in HTML blocks and link marks at every depth (saveDoc: the REST PUT, a version restore)', async () => {
    const pageId = await newPage();
    expect(await saveDoc(pageId, dirtyDoc(), { authorId: (await userOf('editorA')).id })).not.toBeNull();

    const { page, version } = await storedDocs(pageId);
    for (const doc of [page, version]) {
      expect(htmlsOf(doc)).toEqual([CLEAN_HTML, CLEAN_HTML, CLEAN_HTML]);
      expect(hrefsOf(doc)).toEqual([...LINKS_STORED, ...LINKS_STORED, ...LINKS_STORED]);
      expect(JSON.stringify(doc)).not.toMatch(SCRIPTED);
    }
    // What stays is the text the links were on.
    expect(collect(page, (n) => n.text).join('')).toContain('plain cased tabbed data web');
  });

  it('is stored without an event handler a link mark carries beside its href, at every depth', async () => {
    const pageId = await newPage();
    const handled = () => [{ type: 'paragraph', content: [linked('web', { href: 'https://example.org/', onclick: 'alert(9)', onmouseover: 'alert(10)' })] }];
    const doc = {
      type: 'doc',
      content: [
        ...handled(),
        { type: 'grid', attrs: { columnWidths: [1] }, content: [{ type: 'gridCell', content: handled() }] },
        { type: 'table', attrs: { columnWidths: [1] }, content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [cell(true, handled()[0].content)] }] },
      ],
    };
    await saveDoc(pageId, doc);

    const { page, version } = await storedDocs(pageId);
    for (const stored of [page, version]) {
      expect(linkMarksOf(stored)).toEqual([{ href: 'https://example.org/' }, { href: 'https://example.org/' }, { href: 'https://example.org/' }]);
      expect(JSON.stringify(stored)).not.toMatch(SCRIPTED);
    }
  });

  it('is stored without them when an agent appends it or sets it in a grid cell (the MCP block tools)', async () => {
    const pageId = await newPage();
    const agent = await connectAs('editorA');
    const tool = async (name: string, args: Record<string, unknown>) => {
      const res = await agent.callTool({ name, arguments: { pageId, ...args } });
      expect(res.isError, textOf(res)).toBeFalsy();
      return textOf(res);
    };
    await tool('append_block', { block: { kind: 'html', html: DIRTY_HTML } });
    const grid = (await tool('append_block', { block: { kind: 'grid', columns: 1, cells: [[{ kind: 'html', html: DIRTY_HTML }]] } })).replace('Appended block ', '');
    await tool('set_cell', { gridBlockId: grid, cellIndex: 0, mode: 'append', blocks: [{ kind: 'html', html: DIRTY_HTML }] });

    const { page } = await storedDocs(pageId);
    expect(htmlsOf(page)).toEqual([CLEAN_HTML, CLEAN_HTML, CLEAN_HTML]);
    expect(JSON.stringify(page)).not.toMatch(SCRIPTED);
  });

  it('is stored without them when it arrives as blocks applied from picks (the apply-picks route)', async () => {
    const editorA = await userOf('editorA');
    const pageId = await newPage();
    const { token } = await acquireLock(pageId, editorA.id);
    const picks = [
      { blockId: 'picked-html', op: 'add' as const, block: htmlBlock('picked-html') },
      { blockId: 'picked-links', op: 'add' as const, block: linkedParagraph('picked-links'), afterBlockId: 'picked-html' },
      { blockId: 'grid', op: 'add' as const, block: dirtyDoc().content[2], afterBlockId: 'picked-links' },
    ];
    expect(await applyPicksToPage(pageId, picks, { lockToken: token!, authorId: editorA.id })).toEqual({ ok: true });

    const { page, version } = await storedDocs(pageId);
    for (const doc of [page, version]) {
      expect(htmlsOf(doc)).toEqual([CLEAN_HTML, CLEAN_HTML]);
      expect(hrefsOf(doc)).toEqual([...LINKS_STORED, ...LINKS_STORED]);
      expect(JSON.stringify(doc)).not.toMatch(SCRIPTED);
    }
  });

  // The versions route hands the body's doc to captureStandaloneVersion, as here.
  it('is stored without them when it is kept as a lost draft (the versions route)', async () => {
    const editorA = await userOf('editorA');
    const pageId = await newPage();
    const versionId = await captureStandaloneVersion({ nodeType: 'page', nodeId: pageId, payload: dirtyDoc(), kind: 'lost_draft', authorId: editorA.id });

    const [{ doc }] = await db<{ doc: Node }[]>`select doc from page_versions where version_id = ${versionId}`;
    expect(htmlsOf(doc)).toEqual([CLEAN_HTML, CLEAN_HTML, CLEAN_HTML]);
    expect(hrefsOf(doc)).toEqual([...LINKS_STORED, ...LINKS_STORED, ...LINKS_STORED]);
    expect(JSON.stringify(doc)).not.toMatch(SCRIPTED);
  });
});
