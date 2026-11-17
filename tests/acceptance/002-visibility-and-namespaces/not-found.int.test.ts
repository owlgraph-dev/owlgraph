// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import { connectAs, textOf } from '#tests/integration/mcp.ts';

// 002.5 for an agent: what a tool answers for a node its user may not read,
// beside what it answers for one that does not exist.

const seed = inject('seed');
const MISSING = '00000000-0000-4000-8000-000000000000';

describe('a node the agent’s user may not read, asked for through a tool', () => {
  it('002.5 a restricted page the agent’s user may not read answers a tool exactly as one that does not exist', async () => {
    const viewer = await connectAs('viewer');
    const res = await viewer.callTool({ name: 'get_page', arguments: { pageId: seed.restrictedId } });
    const missing = await viewer.callTool({ name: 'get_page', arguments: { pageId: MISSING } });
    expect(res.isError).toBeTruthy();
    expect(textOf(res)).toBe('Page not found');
    expect(textOf(res)).toBe(textOf(missing));
  });

  describe('a link the agent writes', () => {
    /** A page of the agent's own, as it reads it back after linking to a page its user may not read and to an id no page has. */
    let page: string;
    beforeAll(async () => {
      const agent = await connectAs('editorC');
      const made = await agent.callTool({ name: 'create_page', arguments: { title: 'A page that links' } });
      const pageId = /Created page (\S+)/.exec(textOf(made))![1];
      const linked = await agent.callTool({ name: 'append_block', arguments: { pageId, block: { kind: 'paragraph', text: `See [[${seed.restrictedId}]] and [[${MISSING}]].` } } });
      expect(linked.isError).toBeFalsy();
      page = textOf(await agent.callTool({ name: 'get_page', arguments: { pageId } }));
      // A link to an id no page has stays the text it was.
      expect(page).toContain(`[[${MISSING}]]`);
    });

    // Today a link's target is looked up without asking whether the agent's
    // user may read it: the link is made, and with no label of its own it
    // takes the page's title (pages/pages.server.ts,
    // content/blocks/blockInput.server.ts).
    it.fails('002.5 an agent’s link to a page its user may not read is taken as a link to one that does not exist', () => {
      expect(page).not.toContain(seed.restrictedTitle);
      expect(page).toContain(`[[${seed.restrictedId}]]`);
    });
  });
});
