// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { beforeAll, describe, expect, inject, it } from 'vitest';
import sharp from 'sharp';
import type { ServerLoadEvent } from '@sveltejs/kit';
import { createPage, getPage, saveDoc } from '$lib/features/pages/server';
import { createShareLink, getNodeBySlug } from '$lib/features/nodes/server';
import { getDefaultNamespace } from '$lib/features/namespaces/server';
import { createImageAsset } from '$lib/features/media/server';
import { logger } from '$lib/platform/logger.server';
import { renderPage } from './server';
import { load as readLoad } from './routes/read.server';
import { load as shareLoad } from './routes/share.server';
import { connectAs, textOf, userOf, type Role } from '$tests/integration/mcp';

// One page holds what tells the readers apart: a link an anonymous reader may
// not follow, a gone target with a cached slug, a hero image with copies, its
// own widths and ground. The seed's query page (tests/support/seed.ts) matches
// a public, an internal and a restricted page.

const seed = inject('seed');

type PageData = Record<string, unknown> & { html: string; css: string; canvasRuleId: string; groundRuleId: string; imagePreloads: unknown[] };
type Reader = { user: Awaited<ReturnType<typeof userOf>> | null };

async function visit(slug: string, { user }: Reader, query = ''): Promise<PageData> {
  const event = { params: { slug }, locals: { user, locale: 'en', log: logger }, url: new URL(`http://owlgraph.test/${slug}${query}`) };
  return (await readLoad(event as unknown as ServerLoadEvent<{ slug: string }>)) as unknown as PageData;
}

async function viaShare(token: string, { user }: Reader): Promise<{ data: PageData & { afterRuleId: string }; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const event = { params: { id: token }, locals: { user, locale: 'en', log: logger }, setHeaders: (h: Record<string, string>) => Object.assign(headers, h) };
  const data = (await shareLoad(event as unknown as ServerLoadEvent<{ id: string }>)) as unknown as PageData & { afterRuleId: string };
  return { data, headers };
}

async function asAgent(role: Role, pageId: string): Promise<string> {
  const client = await connectAs(role);
  try {
    const res = await client.callTool({ name: 'get_page_html', arguments: { pageId } });
    expect(res.isError ?? false, textOf(res)).toBe(false);
    return textOf(res);
  } finally {
    await client.close();
  }
}

function hrefOf(html: string, text: string): string | null {
  const m = new RegExp(`<a [^>]*href="([^"]*)"[^>]*>(?:<[^>]+>)*${text}`).exec(html);
  return m ? m[1] : null;
}

const GONE_ID = '00000000-0000-4000-8000-00000000dead';
let page: { id: string; slug: string };
let secret: { id: string; slug: string };
let open: { id: string; slug: string };
let assetId: string;
let token: string;
let queryToken: string;

beforeAll(async () => {
  const editorA = await userOf('editorA');
  open = await createPage('Reader open target', editorA, { visibility: 'public' });
  secret = await createPage('Reader secret target', editorA, { visibility: 'restricted' });
  page = await createPage('Reader page', editorA, { visibility: 'public' });
  // Wider than the smallest copy, so copies are offered (docs/architecture/media.md).
  const photo = await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#6b7280' } }).png().toBuffer();
  assetId = (await createImageAsset({ bytes: photo, mime: 'image/png', ownerPageId: page.id, createdBy: editorA.id })).id;
  const link = (text: string, targetPageId: string, targetSlug: string) => ({ type: 'text', text, marks: [{ type: 'pageLink', attrs: { targetPageId, targetSlug } }] });
  await saveDoc(page.id, {
    type: 'doc',
    attrs: { layout: { widths: { desktop: { read: '600px', wide: '900px' } } }, surface: { desktop: { bg: 'token:subtle' } } },
    content: [
      { type: 'grid', attrs: { blockId: 'hero', width: 'full', columnWidths: [1], surface: { desktop: { image: assetId } } }, content: [{ type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: 'hero-text' }, content: [{ type: 'text', text: 'Welcome' }] }] }] },
      {
        type: 'paragraph',
        attrs: { blockId: 'links' },
        content: [link('to the open page', open.id, open.slug), { type: 'text', text: ' · ' }, link('to the secret page', secret.id, secret.slug), { type: 'text', text: ' · ' }, link('to a page gone', GONE_ID, 'gone-page')],
      },
      { type: 'image', attrs: { blockId: 'photo', assetId, alt: 'A photo' } },
    ],
  });
  token = (await createShareLink(page.id, editorA.id)).token;
  queryToken = (await createShareLink(await queryPageId(), editorA.id)).token;
});

