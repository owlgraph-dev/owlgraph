// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { renderDoc } from '$lib/features/content/server';
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { DocumentView } from '../../server/documents.server';
import { FILE_BLOCK } from './model';
import type { FileBlockData } from './blockData.server';

const DOC = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';
const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const TOKEN = 'SecretShareToken42';

const node = (attrs: Record<string, unknown> = {}) => ({ type: FILE_BLOCK, attrs: { blockId: 'b1', documentId: DOC, ...attrs } });

const doc = (over: Partial<DocumentView> = {}): DocumentView => ({
  id: DOC,
  title: 'Quartalsbericht',
  href: '/quartalsbericht',
  content: { view: `/api/documents/${DOC}/content`, download: `/api/documents/${DOC}/content?download` },
  file: { filename: 'Bericht.pdf', mime: 'application/pdf', size: 1_234_567 },
  path: '2026 Q3/Bericht.pdf',
  fileid: '48213',
  own: false,
  modified: '2026-10-02T09:30:00.000Z',
  status: 'ok',
  checkedAt: '2026-10-09T10:00:00.000Z',
  seenAt: '2026-10-09T10:00:00.000Z',
  collectionId: COLLECTION,
  location: { collection: 'Projektunterlagen', folder: '2026 Q3' },
  ...over,
});

function render(n: ReturnType<typeof node>, data?: FileBlockData): string {
  return renderDoc({ type: 'doc', content: [n] } as never, {}, {}, { blockData: data ? { b1: data } : {} }).html;
}

describe('the file block on the page', () => {
  it('renders inside its wrapper as an addressable block, on the server alone, without a style attribute', () => {
    const html = render(node(), { view: doc() });
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain('class="nc-file-block');
    expect(html).not.toContain('data-island');
    expect(html).not.toContain('data-props');
    expect(html).not.toMatch(/\sstyle\s*=/);
  });

  it("draws a row: the file by its name, its details and where it is, its download — linked to the document's content", () => {
    const html = render(node(), { view: doc() });
    expect(html).toContain('de--row');
    // One link to the document's content; a PDF opens in a tab.
    expect(html).toMatch(new RegExp(`<a class="de-entry" href="/api/documents/${DOC}/content" target="_blank" rel="noopener">.*?class="de-title-text">Bericht.pdf</span>.*?</a>`, 's'));
    expect(html).toContain(`href="/api/documents/${DOC}/content?download"`);
    // `download` on each keeps the app's router off it.
    const downloads = [...html.matchAll(/<a\s[^>]*>/g)].map((m) => m[0]).filter((tag) => tag.includes('content?download'));
    expect(downloads.length).toBeGreaterThan(0);
    for (const tag of downloads) expect(tag).toContain('download="Bericht.pdf"');
    expect(html).toContain('PDF · 1.2 MB · Oct 2, 2026');
    expect(html).toContain('Projektunterlagen / 2026 Q3');
    expect(html).toContain('Download');
    expect(html).not.toContain('href="/quartalsbericht"');
    expect(html).not.toContain('de-chip');
  });

  it('downloads a file a browser cannot show — no new tab, and the link says so', () => {
    const html = render(node(), { view: doc({ file: { filename: 'Tabelle.xlsx', mime: 'application/vnd.ms-excel', size: 900 } }) });
    expect(html).toMatch(new RegExp(`<a class="de-entry" href="/api/documents/${DOC}/content" download="Tabelle.xlsx">.*?Tabelle.xlsx`, 's'));
  });

  it("draws a card: an image as its own preview, through the document's content; any other file as its type", () => {
    const image = render(node({ variant: 'card' }), { view: doc({ file: { filename: 'Plan.png', mime: 'image/png', size: 200_000 } }) });
    expect(image).toContain('de--card');
    expect(image).toMatch(new RegExp(`<img class="de-image" src="/api/documents/${DOC}/content"[^>]*loading="lazy"`));
    expect(image).toContain('class="de-title-text">Quartalsbericht</span>');
    expect(image).toContain('Plan.png · PNG');
    const pdf = render(node({ variant: 'card' }), { view: doc() });
    expect(pdf).not.toContain('<img');
    expect(pdf).toMatch(/class="de-tile-type">PDF</);
    // Too large to load for a look.
    const large = render(node({ variant: 'card' }), { view: doc({ file: { filename: 'Luftbild.png', mime: 'image/png', size: 50_000_000 } }) });
    expect(large).not.toContain('<img');
    expect(render(node({ variant: 'card', preview: 'none' }), { view: doc() })).not.toContain('de-preview');
  });

  it('is titled as the block says, and shows its details, its download and its node as set', () => {
    const html = render(node({ titleMode: 'node', showMeta: false, showDownload: false, showNodeLink: true }), { view: doc() });
    expect(html).toContain('class="de-title-text">Quartalsbericht</span>');
    expect(html).not.toContain('de-meta');
    expect(html).not.toContain('?download');
    expect(html).toContain('href="/quartalsbericht"');
    expect(html).toMatch(/Open the document(&#39;|')s page/);
    expect(render(node({ variant: 'card', titleMode: 'filename' }), { view: doc() })).toContain('class="de-title-text">Bericht.pdf</span>');
  });

  it("shows a neutral placeholder — the file's name, never why — for a file its share no longer serves", () => {
    const html = render(node(), { view: doc({ status: 'notFound' }) });
    expect(html).toContain('data-state="problem"');
    expect(html).toContain('Bericht.pdf');
    expect(html).toContain('Currently unavailable');
    expect(html).not.toContain('not found');
    expect(html).not.toContain('48213');
    expect(html).not.toContain('href=');
  });

  it('shows nothing of a document the viewer may not read, of one nothing was resolved for, or of none chosen', () => {
    for (const html of [render(node(), { view: null }), render(node()), render(node({ documentId: null }))]) {
      expect(html).toContain('Currently unavailable');
      expect(html).not.toContain('Bericht');
      expect(html).not.toContain('Quartalsbericht');
    }
  });

  it('carries no token, no WebDAV address, no path inside the share and no file id', () => {
    const html = render(node({ variant: 'card' }), { view: doc() });
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain('/public.php/');
    expect(html).not.toContain('2026 Q3/Bericht.pdf');
    expect(html).not.toContain('48213');
  });

  it("speaks the page's content language", async () => {
    const html = await withContentLocale('de', () => render(node(), { view: doc() }));
    expect(html).toContain('Herunterladen');
    expect(html).toContain('1,2 MB');
    const missing = await withContentLocale('de', () => render(node(), { view: doc({ status: 'revoked' }) }));
    expect(missing).toContain('Derzeit nicht verfügbar');
  });
});
