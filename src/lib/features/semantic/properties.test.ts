// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { collectProperties } from './properties.server';

const semanticText = (text: string, propName: string) => ({
  type: 'text',
  text,
  marks: [{ type: 'semanticProperty', attrs: { propName } }]
});

describe('collectProperties() — queryBlock boundary', () => {
  it('collects a page-level semantic property normally', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [semanticText('2025-01-01', 'deadline')] }] };
    const out: { name: string; value: string }[] = [];
    collectProperties(doc, out);
    expect(out).toEqual([{ name: 'deadline', value: '2025-01-01' }]);
  });

  it('does NOT collect a semantic property mark living inside a queryBlock — it is a template parameter, not a page fact', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'queryBlock',
          attrs: { blockId: 'w1', filter: null, first: 20 },
          content: [
            {
              type: 'grid',
              content: [
                { type: 'gridCell', content: [{ type: 'paragraph', content: [semanticText('placeholder', 'status')] }] }
              ]
            }
          ]
        }
      ]
    };
    const out: { name: string; value: string }[] = [];
    collectProperties(doc, out);
    expect(out).toEqual([]);
  });

  it('skips a reserved parameter-group mark even outside a queryBlock (a pasted-out slot is not a page fact)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'pkg', marks: [{ type: 'semanticProperty', attrs: { propName: 'parameter:package_name', paramType: 'text' } }] },
            semanticText('Active', 'core:status')
          ]
        }
      ]
    };
    const out: { name: string; value: string }[] = [];
    collectProperties(doc, out);
    expect(out).toEqual([{ name: 'core:status', value: 'Active' }]);
  });

  it('collects real page properties that sit alongside a queryBlock, unaffected by the boundary', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [semanticText('Active', 'status')] },
        {
          type: 'queryBlock',
          attrs: { blockId: 'w1', filter: null, first: 20 },
          content: [
            {
              type: 'grid',
              content: [{ type: 'gridCell', content: [{ type: 'paragraph', content: [semanticText('placeholder', 'priority')] }] }]
            }
          ]
        }
      ]
    };
    const out: { name: string; value: string }[] = [];
    collectProperties(doc, out);
    expect(out).toEqual([{ name: 'status', value: 'Active' }]);
  });
});

describe('collectProperties() — unknown blocks', () => {
  it('claims nothing from inside a node this build cannot read', () => {
    const out: { name: string; value: string }[] = [];
    const para = (text: string) => ({ type: 'paragraph', content: [semanticText(text, 'core:status')] });
    collectProperties({ type: 'doc', content: [{ type: 'retiredTabs', content: [para('hidden')] }, para('shown')] }, out);
    expect(out).toEqual([{ name: 'core:status', value: 'shown' }]);
  });
});