async function queryPageId(): Promise<string> {
  const ns = await getDefaultNamespace();
  const node = await getNodeBySlug(ns!.id, seed.queryTestSlug);
  return node!.id;
}

describe('a page at its address (the read route)', () => {
  it('resolves every link to its target’s current address, and a target gone to the slug cached with the link', async () => {
    const data = await visit(page.slug, { user: null });
    expect(hrefOf(data.html, 'to the open page')).toBe(`/${open.slug}`);
    expect(hrefOf(data.html, 'to the secret page')).toBe(`/${secret.slug}`);
    expect(hrefOf(data.html, 'to a page gone')).toBe('/gone-page');
  });

  it('runs the query block as the visitor: an anonymous one is shown no restricted row, an admin every row', async () => {
    const anonymous = await visit(seed.queryTestSlug, { user: null });
    const admin = await visit(seed.queryTestSlug, { user: await userOf('admin') });
    expect(anonymous.html).toContain('active');
    expect(anonymous.html).not.toContain('secret');
    expect(admin.html).toContain('secret');
  });

  it('offers the images’ copies and preloads the hero, and leads the stylesheet with the canvas’s and the ground’s rules', async () => {
    const data = await visit(page.slug, { user: null });
    expect(data.html).toContain(`/api/media/${assetId}?w=640 640w`);
    expect(data.imagePreloads).not.toEqual([]);
    expect(data.canvasRuleId).not.toBe('');
    expect(data.groundRuleId).not.toBe('');
    expect(data.css.startsWith(`[data-b="${data.canvasRuleId}"]{--canvas-read:600px;--canvas-wide:900px;--page-bg:var(--content-theme-subtle)}[data-b="${data.groundRuleId}"]{--page-bg:var(--content-theme-subtle)}`)).toBe(true);
  });

  it('keeps the page data’s keys in their order, the scheme a preview asks for winning over the page’s', async () => {
    const data = await visit(page.slug, { user: await userOf('editorA') }, '?scheme=dark');
    expect(Object.keys(data)).toEqual(['kind', 'id', 'title', 'locale', 'html', 'imagePreloads', 'css', 'canvasRuleId', 'groundRuleId', 'referencedBy', 'tags', 'localGraph', 'firstBlockBleeds', 'contentScheme', 'canEdit']);
    expect(data.contentScheme).toBe('dark');
    expect(data.canEdit).toBe(true);
  });
});

describe('a page through a share link (the share route)', () => {
  it('resolves links only to what an anonymous reader may follow, and never to a cached slug', async () => {
    const { data } = await viaShare(token, { user: null });
    expect(hrefOf(data.html, 'to the open page')).toBe(`/${open.slug}`);
    expect(hrefOf(data.html, 'to the secret page')).toBe('#');
    expect(hrefOf(data.html, 'to a page gone')).toBe('#');
    expect(data.html).not.toContain(secret.slug);
  });

  it('runs the query block as nobody, even for a signed-in admin holding the link', async () => {
    const { data } = await viaShare(queryToken, { user: await userOf('admin') });
    expect(data.html).toContain('active');
    expect(data.html).not.toContain('secret');
  });

  it('offers the images’ copies, and gives the area after the page a rule of its own after the canvas’s and the ground’s', async () => {
    const { data, headers } = await viaShare(token, { user: null });
    expect(data.html).toContain(`/api/media/${assetId}?w=640 640w`);
    expect(data.imagePreloads).not.toEqual([]);
    expect(data.afterRuleId).not.toBe('');
    expect(data.css.startsWith(`[data-b="${data.canvasRuleId}"]{--canvas-read:600px;--canvas-wide:900px;--page-bg:var(--content-theme-subtle)}[data-b="${data.groundRuleId}"]{--page-bg:var(--content-theme-subtle)}[data-b="${data.afterRuleId}"]{--canvas-read:600px;--canvas-wide:900px}`)).toBe(true);
    expect(headers['cache-control']).toBe('private, no-store');
  });

  it('keeps the page data’s keys in their order', async () => {
    const { data } = await viaShare(token, { user: null });
    expect(Object.keys(data)).toEqual(['kind', 'title', 'locale', 'html', 'imagePreloads', 'css', 'canvasRuleId', 'groundRuleId', 'afterRuleId', 'referencedBy', 'localGraph', 'firstBlockBleeds', 'contentScheme']);
  });
});

