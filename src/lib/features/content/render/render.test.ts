// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect } from 'vitest';
import { renderDoc as renderDocImpl } from './render.server';
import { StyleCollector } from '../capabilities/pageStyles';
import type { ResolvedParagraphStyle } from '../capabilities/typography/paragraphStyles';
import { PERSISTED_ADDRESSABLE_BLOCK_TYPES } from '../blocks/catalog';
import { PLUGIN_BLOCK_KIND_NAMES } from '$lib/plugins';
import { queryFormatContainer } from '../blocks/query/formats';
import { txt } from '$tests/e2e/doc';

const doc = (content: unknown[]) => ({ type: 'doc', content }) as any;
const para = (content: unknown[]) => ({ type: 'paragraph', content });

// Most assertions ask whether a value landed in the render, not which carrier
// took it, so they read markup and stylesheet joined; the carrier is asserted at the end.
const renderDoc = (...args: Parameters<typeof renderDocImpl>): string => {
  const { html, css } = renderDocImpl(...args);
  return css ? `${html}\n<style>${css}</style>` : html;
};
const ID = 'b[0-9a-z-]+';
/** The declarations of the rule an element's `data-b` points to, in a joined render. */
const ruleOf = (out: string, id: string) => new RegExp(`\\[data-b="${id}"\\]\\{([^}]*)\\}`).exec(out)?.[1];

