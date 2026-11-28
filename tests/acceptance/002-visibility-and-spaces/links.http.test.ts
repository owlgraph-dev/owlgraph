// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { call, createPage, startApp, type CallOptions, type ServedApp } from '#tests/integration/http.ts';

// 002.20: what a link on a page shows a reader who may not read its target.
// One public page links, inline and by quick link, to a page anyone reads, to
// a page and a document only some may read, and to a page that is gone.

const app = await startApp();
const seed = inject('seed');

describe.skipIf(app.skipped)('a link on a page, as each reader is sent it', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  const GONE = '00000000-0000-4000-8000-00000000dead';
  const GONE_SLUG = 'a-page-long-gone';
  const VISITOR: CallOptions = {};
  const NOT_SHARED: CallOptions = { as: 'editorC' };

  /** An admin's page, set to restricted by itself: no one else reads it. */
  let hidden: { id: string; slug: string };
  /** The address of the public page that holds the links. */
  let address: string;

  beforeAll(async () => {
    hidden = await createPage(served, 'admin', { title: 'Ledger of the vault', visibility: 'restricted' });
    const pageLink = (text: string, targetPageId: string, targetSlug: string) => ({ type: 'text', text, marks: [{ type: 'pageLink', attrs: { targetPageId, targetSlug } }] });
    const docLink = (text: string, targetDocId: string) => ({ type: 'text', text, marks: [{ type: 'docLink', attrs: { targetDocId } }] });
    const card = (blockId: string, label: string, targetPageId: string, targetSlug: string) => ({ type: 'quickLink', attrs: { blockId, refType: 'page', targetPageId, targetSlug, label } });
    const between = { type: 'text', text: ' · ' };
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: 'inline' },
          content: [
            pageLink('inline to the open page', seed.publicId, seed.publicSlug),
            between,
            pageLink('inline to the hidden page', hidden.id, hidden.slug),
            between,
            docLink('inline to the hidden document', seed.restrictedDocId),
            between,
            pageLink('inline to a page gone', GONE, GONE_SLUG),
          ],
        },
        card('card-hidden', 'card to the hidden page', hidden.id, hidden.slug),
        card('card-gone', 'card to a page gone', GONE, GONE_SLUG),
        // No label of its own: the slug it was placed with stands in for one.
        card('card-unlabelled', '', hidden.id, hidden.slug),
      ],
    };
    // A new page inherits the default space, which the suite's seed makes public.
    address = `/${(await createPage(served, 'admin', { title: 'A page of links', doc })).slug}`;
  });

  const sent = async (asker: CallOptions) => {
    const res = await call(served, address, asker);
    expect(res.status).toBe(200);
    return res.text();
  };
  /** Where the link with this text leads, as the page's markup has it: the text may sit in elements of the link's own, never in another link. */
  const hrefOf = (html: string, text: string) => new RegExp(`<a\\b[^>]*\\bhref="([^"]*)"[^>]*>(?:\\s|<(?!/?a\\b)[^>]+>)*${text}`).exec(html)?.[1];

  it('002.20 a link to a node its reader may not read is shown as a link to a node that does not exist, and carries no address of it', async () => {
    for (const asker of [VISITOR, NOT_SHARED]) {
      const who = asker.as ?? 'a visitor';
      const html = await sent(asker);
      expect(hrefOf(html, 'inline to the open page'), who).toBe(`/${seed.publicSlug}`);

      const gone = hrefOf(html, 'inline to a page gone');
      expect(gone, who).toBeDefined();
      expect(hrefOf(html, 'inline to the hidden page'), who).toBe(gone);
      expect(hrefOf(html, 'inline to the hidden document'), who).toBe(gone);
      expect(hrefOf(html, 'card to the hidden page'), who).toBe(hrefOf(html, 'card to a page gone'));
      expect(hrefOf(html, 'card to a page gone'), who).toBe(gone);

      for (const slug of [hidden.slug, seed.restrictedDocSlug, GONE_SLUG]) expect(html, `${slug}, sent to ${who}`).not.toContain(slug);
    }

    // Whoever may read the targets is led to them.
    const html = await sent({ as: 'admin' });
    expect(hrefOf(html, 'inline to the hidden page')).toBe(`/${hidden.slug}`);
    expect(hrefOf(html, 'inline to the hidden document')).toBe(`/${seed.restrictedDocSlug}`);
    expect(hrefOf(html, 'card to the hidden page')).toBe(`/${hidden.slug}`);
  });
});
