// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Maps the validated BlockInput union agents write (blockInputSchema.server.ts)
// to canonical Tiptap nodes: agents never emit raw Tiptap JSON or HTML.
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { blockShape, leafBlockShape, cellStyleShape } from './blockInputSchema.server';
import type { JsonDoc, JsonNode } from '../doc/doc';
import { PERSISTED_ADDRESSABLE_BLOCK_TYPES } from './catalog';
import { isUnknownNode, unknownSummary } from '../doc/unknownBlocks';
import { blockSummary } from './facets';
import { buildQuickLink, quickLinkNode } from './quickLink/input.server';
import { tableNode } from './table/input.server';
import { flexNode } from './flex/input.server';
import { buildCollection, collectionNode } from './collection/input.server';
import { buildDocument, documentNode } from './document/input.server';
import { pluginInputKindOfBlock, pluginInputOf } from '$lib/plugins/inputs.server';
import type { PluginHost } from '$lib/plugins/api';
import { headingLevelOf, type ParagraphStyle } from '../capabilities/typography/paragraphStyles';
import { listParagraphStyles } from '../capabilities/typography/paragraphStyles.server';
import { minHeightData } from '../capabilities/inputShapes.server';
import { GRID_TIERS, gridTierAttrs, resolvedGridColumns } from './grid/gridColumns';
import { DEFAULT_PROPERTY_GROUP } from '$lib/features/semantic';
import type { NodeType } from '$lib/features/nodes';

export type BlockInput = z.infer<typeof blockShape>;
export type LeafBlockInput = z.infer<typeof leafBlockShape>;
export type GridBlockInput = Extract<BlockInput, { kind: 'grid' }>;
export type SectionBlockInput = Extract<BlockInput, { kind: 'section' }>;
export type CellStyleInput = z.infer<typeof cellStyleShape>;

type Node = JsonNode;
type Doc = JsonDoc;

export function emptyDoc(): Doc {
  return { type: 'doc', content: [] };
}

function textContent(text: string): Node[] {
  return text ? [{ type: 'text', text }] : [];
}

// Blind: it knows no site styles or link targets. Rendering treats an unknown
// style id as absent, so this is safe; buildNode is the validated path every
// tool takes.
export function blockInputToNode(input: BlockInput): Node {
  const blockId = randomUUID();
  switch (input.kind) {
    case 'heading':
      return { type: 'heading', attrs: { level: input.level, blockId, ...(input.style ? { paragraphStyle: input.style } : {}) }, content: textContent(input.text) };
    case 'paragraph':
      return { type: 'paragraph', attrs: { blockId, ...(input.style ? { paragraphStyle: input.style } : {}) }, content: textContent(input.text) };
    case 'callout':
      return { type: 'callout', attrs: { variant: input.variant, blockId }, content: textContent(input.text) };
    case 'code':
      return { type: 'codeBlock', attrs: { language: input.language ?? null, blockId }, content: textContent(input.code) };
    case 'html':
      // Raw HTML: sanitized at the storage boundary (render/sanitize.server.ts).
      return { type: 'htmlBlock', attrs: { html: input.html, scheme: input.scheme ?? null, ...(input.placement ? { placement: input.placement } : {}), blockId }, content: [] };
    case 'quickLink':
      return quickLinkNode(input);
    case 'list': {
      // Plain-text items; buildNode parses their inline links.
      const type = input.ordered ? 'orderedList' : 'bulletList';
      const attrs: Record<string, unknown> = { blockId };
      if (input.listStyle) attrs.listStyle = input.listStyle;
      if (input.spacing) attrs.spacing = input.spacing;
      return {
        type,
        attrs,
        content: input.items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: textContent(t) }] })),
      };
    }
    case 'table':
      return tableNode(input);
    case 'diagram':
      return { type: 'diagram', attrs: { code: input.code, blockId }, content: [] };
    case 'grid': {
      const widths = layoutWidths(input);
      const cells = padCells(input.cells, widths.length);
      const styles = input.cellStyles ?? [];
      const content = cells.map((cellBlocks, i) => ({
        type: 'gridCell',
        attrs: cellAttrsFromStyle(styles[i]),
        content: cellBlocks.length ? cellBlocks.map(blockInputToNode) : [emptyParagraph()],
      }));
      return { type: 'grid', attrs: withGridTiers({ columnWidths: widths, blockId }, containerAttrsFromStyle(input)), content };
    }
    case 'flex':
      return flexNode(input, input.cells.map((blocks) => blocks.map(blockInputToNode)));
    case 'section': {
      const styles = input.cellStyles ?? [];
      const content = input.cells.map((cellBlocks, i) => ({
        type: 'gridCell',
        attrs: cellAttrsFromStyle(styles[i]),
        content: cellBlocks.map(blockInputToNode),
      }));
      return { type: 'pageSection', attrs: { blockId, ...sectionAttrsFromInput(input) }, content };
    }
    case 'collection':
      return collectionNode(input);
    case 'document':
      return documentNode(input);
    default: {
      const plugin = pluginInputOf(input.kind);
      if (!plugin) throw new Error(`unknown block kind ${input.kind}`);
      return plugin.input.node(input);
    }
  }
}

