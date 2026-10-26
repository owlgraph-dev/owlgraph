// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { collectEdges, type EdgeDraft } from './graph.server';

function targets(out: EdgeDraft[]): string[] {
  return out.map((d) => d.targetId).sort();
}

describe('collectEdges() — unified sync-on-save edge derivation', () => {
  it('collects a quick link targeting a page', () => {
    const doc = { type: 'doc', content: [{ type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg1' } }] };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'pg1', relationshipType: null, properties: [] }]);
  });

  it('collects a quick link targeting a document', () => {
    const doc = { type: 'doc', content: [{ type: 'quickLink', attrs: { refType: 'document', targetDocId: 'doc1' } }] };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'doc1', relationshipType: null, properties: [] }]);
  });

  it('collects an inline pageLink mark as untyped', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'see', marks: [{ type: 'pageLink', attrs: { targetPageId: 'pg2' } }] }] }],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'pg2', relationshipType: null, properties: [] }]);
  });

  it('collects an inline docLink mark as untyped', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'see', marks: [{ type: 'docLink', attrs: { targetDocId: 'doc2' } }] }] }],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'doc2', relationshipType: null, properties: [] }]);
  });

  it('finds targets nested inside a grid cell', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'grid',
          content: [
            {
              type: 'gridCell',
              content: [{ type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg3' } }],
            },
          ],
        },
      ],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(targets(out)).toEqual(['pg3']);
  });

  it('reports the same target twice when reached via multiple blocks/marks (caller dedupes)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg1' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'again', marks: [{ type: 'pageLink', attrs: { targetPageId: 'pg1' } }] }] },
      ],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(targets(out)).toEqual(['pg1', 'pg1']);
  });

  it('collects both a page and a document target from one quick link attrs (belt-and-suspenders)', () => {
    // refType normally sets only one of the two attrs.
    const doc = { type: 'doc', content: [{ type: 'quickLink', attrs: { targetPageId: 'pg1', targetDocId: 'doc1' } }] };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(targets(out)).toEqual(['doc1', 'pg1']);
  });

  it('ignores nodes/marks with no target attrs', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([]);
  });

  it('collects a typed quick link with its relationship type and property values', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'quickLink',
          attrs: { refType: 'page', targetPageId: 'pg1', relationshipType: 'author-of', properties: { 'core:year': '1997' } },
        },
      ],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'pg1', relationshipType: 'author-of', properties: [{ name: 'core:year', value: '1997' }] }]);
  });

  it('drops property values when relationshipType is unset (typing is opt-in)', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg1', properties: { 'core:year': '1997' } } }],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([{ targetId: 'pg1', relationshipType: null, properties: [] }]);
  });

  it('lets an untyped and a typed quick link to the same target both be collected (distinct edges)', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg1' } },
        { type: 'quickLink', attrs: { refType: 'page', targetPageId: 'pg1', relationshipType: 'author-of', properties: {} } },
      ],
    };
    const out: EdgeDraft[] = [];
    collectEdges(doc, out);
    expect(out).toEqual([
      { targetId: 'pg1', relationshipType: null, properties: [] },
      { targetId: 'pg1', relationshipType: 'author-of', properties: [] },
    ]);
  });
});

describe('collectEdges() — unknown blocks', () => {
  it('declares no edge from inside a node this build cannot read', () => {
    const out: EdgeDraft[] = [];
    const linked = { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'pageLink', attrs: { targetPageId: 'inside' } }] }] };
    collectEdges({ type: 'doc', content: [{ type: 'retiredTabs', content: [linked] }, { ...linked, content: [{ type: 'text', text: 'y', marks: [{ type: 'pageLink', attrs: { targetPageId: 'outside' } }] }] }] }, out);
    expect(targets(out)).toEqual(['outside']);
  });
});
