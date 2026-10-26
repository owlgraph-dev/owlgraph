// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import type { APIRequestContext } from '@playwright/test';
import { seed } from './seed-data';
import { txt } from './doc';

// A page with every block kind and capability emitter at once, overrides on
// every tier: its public render must carry no style attribute and no CSP violation.

const para = (text: string, attrs?: Record<string, unknown>) => ({ type: 'paragraph', ...(attrs ? { attrs } : {}), content: [txt(text)] });
const item = (text: string) => ({ type: 'listItem', content: [para(text)] });
const cell = (attrs: Record<string, unknown>, isHeader: boolean, text: string) => ({
  type: 'tableCell',
  attrs: { isHeader, ...attrs },
  content: [txt(text)],
});

export function probeDoc() {
  return {
    type: 'doc',
    attrs: { spacing: { desktop: { blockSpace: 28 } } },
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [txt('Cascade probe')] },
      {
        type: 'heading',
        attrs: { level: 2, typography: { desktop: { size: 'scale:4xl', color: '#b45309', letterSpacing: 0.02 }, phone: { size: 'scale:2xl' } } },
        content: [txt('A heading with its own size, colour and tracking')],
      },
      para('A plain paragraph in the paragraph style the theme gives it.'),
      para('A paragraph set in serif at 20px, semibold, with generous leading.', {
        typography: { desktop: { family: 'serif', size: 20, lineHeight: 1.8, weight: 'semibold' } },
      }),
      {
        type: 'paragraph',
        content: [
          txt('Marks: '),
          txt('blue', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }]),
          txt(', '),
          txt('larger', [{ type: 'typographySize', attrs: { size: 'scale:xl' } }]),
          txt(', '),
          txt('bold', [{ type: 'typographyWeight', attrs: { weight: 'bold' } }]),
          txt(', '),
          txt('mono', [{ type: 'typographyFamily', attrs: { family: 'mono' } }]),
          txt(', '),
          txt('tall', [{ type: 'typographyLineHeight', attrs: { lineHeight: 2 } }]),
          txt(', '),
          txt('spaced', [{ type: 'typographyLetterSpacing', attrs: { letterSpacing: 0.1 } }]),
          txt(', and '),
          txt('blue again', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }]),
          txt(' — the same set twice.'),
        ],
      },
      para('This paragraph sits 64px below the one before it.', { spacing: { desktop: { spaceAbove: 64 } } }),
      { type: 'bulletList', attrs: { listStyle: 'square', spacing: 'loose' }, content: [item('Square bullets'), item('Loosely spaced')] },
      { type: 'orderedList', attrs: { listStyle: 'lower-roman' }, content: [item('Roman one'), item('Roman two')] },
      { type: 'blockquote', content: [para('A quoted paragraph.')] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [txt('const answer: number = 42;\nexport { answer };')] },
      { type: 'horizontalRule' },
      { type: 'callout', attrs: { variant: 'warn' }, content: [txt('A warning callout.')] },
      {
        type: 'htmlBlock',
        attrs: {
          html:
            '<p style="margin:0;color:#dc2626;font-size:var(--type-lg)">Author-styled <span style="background-color:#fde68a;padding:2px 6px;border-radius:4px">inline</span> text</p>' +
            '<div style="display:flex;gap:12px;margin-top:8px"><div style="flex:1;border:1px solid #94a3b8;padding:8px">Left</div><div style="flex:1;padding:8px;text-align:right">Right</div></div>',
        },
      },
      { type: 'htmlBlock', attrs: { scheme: 'dark', html: '<p style="margin:0">A block pinned dark, with <em style="color:#93c5fd">an emphasised run</em>.</p>' } },
      {
        type: 'grid',
        attrs: {
          columnWidths: [1, 2],
          gap: 'lg',
          spacing: { desktop: { pad: 24 }, phone: { pad: 8 } },
          surface: { desktop: { bg: '#f1f5f9', radius: 12, border: '#cbd5e1', shadow: 'md' } },
        },
        content: [
          {
            type: 'gridCell',
            attrs: { surface: { desktop: { bg: '#1e293b' } }, spacing: { desktop: { pad: 16 } }, typography: { desktop: { color: '#f8fafc' } }, alignX: 'center' },
            content: [para('Dark cell')],
          },
          { type: 'gridCell', attrs: { spacing: { desktop: { top: 32 } } }, content: [para('Wide cell, extra top padding')] },
          { type: 'gridCell', attrs: { colSpan: 2, surface: { desktop: { radius: 4, border: '#94a3b8' } } }, content: [para('Spanning cell')] },
        ],
      },
      {
        type: 'flexContainer',
        attrs: {
          layout: { desktop: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }, phone: { flexDirection: 'column' } },
          surface: { desktop: { radius: 8 } },
        },
        content: [1, 2, 3].map((n) => ({
          type: 'flexCell',
          attrs: { surface: { desktop: { bg: '#fee2e2' } }, spacing: { desktop: { pad: 12 } } },
          content: [para(`Flex cell ${n}`)],
        })),
      },
      {
        type: 'table',
        attrs: { columnWidths: [1, 1, 2], surface: { desktop: { bg: '#eef2ff', radius: 8 } } },
        content: [
          { type: 'tableRow', attrs: { isHeader: true }, content: [cell({}, true, 'Name'), cell({}, true, 'Kind'), cell({}, true, 'Notes')] },
          {
            type: 'tableRow',
            attrs: { height: 56 },
            content: [
              cell({ spacing: { desktop: { pad: 12 } } }, false, 'Padded'),
              cell({ surface: { desktop: { bg: '#fef3c7' } } }, false, 'Tinted'),
              cell({}, false, 'A taller row'),
            ],
          },
          { type: 'tableRow', content: [cell({}, false, 'Plain'), cell({}, false, 'Plain'), cell({}, false, 'Plain')] },
        ],
      },
      {
        type: 'image',
        attrs: { assetId: seed.publicAssetId, alt: 'Seed image', width: 60, widthPhone: 100, boxMode: 'aspect', boxAspect: '16/9', objectFit: 'cover', align: 'left' },
      },
      { type: 'quickLink', attrs: { refType: 'page', targetPageId: seed.publicId, label: 'A link reference', variant: 'link' } },
      {
        type: 'quickLink',
        attrs: { refType: 'url', url: 'https://example.com', label: 'An outlined reference', variant: 'outlined', surface: { desktop: { border: '#0f766e', radius: 999 } } },
      },
      {
        type: 'quickLink',
        attrs: {
          refType: 'document',
          targetDocId: seed.publicDocId,
          label: 'A button reference',
          variant: 'button',
          surface: { desktop: { bg: '#7c3aed' } },
          typography: { desktop: { weight: 'bold' } },
        },
      },
      {
        type: 'queryBlock',
        attrs: { blockId: 'probe-query', filter: { property: { name: seed.propStatus, operator: 'EQ', value: 'active' } }, first: 5 },
        content: [
          {
            type: 'grid',
            attrs: { columnWidths: [1], surface: { desktop: { border: '#cbd5e1', radius: 6 } } },
            content: [
              {
                type: 'gridCell',
                attrs: { spacing: { desktop: { pad: 12 } } },
                content: [
                  { type: 'paragraph', content: [txt('status', [{ type: 'semanticProperty', attrs: { propName: seed.propStatus } }])] },
                  { type: 'htmlBlock', attrs: { html: `<p style="margin:0;color:#475569">Status: {{{${seed.propStatus}}}}</p>` } },
                ],
              },
            ],
          },
        ],
      },
      { type: 'diagram', attrs: { code: 'graph LR\n  A[Start] --> B{Decision}\n  B -->|yes| C[Done]\n  B -->|no| D[Retry]' } },
      para('The end.'),
    ],
  };
}

/** Creates the probe page through the API (the request context must be signed in as an editor or admin). */
export async function seedProbePage(request: APIRequestContext, scheme: 'light' | 'dark' | 'adaptive' = 'adaptive'): Promise<{ id: string; slug: string }> {
  const created = (await (await request.post('/api/pages')).json()) as { id: string; slug: string };
  const put = await request.put(`/api/pages/${created.id}`, { data: probeDoc() });
  if (!put.ok()) throw new Error(`probe page: PUT failed with ${put.status()}: ${await put.text()}`);
  const patch = await request.patch(`/api/pages/${created.id}`, { data: { contentScheme: scheme } });
  if (!patch.ok()) throw new Error(`probe page: PATCH failed with ${patch.status()}`);
  return created;
}
