// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A two-way, top-level block diff for page docs, matched by blockId only: a block
// without one shows as removed plus added. Placeholders are dropped first: the
// editor gives them a fresh id on every read (content/blocks/placeholder).
import { withoutPlaceholders, type JsonNode } from '$lib/features/content';

type AnyNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: AnyNode[];
  text?: string;
  [k: string]: unknown;
};

export type BlockDiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface BlockDiffEntry {
  blockId: string | null;
  status: BlockDiffStatus;
  moved: boolean; // order among common blocks changed
  type: string;
  preview: string;
  oldIndex: number | null;
  newIndex: number | null;
  oldBlock?: AnyNode;
  newBlock?: AnyNode;
}

export interface DocDiff {
  entries: BlockDiffEntry[]; // B order, removed blocks anchored in place
  summary: { added: number; removed: number; modified: number; moved: number; unchanged: number };
}

function topBlocks(doc: unknown): AnyNode[] {
  const content = (doc as AnyNode)?.content;
  return Array.isArray(content) ? (content as AnyNode[]) : [];
}

function storedBlocks(doc: unknown): AnyNode[] {
  return topBlocks(doc && typeof doc === 'object' ? withoutPlaceholders(doc as JsonNode) : doc);
}

function idOf(node: AnyNode): string | null {
  const id = node?.attrs?.blockId;
  return typeof id === 'string' && id ? id : null;
}

// Key-sorted, so attribute key order doesn't read as a change.
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

function previewText(node: AnyNode, max = 80): string {
  let out = '';
  const walk = (n: AnyNode | undefined) => {
    if (!n || out.length >= max) return;
    if (typeof n.text === 'string') out += n.text;
    for (const c of n.content ?? []) {
      if (out.length >= max) break;
      walk(c);
    }
  };
  walk(node);
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > max ? out.slice(0, max - 1) + '…' : out;
}

// Positions of a longest increasing subsequence: the blocks outside it are the
// minimal move set, so one move doesn't flag everything after it.
function lisPositions(seq: number[]): Set<number> {
  const n = seq.length;
  if (!n) return new Set();
  const tails: number[] = []; // tails[k]: position of the smallest tail of an LIS of length k+1
  const prev: number[] = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < seq[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    if (lo === tails.length) tails.push(i);
    else tails[lo] = i;
  }
  const keep = new Set<number>();
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k !== -1) {
    keep.add(k);
    k = prev[k];
  }
  return keep;
}

export function diffDocs(a: unknown, b: unknown): DocDiff {
  const oldList = storedBlocks(a);
  const newList = storedBlocks(b);

  const oldById = new Map<string, number>();
  oldList.forEach((n, i) => {
    const id = idOf(n);
    if (id && !oldById.has(id)) oldById.set(id, i);
  });
  const newById = new Map<string, number>();
  newList.forEach((n, i) => {
    const id = idOf(n);
    if (id && !newById.has(id)) newById.set(id, i);
  });

  const commonNewIndex: number[] = [];
  const commonOldIndex: number[] = [];
  newList.forEach((n, i) => {
    const id = idOf(n);
    if (id && oldById.has(id)) {
      commonNewIndex.push(i);
      commonOldIndex.push(oldById.get(id)!);
    }
  });
  const inOrder = lisPositions(commonOldIndex);
  const movedNewIndex = new Set<number>();
  commonNewIndex.forEach((newIdx, k) => {
    if (!inOrder.has(k)) movedNewIndex.add(newIdx);
  });

  const summary = { added: 0, removed: 0, modified: 0, moved: 0, unchanged: 0 };

  const entries: BlockDiffEntry[] = newList.map((node, i) => {
    const id = idOf(node);
    const oldIdx = id ? oldById.get(id) ?? null : null;
    if (oldIdx == null) {
      summary.added++;
      return { blockId: id, status: 'added', moved: false, type: String(node.type ?? ''), preview: previewText(node), oldIndex: null, newIndex: i, newBlock: node };
    }
    const oldNode = oldList[oldIdx];
    const changed = canonical(oldNode) !== canonical(node);
    const moved = movedNewIndex.has(i);
    if (changed) summary.modified++;
    else summary.unchanged++;
    if (moved) summary.moved++;
    return {
      blockId: id,
      status: changed ? 'modified' : 'unchanged',
      moved,
      type: String(node.type ?? ''),
      preview: previewText(node),
      oldIndex: oldIdx,
      newIndex: i,
      oldBlock: oldNode,
      newBlock: node,
    };
  });

  // A removed block goes after its nearest surviving predecessor; old order keeps
  // consecutive removals together.
  oldList.forEach((node, i) => {
    const id = idOf(node);
    if (id && newById.has(id)) return;
    summary.removed++;
    const entry: BlockDiffEntry = { blockId: id, status: 'removed', moved: false, type: String(node.type ?? ''), preview: previewText(node), oldIndex: i, newIndex: null, oldBlock: node };
    let insertAt = 0;
    let bestOld = -1;
    for (let idx = 0; idx < entries.length; idx++) {
      const oi = entries[idx].oldIndex;
      if (oi != null && oi < i && oi > bestOld) {
        bestOld = oi;
        insertAt = idx + 1;
      }
    }
    entries.splice(insertAt, 0, entry);
  });

  return { entries, summary };
}

// A cherry-picked diff entry, applied by blockId so other changes to the target
// doc since the diff survive.
export interface BlockPick {
  blockId: string;
  op: 'add' | 'replace' | 'remove';
  block?: AnyNode; // required for add / replace
  afterBlockId?: string | null; // for add; null or absent prepends
}

// Replace, then remove, then add, so add anchors resolve against the remaining
// blocks; adds go in array order, so consecutive new blocks chain afterBlockId.
export function applyPicks(doc: unknown, picks: BlockPick[]): { type: string; content: AnyNode[] } {
  const blocks: AnyNode[] = [...topBlocks(doc)];
  const indexById = (id: string | null | undefined) => (id ? blocks.findIndex((b) => idOf(b) === id) : -1);

  for (const p of picks) {
    if (p.op === 'replace' && p.block) {
      const i = indexById(p.blockId);
      if (i !== -1) blocks[i] = p.block;
    }
  }
  for (const p of picks) {
    if (p.op === 'remove') {
      const i = indexById(p.blockId);
      if (i !== -1) blocks.splice(i, 1);
    }
  }
  for (const p of picks) {
    if (p.op !== 'add' || !p.block) continue;
    if (indexById(p.blockId) !== -1) continue;
    if (p.afterBlockId == null) {
      blocks.unshift(p.block);
      continue;
    }
    const i = indexById(p.afterBlockId);
    if (i === -1) blocks.push(p.block);
    else blocks.splice(i + 1, 0, p.block);
  }

  const type = typeof (doc as AnyNode)?.type === 'string' ? ((doc as AnyNode).type as string) : 'doc';
  return { type, content: blocks };
}
