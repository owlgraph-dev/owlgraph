// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Unknown blocks (docs/architecture/blocks/anatomy.md, "Unknown blocks"): a node of a type or with a
// mark this build doesn't define. ProseMirror refuses a whole document over
// one, so the editor wraps each verbatim in an `unknownBlock` on load and
// unwraps it on the way out. Shared by server and editor, so both agree on
// what is unknown.
import { retiredBlockKind } from '$lib/plugins';
import { BLOCK_KINDS } from '../blocks/catalog';
import type { Attrs, JsonNode } from './doc';

/** The wrapper's node type (blocks/unknown/). */
export const UNKNOWN_BLOCK = 'unknownBlock';

/** Every node type the editor's schema defines: the block kinds, and the document, text and line break. */
export const KNOWN_NODE_TYPES: ReadonlySet<string> = new Set([...BLOCK_KINDS.map((kind) => kind.name), 'doc', 'text', 'hardBreak']);

/** Every mark type the editor's schema defines (pinned to the editor's extensions by a test). */
export const KNOWN_MARK_TYPES: ReadonlySet<string> = new Set([
  'italic',
  'strike',
  'code',
  'link',
  'pageLink',
  'docLink',
  'semanticProperty',
  'customStyle',
  'typographyFamily',
  'typographySize',
  'typographyColor',
  'typographyWeight',
  'typographyLineHeight',
  'typographyLetterSpacing',
]);

/** The attrs of an `unknownBlock`: the node it stands for, as it was stored. */
export interface UnknownBlockAttrs {
  /** The original's block id, for the editor's addressing; a pasted copy gets a fresh one. */
  blockId: string | null;
  originalType: string;
  original: JsonNode;
  /** The plugin a retired kind belonged to (plugins/index.ts, RETIRED_BLOCK_KINDS), else null. */
  plugin: string | null;
}

/** A node the running code cannot draw: an unknown type, or an unknown mark on it. */
export function isUnknownNode(node: JsonNode): boolean {
  if (!KNOWN_NODE_TYPES.has(node.type)) return true;
  return (node.marks ?? []).some((mark) => !KNOWN_MARK_TYPES.has(mark.type));
}

/**
 * What readers, search and the graph leave out, content included. Text under
 * an unknown mark is not one: a reader gets the text without the mark.
 */
export function isUnknownType(node: JsonNode): boolean {
  return !KNOWN_NODE_TYPES.has(node.type);
}

/**
 * Anything else in a stand-in (pasted, written by hand) is dropped rather
 * than put in the page unseen.
 */
export function isStandInOriginal(original: unknown, originalType: unknown): original is JsonNode {
  if (!original || typeof original !== 'object' || Array.isArray(original)) return false;
  const node = original as JsonNode;
  return typeof node.type === 'string' && node.type === originalType && unknownKeys(node).size > 0;
}

/** A node a document operation must leave where it is, as it is: an unknown one, or the wrapper of one. */
export function isOpaqueNode(node: JsonNode | null | undefined): boolean {
  return !!node && (node.type === UNKNOWN_BLOCK || !KNOWN_NODE_TYPES.has(node.type));
}

// ---- keys --------------------------------------------------------------------

/** JSON with every object's keys sorted: one spelling per value, whatever order it was written in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** cyrb53: a fast 53-bit string hash, as hex. Enough to tell apart a page's few id-less unknown units. */
function hash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

const KEY = /^[A-Za-z0-9:_-]+$/;

/** Whether a string can be an unknown unit's key — what a writer may acknowledge. */
export function isUnknownKey(key: string): boolean {
  return KEY.test(key);
}

/** An unknown unit's key: its block id, or a fingerprint of the node as stored. */
export function unknownKey(node: JsonNode): string {
  const id = node.attrs?.blockId;
  if (typeof id === 'string' && id && KEY.test(id)) return id;
  return `fp:${hash(canonical(node))}`;
}

/** One kind of unknown unit a document holds: its key, what it is, how many. */
export interface UnknownUnit {
  key: string;
  type: string;
  count: number;
}

/**
 * Every unknown unit, wrappers looked through, as a multiset: two identical
 * id-less nodes count twice. The save guard keys a unit as it would be stored.
 */