describe('a page an agent reads (get_page_html)', () => {
  it('resolves links as the read route does', async () => {
    const html = await asAgent('admin', page.id);
    expect(hrefOf(html, 'to the open page')).toBe(`/${open.slug}`);
    expect(hrefOf(html, 'to the secret page')).toBe(`/${secret.slug}`);
    expect(hrefOf(html, 'to a page gone')).toBe('/gone-page');
  });

  it('runs the query block as the agent’s user', async () => {
    const id = await queryPageId();
    expect(await asAgent('admin', id)).toContain('secret');
    expect(await asAgent('viewer', id)).not.toContain('secret');
  });

  it('offers no image copies and draws no frame: the stylesheet is the blocks’ alone, before the markup', async () => {
    const text = await asAgent('admin', page.id);
    // The hero's background has copies either way; only the image block's srcset needs the sizes.
    expect(text).toContain('alt="A photo"');
    expect(text).not.toContain(`/api/media/${assetId}?w=640 640w`);
    const style = /^<style>(.*)<\/style>\n</.exec(text);
    expect(style).not.toBeNull();
    expect(style![1]).not.toContain('--canvas-read');
    expect(style![1]).not.toContain('{--page-bg:var(--content-theme-subtle)}');
  });
});

describe('renderPage, as its callers hand it on', () => {
  it('the read route passes on the visitor’s render as it is, with the preview’s scheme', async () => {
    const user = await userOf('editorA');
    const stored = await getPage(page.id);
    const rendered = await renderPage(stored!, { kind: 'visitor', user, locale: 'en', log: logger, returnTo: `/${page.slug}` }, { previewScheme: 'dark' });
    const data = await visit(page.slug, { user }, '?scheme=dark');
    expect({ html: data.html, css: data.css, preloads: data.imagePreloads, canvasRuleId: data.canvasRuleId, groundRuleId: data.groundRuleId, firstBlockBleeds: data.firstBlockBleeds, contentScheme: data.contentScheme }).toEqual({
      html: rendered.html,
      css: rendered.css,
      preloads: rendered.preloads,
      canvasRuleId: rendered.canvasRuleId,
      groundRuleId: rendered.groundRuleId,
      firstBlockBleeds: rendered.firstBlockBleeds,
      contentScheme: 'dark',
    });
    expect(rendered.afterRuleId).toBe('');
  });

  it('the share route passes on the share link’s render as it is', async () => {
    const stored = await getPage(page.id);
    const rendered = await renderPage(stored!, { kind: 'share', locale: 'en', log: logger });
    const { data } = await viaShare(token, { user: await userOf('admin') });
    expect({ html: data.html, css: data.css, preloads: data.imagePreloads, canvasRuleId: data.canvasRuleId, groundRuleId: data.groundRuleId, afterRuleId: data.afterRuleId, firstBlockBleeds: data.firstBlockBleeds, contentScheme: data.contentScheme }).toEqual({
      html: rendered.html,
      css: rendered.css,
      preloads: rendered.preloads,
      canvasRuleId: rendered.canvasRuleId,
      groundRuleId: rendered.groundRuleId,
      afterRuleId: rendered.afterRuleId,
      firstBlockBleeds: rendered.firstBlockBleeds,
      contentScheme: rendered.contentScheme,
    });
  });

  it('get_page_html passes on the agent’s render, its stylesheet first, with no frame', async () => {
    const stored = await getPage(page.id);
    const rendered = await renderPage(stored!, { kind: 'agent', user: await userOf('admin'), log: logger });
    expect(await asAgent('admin', page.id)).toBe(`<style>${rendered.css}</style>\n${rendered.html}`);
    expect([rendered.canvasRuleId, rendered.groundRuleId, rendered.afterRuleId]).toEqual(['', '', '']);
  });
});

describe('the three readers of one page', () => {
  it('render the page’s own blocks alike where nothing tells them apart', async () => {
    const plain = await createPage('Reader plain page', await userOf('editorA'), { visibility: 'public' });
    await saveDoc(plain.id, { type: 'doc', content: [{ type: 'paragraph', attrs: { blockId: 'only', typography: { desktop: { weight: 'semibold' } } }, content: [{ type: 'text', text: 'The same for all' }] }] });
    const shared = (await createShareLink(plain.id, null)).token;
    const visitor = await visit(plain.slug, { user: null });
    const { data: share } = await viaShare(shared, { user: null });
    const agent = await asAgent('admin', plain.id);
    expect(share.html).toBe(visitor.html);
    expect(agent).toBe(`<style>${visitor.css}</style>\n${visitor.html}`);
  });
});