// Its columns are the page's, so only the section's own attrs.
export function sectionAttrsFromInput(input: SectionBlockInput): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  // An explicit 'normal' is kept as a choice (null); an omitted width gets the
  // layout's default span.
  if (input.width) a.width = input.width === 'normal' ? null : input.width;
  if (input.columns === 'single') a.columns = 'single';
  if (input.bleedToTop) a.bleedToTop = true;
  if (input.spacing) a.spacing = input.spacing;
  if (input.surface) a.surface = input.surface;
  if (input.minHeight) a.height = minHeightData(input.minHeight);
  return a;
}

export function containerAttrsFromStyle(input: GridBlockInput): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (input.gap) a.gap = input.gap;
  if (input.spacing) a.spacing = input.spacing;
  if (input.surface) a.surface = input.surface;
  if (input.minHeight) a.height = minHeightData(input.minHeight);
  if (input.width && input.width !== 'normal') a.width = input.width;
  if (input.placement) a.placement = input.placement;
  if (Array.isArray(input.rowHeights) && input.rowHeights.length > 0) {
    a.rowHeights = input.rowHeights.map((n) => (Number(n) > 0 ? Math.min(2000, Math.round(Number(n))) : null));
  }
  // Raw, 'auto' as an explicit clear (null); withGridTiers merges and validates them.
  for (const tier of GRID_TIERS) {
    const cols = input.columnsByTier?.[tier];
    if (cols !== undefined) a.columnsByTier = { ...(a.columnsByTier as object), [tier]: cols === 'auto' ? null : cols };
    const gap = input.gapByTier?.[tier];
    if (gap !== undefined) a.gapByTier = { ...(a.gapByTier as object), [tier]: gap === 'auto' ? null : gap };
  }
  return a;
}

/**
 * A grid's attrs with style input applied: the per-tier columns and gaps
 * merged over the grid's own, then made valid against its desktop ones (grid/gridColumns.ts).
 */
export function withGridTiers(attrs: Record<string, unknown>, style: Record<string, unknown>): Record<string, unknown> {
  const merge = (current: unknown, next: unknown) =>
    next === undefined ? current : { ...((current && typeof current === 'object' ? current : {}) as object), ...(next as object) };
  const merged: Record<string, unknown> = {
    ...attrs,
    ...style,
    columnsByTier: merge(attrs.columnsByTier, style.columnsByTier),
    gapByTier: merge(attrs.gapByTier, style.gapByTier),
  };
  return { ...merged, ...gridTierAttrs(merged) };
}

export function cellAttrsFromStyle(s?: CellStyleInput): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (!s) return a;
  if (s.typography) a.typography = s.typography;
  if (s.spacing) a.spacing = s.spacing;
  if (s.surface) a.surface = s.surface;
  if (s.alignX) a.alignX = s.alignX;
  if (s.alignY) a.alignY = s.alignY;
  if (s.stretch) a.stretch = true;
  return a;
}

export function layoutWidths(input: GridBlockInput): number[] {
  if (Array.isArray(input.columnWidths) && input.columnWidths.length > 0) {
    return input.columnWidths.map((n) => Math.max(1, Math.round(Number(n) || 1)));
  }
  return Array(Math.max(1, Math.min(6, input.columns ?? 2))).fill(1);
}