export function unknownKeys(doc: JsonNode | null | undefined, keyOf: (node: JsonNode) => string = unknownKey): Map<string, UnknownUnit> {
  const units = new Map<string, UnknownUnit>();
  const walk = (node: JsonNode | null | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === UNKNOWN_BLOCK) {
      walk((node.attrs as Partial<UnknownBlockAttrs> | undefined)?.original);
      return;
    }
    if (isUnknownNode(node)) {
      const key = keyOf(node);
      const known = units.get(key);
      if (known) known.count++;
      else units.set(key, { key, type: KNOWN_NODE_TYPES.has(node.type) ? unknownMarkType(node) : node.type, count: 1 });
      return;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return units;
}

/** What names a known node that is unknown for a mark: the first mark the code does not know. */
function unknownMarkType(node: JsonNode): string {
  return (node.marks ?? []).find((mark) => !KNOWN_MARK_TYPES.has(mark.type))?.type ?? node.type;
}

/**
 * The units `before` holds that `after` would lose, beyond those acknowledged
 * — each acknowledgement covering one occurrence of its key.
 */
export function droppedUnits(before: Map<string, UnknownUnit>, after: Map<string, UnknownUnit>, acknowledged: readonly string[] = []): UnknownUnit[] {
  const acks = new Map<string, number>();
  for (const key of acknowledged) acks.set(key, (acks.get(key) ?? 0) + 1);
  const dropped: UnknownUnit[] = [];
  for (const unit of before.values()) {
    const missing = unit.count - (after.get(unit.key)?.count ?? 0) - (acks.get(unit.key) ?? 0);
    if (missing > 0) dropped.push({ key: unit.key, type: unit.type, count: missing });
  }
  return dropped;
}

/** The keys a document lost against another, one per lost occurrence — what an editor acknowledges for the blocks its author removed. */
export function lostKeys(before: Map<string, UnknownUnit>, after: Map<string, UnknownUnit>): string[] {
  const keys: string[] = [];
  for (const unit of before.values()) {
    const lost = unit.count - (after.get(unit.key)?.count ?? 0);
    for (let i = 0; i < lost; i++) keys.push(unit.key);
  }
  return keys;
}

// ---- wrapping ------------------------------------------------------------------

/**
 * Elsewhere the wrap takes the nearest ancestor that stands in such a slot.
 * Pinned to the editor's schema by a test.
 */
export function slotTakesBlock(type: string, index: number): boolean {
  switch (type) {
    case 'doc':
    case 'gridCell':
    case 'flexCell':
    case 'blockquote':
      return true;
    case 'listItem':
      return index > 0;
    default:
      return false;
  }
}

function wrapperOf(node: JsonNode): JsonNode {
  const original = structuredClone(node);
  const id = original.attrs?.blockId;
  const attrs: UnknownBlockAttrs = {
    blockId: typeof id === 'string' && id ? id : null,
    originalType: original.type,
    original,
    plugin: retiredBlockKind(original.type)?.plugin ?? null,
  };
  return { type: UNKNOWN_BLOCK, attrs: attrs as unknown as Attrs };
}

/** The editor's load pass. What holds nothing unknown is shared, not copied. */
export function wrapUnknown<T extends JsonNode>(doc: T): T {
  // `bubble`: something inside can't be wrapped where it is, so this node must be.
  const visit = (node: JsonNode, slotTakesWrapper: boolean): JsonNode | 'bubble' => {
    if (node.type === UNKNOWN_BLOCK) return node;
    if (isUnknownNode(node)) return slotTakesWrapper ? wrapperOf(node) : 'bubble';
    const children = node.content;
    if (!children?.length) return node;
    let changed = false;
    const next: JsonNode[] = [];
    for (let i = 0; i < children.length; i++) {
      const result = visit(children[i], slotTakesBlock(node.type, i));
      if (result === 'bubble') return slotTakesWrapper ? wrapperOf(node) : 'bubble';
      if (result !== children[i]) changed = true;
      next.push(result);
    }
    return changed ? { ...node, content: next } : node;
  };
  const result = visit(doc, false);
  // The document itself is known and its top level takes a block, so nothing bubbles out of it.
  return (result === 'bubble' ? doc : result) as T;
}

/**
 * A pasted copy takes the live block id the editor gave it, so a page never
 * holds one id twice.
 */
export function unwrapUnknown<T extends JsonNode>(doc: T): T {
  const visit = (node: JsonNode): JsonNode | null => {
    if (node.type === UNKNOWN_BLOCK) {
      const attrs = (node.attrs ?? {}) as Partial<UnknownBlockAttrs>;
      if (!isStandInOriginal(attrs.original, attrs.originalType)) return null;
      const original = structuredClone(attrs.original) as JsonNode;
      const was = original.attrs?.blockId;
      if (typeof was === 'string' && was && typeof attrs.blockId === 'string' && attrs.blockId && attrs.blockId !== was) {
        original.attrs = { ...original.attrs, blockId: attrs.blockId };
      }
      return original;
    }
    const children = node.content;
    if (!children?.length) return node;
    let changed = false;
    const next: JsonNode[] = [];
    for (const child of children) {
      const result = visit(child);
      if (result !== child) changed = true;
      if (result) next.push(result);
    }
    return changed ? { ...node, content: next } : node;
  };
  return (visit(doc) ?? doc) as T;
}

/** How an agent reads an unknown unit or its wrapper in a page's blocks — null for anything else. */
export function unknownSummary(node: JsonNode): string | null {
  const original = node.type === UNKNOWN_BLOCK ? ((node.attrs as Partial<UnknownBlockAttrs> | undefined)?.original ?? null) : node;
  if (!original || !isUnknownNode(original)) return null;
  const type = KNOWN_NODE_TYPES.has(original.type) ? unknownMarkType(original) : original.type;
  const plugin = retiredBlockKind(original.type)?.plugin;
  return `unknown block (${type}${plugin ? `, plugin ${plugin}` : ''})`;
}