describe('renderDoc', () => {
  it('escapes text content (no raw HTML injection via text nodes)', () => {
    const html = renderDoc(doc([para([txt('Hello <script>x</script> & co')])]));
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x');
    expect(html).toContain('&amp;');
  });

  it('renders a link mark with a script-capable href as a dead link', () => {
    const link = (href: string) => txt('x', [{ type: 'link', attrs: { href } }]);
    const html = renderDoc(doc([para([link('javascript:alert(document.cookie)'), link('https://example.org')])]));
    expect(html).not.toContain('javascript:');
    expect(html).toContain('<a href="#"');
    expect(html).toContain('<a href="https://example.org"');
  });

  it('sanitizes htmlBlock content — strips scripts, keeps safe markup', () => {
    const html = renderDoc(doc([{ type: 'htmlBlock', attrs: { html: '<script>alert(1)</script><b>ok</b>' } }]));
    expect(html).not.toContain('<script');
    expect(html).toContain('ok');
  });

  it('resolves pageLink marks to /<slug> via the slug map', () => {
    const d = doc([para([txt('link', [{ type: 'pageLink', attrs: { targetPageId: 'p1' } }])])]);
    expect(renderDoc(d, { p1: 'hello-world' })).toContain('href="/hello-world"');
  });

  it('pageLink with no resolvable slug falls back to #', () => {
    const d = doc([para([txt('link', [{ type: 'pageLink', attrs: { targetPageId: 'missing' } }])])]);
    expect(renderDoc(d, {})).toContain('href="#"');
  });

  // A cached slug must not reveal a target the viewer-scoped slug map omitted.
  it('pageLink falls back to the cached targetSlug when absent from the map and trustCachedSlug defaults true', () => {
    const d = doc([para([txt('link', [{ type: 'pageLink', attrs: { targetPageId: 'missing', targetSlug: 'other-ns/secret' } }])])]);
    expect(renderDoc(d, {})).toContain('href="/other-ns/secret"');
  });

  it('pageLink ignores the cached targetSlug when trustCachedSlug is false, even though it is set', () => {
    const d = doc([para([txt('link', [{ type: 'pageLink', attrs: { targetPageId: 'missing', targetSlug: 'other-ns/secret' } }])])]);
    const html = renderDoc(d, {}, {}, { trustCachedSlug: false });
    expect(html).toContain('href="#"');
    expect(html).not.toContain('other-ns/secret');
    expect(html).toContain('link'); // link text still renders, just the href is blocked
  });

  it('pageLink still resolves via the slug map when trustCachedSlug is false, if the target IS in the map', () => {
    const d = doc([para([txt('link', [{ type: 'pageLink', attrs: { targetPageId: 'p1', targetSlug: 'stale-cache' } }])])]);
    const html = renderDoc(d, { p1: 'current-slug' }, {}, { trustCachedSlug: false });
    expect(html).toContain('href="/current-slug"');
  });

  it('quick link to a page target: cached slug ignored when trustCachedSlug is false', () => {
    const d = doc([{ type: 'quickLink', attrs: { refType: 'page', targetPageId: 'missing', targetSlug: 'other-ns/secret', label: 'See page' } }]);
    const html = renderDoc(d, {}, {}, { trustCachedSlug: false });
    expect(html).not.toContain('other-ns/secret');
  });

  it('resolves a custom font family on a heading via opts.typographyRegistry', () => {
    const d = doc([{ type: 'heading', attrs: { level: 2, typography: { desktop: { family: 'custom:11111111-1111-1111-1111-111111111111' } } }, content: [txt('Title')] }]);
    const html = renderDoc(d, {}, {}, {
      typographyRegistry: {
        customStacks: { 'custom:11111111-1111-1111-1111-111111111111': "'Be Vietnam Pro', sans-serif" },
        paragraphStyles: [],
      },
    });
    expect(html).toContain("--typography-family-d:'Be Vietnam Pro', sans-serif");
  });

  describe('paragraph styles (opts.typographyRegistry.paragraphStyles)', () => {
    const styles: ResolvedParagraphStyle[] = [
      { id: 'body', label: 'Body text', renderAs: 'p', baseRole: 'body', isDefault: true, position: 0, defaults: { size: 'scale:m' } },
      { id: 'h2', label: 'Subtitle', renderAs: 'h2', baseRole: 'h2', isDefault: true, position: 2, defaults: { size: 40, weight: 'bold' } },
      { id: 'display', label: 'Display', renderAs: 'h1', baseRole: 'display', isDefault: false, position: 7, defaults: { size: 'scale:6xl', weight: 'semibold' } },
    ];
    const render = (node: unknown) => renderDoc(doc([node]), {}, {}, { typographyRegistry: { customStacks: {}, paragraphStyles: styles } });

    // The look itself is a rule of the theme stylesheet (emitParagraphStyles.ts);
    // the element names its resolved style, and carries no inline look.
    it("an untouched heading takes its level's default style, by name", () => {
      const html = render({ type: 'heading', attrs: { level: 2 }, content: [txt('T')] });
      expect(html).toBe('<h2 class="cap-typography" data-ps="h2">T</h2>');
    });

    it("a block's own style is named; the level stays the tag; a deviation from its look is inline", () => {
      expect(render({ type: 'heading', attrs: { level: 1, paragraphStyle: 'display' }, content: [txt('T')] })).toBe('<h1 class="cap-typography" data-ps="display">T</h1>');
      const deviating = render({ type: 'heading', attrs: { level: 1, paragraphStyle: 'display', typography: { desktop: { weight: 'bold' } } }, content: [txt('T')] });
      const id = new RegExp(`data-ps="display" data-b="(${ID})"`).exec(deviating)?.[1];
      expect(id).toBeTruthy();
      expect(ruleOf(deviating, id!)).toBe('--typography-weight-d:700');
      // Equal to the look: nothing of its own.
      expect(render({ type: 'heading', attrs: { level: 1, paragraphStyle: 'display', typography: { desktop: { size: 'scale:6xl' } } }, content: [txt('T')] })).not.toMatch(/style=|data-b=/);
    });

    it('a deleted style falls back to the tag default, and a legacy override resolves its style', () => {
      expect(render({ type: 'paragraph', attrs: { paragraphStyle: 'gone' }, content: [txt('T')] })).toContain('data-ps="body"');
      expect(render({ type: 'heading', attrs: { level: 1, typographyRole: 'display' }, content: [txt('T')] })).toContain('data-ps="display"');
      expect(render({ type: 'heading', attrs: { level: 2, typographyRole: 'display' }, content: [txt('T')] })).toContain('data-ps="h2"');
    });

    it('a level with no style in the registry names none and takes the built-in element rule', () => {
      expect(render({ type: 'heading', attrs: { level: 3 }, content: [txt('T')] })).toBe('<h3 class="cap-typography">T</h3>');
    });
  });

  it('a custom font family that is no longer registered fails soft (no family var, page still renders)', () => {
    const d = doc([{ type: 'heading', attrs: { level: 2, typography: { desktop: { family: 'custom:11111111-1111-1111-1111-111111111111' } } }, content: [txt('Title')] }]);
    const html = renderDoc(d);
    expect(html).toContain('Title');
    expect(html).not.toContain('--typography-family-d');
  });

  it('renders semanticProperty marks as machine-readable spans', () => {
    const d = doc([para([txt('Active', [{ type: 'semanticProperty', attrs: { propName: 'status' } }])])]);
    const html = renderDoc(d);
    expect(html).toContain('class="sem-prop"');
    expect(html).toContain('data-prop="status"');
  });

  it('renders a template-parameter mark (reserved parameter group) as plain text — a slot is not a property claim', () => {
    const d = doc([para([txt('bound value', [{ type: 'semanticProperty', attrs: { propName: 'parameter:pkg', paramType: 'text' } }])])]);
    const html = renderDoc(d);
    expect(html).toContain('bound value');
    expect(html).not.toContain('sem-prop');
    expect(html).not.toContain('data-prop');
    expect(html).not.toContain('parameter:');
  });

  it('table omits the header row entirely when showHeader is false', () => {
    const cell = (text: string, isHeader: boolean) => ({ type: 'tableCell', attrs: { isHeader }, content: [txt(text)] });
    const table = {
      type: 'table',
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [cell('A', true), cell('B', true)] },
        { type: 'tableRow', attrs: { isHeader: false }, content: [cell('1', false), cell('2', false)] },
      ],
    };
    // One <tbody>, as in the editor's contentDOM; <th scope="col"> carries the header semantics.
    const shown = renderDoc(doc([{ ...table, attrs: { showHeader: true } }]));
    expect(shown).not.toContain('<thead>');
    expect(shown).toContain('<th');
    expect(shown).toContain('A');
    const hidden = renderDoc(doc([{ ...table, attrs: { showHeader: false } }]));
    expect(hidden).not.toContain('<th');
    expect(hidden).not.toContain('A');
  });

  it('table is a block around its table: the id and the space above on the block, its width in narrowest columns on the table', () => {
    // The box a table wider than its column scrolls in (table.css).
    const cell = (text: string) => ({ type: 'tableCell', attrs: { isHeader: true }, content: [txt(text)] });
    const html = renderDoc(doc([{
      type: 'table',
      attrs: { blockId: 't1', spacing: { desktop: { spaceAbove: 40 } } },
      content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [cell('A'), cell('B'), cell('C')] }],
    }]));
    // The table is a Svelte component inside the block wrapper (Table.svelte): its hydration markers may sit between.
    const m = new RegExp(`<div class="table-block [^"]*" data-block-id="t1" data-b="(${ID})">(?:<!--[^>]*-->)*<table class="table-block-table [^"]*" data-b="(${ID})">`).exec(html);
    expect(m, html).toBeTruthy();
    expect(ruleOf(html, m![1])).toContain('--space-above-d:40px');
    expect(ruleOf(html, m![2])).toContain('--table-span:3');
    expect(ruleOf(html, m![2])).not.toContain('--space-above');
    // Weighted columns: the table is as wide as four of its narrowest column.
    const weighted = renderDoc(doc([{
      type: 'table',
      attrs: { columnWidths: [1, 1, 2] },
      content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [cell('A'), cell('B'), cell('C')] }],
    }]));
    const t = new RegExp(`<table class="table-block-table [^"]*" data-b="(${ID})">`).exec(weighted)![1];
    expect(ruleOf(weighted, t)).toContain('--table-span:4');
    // A column stored narrower than a drag can make is drawn at the floor.
    const sliver = renderDoc(doc([{
      type: 'table',
      attrs: { columnWidths: [42, 25, 33, 1] },
      content: [{ type: 'tableRow', attrs: { isHeader: true }, content: [cell('A'), cell('B'), cell('C'), cell('D')] }],
    }]));
    const s = new RegExp(`<table class="table-block-table [^"]*" data-b="(${ID})">`).exec(sliver)![1];
    const span = Number(/--table-span:([\d.]+)/.exec(ruleOf(sliver, s) ?? '')![1]);
    expect(span).toBeGreaterThan(19);
    expect(span).toBeLessThan(22);
  });

  it('table renders cell inline content (marks) via the same renderInline as paragraphs', () => {
    const cell = (content: unknown[], isHeader: boolean) => ({ type: 'tableCell', attrs: { isHeader }, content });
    const table = {
      type: 'table',
      attrs: { showHeader: true },
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [cell([txt('Name')], true)] },
        { type: 'tableRow', attrs: { isHeader: false }, content: [cell([txt('bold', [{ type: 'typographyWeight', attrs: { weight: 'bold' } }])], false)] },
      ],
    };
    const html = renderDoc(doc([table]));
    expect(html).toContain('<th');
    expect(html).toContain('<td');
    const id = new RegExp(`<span data-b="(${ID})">bold</span>`).exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(ruleOf(html, id!)).toBe('font-weight:700');
  });

  it('renders a callout with its variant class and inline content', () => {
    const d = doc([{ type: 'callout', attrs: { variant: 'warn' }, content: [txt('Heads up')] }]);
    const html = renderDoc(d);
    expect(html).toMatch(/\bcallout\b/);
    expect(html).toMatch(/\bcallout-warn\b/);
    expect(html).toContain('Heads up');
  });

  it('callout defaults to the "info" variant when unset', () => {
    const d = doc([{ type: 'callout', attrs: {}, content: [txt('Note')] }]);
    expect(renderDoc(d)).toMatch(/\bcallout-info\b/);
  });

  it('renders a grid with its width/style attrs and nested cells', () => {
    const container = {
      type: 'grid',
      attrs: { columnWidths: [1, 1], gap: 'md', width: 'wide' },
      content: [
        { type: 'gridCell', attrs: {}, content: [para([txt('left')])] },
        { type: 'gridCell', attrs: { stretch: true, alignX: 'center' }, content: [para([txt('right')])] },
      ],
    };
    const html = renderDoc(doc([container]));
    // Word-boundary class matches, since classes may reorder; `grid` must not
    // match inside a nested `grid-cell`.
    expect(html).toMatch(/\bgrid(?=[\s"])/);
    expect(html).toMatch(/\bcap-spacing\b/);
    expect(html).toContain('data-width="wide"');
    expect(html).toMatch(/\bgrid-cell\b/);
    expect(html).toContain('data-stretch=""');
    expect(html).toContain('left');
    expect(html).toContain('right');
  });

  it('grid publishes its columns per tier and marks where its cells reflow', () => {
    const cells = [1, 2, 3, 4].map(() => ({ type: 'gridCell', attrs: {}, content: [para([])] }));
    const grid = (attrs: Record<string, unknown>, n = 4) => renderDoc(doc([{ type: 'grid', attrs, content: cells.slice(0, n) }]));
    // Untouched: the desktop's columns and gap, stacked on a phone as always.
    const plain = grid({ columnWidths: [1, 1, 1, 1] });
    expect(plain).toContain('data-reflow="p"');
    expect(plain).toContain('--gap-d:1rem');
    expect(plain).not.toContain('--cols-p');
    expect(plain).not.toContain('--cols-t');
    // Four figures, 2 × 2 on a phone with a smaller gap.
    const stats = grid({ columnWidths: [1, 1, 1, 1], columnsByTier: { phone: [1, 1] }, gapByTier: { phone: 'sm' } });
    expect(stats).toContain('--cols-p:1fr 1fr');
    expect(stats).toContain('--gap-p:0.5rem');
    expect(stats).toContain('data-reflow="p"');
    // An icon beside its text keeps the desktop's columns on a phone: nothing reflows.
    const icons = grid({ columnWidths: [1, 6], columnsByTier: { phone: [1, 6] } }, 2);
    expect(icons).toContain('--cols-p:1fr 6fr');
    expect(icons).not.toContain('data-reflow');
  });

  it('grid omits data-width for the default "normal" width', () => {
    const container = { type: 'grid', attrs: { columnWidths: [1] }, content: [{ type: 'gridCell', attrs: {}, content: [para([])] }] };
    expect(renderDoc(doc([container]))).not.toContain('data-width');
  });

  it('renders grid/gridCell surface data as bg/border/radius/shadow custom properties', () => {
    const container = {
      type: 'grid',
      attrs: {
        columnWidths: [1],
        surface: { desktop: { bg: '#0f172a', border: '#334155', radius: 12, shadow: 'md' } },
      },
      content: [
        {
          type: 'gridCell',
          attrs: { surface: { desktop: { bg: '#ffffff', radius: 4 } } },
          content: [para([txt('cell')])],
        },
      ],
    };
    const html = renderDoc(doc([container]));
    expect(html).toMatch(/\bcap-surface\b/);
    expect(html).toContain('--surface-bg-d:#0f172a');
    expect(html).toContain('--surface-border-d:1px solid #334155');
    expect(html).toContain('--surface-radius-d:12px');
    expect(html).toContain('--surface-shadow-d:var(--content-shadow-md)');
    expect(html).toContain('--surface-bg-d:#ffffff');
    // The cell's radius 4 equals the containers' default: nothing to emit.
    expect(html).not.toContain('--surface-radius-d:4px');
  });

  it('grid surface supports a tablet-only override while leaving other fields on the desktop tier', () => {
    const container = {
      type: 'grid',
      attrs: {
        columnWidths: [1],
        surface: {
          desktop: { bg: '#0f172a', border: '#334155', radius: 12, shadow: 'md' },
          tablet: { bg: '#1e293b' },
        },
      },
      content: [{ type: 'gridCell', attrs: {}, content: [para([])] }],
    };
    const html = renderDoc(doc([container]));
    // Field-scoped: the CSS fallback chain resolves the other fields at tablet.
    expect(html).toContain('--surface-bg-t:#1e293b');
    expect(html).not.toContain('--surface-border-t');
    expect(html).not.toContain('--surface-radius-t');
    expect(html).not.toContain('--surface-shadow-t');
    expect(html).toContain('--surface-bg-d:#0f172a');
    expect(html).toContain('--surface-border-d:1px solid #334155');
  });

  it('grid/gridCell with no surface or spacing data carry no surface or padding vars — the group defaults are the theme stylesheet', () => {
    const container = {
      type: 'grid',
      attrs: { columnWidths: [1] },
      content: [{ type: 'gridCell', attrs: {}, content: [para([])] }],
    };
    const html = renderDoc(doc([container]));
    expect(html).not.toContain('--surface-');
    expect(html).not.toContain('--pad-');
    expect(html).not.toContain('--typography-');
    expect(html).toContain('class="grid grp-containers cap-spacing cap-surface cap-height"');
    expect(html).toContain('class="grid-cell grp-containers cap-spacing cap-surface cap-typography"');
  });

  it('emits padding as the uniform shorthand when the sides agree, and leaves out the group default', () => {
    const cell = (spacing: unknown) =>
      renderDoc(doc([{ type: 'grid', attrs: { columnWidths: [1] }, content: [{ type: 'gridCell', attrs: { spacing }, content: [para([])] }] }]));
    expect(cell({ desktop: { pad: 16 } })).toContain('{--pad-d:16px}');
    expect(cell({ desktop: { pad: 8 } })).not.toContain('--pad-');
    expect(cell({ desktop: { pad: 16, top: 0 }, phone: { pad: 8 } })).toContain('{--pad-d:16px;--pad-d-top:0px;--pad-p:8px}');
  });

  it('renders a theme-colour reference as its custom property, in a colour mark and on a filled quick link', () => {
    const marked = renderDoc(doc([para([txt('tinted', [{ type: 'typographyColor', attrs: { color: 'token:accent' } }])])]));
    const id = new RegExp(`<span data-b="(${ID})">tinted</span>`).exec(marked)?.[1];
    expect(ruleOf(marked, id!)).toBe('color:var(--content-theme-accent)');
    expect(marked).not.toContain('token:');
    const filled = renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', surface: { desktop: { bg: 'token:inverse' } } } }]));
    expect(filled).toContain('--surface-bg-d:var(--content-theme-inverse)');
    // Its default text is the fill's readable partner; a theme colour is no island.
    expect(filled).toContain('--surface-fg-d:var(--content-theme-on-inverse)');
    expect(filled).not.toContain('data-scheme');
  });

  it('pins the scheme of a block with a literal background, and sets its default text from that scheme', () => {
    const html = renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', surface: { desktop: { bg: '#0f172a' } } } }]));
    expect(html).toContain('<div class="quick-link-block" data-scheme="dark"');
    expect(html).toContain('--surface-fg-d:var(--content-filled-fg)');
  });

  // The button variant is a Svelte component, server-rendered and hydrated on the page.
  it('renders a button quick link through its component: the island marker, its props, the hydration markers, no style attribute', () => {
    const html = renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Visit', variant: 'button', icon: 'link', surface: { desktop: { bg: '#2563eb' } } } }]));
    const wrap = /<div class="quick-link-block" data-scheme="dark" data-island="quickLink" data-props="([^"]+)">(<!--\[-->)/.exec(html);
    expect(wrap, 'the wrapper carries the island marker and opens on the hydration marker').not.toBeNull();
    const props = JSON.parse(wrap![1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const ruleId = new RegExp(`<a [^>]*data-b="(${ID})"`).exec(html)![1];
    expect(props).toEqual({ variant: 'button', href: 'https://example.com', external: true, label: 'Visit', icon: 'link', iconPosition: 'left', class: 'grp-cards cap-surface cap-typography quick-link--icon-left', interactive: true, 'data-b': ruleId });
    expect(html).toContain('<a href="https://example.com" class="quick-link quick-link--button grp-cards cap-surface cap-typography quick-link--icon-left" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('<span class="quick-link-icon">');
    expect(html).toContain('<span class="quick-link-label">Visit</span>');
    expect(ruleOf(html, ruleId)).toContain('--surface-bg-d:#2563eb');
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toContain('data-hydrated');
    expect(html).not.toContain('quick-link-dest');
  });

  // The server renders the diagram's text; the source rides in the island's props.
  it('renders a diagram as an island that says it is being drawn, its source in the props, never as text', () => {
    const html = renderDoc(doc([{ type: 'diagram', attrs: { blockId: 'd', code: 'graph TD; A[<Alpha>]-->B', spacing: { desktop: { spaceAbove: 16 } } } }]));
    const wrap = new RegExp(`^<div class="diagram-block" data-block-id="d" data-b="(${ID})" data-island="diagram" data-props="([^"]+)">`).exec(html);
    expect(wrap, 'the wrapper carries the block id, its space above and the island marker').not.toBeNull();
    expect(ruleOf(html, wrap![1])).toContain('--space-above-d:16px');
    const props = JSON.parse(wrap![2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    expect(props).toEqual({ code: 'graph TD; A[<Alpha>]-->B', waiting: 'Rendering diagram…', failed: 'Diagram error', empty: null });
    expect(html.replace(/<!--[^>]*-->/g, '').replace(/ data-props="[^"]+"/, '')).toMatch(/<div class="mermaid"><span class="diagram-waiting">Rendering diagram…<\/span><\/div><\/div>/);
    expect(html.replace(/ data-props="[^"]+"/, '')).not.toContain('Alpha');
    expect(html).not.toMatch(/\sstyle=/);
    // An empty diagram shows nothing on the page.
    expect(renderDoc(doc([{ type: 'diagram', attrs: { code: ' ' } }])).replace(/<!--[^>]*-->/g, '').replace(/ data-props="[^"]+"/, '')).toBe('<div class="diagram-block" data-island="diagram"><div class="mermaid"></div></div>');
  });

  it("renders every variant through the component as the block's own anchor; a card with nothing of its own carries no rule", () => {
    const card = (variant: string) => renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', variant } }]));
    const link = card('link');
    expect(link).toContain('data-island="quickLink"');
    expect(link).toContain('<a href="https://example.com" class="quick-link quick-link--link grp-cards cap-surface cap-typography" target="_blank" rel="noopener noreferrer">');
    expect(link).not.toContain('ds-btn');
    expect(link).not.toContain('data-b');
    const outlined = card('outlined');
    expect(outlined).toContain('class="quick-link quick-link--outlined grp-cards cap-surface cap-typography"');
    expect(outlined).not.toContain('svelte-'); // no scoped class: the component has no <style> of its own
    expect(JSON.parse(/data-props="([^"]+)"/.exec(outlined)![1].replace(/&quot;/g, '"')).variant).toBe('outlined');
  });

  it('renders a size mark as its type-scale token, and a px literal unchanged', () => {
    const scaled = renderDoc(doc([para([txt('big', [{ type: 'typographySize', attrs: { size: 'scale:2xl' } }])])]));
    expect(ruleOf(scaled, new RegExp(`<span data-b="(${ID})">big</span>`).exec(scaled)![1])).toBe('font-size:var(--type-2xl)');
    expect(scaled).not.toContain('scale:');
    const literal = renderDoc(doc([para([txt('fixed', [{ type: 'typographySize', attrs: { size: 20 } }])])]));
    expect(ruleOf(literal, new RegExp(`<span data-b="(${ID})">fixed</span>`).exec(literal)![1])).toBe('font-size:20px');
  });

  it('drops a size mark that is neither a px number nor a known step', () => {
    const html = renderDoc(doc([para([txt('x', [{ type: 'typographySize', attrs: { size: 'scale:9xl' } }])])]));
    expect(html).not.toContain('font-size');
  });

  it('drops a colour that is neither a literal nor a known theme colour', () => {
    const html = renderDoc(doc([para([txt('x', [{ type: 'typographyColor', attrs: { color: 'token:nope' } }])])]));
    expect(html).not.toMatch(/data-b=|color:/);
  });

  it('renders a quick link with no variant as a link, with the resolved page href and Surface classes', () => {
    const d = doc([{ type: 'quickLink', attrs: { refType: 'page', targetPageId: 'p1', label: 'My Page' } }]);
    const html = renderDoc(d, { p1: 'my-page' });
    expect(html).toContain('class="quick-link-block"');
    expect(html).toContain('class="quick-link quick-link--link grp-cards cap-surface cap-typography"');
    expect(html).toContain('href="/my-page"');
    expect(html).toContain('My Page');
  });

  it('a quick link with a Surface bg from before variants is a button, emits its own fill, external with target=_blank', () => {
    const d = doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Visit', surface: { desktop: { bg: '#2563eb' } } } }]);
    const html = renderDoc(d);
    expect(html).toMatch(/\bquick-link--button\b/);
    expect(html).toContain('--surface-bg-d:#2563eb');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it("a variant decides which surface fields a card carries: a link's stored fill and an outline's are never emitted", () => {
    const card = (variant: string) =>
      renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', variant, surface: { desktop: { bg: '#2563eb', border: '#334155', shadow: 'md' } } } }]));
    expect(card('link')).toContain('class="quick-link quick-link--link grp-cards cap-surface cap-typography"');
    expect(card('link')).not.toContain('--surface-');
    expect(card('outlined')).toContain('--surface-border-d:1px solid #334155');
    expect(card('outlined')).toContain('--surface-shadow-d:');
    expect(card('outlined')).not.toContain('--surface-bg-d');
    expect(card('button')).toContain('--surface-bg-d:#2563eb');
    // The button's built-in accent is the variant's look, not a var on the card.
    expect(renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', variant: 'button', surface: { desktop: { bg: 'token:accent' } } } }]))).not.toContain('--surface-bg-d');
  });

  // Responsive images (docs/architecture/media.md): an image whose size the caller looked
  // up offers its copies; one whose size is unknown renders by its src alone.
  describe('image copies', () => {
    const ASSET = '11111111-2222-3333-4444-555555555555';
    const image = (attrs: Record<string, unknown> = {}) => ({ type: 'image', attrs: { assetId: ASSET, alt: '', ...attrs } });
    // Past the page's opening blocks: an image like any other, loaded lazily.
    const one = (attrs: Record<string, unknown> = {}) => doc([para([txt('a')]), para([txt('b')]), image(attrs)]);
    const sizes = { [ASSET]: { width: 1600, height: 900, variants: true } };

    it('offers the copies, the size the image is shown at, and its own size', () => {
      const { html, css } = renderDocImpl(one(), {}, {}, { assetSizes: sizes });
      expect(html).toContain(`srcset="/api/media/${ASSET}?w=320 320w, /api/media/${ASSET}?w=640 640w, /api/media/${ASSET}?w=960 960w, /api/media/${ASSET}?w=1280 1280w, /api/media/${ASSET} 1600w"`);
      expect(html).toContain('sizes="auto, (max-width: 640px) min(1600px, 100vw), (max-width: 900px) min(1600px, 100vw), min(1600px, 760px)"');
      // No width/height attributes: `sizes="auto"` makes the browser contain
      // its size, so the ratio comes from the stored size.
      expect(html).not.toMatch(/<img [^>]*\swidth="/);
      expect(css).toContain('--img-w:1600px');
      expect(css).toContain('aspect-ratio:auto 1600 / 900');
    });

    it("draws a fitted box as authored: its own ratio wins, a set height takes the width that height gives", () => {
      const aspect = renderDocImpl(one({ boxMode: 'aspect', boxAspect: '4/3' }), {}, {}, { assetSizes: sizes }).css;
      expect(aspect).toContain('aspect-ratio:4/3');
      expect(aspect).not.toContain('aspect-ratio:auto');
      const height = renderDocImpl(one({ boxMode: 'height', boxHeight: 200 }), {}, {}, { assetSizes: sizes }).css;
      expect(height).toContain('height:200px');
      expect(height).not.toContain('--img-w');
    });

    it("the page's opening image loads at once and first, the next one lazily (leadImage.ts)", () => {
      const html = renderDocImpl(doc([para([txt('Titel')]), image(), image({ alt: 'second' })]), {}, {}, { assetSizes: sizes }).html;
      const [first, second] = html.match(/<img [^>]*>/g)!;
      expect(first).toContain('fetchpriority="high"');
      expect(first).not.toContain('loading=');
      // Not lazy, so no `auto`: the guess decides.
      expect(first).toContain('sizes="(max-width: 640px)');
      expect(second).toContain('loading="lazy"');
      expect(second).not.toContain('fetchpriority');
    });

    it('renders an image of unknown size as before: src alone', () => {
      const html = renderDoc(one());
      expect(html).not.toContain('srcset');
      expect(html).not.toContain('--img-w');
      expect(html).toContain(`src="/api/media/${ASSET}"`);
    });
  });

  describe('image fitted-box', () => {
    const img = (attrs: Record<string, unknown>) => doc([{ type: 'image', attrs: { assetId: 'a1', alt: 'Alt', ...attrs } }]);

    it('default (no boxMode) carries no fitted box — no data-box/data-pos anywhere', () => {
      const { html, css } = renderDocImpl(img({ width: 50, align: 'left' }));
      // The component inside its frame (Svelte's markers around it); how to load comes before the source.
      const id = new RegExp(`^<div class="page-image-frame"><!--\\[--><img class="page-image" loading="lazy" decoding="async" src="/api/media/a1" alt="Alt" data-b="(${ID})" data-align="left"/><!--\\[-1--><!--\\]--><!--\\]--></div>$`).exec(html)?.[1];
      expect(id).toBeTruthy();
      expect(css).toBe(`[data-b="${id}"]{--image-width-d:50%}`);
      expect(html).not.toContain('data-box');
      expect(html).not.toContain('data-pos');
      expect(css).not.toContain('object-fit');
    });

    it('boxMode "auto" explicitly set behaves the same as unset', () => {
      const html = renderDoc(img({ boxMode: 'auto' }));
      expect(html).not.toContain('data-box');
      expect(html).not.toMatch(/style=|data-b=/);
    });

    it('height mode: inline height + implicit cover/center defaults, data-box on frame and img', () => {
      const html = renderDoc(img({ boxMode: 'height', boxHeight: 220 }));
      expect(html).toContain('<div class="page-image-frame" data-box="height">');
      expect(html).toContain('height:220px');
      expect(html).toContain('object-fit:cover');
      expect(html).toContain('object-position:center');
      expect(html).toContain('data-box="height"');
      expect(html).toContain('data-pos="center"');
    });

    it('height mode with no boxHeight set falls back to the 300px default', () => {
      const html = renderDoc(img({ boxMode: 'height' }));
      expect(html).toContain('height:300px');
    });

    it('aspect mode: inline aspect-ratio, falls back to 16/9 when unset', () => {
      const withRatio = renderDoc(img({ boxMode: 'aspect', boxAspect: '4/3' }));
      expect(withRatio).toContain('aspect-ratio:4/3');
      const withoutRatio = renderDoc(img({ boxMode: 'aspect' }));
      expect(withoutRatio).toContain('aspect-ratio:16/9');
    });

    it('an invalid custom aspect ratio string falls back to the default rather than emitting garbage', () => {
      const html = renderDoc(img({ boxMode: 'aspect', boxAspect: 'not-a-ratio' }));
      expect(html).toContain('aspect-ratio:16/9');
    });

    it('fill mode: width and height both 100%, data-box="fill" on the frame drives the CSS hook', () => {
      const html = renderDoc(img({ boxMode: 'fill' }));
      expect(html).toContain('<div class="page-image-frame" data-box="fill">');
      expect(html).toContain('width:100%');
      expect(html).toContain('height:100%');
    });

    it('explicit objectFit/objectPosition override the implicit cover/center defaults', () => {
      const html = renderDoc(img({ boxMode: 'height', boxHeight: 200, objectFit: 'contain', objectPosition: 'top-left' }));
      expect(html).toContain('object-fit:contain');
      expect(html).toContain('object-position:left top');
      expect(html).toContain('data-pos="top-left"');
    });

    it('an unrecognized objectFit/objectPosition value falls back to the implicit default', () => {
      const html = renderDoc(img({ boxMode: 'fill', objectFit: 'bogus', objectPosition: 'nowhere' }));
      expect(html).toContain('object-fit:cover');
      expect(html).toContain('object-position:center');
    });
  });

  // The query block's wrapper is the template format's result container (blocks/query/formats.ts).
  describe('queryBlock result container', () => {
    const template = {
      type: 'grid',
      attrs: { columnWidths: [1] },
      content: [{ type: 'gridCell', content: [para([txt('item')])] }],
    };
    const qb = (attrs: Record<string, unknown>) => doc([{ type: 'queryBlock', attrs: { blockId: 'q1', ...attrs }, content: [template] }]);
    const item = { id: 'n1', title: 'Item', properties: [] } as any;
    const twoResults = { q1: { state: 'ok' as const, items: [item, item] } };
    // [the wrapper's opening tag, the declarations of its rule (undefined when it has none)]
    const wrapper = (html: string): [string, string | undefined] | null => {
      const m = /<div class="query-block[^"]*"[^>]*? data-block-id="q1"[^>]*?(?: data-b="([^"]*)")?>/.exec(html);
      return m ? [m[0], m[1] ? ruleOf(html, m[1]) : undefined] : null;
    };

    it('unset options render a plain stacked list: cap classes, column flow, no gap, no padding', () => {
      const html = renderDoc(qb({}), {}, twoResults);
      // The column flow and the flush padding are kind pins in query.css,
      // the group defaults the theme stylesheet: nothing is inline.
      expect(html).toContain('<div class="query-block grp-containers cap-layout cap-spacing cap-surface" data-block-id="q1">');
      expect(wrapper(html)![1]).toBeUndefined();
      expect(html.match(/class="query-block-instance"/g)).toHaveLength(2);
    });

    it('formatOptions layout/spacing become the capability vars, overriding the kind defaults', () => {
      const html = renderDoc(
        qb({
          format: 'template',
          formatOptions: {
            layout: { desktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, phone: { flexDirection: 'column' } },
            spacing: { desktop: { pad: 8 }, tablet: { pad: 4 } },
          },
        }),
        {},
        twoResults
      );
      const style = wrapper(html)![1];
      expect(style).toContain('--layout-direction-d:row');
      expect(style).toContain('--layout-wrap-d:wrap');
      expect(style).toContain('--layout-gap-d:16px');
      expect(style).toContain('--layout-direction-p:column');
      expect(style).toContain('--pad-d:8px');
      expect(style).toContain('--pad-t:4px');
      expect(style).not.toContain('--layout-direction-d:column'); // the kind pin is a rule, never an inline var
    });

    it('malformed formatOptions are tolerated as unset', () => {
      for (const formatOptions of ['garbage', 42, { layout: { desktop: { flexDirection: 'diagonal' } }, spacing: 'x' }]) {
        expect(wrapper(renderDoc(qb({ formatOptions }), {}, twoResults))![1]).toBeUndefined();
      }
    });

    it('section width is mirrored as data-width on the wrapper, omitted for normal/unset', () => {
      expect(renderDoc(qb({ width: 'full' }), {}, twoResults)).toContain('data-width="full" data-block-id="q1">');
      expect(renderDoc(qb({ width: 'wide' }), {}, twoResults)).toContain('data-width="wide"');
      expect(renderDoc(qb({ width: 'normal' }), {}, twoResults)).not.toContain('data-width');
      expect(renderDoc(qb({}), {}, twoResults)).not.toContain('data-width');
    });

    it('bleed-to-top is mirrored as data-bleed-top, absent by default', () => {
      expect(renderDoc(qb({ bleedToTop: true }), {}, twoResults)).toContain('data-bleed-top="" data-block-id="q1">');
      expect(renderDoc(qb({}), {}, twoResults)).not.toContain('data-bleed-top');
    });

    it('surface options become surface vars; unset emits nothing', () => {
      expect(wrapper(renderDoc(qb({}), {}, twoResults))![1]).toBeUndefined();
      const styled = wrapper(
        renderDoc(qb({ formatOptions: { surface: { desktop: { bg: '#2563eb', radius: 12 }, phone: { shadow: 'sm' } } } }), {}, twoResults)
      )![1];
      expect(styled).toContain('--surface-bg-d:#2563eb');
      expect(styled).toContain('--surface-radius-d:12px');
      expect(styled).toContain('--surface-shadow-p:');
      // A literal background pins its scheme region on the result container itself.
      expect(renderDoc(qb({ formatOptions: { surface: { desktop: { bg: '#0f172a' } } } }), {}, twoResults)).toMatch(/data-scheme="dark" data-block-id="q1" data-b=/);
    });

    it('an unknown format id falls back to the template format container', () => {
      const html = renderDoc(qb({ format: 'hologram' }), {}, twoResults);
      expect(html).toContain('class="query-block grp-containers cap-layout cap-spacing cap-surface"');
    });

    it('a non-ok state renders the placeholder, never a result container', () => {
      const html = renderDoc(qb({}), {}, { q1: { state: 'empty' as const } });
      expect(html).not.toContain('cap-layout');
      expect(html).not.toContain('query-block-instance');
    });
  });

  describe('schemes a block pins for itself', () => {
    it('carries the pin on the HTML block wrapper; one that follows the page is wrapped without a pin', () => {
      const pinned = renderDocImpl(doc([{ type: 'htmlBlock', attrs: { html: '<p style="color: #333">hi</p>', scheme: 'light' } }]));
      // The author's inline style becomes a per-page rule (sanitizeFragmentInto).
      const id = new RegExp(`^<div class="html-block" data-html-block="" data-scheme="light">(?:<!--[^>]*-->)*<p data-b="(${ID})">hi</p>(?:<!--[^>]*-->)*</div>$`).exec(pinned.html)?.[1];
      expect(id).toBeTruthy();
      expect(pinned.css).toBe(`[data-b="${id}"]{color:#333}`);
      // Unconditional: the wrapper carries the block's id and its space above.
      expect(renderDoc(doc([{ type: 'htmlBlock', attrs: { html: '<p>hi</p>', scheme: 'sepia' } }])).replace(/<!--[^>]*-->/g, '')).toBe(
        '<div class="html-block" data-html-block=""><p>hi</p></div>'
      );
      // An empty block draws nothing on the page — the editor's hint is the editor's.
      expect(renderDoc(doc([{ type: 'htmlBlock', attrs: { html: '' } }])).replace(/<!--[^>]*-->/g, '')).toBe('<div class="html-block" data-html-block=""></div>');
    });

    it("pins an image's backdrop on the <img> itself", () => {
      const html = renderDoc(doc([{ type: 'image', attrs: { assetId: 'a1', alt: '', backdrop: 'dark' } }]));
      expect(html).toMatch(/<img class="page-image"[^>]* data-backdrop="" data-scheme="dark"/);
      expect(renderDoc(doc([{ type: 'image', attrs: { assetId: 'a1', alt: '' } }]))).not.toContain('data-backdrop');
    });

    it('resolves a custom style inside a query block template instance', () => {
      // The bound clone re-enters the same walker, so every row keeps the class.
      const template = {
        type: 'grid',
        attrs: { columnWidths: [1] },
        content: [
          {
            type: 'gridCell',
            attrs: {},
            content: [para([txt('item', [{ type: 'customStyle', attrs: { styleId: 's1' } }])])],
          },
        ],
      };
      const item = { id: 'n1', title: 'Item', properties: [] } as any;
      const html = renderDoc(
        doc([{ type: 'queryBlock', attrs: { blockId: 'q1' }, content: [template] }]),
        {},
        { q1: { state: 'ok' as const, items: [item, item] } },
        { customStyles: { s1: 'cs-lead' } }
      );
      expect(html.match(/<span class="cs-lead">item<\/span>/g)).toHaveLength(2);
    });

    it('keeps theme colour references in a query block template instance', () => {
      const template = {
        type: 'grid',
        attrs: { columnWidths: [1] },
        content: [{ type: 'gridCell', attrs: { surface: { desktop: { bg: 'token:accent-soft' } }, typography: { desktop: { color: 'token:accent' } } }, content: [para([txt('item')])] }],
      };
      const item = { id: 'n1', title: 'Item', properties: [] } as any;
      const html = renderDoc(doc([{ type: 'queryBlock', attrs: { blockId: 'q1' }, content: [template] }]), {}, { q1: { state: 'ok' as const, items: [item] } });
      expect(html).toContain('--surface-bg-d:var(--content-theme-accent-soft)');
      expect(html).toContain('--typography-color-d:var(--content-theme-accent)');
      expect(html).not.toContain('token:');
    });
  });
});

// The rendered class always comes from the registry, never the stored
// attribute, so no class can be smuggled in over the API (docs/architecture/custom-styles.md).
describe('renderDoc — customStyle mark', () => {
  const styleMark = (styleId: unknown) => [{ type: 'customStyle', attrs: { styleId } }];
  const classes = { s1: 'cs-lead' };

  it('renders the registry class for a known style id', () => {
    const html = renderDoc(doc([para([txt('Intro', styleMark('s1'))])]), {}, {}, { customStyles: classes });
    expect(html).toContain('<span class="cs-lead">Intro</span>');
  });

  it('leaves the run unstyled when the style was deleted', () => {
    const html = renderDoc(doc([para([txt('Intro', styleMark('gone'))])]), {}, {}, { customStyles: classes });
    expect(html).toContain('Intro');
    expect(html).not.toContain('<span');
    expect(html).not.toContain('cs-');
  });

  it('never takes the class from the stored attribute, so an injected id yields nothing', () => {
    const evil = '"><script>alert(1)</script><span class="';
    const html = renderDoc(doc([para([txt('Intro', styleMark(evil))])]), {}, {}, { customStyles: classes });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<span');
    expect(html).toContain('Intro');
  });

  it('renders unstyled rather than throwing when no registry was threaded', () => {
    const html = renderDoc(doc([para([txt('Intro', styleMark('s1'))])]));
    expect(html).toContain('Intro');
    expect(html).not.toContain('cs-lead');
  });

  it('wraps inside a page link, so a class that sets colour beats the link rule', () => {
    const marks = [...styleMark('s1'), { type: 'pageLink', attrs: { targetPageId: 'p1', targetSlug: 'other' } }];
    const html = renderDoc(doc([para([txt('Intro', marks)])]), { p1: 'other' }, {}, { customStyles: classes });
    expect(html).toContain('<a class="page-link" href="/other"><span class="cs-lead">Intro</span></a>');
  });

  it('wraps outside the typography marks, which are the finer-grained overrides', () => {
    const marks = [...styleMark('s1'), { type: 'typographyWeight', attrs: { weight: 'bold' } }];
    const html = renderDoc(doc([para([txt('Intro', marks)])]), {}, {}, { customStyles: classes });
    expect(html).toMatch(new RegExp(`<span class="cs-lead"><span data-b="${ID}">Intro</span></span>`));
  });
});

// The reader's strict style-src: no style attribute anywhere, every override a
// per-page rule named by data-b (docs/architecture/blocks/capabilities.md, "Override sets and the carrier").
describe('per-page stylesheet', () => {
  const rich = doc([
    { type: 'heading', attrs: { level: 2, typography: { desktop: { size: 'scale:4xl', color: '#b45309' } } }, content: [txt('H')] },
    para([txt('a', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }]), txt('b', [{ type: 'typographyColor', attrs: { color: '#2563eb' } }])]),
    { type: 'paragraph', attrs: { spacing: { desktop: { spaceAbove: 64 } } }, content: [txt('spaced')] },
    { type: 'bulletList', attrs: { listStyle: 'square', spacing: 'loose' }, content: [{ type: 'listItem', content: [para([txt('i')])] }] },
    { type: 'htmlBlock', attrs: { html: '<p style="margin:0"><em style="color:#dc2626">e</em></p>' } },
    {
      type: 'grid',
      attrs: { columnWidths: [1, 2], gap: 'lg', spacing: { desktop: { pad: 24 } }, surface: { desktop: { bg: '#f1f5f9', radius: 12 } } },
      content: [
        { type: 'gridCell', attrs: { surface: { desktop: { bg: '#1e293b' } }, alignX: 'center' }, content: [para([txt('c1')])] },
        { type: 'gridCell', attrs: { colSpan: 2 }, content: [para([txt('c2')])] },
      ],
    },
    {
      type: 'flexContainer',
      attrs: { layout: { desktop: { flexDirection: 'row', gap: 24 } } },
      content: [{ type: 'flexCell', attrs: { spacing: { desktop: { pad: 12 } } }, content: [para([txt('f')])] }],
    },
    {
      type: 'table',
      attrs: { columnWidths: [1, 3], surface: { desktop: { bg: '#eef2ff' } } },
      content: [
        { type: 'tableRow', attrs: { isHeader: true }, content: [{ type: 'tableCell', attrs: { isHeader: true }, content: [txt('A')] }, { type: 'tableCell', attrs: { isHeader: true }, content: [txt('B')] }] },
        { type: 'tableRow', attrs: { height: 56 }, content: [{ type: 'tableCell', attrs: { spacing: { desktop: { pad: 12 } } }, content: [txt('1')] }, { type: 'tableCell', attrs: {}, content: [txt('2')] }] },
      ],
    },
    { type: 'image', attrs: { assetId: 'a1', width: 60, boxMode: 'aspect', boxAspect: '16/9' } },
    { type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'B', variant: 'button', surface: { desktop: { bg: '#7c3aed' } } } },
    { type: 'callout', attrs: { variant: 'warn', spacing: { desktop: { spaceAbove: 8 } } }, content: [txt('w')] },
    { type: 'codeBlock', attrs: { language: 'ts', spacing: { desktop: { spaceAbove: 8 } } }, content: [txt('x')] },
    { type: 'diagram', attrs: { code: 'graph LR; A-->B', spacing: { desktop: { spaceAbove: 8 } } } },
  ]);

  it('emits no style attribute anywhere, and a rule for every data-b it names', () => {
    const { html, css } = renderDocImpl(rich);
    expect(html).not.toMatch(/\sstyle\s*=/);
    const ids = Array.from(html.matchAll(/data-b="([^"]+)"/g), (m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(css, `rule for ${id}`).toContain(`[data-b="${id}"]{`);
    // and no rule without an element
    for (const id of Array.from(css.matchAll(/\[data-b="([^"]+)"\]/g), (m) => m[1])) expect(ids).toContain(id);
    // one data-b per element
    expect(html).not.toMatch(/data-b="[^"]*"[^>]*data-b=/);
  });

  it('identical sets share one id and one rule', () => {
    const { html, css } = renderDocImpl(rich);
    const blue = Array.from(html.matchAll(new RegExp(`<span data-b="(${ID})">[ab]</span>`, 'g')), (m) => m[1]);
    expect(blue).toHaveLength(2);
    expect(blue[0]).toBe(blue[1]);
    expect(css.match(/color:#2563eb/g)).toHaveLength(1);
    // the three 8px space-above blocks share a rule too
    expect(css.match(/\{--space-above-d:8px\}/g)).toHaveLength(1);
  });

  it('carries the table column widths and the row height as rules', () => {
    const { html, css } = renderDocImpl(rich);
    expect(html).toMatch(new RegExp(`<col data-b="${ID}"/><col data-b="${ID}"/>`));
    expect(css).toContain('{width:25%}');
    expect(css).toContain('{width:75%}');
    expect(html).toMatch(new RegExp(`<tr data-b="${ID}">`));
    expect(css).toContain('{height:56px}');
  });

  it('keeps concurrent renders apart: each call has its own stylesheet unless one is shared on purpose', () => {
    const a = renderDocImpl(doc([para([txt('a', [{ type: 'typographyColor', attrs: { color: '#111111' } }])])]));
    const b = renderDocImpl(doc([para([txt('b', [{ type: 'typographyColor', attrs: { color: '#222222' } }])])]));
    expect(a.css).toContain('#111111');
    expect(a.css).not.toContain('#222222');
    expect(b.css).not.toContain('#111111');
    const shared = new StyleCollector();
    renderDocImpl(doc([para([txt('a', [{ type: 'typographyColor', attrs: { color: '#111111' } }])])]), {}, {}, { styles: shared });
    const second = renderDocImpl(doc([para([txt('b', [{ type: 'typographyColor', attrs: { color: '#222222' } }])])]), {}, {}, { styles: shared });
    expect(second.css).toContain('#111111');
    expect(second.css).toContain('#222222');
    expect(shared.css()).toBe(second.css);
  });

  it('is deterministic: the same document renders the same markup and stylesheet twice', () => {
    expect(renderDocImpl(rich)).toEqual(renderDocImpl(rich));
  });
});

describe('inter-block spacing vars', () => {
  const grid = (spacing: unknown) => ({
    type: 'grid',
    attrs: { blockId: 'g1', spacing },
    content: [{ type: 'gridCell', attrs: {}, content: [para([txt('x')])] }],
  });

  // --block-space-* here would decide the space above the container from the
  // rhythm it sets for its contents; its cells relay --flow-space-* instead.
  it("a container publishes its rhythm as a complete --flow-space-* triple", () => {
    const html = renderDoc(doc([grid({ desktop: { blockSpace: 40 }, phone: { blockSpace: 8 } })]));
    expect(html).toContain('--flow-space-d:40px');
    expect(html).toContain('--flow-space-t:40px');
    expect(html).toContain('--flow-space-p:8px');
    expect(html).not.toContain('--block-space');
  });

  it('a container with no rhythm of its own emits none, and inherits the page rhythm', () => {
    const html = renderDoc(doc([grid({ desktop: { pad: 8 } })]));
    expect(html).not.toContain('--flow-space');
    expect(html).not.toContain('--block-space');
  });

  it('a cell emits --block-space-* directly — a cell is never a spacing target', () => {
    const html = renderDoc(
      doc([
        {
          type: 'grid',
          attrs: { blockId: 'g1' },
          content: [{ type: 'gridCell', attrs: { spacing: { desktop: { blockSpace: 12 } } }, content: [para([txt('x')])] }],
        },
      ])
    );
    expect(html).toContain('--block-space-d:12px');
  });

  it('space-above is sparse: an absent desktop var is what lets the type default apply', () => {
    const html = renderDoc(doc([grid({ tablet: { spaceAbove: 0 } })]));
    expect(html).toContain('--space-above-t:0px');
    expect(html).not.toContain('--space-above-d');
  });
});

// Inter-block spacing selects blocks by data-block-id (app.css), so a kind that
// omits it renders fine and silently loses its space above.
describe('data-block-id parity', () => {
  const ID = 'b-fixture';
  const withId = (type: string, attrs: Record<string, unknown> = {}, content?: unknown[]) => ({
    type,
    attrs: { ...attrs, blockId: ID },
    ...(content ? { content } : {}),
  });

  // One fixture node per persisted addressable kind, at the depth it really
  // occurs (cells wrap their leaf blocks, rows wrap cells).
  const FIXTURES: Record<string, unknown> = {
    paragraph: withId('paragraph', {}, [txt('x')]),
    heading: withId('heading', { level: 2 }, [txt('x')]),
    codeBlock: withId('codeBlock', { language: 'plaintext' }, [txt('x')]),
    callout: withId('callout', { variant: 'info' }, [txt('x')]),
    blockquote: withId('blockquote', {}, [para([txt('x')])]),
    horizontalRule: withId('horizontalRule'),
    bulletList: withId('bulletList', {}, [{ type: 'listItem', content: [para([txt('x')])] }]),
    orderedList: withId('orderedList', {}, [{ type: 'listItem', content: [para([txt('x')])] }]),
    // The parent list carries no id, so only the item can satisfy it.
    listItem: { type: 'bulletList', content: [withId('listItem', {}, [para([txt('x')])])] },
    image: withId('image', { assetId: 'a1', alt: 'x' }),
    htmlBlock: withId('htmlBlock', { html: '<b>x</b>' }),
    quickLink: withId('quickLink', { refType: 'url', url: 'https://example.com', label: 'x' }),
    // An embedding block with nothing resolved for it (an agent's view) still renders its box.
    collectionBlock: withId('collectionBlock', { nodeId: '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11' }),
    documentBlock: withId('documentBlock', { nodeId: '2b4f0c1e-6d3a-4c59-9e1a-7f0b3c2d1e44' }),
    diagram: withId('diagram', { code: 'graph TD;' }),
    table: withId('table', {}, [
      { type: 'tableRow', content: [{ type: 'tableCell', content: [para([txt('x')])] }] },
    ]),
    grid: withId('grid', {}, [{ type: 'gridCell', content: [para([txt('x')])] }]),
    pageSection: withId('pageSection', {}, [{ type: 'gridCell', content: [para([txt('x')])] }]),
    flexContainer: withId('flexContainer', {}, [{ type: 'flexCell', content: [para([txt('x')])] }]),
    queryBlock: withId('queryBlock', {}),
  };

  // A plugin's kinds are held by the plugin contract (src/lib/plugins/contract.test.ts), each with its own sample.
  it('covers every persisted addressable kind', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual([...PERSISTED_ADDRESSABLE_BLOCK_TYPES].filter((kind) => !PLUGIN_BLOCK_KIND_NAMES.has(kind)).sort());
  });

  for (const [kind, node] of Object.entries(FIXTURES)) {
    it(`${kind} renders data-block-id`, () => {
      expect(renderDoc(doc([node]))).toContain(`data-block-id="${ID}"`);
    });
  }
});

// A section carries no tracks of its own (the canvas publishes them), and a
// block outside any section renders inside one.
describe('page sections', () => {
  const ARTIKEL = { mode: 'columns', template: { desktop: [3, 2], tablet: [3, 2], phone: [1] }, preset: 'main-aside', sectionDefaults: { width: 'wide' } };
  const cell = (text: string) => ({ type: 'gridCell', content: [{ type: 'paragraph', attrs: { blockId: text }, content: [txt(text)] }] });
  const section = (attrs: Record<string, unknown>, ...cells: unknown[]) => ({ type: 'pageSection', attrs: { blockId: 's1', ...attrs }, content: cells });

  it('renders the grid markup with its span, bound to the page, and no tracks of its own', () => {
    const d = { ...doc([section({ width: 'wide' }, cell('main'), cell('aside'))]), attrs: { layout: ARTIKEL } };
    const { html, css } = renderDocImpl(d);
    // The section's block is its wrapper, with its span; the row inside is the grid, on the page's tracks.
    expect(html).toMatch(/<div class="grid-block grp-containers" data-width="wide"[^>]*><!--\[--><!--\[-1--><div class="grid page-section grp-containers cap-spacing cap-surface cap-height" data-page-section=""/);
    expect(html.match(/class="grid-cell /g)).toHaveLength(2);
    expect(css).not.toContain('--cols');
  });

  it('marks a single-column section', () => {
    const d = { ...doc([section({ columns: 'single' }, cell('band'))]), attrs: { layout: ARTIKEL } };
    expect(renderDoc(d)).toContain('data-columns="single"');
  });

  it('puts a block outside any section in one, main column, with a stable id', () => {
    const stray = { type: 'paragraph', attrs: { blockId: 'p9' }, content: [txt('stray')] };
    const d = { ...doc([stray, section({}, cell('a'), cell('b'))]), attrs: { layout: ARTIKEL } };
    const html = renderDocImpl(d).html;
    expect(html.indexOf('data-block-id="implicit-p9"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-block-id="implicit-p9"')).toBeLessThan(html.indexOf('stray'));
    expect(renderDocImpl(d).html).toBe(html);
  });

  it('leaves a flow page as it is', () => {
    const stray = { type: 'paragraph', attrs: { blockId: 'p9' }, content: [txt('stray')] };
    expect(renderDocImpl(doc([stray])).html).not.toContain('page-section');
  });
});

describe('placement and flex cells', () => {
  const cellOf = (...blocks: unknown[]) => ({ type: 'flexCell', content: blocks });
  const flex = (attrs: Record<string, unknown>, cellAttrs: Record<string, unknown> = {}) =>
    renderDoc(doc([{ type: 'flexContainer', attrs: { blockId: 'f', ...attrs }, content: [{ ...cellOf(para([txt('a')])), attrs: cellAttrs }] }]));

  it("puts a placed box's class and values on its outermost element, and nothing on an unplaced one", () => {
    const placed = flex({ placement: { desktop: { align: 'end' } } });
    const id = new RegExp(`<div class="flex-block [^"]* cap-placement" data-block-id="f" data-b="(${ID})"`).exec(placed)?.[1];
    expect(id).toBeTruthy();
    // The per-page stylesheet orders a rule's declarations.
    expect(ruleOf(placed, id!)).toBe('--placement-ml-d:auto;--placement-w-d:fit-content');
    const plain = flex({});
    expect(plain).not.toContain('cap-placement');
    expect(plain).not.toContain('--placement-');
    // Stretch is what a box renders anyway: nothing to carry.
    expect(flex({ placement: { desktop: { align: 'stretch' } } })).not.toContain('cap-placement');
  });

  it('places a grid, an html block and a card on their outermost elements; a card fills when stretched', () => {
    const grid = renderDoc(doc([{ type: 'grid', attrs: { placement: { desktop: { align: 'center' } } }, content: [{ type: 'gridCell', content: [para([txt('x')])] }] }]));
    expect(grid).toMatch(/<div class="grid-block [^"]* cap-placement"/);
    const html = renderDoc(doc([{ type: 'htmlBlock', attrs: { html: '<b>x</b>', placement: { phone: { align: 'start' } } } }]));
    expect(html).toContain('<div class="html-block cap-placement" data-html-block=""');
    expect(html).toContain('{--placement-mr-p:auto;--placement-w-p:fit-content}');
    const card = renderDoc(doc([{ type: 'quickLink', attrs: { refType: 'url', url: 'https://example.com', label: 'Go', placement: { desktop: { align: 'stretch' } } } }]));
    expect(card).toContain('<div class="quick-link-block cap-placement"');
    expect(card).toContain('--quick-link-fill-d:100%');
  });

  it('never places a page section: its place is its span', () => {
    const out = renderDoc(doc([{ type: 'pageSection', attrs: { blockId: 's', placement: { desktop: { align: 'end' } } }, content: [{ type: 'gridCell', content: [para([txt('x')])] }] }]));
    expect(out).not.toContain('cap-placement');
  });

  it('moves a placed image within its frame by its margins; an image never placed keeps its old align', () => {
    const img = (attrs: Record<string, unknown>) => renderDoc(doc([{ type: 'image', attrs: { assetId: 'a1', alt: '', width: 50, ...attrs } }]));
    const placed = img({ align: 'left', placement: { desktop: { align: 'end' } } });
    expect(placed).not.toContain('data-align');
    expect(placed).toContain('--placement-mr-d:0px');
    expect(placed).not.toContain('cap-placement');
    expect(img({ align: 'right' })).toContain('data-align="right"');
    expect(img({ align: 'right' })).not.toContain('--placement-');
  });

  it('marks the tiers a flex row or a query result row scrolls sideways at', () => {
    const scrolling = flex({ layout: { phone: { flexWrap: 'scroll' } } });
    expect(scrolling).toContain('data-scroll="p"');
    expect(flex({})).not.toContain('data-scroll');
    // The query result container takes the same from the format's shared helper (both renderers use it).
    const { attrs } = queryFormatContainer('template', { layout: { desktop: { flexDirection: 'row', flexWrap: 'scroll' } } });
    expect(attrs).toEqual({ 'data-scroll': 'd t p' });
    expect(queryFormatContainer('template', {}).attrs).toEqual({});
  });

  it("sizes a flex cell in its row, and leaves an untouched cell exactly as it was", () => {
    const filled = flex({}, { flexItem: { desktop: { size: 'fill', weight: 2 }, phone: { self: 'center' } } });
    expect(filled).toMatch(/<div class="flex-cell [^"]* cap-flex-item"/);
    for (const decl of ['--flex-item-flex-d:2 1 0%', '--flex-item-self-p:center']) expect(filled).toContain(decl);
    const plain = flex({});
    expect(plain).not.toContain('cap-flex-item');
    expect(plain).not.toContain('--flex-item-');
  });
});

describe('background images and min-height', () => {
  const IMG = '11111111-1111-4111-8111-111111111111';
  const PHONE = '22222222-2222-4222-8222-222222222222';

  it('emits the layer stack, its per-tier art direction and the min-height into the page stylesheet — no style attribute', () => {
    const doc = {
      type: 'doc' as const,
      content: [
        {
          type: 'grid',
          attrs: {
            blockId: 'hero',
            surface: { desktop: { image: IMG, overlay: '#000000', overlayOpacity: 60 }, phone: { image: PHONE } },
            height: { desktop: { min: '640px' }, phone: { min: '100svh' } },
          },
          content: [{ type: 'gridCell', content: [{ type: 'paragraph' }] }],
        },
      ],
    };
    const { html, css } = renderDocImpl(doc);
    expect(html).not.toContain('style=');
    expect(html).toContain('data-scheme="dark"');
    expect(css).toContain(`--surface-img-d:linear-gradient(color-mix(in srgb, #000000 60%, transparent), color-mix(in srgb, #000000 60%, transparent)), image-set(url(/api/media/${IMG}?w=1920) 1x, url(/api/media/${IMG}?w=2560) 2x)`);
    expect(css).toContain(`url(/api/media/${PHONE}?w=640) 1x`);
    expect(css).toContain('--min-height-d:640px');
    expect(css).toContain('--min-height-p:100svh');
  });
});

describe('unknown blocks (docs/architecture/blocks/anatomy.md, "Unknown blocks")', () => {
  const para = (text: string, marks?: unknown[]) => ({ type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] });

  it('renders nothing of a node this build cannot read — its content included — and the rest as ever', () => {
    const html = renderDoc(doc([para('before'), { type: 'retiredWidget', attrs: { blockId: 'w-1', label: 'secret attr' } }, { type: 'retiredTabs', attrs: { blockId: 't-1' }, content: [para('inside tabs')] }, para('after')]));
    expect(html).toContain('before');
    expect(html).toContain('after');
    expect(html).not.toContain('inside tabs');
    expect(html).not.toContain('secret attr');
    expect(html).not.toContain('w-1');
  });

  it('renders text under a mark this build cannot read as text, without that mark', () => {
    const html = renderDoc(doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Do ' }, { type: 'text', text: 'not', marks: [{ type: 'bold' }, { type: 'italic' }] }, { type: 'text', text: ' delete' }] }]));
    expect(html).toContain('Do ');
    expect(html).toMatch(/<em>not<\/em>/);
    expect(html).toContain(' delete');
    expect(html).not.toContain('bold');
  });

  it("renders nothing of an editor's stand-in", () => {
    expect(renderDoc(doc([{ type: 'unknownBlock', attrs: { blockId: 'u-1', originalType: 'retiredWidget', original: { type: 'retiredWidget' }, plugin: null } }]))).not.toContain('u-1');
  });

  it('renders a link mark the API wrote as a link', () => {
    expect(renderDoc(doc([para('site', [{ type: 'link', attrs: { href: 'https://example.org' } }])]))).toContain('href="https://example.org"');
  });
});