// Pads a row-major cell list to a multiple of the column count.
export function padCells<T>(cells: T[][], cols: number): T[][] {
  const out = cells.map((c) => c);
  while (out.length % cols !== 0) out.push([] as T[]);
  return out;
}

export function emptyParagraph(): Node {
  return { type: 'paragraph', attrs: { blockId: randomUUID() }, content: [] };
}

// Editor saves can bring nodes without ids, which the MCP tools could not
// target. A list item's inner paragraph is skipped, as in the editor's plugin.
export function ensureBlockIds(doc: Doc): Doc {
  const walk = (node: Node, parent: Node | null) => {
    if (!node || typeof node !== 'object') return;
    // A node this build cannot read is stored as it was, ids and all (docs/architecture/blocks/anatomy.md, "Unknown blocks").
    if (isUnknownNode(node)) return;
    if (PERSISTED_ADDRESSABLE_BLOCK_TYPES.has(node.type) && parent?.type !== 'listItem') {
      node.attrs = node.attrs ?? {};
      if (!node.attrs.blockId) node.attrs.blockId = randomUUID();
    }
    for (const child of node.content ?? []) walk(child, node);
  };
  for (const node of doc.content ?? []) walk(node, null);
  return doc;
}

export function findBlockIndex(doc: Doc, blockId: string): number {
  return (doc.content ?? []).findIndex((n: Node) => n.attrs?.blockId === blockId);
}

function extractText(node: Node): string {
  // A block this build cannot read names itself, and nothing of its content (docs/architecture/blocks/anatomy.md, "Unknown blocks").
  const unknown = unknownSummary(node);
  if (unknown) return unknown;
  if (node.type === 'htmlBlock') return String(node.attrs?.html ?? '').replace(/<[^>]+>/g, ' ').trim();
  const own = blockSummary(node);
  if (own != null) return own;
  if (node.type === 'table') {
    const rows: Node[] = node.content ?? [];
    const headerRow = rows[0];
    const headerText = headerRow ? (headerRow.content ?? []).map(extractText).join(' | ') : '';
    const dataRowCount = Math.max(0, rows.length - 1);
    return `table: ${headerText} (${dataRowCount} rows)`;
  }
  if (node.type === 'diagram') return `diagram: ${String(node.attrs?.code ?? '').split('\n')[0]}`;
  if (node.type === 'queryBlock') return (node.attrs?.filter || node.attrs?.traversal) ? 'query: (configured)' : 'query: (unconfigured)';
  if (node.text) return node.text;
  return (node.content ?? []).map(extractText).join('');
}

// The agent's kind of each stored block an agent may write (blockInputSchema.server.ts).
const AGENT_KIND_OF_TYPE: Readonly<Record<string, string>> = {
  paragraph: 'paragraph',
  heading: 'heading',
  callout: 'callout',
  codeBlock: 'code',
  bulletList: 'list',
  orderedList: 'list',
  htmlBlock: 'html',
  quickLink: 'quickLink',
  table: 'table',
  diagram: 'diagram',
  collectionBlock: 'collection',
  documentBlock: 'document',
  grid: 'grid',
  flexContainer: 'flex',
  pageSection: 'section',
};

/** The name append_block takes for a stored block, or null for one an agent cannot write. */
export function agentKindOf(type: string): string | null {
  return Object.hasOwn(AGENT_KIND_OF_TYPE, type) ? AGENT_KIND_OF_TYPE[type] : pluginInputKindOfBlock(type);
}

