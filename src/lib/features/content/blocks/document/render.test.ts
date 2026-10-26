// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { renderDoc } from '$lib/features/content/server';
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { DocumentBlockData } from './model';

const DOC = '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44';
const CONTENT = `/api/documents/${DOC}/content`;

const node = (attrs: Record<string, unknown> = {}) => ({ type: 'documentBlock', attrs: { blockId: 'b1', nodeId: DOC, ...attrs } });

const upload = (over: Partial<Extract<DocumentBlockData, { state: 'file' }>> = {}): DocumentBlockData => ({
  state: 'file',
  node: { id: DOC, title: 'Quarterly report', href: '/quarterly-report' },
  source: 'upload',
  file: { filename: 'Bericht.pdf', mime: 'application/pdf', size: 1_234_567 },
  linkHost: null,
  content: { view: CONTENT, download: `${CONTENT}?download` },
  modified: '2026-10-02T09:30:00.000Z',
  ...over,
});

const link: DocumentBlockData = {
  state: 'file',
  node: { id: DOC, title: 'A cited paper', href: '/a-cited-paper' },
  source: 'link',
  file: null,
  linkHost: 'doi.org',
  content: { view: CONTENT, download: null },
  modified: '2026-10-02T09:30:00.000Z',
};

function render(n: ReturnType<typeof node>, data?: DocumentBlockData): string {
  return renderDoc({ type: 'doc', content: [n] } as never, {}, {}, { blockData: data ? { b1: data } : {} }).html;
}

describe('the document block on the page', () => {
  it("draws an upload as a row — the file by its name, its details — one link to the document's content, and its download", () => {
    const html = render(node(), upload());
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain('class="document-block');
    expect(html).not.toContain('data-island');
    expect(html).not.toMatch(/\sstyle\s*=/);
    expect(html).toMatch(new RegExp(`<a class="de-entry" href="${CONTENT}" target="_blank" rel="noopener">.*?class="de-title-text">Bericht.pdf</span>`, 's'));
    expect(html).toContain('PDF · 1.2 MB · Oct 2, 2026');
    expect(html).toMatch(new RegExp(`href="${CONTENT}\\?download"[^>]*download="Bericht.pdf"`));
    // The chip is the editor's; the way to the node only when asked for.
    expect(html).not.toContain('de-chip');
    expect(html).not.toContain('/quarterly-report');
  });

  it('draws a card titled by its node, its type as a tile — an upload is never an image here', () => {
    const html = render(node({ variant: 'card' }), upload());
    expect(html).toContain('de--card');
    expect(html).toContain('class="de-title-text">Quarterly report</span>');
    expect(html).toMatch(/class="de-tile-type">PDF</);
    expect(html).not.toContain('<img');
    expect(render(node({ variant: 'card', preview: 'none' }), upload())).not.toContain('de-preview');
  });

  it('is titled, detailed and linked as the block says', () => {
    const html = render(node({ titleMode: 'node', showMeta: false, showDownload: false, showNodeLink: true }), upload());
    expect(html).toContain('class="de-title-text">Quarterly report</span>');
    expect(html).not.toContain('de-meta');
    expect(html).not.toContain('?download');
    expect(html).toContain('href="/quarterly-report"');
  });

  it('opens a link document beside the page, telling it nothing — its host shown, never its address, and nothing to download', () => {
    const html = render(node(), link);
    expect(html).toMatch(new RegExp(`<a class="de-entry" href="${CONTENT}" target="_blank" rel="noopener noreferrer">`));
    expect(html).toContain('External document');
    expect(html).toContain('doi.org');
    expect(html).not.toContain('?download');
    expect(html).not.toContain('https://');
  });

  it('renders nothing at all for a document the reader may not read, or for none chosen — not even its box', () => {
    expect(render(node(), { state: 'hidden' })).toBe('');
    expect(render(node({ nodeId: null }))).toBe('');
  });

  it('is a neutral line where nothing was resolved, and for a document an integration keeps', () => {
    for (const html of [render(node()), render(node(), { state: 'unavailable', node: { id: DOC, title: 'Plan.png', href: '/plan' } })]) {
      expect(html).toContain('data-block-id="b1"');
      expect(html).toContain('Currently unavailable');
    }
  });

  it("speaks the page's content language", async () => {
    const html = await withContentLocale('de', () => render(node(), upload()));
    expect(html).toContain('Herunterladen');
    expect(html).toContain('1,2 MB');
  });
});
