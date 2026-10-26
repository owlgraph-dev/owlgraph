// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A columns page's sections (docs/architecture/blocks/layout.md, "Page layout: sections"). Plain
// JSON in and out, so the editor, the server and the renderer agree. Nothing
// here drops content: fewer cells move their blocks into the last cell that
// stays and report it (`merges`). `fill` puts a placeholder in an empty cell
// for the editor's schema; storage leaves it empty.
import type { JsonNode } from '../doc/doc';
import { isOpaqueNode } from '../doc/unknownBlocks';
import { sectionCellCount, sectionDefaultBleed, sectionDefaultWidth, type PageColumns } from './pageColumns';

export const SECTION_TYPE = 'pageSection';
export const SECTION_CELL_TYPE = 'gridCell';

export type CellFill = 'placeholder' | 'empty';

export function isSection(node: JsonNode | null | undefined): boolean {
  return node?.type === SECTION_TYPE;
}

/**
 * A section, or a node this build can't read: it may itself be a section,
 * which folding into a new one would bury.
 */
export function staysTopLevel(node: JsonNode | null | undefined): boolean {
  return isSection(node) || isOpaqueNode(node);
}

const isPlaceholder = (node: JsonNode) => node.type === 'placeholder';

/** A cell's real blocks — placeholders dropped. */
function realBlocks(cell: JsonNode | undefined): JsonNode[] {
  return (cell?.content ?? []).filter((n) => !isPlaceholder(n));
}

function cellWith(blocks: JsonNode[], fill: CellFill, attrs?: JsonNode['attrs']): JsonNode {
  const content = blocks.length ? blocks : fill === 'placeholder' ? [{ type: 'placeholder' }] : [];
  return { type: SECTION_CELL_TYPE, ...(attrs && Object.keys(attrs).length ? { attrs } : {}), content };
}

/** A new section: the given blocks in its first cell, the rest empty. */
export function makeSectionNode(columns: PageColumns | null, fill: CellFill, blocks: JsonNode[] = [], attrs: Record<string, unknown> = {}): JsonNode {
  const count = sectionCellCount(columns);
  const width = attrs.width !== undefined ? attrs.width : sectionDefaultWidth(columns);
  const cells = [cellWith(blocks, fill), ...Array.from({ length: count - 1 }, () => cellWith([], fill))];
  return { type: SECTION_TYPE, attrs: { ...attrs, ...(width ? { width } : {}) }, content: cells };
}

/** The first section's own attrs from the page's section defaults: bleed-to-top is only ever the first's. */
function firstSectionAttrs(columns: PageColumns | null): Record<string, unknown> {
  return sectionDefaultBleed(columns) ? { bleedToTop: true } : {};
}

/** Flow → columns: every top-level block into one section's first cell. */
export function wrapIntoSection(doc: JsonNode, columns: PageColumns, fill: CellFill): JsonNode {
  const blocks = (doc.content ?? []).filter((n) => !isPlaceholder(n));
  return { ...doc, content: [makeSectionNode(columns, fill, blocks, firstSectionAttrs(columns))] };
}

/** Columns → flow: the cells' blocks become top-level again; the sections' own settings go. */
export function unwrapSections(doc: JsonNode, fill: CellFill): JsonNode {
  const out: JsonNode[] = [];
  for (const node of doc.content ?? []) {
    if (!isSection(node)) {
      if (!isPlaceholder(node)) out.push(node);
      continue;
    }
    for (const cell of node.content ?? []) out.push(...realBlocks(cell));
  }
  if (out.length === 0 && fill === 'placeholder') out.push({ type: 'placeholder' });
  return { ...doc, content: out };
}

/** Where content moved: in the section at `section` (0-based among the page's top-level nodes), columns `from` (1-based) went into column `into`. */
export interface SectionMerge {
  section: number;
  from: number[];
  into: number;
}

