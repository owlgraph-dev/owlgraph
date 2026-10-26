// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { renderDoc } from '$lib/features/content/server';
import { withContentLocale } from '$lib/platform/i18n/contentLocale.server';
import type { CollectionBlockData, EmbedMember } from './model';

const COLLECTION = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';

const node = (attrs: Record<string, unknown> = {}) => ({ type: 'collectionBlock', attrs: { blockId: 'b1', nodeId: COLLECTION, ...attrs } });

const member = (id: string, over: Partial<EmbedMember> = {}): EmbedMember => ({
  id,
  type: 'page',
  title: `Title ${id}`,
  href: `/${id}`,
  label: null,
  plugin: null,
  pluginLabel: null,
  ...over,
});

const members = (list: EmbedMember[], total = list.length): CollectionBlockData => ({
  state: 'members',
  node: { id: COLLECTION, title: 'Reading list', href: '/reading-list' },
  members: list,
  total,
});

function render(n: ReturnType<typeof node>, data?: CollectionBlockData): string {
  return renderDoc({ type: 'doc', content: [n] } as never, {}, {}, { blockData: data ? { b1: data } : {} }).html;
}

describe('the collection block on the page', () => {
  it('lists the members as the collection’s page does — labels, a nested collection as a row linking to it, the kind — inside its wrapper, without a style attribute', () => {
    const html = render(
      node(),
      members([
        member('a', { label: { en: 'First read' } }),
        member('b', { type: 'document', title: 'Report', plugin: 'acme', pluginLabel: 'Acme' }),
        member('c', { type: 'collection', title: 'More reading' }),
      ])
    );
    expect(html).toContain('data-block-id="b1"');
    expect(html).toContain('class="collection-block');
    expect(html).not.toContain('data-island');
    expect(html).not.toMatch(/\sstyle\s*=/);
    // A labelled member goes by its label, its own title below it.
    expect(html).toMatch(/<a class="el-entry" href="\/a">.*?class="el-name-text">First read<.*?class="el-note">Title a</s);
    expect(html).toContain('Document · Acme');
    expect(html).toMatch(/el-row--folder.*?href="\/c"/s);
    expect(html).toContain('3 entries');
    expect(html).not.toContain('/reading-list');
  });

  it('shows at most its limit, with the way to the collection’s page for the rest', () => {
    const html = render(node({ limit: 2 }), members([member('a'), member('b')], 5));
    expect(html).toContain('2 of 5');
    expect(html).toMatch(/href="\/reading-list"[^>]*>.*?All 5 entries/s);
  });

  it('cuts to its limit whatever it is handed — the editor gets the collection uncut', () => {
    const html = render(node({ limit: 2 }), members([member('a'), member('b'), member('c'), member('d')], 4));
    expect(html).toContain('Title a');
    expect(html).toContain('Title b');
    expect(html).not.toContain('Title c');
    expect(html).toContain('2 of 4');
  });

  it('goes by the members’ titles and leaves the kind out as the block says, and reads compact', () => {
    const html = render(node({ showLabels: false, columns: [], density: 'compact' }), members([member('a', { label: { en: 'First read' } })]));
    expect(html).toContain('class="el-name-text">Title a<');
    expect(html).not.toContain('First read');
    expect(html).not.toContain('el-kind');
    expect(html).toContain('el--compact');
  });

  it('says so when the collection holds nothing the reader may read', () => {
    expect(render(node(), members([]))).toContain('Nothing in this collection yet.');
  });

  it('renders nothing at all for a collection the reader may not read, or for none chosen — not even its box', () => {
    expect(render(node(), { state: 'hidden' })).toBe('');
    expect(render(node({ nodeId: null }))).toBe('');
  });

  it('is a neutral line where nothing was resolved, and for a collection an integration keeps', () => {
    for (const html of [render(node()), render(node(), { state: 'unavailable', node: { id: COLLECTION, title: 'Share', href: '/share' } })]) {
      expect(html).toContain('data-block-id="b1"');
      expect(html).toContain('Currently unavailable');
      expect(html).not.toContain('Share');
    }
  });

  it('speaks the page’s content language, its labels too', async () => {
    const html = await withContentLocale('de', () => render(node({ limit: 1 }), members([member('a', { label: { en: 'First read', de: 'Zuerst lesen' } })], 3)));
    expect(html).toContain('Zuerst lesen');
    expect(html).toContain('1 von 3');
    expect(html).toContain('Alle 3 Einträge');
  });
});
