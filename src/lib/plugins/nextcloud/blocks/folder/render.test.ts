// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { renderDoc } from '$lib/features/content/server';
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { ListingEntry, ListingView } from '../../server/listing.server';
import { FOLDER_BLOCK, FOLDER_ISLAND } from './model';
import type { FolderBlockData } from './blockData.server';

const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const TOKEN = 'SecretShareToken42';

const node = (attrs: Record<string, unknown> = {}) => ({ type: FOLDER_BLOCK, attrs: { blockId: 'b1', collectionId: COLLECTION, startPath: '', ...attrs } });

const entry = (path: string, over: Partial<ListingEntry> = {}): ListingEntry => ({
  path,
  name: path.split('/').at(-1)!,
  folder: false,
  size: 1_234_567,
  mime: 'application/pdf',
  modified: '2026-10-02T09:30:00.000Z',
  fileid: '101',
  linked: null,
  ...over,
});

const view = (over: Partial<ListingView> = {}): ListingView => ({
  state: 'ready',
  via: 'node',
  collection: { title: 'Projektunterlagen', href: '/projektunterlagen', count: 3, checkedAt: '2026-10-09T10:00:00.000Z', own: false },
  root: 'Projektunterlagen',
  path: '',
  entries: [
    entry('Q3', { folder: true, mime: null, size: 2048, fileid: '10' }),
    entry('Bericht.pdf'),
    entry('Notizen.txt', { mime: 'text/plain', fileid: '102', linked: { id: 'd1', href: '/notizen-txt' } }),
    entry('Zahlen.csv', { mime: 'text/csv', fileid: '103' }),
  ],
  total: 4,
  offset: 0,
  checkedAt: '2026-10-11T10:00:00.000Z',
  ...over,
});

function render(n: ReturnType<typeof node>, data?: FolderBlockData): string {
  return renderDoc({ type: 'doc', content: [n] } as never, {}, {}, { blockData: data ? { b1: data } : {} }).html;
}

function islandProps(html: string): Record<string, unknown> {
  const raw = /data-props="([^"]*)"/.exec(html)?.[1] ?? '';
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
}

describe('the folder block on the page', () => {
  it('renders inside its wrapper as an addressable block and an island, without a style attribute', () => {
    const html = render(node(), { view: view() });
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain(`data-island="${FOLDER_ISLAND}"`);
    expect(html).toContain('class="nc-folder-block');
    expect(html).not.toMatch(/\sstyle\s*=/);
  });

  it('lists what was resolved — folders first as the server sorted them, files linking to their stable address', () => {
    const html = render(node(), { view: view() });
    expect(html).toContain('Projektunterlagen');
    expect(html.indexOf('Q3')).toBeLessThan(html.indexOf('Bericht.pdf'));
    expect(html).toContain(`href="/api/plugins/nextcloud/open?c=${COLLECTION}&amp;p=Bericht.pdf&amp;f=101" target="_blank"`);
    // `download` on these keeps the app's router off them.
    expect(html).toContain(`href="/api/plugins/nextcloud/open?c=${COLLECTION}&amp;p=Zahlen.csv&amp;f=103" download="Zahlen.csv"`);
    expect(html).toContain(`href="/api/plugins/nextcloud/open?c=${COLLECTION}&amp;p=Bericht.pdf&amp;f=101&amp;download=1" download="Bericht.pdf"`);
    expect(html).toContain('href="/notizen-txt"');
    expect(html).toContain('el-chip');
  });

  it('carries node ids and paths, never a token or a WebDAV address — in the markup or in the props', () => {
    const html = render(node(), { view: view() });
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain('/public.php/');
    const props = islandProps(html);
    expect(props.collectionId).toBe(COLLECTION);
    expect(props.mode).toBe('page');
    expect(props.editing).toBeNull();
    expect(JSON.stringify(props)).not.toContain('/public.php/');
  });

  it('shows a loading skeleton when nothing is held yet, or nothing was resolved', () => {
    for (const html of [render(node(), { view: view({ state: 'loading', entries: [], total: 0 }) }), render(node())]) {
      expect(html).toContain('data-state="loading"');
      expect(html).toContain('el-skeleton');
    }
  });

  it('shows the same neutral placeholder on the page for a share that fails and a collection that is not the viewer’s — never why', () => {
    // A writer's view carries the reason; only the editor says it.
    const failing = render(node(), { view: view({ state: 'unavailable', entries: [], total: 0, reason: 'revoked' }) });
    const hidden = render(node(), { view: null });
    for (const html of [failing, hidden]) {
      const shown = html.replace(/data-props="[^"]*"/, '');
      expect(shown).toContain('data-state="unavailable"');
      expect(shown).toContain('Folder currently unavailable');
      expect(shown).not.toContain('revoked');
      expect(shown).not.toContain('Share revoked');
    }
  });

  it('shows the last listing as not current while the server fails', () => {
    const html = render(node(), { view: view({ state: 'stale' }) });
    expect(html).toContain('data-state="stale"');
    expect(html).toContain('not current');
  });

  it('shows a neutral placeholder for a block with no collection', () => {
    expect(render(node({ collectionId: null }))).toContain('Folder currently unavailable');
  });

  it("speaks the page's content language", async () => {
    const html = await withContentLocale('de', () => render(node(), { view: view({ state: 'unavailable', entries: [], total: 0 }) }));
    expect(html).toContain('Ordner derzeit nicht verfügbar');
    const listed = await withContentLocale('de', () => render(node(), { view: view() }));
    expect(listed).toContain('4 von 4');
    expect(listed).toContain('1,2 MB');
  });

  it('leaves out the columns it does not show, and draws the density it is set to', () => {
    const html = render(node({ showSize: false, showModified: false, density: 'compact' }), { view: view() });
    expect(html).toContain('el--no-size');
    expect(html).toContain('el--no-modified');
    expect(html).toContain('el--compact');
  });
});