// What agents get back instead of the raw JSON: ids, the stored type and the
// agent's kind of it, and a text preview.
export function summarizeBlocks(doc: Doc) {
  return (doc.content ?? []).map((n: Node, i: number) => {
    const base = {
      index: i,
      blockId: n.attrs?.blockId,
      type: n.type,
      kind: unknownSummary(n) ? null : agentKindOf(n.type),
      preview: extractText(n).slice(0, 140),
      ...(unknownSummary(n) ? { unknown: true } : {}),
    };
    if (n.type === 'pageSection') {
      const cellNodes = n.content ?? [];
      return {
        ...base,
        // Its columns are the page's (get_page settings.columns); `single` is its own one-column override.
        columns: n.attrs?.columns === 'single' ? 'single' : 'template',
        width: n.attrs?.width ?? 'normal',
        cells: cellNodes.length,
        cellContents: cellNodes.map((c: { content?: unknown[] }, i: number) => ({
          index: i,
          blocks: c.content?.length ?? 0,
          preview: extractText(c as Parameters<typeof extractText>[0]).slice(0, 80),
        })),
      };
    }
    if (n.type === 'flexContainer') {
      const cellNodes = n.content ?? [];
      return {
        ...base,
        width: n.attrs?.width ?? 'normal',
        cells: cellNodes.length,
        cellContents: cellNodes.map((c: { content?: unknown[] }, i: number) => ({
          index: i,
          blocks: c.content?.length ?? 0,
          preview: extractText(c as Parameters<typeof extractText>[0]).slice(0, 80),
        })),
      };
    }
    if (n.type === 'grid') {
      const widths = Array.isArray(n.attrs?.columnWidths) && n.attrs.columnWidths.length ? n.attrs.columnWidths : [1, 1];
      const cellNodes = n.content ?? [];
      return {
        ...base,
        columns: widths.length,
        columnWidths: widths,
        // Own or inherited; one column = stacked.
        columnsByTier: { tablet: resolvedGridColumns(n.attrs, 'tablet'), phone: resolvedGridColumns(n.attrs, 'phone') },
        width: n.attrs?.width ?? 'normal',
        cells: cellNodes.length,
        cellContents: cellNodes.map((c: { content?: unknown[] }, i: number) => ({
          index: i,
          blocks: c.content?.length ?? 0,
          preview: extractText(c as Parameters<typeof extractText>[0]).slice(0, 80),
        })),
      };
    }
    return base;
  });
}

// Quick links and inline links denormalize the target's slug and title at write
// time. Pages and documents live above this feature, so the caller injects
// the lookups.

export interface BlockRefResolvers {
  resolvePage(id: string): Promise<{ id: string; slug: string; title: string } | null>;
  resolveDocument(id: string): Promise<{ id: string; title: string } | null>;
  /**
   * A node an embedding block may show, if the writing agent may read it, with
   * the integration that keeps it (null for the core's). Absent: embedding blocks are refused.
   */
  resolveEmbedTarget?(id: string): Promise<{ id: string; type: NodeType; plugin: string | null } | null>;
  /** The agent's name of the plugin block that shows a node an integration keeps — what a refusal points to. */
  embedKindOf?(plugin: string, family: 'collection' | 'document'): string | null;
  /** The plugin's host for the writing agent. Absent: a plugin's block is refused. */
  pluginHost?(pluginId: string): PluginHost;
}