/** Fewer cells: the trailing cells' blocks join the last cell that stays, whose settings win. */
export function resizeSection(section: JsonNode, count: number, fill: CellFill): { section: JsonNode; merged: number[] } {
  const cells = section.content ?? [];
  if (cells.length === count) return { section, merged: [] };
  if (cells.length < count) {
    const extra = Array.from({ length: count - cells.length }, () => cellWith([], fill));
    return { section: { ...section, content: [...cells, ...extra] }, merged: [] };
  }
  const keep = cells.slice(0, count - 1);
  const last = cells[count - 1];
  const moved: JsonNode[] = [];
  const merged: number[] = [];
  cells.slice(count).forEach((cell, i) => {
    const blocks = realBlocks(cell);
    if (blocks.length) merged.push(count + i + 1);
    moved.push(...blocks);
  });
  const into = cellWith([...realBlocks(last), ...moved], fill, last.attrs);
  return { section: { ...section, content: [...keep, into] }, merged };
}

/** A single-column section keeps its one cell. */
export function reconcileSections(doc: JsonNode, count: number, fill: CellFill): { doc: JsonNode; merges: SectionMerge[] } {
  const merges: SectionMerge[] = [];
  const content = (doc.content ?? []).map((node, index) => {
    if (!isSection(node) || node.attrs?.columns === 'single') return node;
    const { section, merged } = resizeSection(node, count, fill);
    if (merged.length) merges.push({ section: index, from: merged, into: count });
    return section;
  });
  return { doc: { ...doc, content }, merges };
}

export function setSectionColumns(section: JsonNode, single: boolean, columns: PageColumns | null, fill: CellFill): JsonNode {
  const attrs = { ...(section.attrs ?? {}) };
  if (single) attrs.columns = 'single';
  else delete attrs.columns;
  const resized = resizeSection({ ...section, attrs }, single ? 1 : sectionCellCount(columns), fill).section;
  return resized;
}

/**
 * Consecutive blocks outside a section go into one, in its first cell, so an
 * agent's append reads in the main column. `idFor` gives the renderer a stable
 * id; the editor and server let their id backfill name it.
 */
export function normalizeStrays(
  doc: JsonNode,
  columns: PageColumns | null,
  fill: CellFill,
  idFor?: (first: JsonNode, index: number) => string
): JsonNode {
  if (!columns) return doc;
  const nodes = doc.content ?? [];
  if (nodes.every(staysTopLevel)) return doc;
  const out: JsonNode[] = [];
  let run: JsonNode[] = [];
  const flush = () => {
    const real = run.filter((n) => !isPlaceholder(n));
    // Only-placeholder runs are dropped, unless they are the whole page: it
    // keeps one empty section to type in.
    if (run.length && (real.length || run.length === nodes.length)) {
      const id = idFor?.(run[0], out.length);
      out.push(makeSectionNode(columns, fill, real, { ...(out.length === 0 ? firstSectionAttrs(columns) : {}), ...(id ? { blockId: id } : {}) }));
    }
    run = [];
  };
  for (const node of nodes) {
    if (staysTopLevel(node)) {
      flush();
      out.push(node);
    } else run.push(node);
  }
  flush();
  return { ...doc, content: out };
}

/** The one decision editor and server both make; proportions, gap or preset alone change nothing. */
export function changePageColumns(
  doc: JsonNode,
  current: PageColumns | null,
  next: PageColumns | null,
  fill: CellFill
): { doc: JsonNode; merges: SectionMerge[]; changed: boolean } {
  if (!current && !next) return { doc, merges: [], changed: false };
  if (!current && next) return { doc: wrapIntoSection(doc, next, fill), merges: [], changed: true };
  if (current && !next) return { doc: unwrapSections(doc, fill), merges: [], changed: true };
  if (current!.template.desktop.length === next!.template.desktop.length) return { doc, merges: [], changed: false };
  const { doc: reconciled, merges } = reconcileSections(doc, next!.template.desktop.length, fill);
  return { doc: reconciled, merges, changed: true };
}

// Moves (docs/architecture/blocks/layout.md, "Placement"): which cell holds a block is structure,
// not an attribute. A move appends to the end of the target cell, the
// predictable place in a top-aligned row; a section it empties stays.