// Parses [[pageId|label]], [[doc:id|label]] and {{{name:value}}} into inline
// content. An unresolved id stays plain text, so nothing is lost.
async function parseInline(text: string, refs: BlockRefResolvers) {
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\{\{\{([\w-]+)(?::([^]*?))?\}\}\}/g;
  const out: JsonNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) {
      const raw = m[1].trim();
      const label = (m[2] ?? '').trim();
      if (raw.startsWith('doc:')) {
        const docId = raw.slice(4).trim();
        const doc = await refs.resolveDocument(docId);
        if (doc) {
          out.push({ type: 'text', text: label || doc.title, marks: [{ type: 'docLink', attrs: { targetDocId: doc.id } }] });
        } else {
          out.push({ type: 'text', text: label || `[[doc:${docId}]]` });
        }
      } else {
        const id = raw;
        const target = await refs.resolvePage(id);
        if (target) {
          out.push({
            type: 'text',
            text: label || target.title,
            marks: [{ type: 'pageLink', attrs: { targetPageId: target.id, targetSlug: target.slug } }],
          });
        } else {
          out.push({ type: 'text', text: label || `[[${id}]]` });
        }
      }
    } else if (m[3] !== undefined) {
      // Always the default group: the first ':' separates name and value, not a namespace.
      const localName = m[3].trim();
      const propName = `${DEFAULT_PROPERTY_GROUP}:${localName}`;
      const value = (m[4] ?? '').trim();
      out.push({ type: 'text', text: value || localName, marks: [{ type: 'semanticProperty', attrs: { propName } }] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

// The site's paragraph styles, read once per build and only when an input names one.
type BuildContext = { styles?: Promise<ParagraphStyle[]> };

async function styleFor(id: string, ctx: BuildContext): Promise<ParagraphStyle> {
  ctx.styles ??= listParagraphStyles();
  const style = (await ctx.styles).find((s) => s.id === id);
  if (!style) throw new Error(`unknown paragraph style ${id} — call list_paragraph_styles for the site's styles`);
  return style;
}

// Async for the lookups quick links and inline links need.
export async function buildNode(input: BlockInput, refs: BlockRefResolvers, ctx: BuildContext = {}): Promise<JsonNode> {
  if (input.kind === 'quickLink') return buildQuickLink(input, refs);
  if (input.kind === 'collection') return buildCollection(input, refs);
  if (input.kind === 'document') return buildDocument(input, refs);
  const plugin = pluginInputOf(input.kind);
  if (plugin) {
    const host = refs.pluginHost?.(plugin.plugin);
    if (!host) throw new Error(`a ${input.kind} block cannot be written here`);
    return plugin.input.build(input, host);
  }
  if (input.kind === 'heading' || input.kind === 'paragraph' || input.kind === 'callout') {
    const blockId = randomUUID();
    const content = await parseInline(input.text, refs);
    if (input.kind === 'callout') return { type: 'callout', attrs: { variant: input.variant, blockId }, content };
    // The style's tag wins over the input's kind and level, as in the editor (docs/architecture/typography.md).
    if (input.style) {
      const style = await styleFor(input.style, ctx);
      const level = headingLevelOf(style.renderAs);
      return level == null
        ? { type: 'paragraph', attrs: { blockId, paragraphStyle: style.id }, content }
        : { type: 'heading', attrs: { level, blockId, paragraphStyle: style.id }, content };
    }
    if (input.kind === 'heading') return { type: 'heading', attrs: { level: input.level, blockId }, content };
    return { type: 'paragraph', attrs: { blockId }, content };
  }
  if (input.kind === 'list') {
    const type = input.ordered ? 'orderedList' : 'bulletList';
    const content = [];
    for (const t of input.items) {
      content.push({ type: 'listItem', content: [{ type: 'paragraph', content: await parseInline(t, refs) }] });
    }
    const attrs: Record<string, unknown> = { blockId: randomUUID() };
    if (input.listStyle) attrs.listStyle = input.listStyle;
    if (input.spacing) attrs.spacing = input.spacing;
    return { type, attrs, content };
  }
  if (input.kind === 'grid') {
    const widths = layoutWidths(input);
    const cells = padCells(input.cells, widths.length);
    const styles = input.cellStyles ?? [];
    const content = [];
    for (let i = 0; i < cells.length; i++) {
      const inner = [];
      for (const b of cells[i]) inner.push(await buildNode(b, refs, ctx));
      content.push({ type: 'gridCell', attrs: cellAttrsFromStyle(styles[i]), content: inner.length ? inner : [emptyParagraph()] });
    }
    return { type: 'grid', attrs: withGridTiers({ columnWidths: widths, blockId: randomUUID() }, containerAttrsFromStyle(input)), content };
  }
  if (input.kind === 'flex') {
    const cells: JsonNode[][] = [];
    for (const blocks of input.cells) {
      const inner = [];
      for (const b of blocks) inner.push(await buildNode(b, refs, ctx));
      cells.push(inner);
    }
    return flexNode(input, cells);
  }
  if (input.kind === 'section') {
    const styles = input.cellStyles ?? [];
    const content = [];
    for (let i = 0; i < input.cells.length; i++) {
      const inner = [];
      for (const b of input.cells[i]) inner.push(await buildNode(b, refs, ctx));
      content.push({ type: 'gridCell', attrs: cellAttrsFromStyle(styles[i]), content: inner });
    }
    return { type: 'pageSection', attrs: { blockId: randomUUID(), ...sectionAttrsFromInput(input) }, content };
  }
  return blockInputToNode(input);
}