/** Where a block sits on a columns page: its section's index among the page's top-level nodes, its cell's in the section, its own in the cell. */
export interface SectionPlace {
  section: number;
  cell: number;
  index: number;
}

/**
 * The previous / next column of the same section; the previous / next section
 * (the same cell index, or its last cell when it has fewer); or a new
 * single-column section of its own right after this one.
 */
export type SectionMove = 'cell-prev' | 'cell-next' | 'section-prev' | 'section-next' | 'extract';

/** Where a block that sits directly in a section's cell is, or null — on a flow page, nested deeper, or not there. */
export function findSectionPlace(doc: JsonNode, blockId: string): SectionPlace | null {
  const nodes = doc.content ?? [];
  for (let section = 0; section < nodes.length; section++) {
    if (!isSection(nodes[section])) continue;
    const cells = nodes[section].content ?? [];
    for (let cell = 0; cell < cells.length; cell++) {
      const index = (cells[cell].content ?? []).findIndex((n) => n.attrs?.blockId === blockId);
      if (index >= 0) return { section, cell, index };
    }
  }
  return null;
}

const hasCells = (node: JsonNode | undefined) => isSection(node) && (node!.content?.length ?? 0) > 0;

/** Null when the block isn't directly in a section's cell. */
export function sectionMovesFor(doc: JsonNode, blockId: string): Record<SectionMove, boolean> | null {
  const at = findSectionPlace(doc, blockId);
  if (!at) return null;
  const nodes = doc.content ?? [];
  const cells = nodes[at.section].content?.length ?? 0;
  return {
    'cell-prev': at.cell > 0,
    'cell-next': at.cell < cells - 1,
    'section-prev': hasCells(nodes[at.section - 1]),
    'section-next': hasCells(nodes[at.section + 1]),
    extract: true,
  };
}

/** A move's edit: the page's top-level nodes `from` up to (not including) `to` are replaced by `nodes`. */
export interface SectionEdit {
  from: number;
  to: number;
  nodes: JsonNode[];
}

/** A section with one cell's blocks replaced (the cell keeps its own settings). */
function withCellBlocks(section: JsonNode, index: number, blocks: JsonNode[], fill: CellFill): JsonNode {
  const content = (section.content ?? []).map((cell, i) => (i === index ? cellWith(blocks, fill, cell.attrs) : cell));
  return { ...section, content };
}

/** The smallest edit of the top-level nodes; null when the move isn't available there. */
export function moveInSections(doc: JsonNode, blockId: string, move: SectionMove, fill: CellFill): SectionEdit | null {
  const at = findSectionPlace(doc, blockId);
  if (!at || !sectionMovesFor(doc, blockId)?.[move]) return null;
  const nodes = doc.content ?? [];
  const source = nodes[at.section];
  const sourceCells = source.content ?? [];
  const block = sourceCells[at.cell].content![at.index];
  const left = withCellBlocks(source, at.cell, realBlocks(sourceCells[at.cell]).filter((n) => n !== block), fill);

  if (move === 'cell-prev' || move === 'cell-next') {
    const target = at.cell + (move === 'cell-next' ? 1 : -1);
    const moved = withCellBlocks(left, target, [...realBlocks(sourceCells[target]), block], fill);
    return { from: at.section, to: at.section + 1, nodes: [moved] };
  }
  if (move === 'extract') {
    // Spans what its old section did: the way to a full-width band mid-article.
    const width = source.attrs?.width;
    const own: JsonNode = { type: SECTION_TYPE, attrs: { columns: 'single', ...(width ? { width } : {}) }, content: [cellWith([block], fill)] };
    return { from: at.section, to: at.section + 1, nodes: [left, own] };
  }
  const t = at.section + (move === 'section-next' ? 1 : -1);
  const target = nodes[t];
  const targetCells = target.content ?? [];
  const cell = Math.min(at.cell, targetCells.length - 1);
  const moved = withCellBlocks(target, cell, [...realBlocks(targetCells[cell]), block], fill);
  return move === 'section-next' ? { from: at.section, to: t + 1, nodes: [left, moved] } : { from: t, to: at.section + 1, nodes: [moved, left] };
}
