// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Page operations, shared by the app and the standalone MCP server: keep it
// free of SvelteKit-only imports.
import { timed } from '$lib/platform/logger.server';
import { db, type TxSql, type JsonArg } from '$lib/platform/db.server';
import { sanitizeDoc } from '$lib/features/content/server';
import { listPageLayoutPresets } from './pageLayoutPresets.server';
import { extractSearchText } from '$lib/features/search/server';
import {
  changePageColumns,
  mentionsAllPageAttrs,
  normalizeGap,
  normalizeStrays,
  normalizeTemplate,
  pageAttrsForWrite,
  pageAttrsOf,
  pageColumnsOf,
  PAGE_ATTR_KEYS,
  resizeSection,
  sectionCellCount,
  sectionDefaultWidth,
  sectionDefaultBleed,
  CUSTOM_PRESET_ID,
  STANDARD_PRESET_ID,
  setPageColumns,
  setPageGround,
  setPageGutter,
  setPageWidth,
  setSpacingField,
  stripPlaceholders,
  collectAssetIds,
  type PageColumns,
  type PageLayout,
  type SectionMerge,
} from '$lib/features/content';
import { presetSnapshot, type PageLayoutPreset } from './pageLayoutPresets';
import type { Visibility } from '$lib/features/nodes';
import type { SessionUser } from '$lib/features/auth/server';
import { syncProperties } from '$lib/features/semantic/server';
import { syncEdges } from '$lib/features/graph/server';
import { pageOwnedAssetIds, reconcilePageAssets } from '$lib/features/media/server';
import { getDocument } from '$lib/features/documents/server';
import {
  insertNode,
  deleteNodeTx,
  setNodeVisibility,
  setNodeNamespace,
  touchNode,
  readableNodes,
  slugify,
  cleanSlug,
  assertSlugAvailable,
  namespaceJoin,
  namespaceSlugColumn,
  assertCanPlaceInNamespace,
  assertNotWiderThanNamespace,
  userCanReadNode,
  userCanWriteNode,
  type NodeAccessRow,
} from '$lib/features/nodes/server';
import { getNamespace, getDefaultNamespace } from '$lib/features/namespaces/server';
import { getTypeClass } from '$lib/features/semantic/server';
import { captureVersion, registerVersionedType, type VersionKind } from './versions.server';
import { applyPicks, type BlockPick } from './pageDiff';
import {
  ensureBlockIds,
  emptyDoc,
  findBlockIndex,
  summarizeBlocks,
  emptyParagraph,
  containerAttrsFromStyle,
  withGridTiers,
  cellAttrsFromStyle,
  type BlockInput,
  type LeafBlockInput,
  type BlockRefResolvers,
  buildNode,
  type CellStyleInput,
  type GridBlockInput,
} from '$lib/features/content/server';
import type { JsonDoc, JsonNode, ContentScheme } from '$lib/features/content';
import { droppedUnits, isUnknownNode, lostKeys, unknownKey, unknownKeys, unwrapUnknown, type UnknownUnit } from '$lib/features/content';
import { assertNoUnknownDropped } from './unknownGuard';
import { CodedError } from '$lib/platform/codedError';

// The pages the user may read: userCanReadPage in SQL, via readableNodes.
export interface PageListRow {
  id: string;
  slug: string;
  namespace_slug: string | null;
  title: string;
  updated_at: string;
  visibility: string | null; // as stored, null = inherits its namespace; display only
  created_by: string | null;
  locale: string; // the content language (docs/architecture/languages.md)
}

export async function listPagesForUser(user: { id: string; role: string } | null) {
  return db<PageListRow[]>`
    select p.id, n.slug, ${db.unsafe(namespaceSlugColumn())}, n.title, n.updated_at, n.visibility, n.created_by, n.locale
    from pages p join nodes n on n.id = p.id ${db.unsafe(namespaceJoin('n'))}
    where ${readableNodes(user, 'n')}
    order by n.updated_at desc`;
}

// Filters derived data (incoming edges, graph, query results) so restricted titles don't leak.
export async function readablePageIds(user: { id: string; role: string } | null): Promise<Set<string>> {
  const rows = await db<{ id: string }[]>`
    select p.id from pages p join nodes n on n.id = p.id
    where ${readableNodes(user, 'n')}`;
  return new Set(rows.map((r) => r.id));
}

export interface PageRow {
  id: string;
  slug: string;
  namespace_id: string;
  namespace_slug: string | null;
  title: string;
  visibility: string | null; // null = inherits namespace_access_level, live
  namespace_access_level: Visibility;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  class_id: string; // at least the 'page' type class
  content_scheme: ContentScheme | null; // null = inherit (namespace slot, then the site default)
  locale: string; // the content language, never the interface language (docs/architecture/languages.md)
  doc: JsonDoc;
}

// Explicit columns, not `select *`: a missed nodes join is then an SQL error,
// not a silently undefined visibility.
const PAGE_SELECT = `p.id, n.slug, n.namespace_id, ${namespaceSlugColumn()}, n.title, p.doc, n.visibility, ns.access_level as namespace_access_level, n.created_by, n.created_at, n.updated_at, n.class_id, p.content_scheme, n.locale
    from pages p join nodes n on n.id = p.id ${namespaceJoin('n')}`;

export async function getPage(id: string): Promise<PageRow | null> {
  const [page] = await db<PageRow[]>`select ${db.unsafe(PAGE_SELECT)} where p.id = ${id}`;
  return page ?? null;
}

export async function createPage(
  title: string,
  user: SessionUser | null = null,
  opts?: { namespaceId?: string; visibility?: Visibility; locale?: string }
) {
  return db.begin(async (sql) => {
    const namespace = opts?.namespaceId ? await getNamespace(sql, opts.namespaceId) : await getDefaultNamespace(sql);
    if (!namespace) throw new CodedError('unknown_namespace', 'Unknown namespace');
    await assertCanPlaceInNamespace(sql, user, namespace.id, namespace.access_level);
    // An explicit visibility may only narrow the namespace's; null inherits it live.
    if (opts?.visibility) assertNotWiderThanNamespace(opts.visibility, namespace.access_level);
    const visibility = opts?.visibility ?? null;
    // Every node carries at least its type class (docs/architecture/semantic-layer.md).
    const pageClass = await getTypeClass(sql, 'page');
    // No locale: insertNode takes the site default.
    const node = await insertNode(sql, { classId: pageClass.id, slug: slugify(title), namespaceId: namespace.id, createdBy: user?.id ?? null, visibility, title, locale: opts?.locale });
    await sql`insert into pages (id, doc, search_title, search_locale) values (${node.id}, ${sql.json(emptyDoc() as unknown as JsonArg)}, ${title}, ${node.locale})`;
    const [page] = await sql<PageRow[]>`select ${sql.unsafe(PAGE_SELECT)} where p.id = ${node.id}`;
    return page;
  });
}

// Inherits its namespace's access level like every new node: a draft that must
// stay closed is set to Restricted in its access panel.
export async function createBlankPage(user: SessionUser, namespaceId?: string, title?: string) {
  return createPage(title?.trim() || 'Untitled', user, { namespaceId });
}

// null inherits the namespace's access level; returns what was stored.
export async function setPageVisibility(pageId: string, visibility: Visibility | null): Promise<Visibility | null> {
  return setNodeVisibility(pageId, visibility);
}

// null inherits (docs/architecture/theming.md, "Content scheme"). Callers validate the value
// (isContentScheme); the column's CHECK constraint is the backstop.
export async function getPageContentScheme(pageId: string): Promise<ContentScheme | null> {
  const [row] = await db<{ content_scheme: ContentScheme | null }[]>`select content_scheme from pages where id = ${pageId}`;
  return row?.content_scheme ?? null;
}

export async function setPageContentScheme(pageId: string, scheme: ContentScheme | null): Promise<void> {
  const rows = await db`update pages set content_scheme = ${scheme} where id = ${pageId} returning id`;
  if (rows.length === 0) throw new CodedError('not_found', 'Page not found');
}

// Changes the page's route (identity is namespace + slug). A restricted target
// needs the acting user's membership (or admin); a visibility wider than the
// target's is narrowed (setNodeNamespace). Gated as a page edit
// (userCanWritePage), not namespace:manage.
export async function setPageNamespace(pageId: string, namespaceId: string, user: SessionUser | null): Promise<void> {
  await setNodeNamespace(pageId, namespaceId, user);
}

export async function getPageShares(pageId: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`select user_id from page_shares where page_id = ${pageId}`;
  return rows.map((r) => r.user_id);
}

export async function setPageShares(pageId: string, userIds: unknown): Promise<string[]> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map((u) => String(u)))] : [];
  await db.begin(async (sql) => {
    await sql`delete from page_shares where page_id = ${pageId}`;
    for (const uid of ids) {
      await sql`insert into page_shares (page_id, user_id) values (${pageId}, ${uid}) on conflict do nothing`;
    }
  });
  return ids;
}

// The node model's checks (nodes/access.server.ts) with kind 'page'.
export async function userCanReadPage(user: SessionUser | null, page: NodeAccessRow): Promise<boolean> {
  return userCanReadNode(user, page, 'page');
}

export async function userCanWritePage(user: SessionUser | null, page: NodeAccessRow): Promise<boolean> {
  return userCanWriteNode(user, page, 'page');
}

// Page settings (pageAttrs.ts) live on the doc's root node, so a doc rebuilt
// from a block list (an MCP tool) would reset them. The editor always writes
// every key, `{}` meaning "cleared"; a BlockInput doc has no root attrs. So a
// stored setting is carried over only when the incoming doc doesn't mention it.
async function carryPageAttrs(sql: TxSql, id: string, doc: JsonDoc) {
  if (!doc) return;
  const [prev] = mentionsAllPageAttrs(doc) ? [undefined] : await sql<{ doc: JsonDoc | null }[]>`select doc from pages where id = ${id}`;
  const settings = pageAttrsForWrite(doc, prev?.doc?.attrs);
  const rest = { ...(doc.attrs ?? {}) };
  for (const key of PAGE_ATTR_KEYS) delete rest[key];
  const attrs = { ...rest, ...settings };
  if (Object.keys(attrs).length > 0) doc.attrs = attrs;
  else delete doc.attrs;
}

// Persists a doc and regenerates its derived state (graph, properties, search,
// asset GC); run inside a transaction so they commit together. The timing label
// is never SQL text or parameters, which carry token hashes and whole documents.
function persistDocTx(sql: TxSql, id: string, input: unknown) {
  return timed('page.persist', () => persistDocTxImpl(sql, id, input));
}

async function persistDocTxImpl(sql: TxSql, id: string, input: unknown) {
  // The trust boundary for a doc from the wire (PUT body, MCP tool, version restore).
  const doc = input as JsonDoc;
  // Unknown-block stand-ins are written back as what they stand for
  // (docs/architecture/blocks/anatomy.md, "Unknown blocks"), in place: the caller's version capture
  // reuses this object.
  const unwrapped = unwrapUnknown(doc);
  if (unwrapped !== doc) doc.content = unwrapped.content;
  await carryPageAttrs(sql, id, doc);
  // A columns page stores sections only (pageSections.ts): a stray block goes
  // into one, in the main column, as the renderer would show it.
  const columns = pageColumnsOf(doc.attrs?.layout as PageLayout | undefined);
  if (columns) doc.content = normalizeStrays(doc, columns, 'empty').content;
  // Placeholders are editor-only: stripped first so search, the write and the
  // caller's captureVersion (same object) all see a clean doc.
  stripPlaceholders(doc);
  sanitizeDoc(doc); // the HTML sanitization boundary: every write funnels here
  ensureBlockIds(doc);
  // search_tsv is generated from these and search_title (kept in sync by renamePage).
  const search = extractSearchText(doc);
  await sql`update pages set doc = ${sql.json(doc as unknown as JsonArg)}, search_headings = ${search.headings}, search_body = ${search.body} where id = ${id}`;
  await touchNode(sql, id);
  await syncEdges(sql, id, doc);
  await syncProperties(sql, id, doc);
  await reconcilePageAssets(id, collectAssetIds(doc), sql);
}

// The unknown units keyed as stored, for the save guard (unknownGuard.ts). The
// sanitizer may rewrite an id-less unit and so its fingerprint; keying on a
// sanitized copy matches it either way. `asStored` maps a given key to its
// stored one, so a writer may name a unit by either.
function unknownAsStored(doc: unknown): { units: Map<string, UnknownUnit>; asStored: (key: string) => string } {
  const keys = new Map<string, string>();
  const units = unknownKeys(doc as JsonNode | null, (node) => {
    const key = unknownKey(sanitizeDoc(structuredClone(node) as JsonDoc));
    keys.set(unknownKey(node), key);
    return key;
  });
  return { units, asStored: (key) => keys.get(key) ?? key };
}

// The editor's full-document save. The row lock serializes it with MCP block
// edits. Under an edit lock the caller must present its token, checked in the
// same transaction (LOCK_LOST otherwise). Dropping an unknown block
// unacknowledged throws UNKNOWN_DROPPED (unknownGuard.ts).
export async function saveDoc(
  id: string,
  doc: unknown,
  opts?: { lockToken?: string | null; authorId?: string | null; versionKind?: VersionKind; acknowledgeDropped?: readonly string[] }
) {
  return await db.begin(async (sql) => {
    const [locked] = await sql<{ doc: unknown }[]>`select doc from pages where id = ${id} for update`;
    if (!locked) return null;
    const [lock] = await sql<{ token: string }[]>`select token from page_locks where page_id = ${id}`;
    if (lock && lock.token !== (opts?.lockToken ?? null)) {
      throw new CodedError('lock_lost', 'edit lock lost');
    }
    const before = unknownAsStored(locked.doc);
    assertNoUnknownDropped(before.units, unknownAsStored(doc).units, (opts?.acknowledgeDropped ?? []).map(before.asStored));
    await persistDocTx(sql, id, doc);
    // The row lock above also serializes version_no allocation.
    await captureVersion(sql, {
      nodeType: 'page',
      nodeId: id,
      payload: doc,
      kind: opts?.versionKind ?? 'autosave',
      authorId: opts?.authorId ?? null,
    });
    const [page] = await sql<PageRow[]>`select ${sql.unsafe(PAGE_SELECT)} where p.id = ${id}`;
    return page ?? null;
  });
}

// Registered at module load: every page write path imports this module, so it
// is registered before any capture. A restore goes through saveDoc.
registerVersionedType('page', {
  async writePayload(sql, versionId, payload) {
    // A lost draft arrives as its editor sent it, so it passes the same boundary.
    stripPlaceholders(payload as JsonDoc);
    sanitizeDoc(payload as JsonDoc);
    await sql`
      insert into page_versions (version_id, doc) values (${versionId}, ${sql.json(payload as unknown as JsonArg)})
      on conflict (version_id) do update set doc = excluded.doc`;
  },
  async readPayload(sql, versionId) {
    const [r] = await sql<{ doc: unknown }[]>`select doc from page_versions where version_id = ${versionId}`;
    return r?.doc ?? null;
  },
  async applyCurrent(nodeId, payload, authorId, opts) {
    // No lock token: a restore fails with LOCK_LOST while an edit lock is held.
    // 'manual' keeps the replaced document in the history, so it can be undone.
    await saveDoc(nodeId, payload, { authorId, versionKind: 'manual', acknowledgeDropped: opts?.acknowledgeDropped });
  },
});

// Applies cherry-picked blocks by blockId onto the live doc, read under the row
// lock, so changes since the diff survive. The caller must hold the edit lock
// token. An unknown block may go only inside a block picked for removal
// (unknownGuard.ts).
export async function applyPicksToPage(
  id: string,
  picks: BlockPick[],
  opts: { lockToken: string | null; authorId: string | null }
): Promise<{ ok: true } | { ok: false; reason: 'not_found' | 'lock' } | { ok: false; reason: 'unknown_dropped'; dropped: UnknownUnit[] }> {
  return await db.begin(async (sql) => {
    const [row] = await sql<{ doc: unknown }[]>`select doc from pages where id = ${id} for update`;
    if (!row) return { ok: false as const, reason: 'not_found' as const };
    const [lock] = await sql<{ token: string }[]>`select token from page_locks where page_id = ${id}`;
    if (!lock || lock.token !== opts.lockToken) return { ok: false as const, reason: 'lock' as const };
    const merged = applyPicks(row.doc, picks);
    const stored = row.doc as JsonDoc | null;
    const removed = picks
      .filter((pick) => pick.op === 'remove')
      .flatMap((pick) => (stored?.content ?? []).filter((block) => block.attrs?.blockId === pick.blockId))
      .flatMap((block) => lostKeys(unknownAsStored(block).units, new Map()));
    const dropped = droppedUnits(unknownAsStored(stored).units, unknownAsStored(merged).units, removed);
    if (dropped.length) return { ok: false as const, reason: 'unknown_dropped' as const, dropped };
    await persistDocTx(sql, id, merged);
    await captureVersion(sql, { nodeType: 'page', nodeId: id, payload: merged, kind: 'autosave', authorId: opts.authorId });
    return { ok: true as const };
  });
}

// The chokepoint for incremental doc edits: a read-modify-write under the row
// lock, so no update is lost. Do async prep (buildNode) before calling, to hold
// the lock briefly. An unknown block goes only when acknowledged
// (unknownGuard.ts): by key, or as the block the operation hands to `named`.
export async function withPageDoc<T>(
  id: string,
  mutate: (doc: JsonDoc, named: (node: JsonNode) => void) => T | Promise<T>,
  acknowledgeDropped: readonly string[] = []
): Promise<T> {
  const result = await db.begin(async (sql) => {
    const [row] = await sql`select doc from pages where id = ${id} for update`;
    if (!row) throw new Error('page not found');
    const doc = row.doc as JsonDoc;
    // Before `mutate` changes the doc in place.
    const before = unknownAsStored(doc);
    const acks = [...acknowledgeDropped];
    const out = await mutate(doc, (node) => {
      if (isUnknownNode(node)) acks.push(unknownKey(node));
    });
    assertNoUnknownDropped(before.units, unknownAsStored(doc).units, acks.map(before.asStored));
    await persistDocTx(sql, id, doc);
    return out;
  });
  return result as T;
}

/** The page's own settings (pageAttrs.ts): null takes the site's, undefined leaves a field as it is. */
export interface PageSettingsInput {
  readWidth?: string | null;
  wideWidth?: string | null;
  background?: string | null;
  blockSpace?: number | null;
  gutters?: Partial<Record<'desktop' | 'tablet' | 'phone', string | null>>;
  /**
   * A preset's id (its values copied in; the page's own preset again
   * reapplies it), `standard` (a flow), or `custom` (with `columns` and `columnGap`).
   */
  layout?: string;
  columns?: unknown;
  columnGap?: unknown;
}

const CUSTOM_START: PageColumns = { mode: 'columns', template: { desktop: [1, 1], tablet: [1, 1], phone: [1] }, preset: CUSTOM_PRESET_ID };

// undefined = no change. A template or gap alone adjusts the current layout and
// keeps its preset provenance ("customized"); `custom` drops it.
function nextColumns(current: PageColumns | null, input: PageSettingsInput, presets: readonly PageLayoutPreset[]): PageColumns | null | undefined {
  const template = input.columns !== undefined ? normalizeTemplate(input.columns) : null;
  if (input.columns !== undefined && !template) throw new Error('columns must be { desktop, tablet?, phone? } with 1–4 whole-number ratios (1–12) per tier');
  const gap = input.columnGap !== undefined ? normalizeGap(input.columnGap) : undefined;
  if (input.layout === STANDARD_PRESET_ID) return null;
  let base: PageColumns;
  if (input.layout !== undefined && input.layout !== CUSTOM_PRESET_ID) {
    const preset = presets.find((p) => p.enabled && p.id === input.layout);
    if (!preset) {
      const known = presets.filter((p) => p.enabled).map((p) => p.id);
      throw new Error(`unknown page layout '${input.layout}' — the site's layouts are ${[...known, CUSTOM_PRESET_ID].join(', ')} (list_page_layout_presets)`);
    }
    const snapshot = presetSnapshot(preset);
    if (!snapshot) return null;
    base = snapshot;
  } else if (input.layout === CUSTOM_PRESET_ID) {
    const { presetLabel: _provenance, ...own } = current ?? CUSTOM_START;
    base = { ...own, preset: CUSTOM_PRESET_ID };
  } else if (template || gap) {
    base = current ?? CUSTOM_START;
  } else {
    return undefined;
  }
  const next: PageColumns = { ...base, template: template ?? base.template };
  if (gap !== undefined) next.gap = gap;
  return next;
}

/** Returns where a layout change merged a section's trailing columns (pageSections.ts). */
export async function setPageSettings(id: string, input: PageSettingsInput): Promise<SectionMerge[]> {
  // Read before the page lock is taken.
  const presets = input.layout !== undefined && input.layout !== STANDARD_PRESET_ID && input.layout !== CUSTOM_PRESET_ID ? await listPageLayoutPresets() : [];
  return await withPageDoc(id, (doc) => {
    const current = pageAttrsOf(doc);
    let { layout, spacing, surface } = current;
    let merges: SectionMerge[] = [];
    const now = pageColumnsOf(layout);
    const next = nextColumns(now, input, presets);
    if (next !== undefined) {
      const changed = changePageColumns(doc, now, next, 'empty');
      doc.content = changed.doc.content;
      merges = changed.merges;
      layout = setPageColumns(layout, next);
    }
    if (input.readWidth !== undefined) layout = setPageWidth(layout, 'read', input.readWidth);
    if (input.wideWidth !== undefined) layout = setPageWidth(layout, 'wide', input.wideWidth);
    if (input.background !== undefined) surface = setPageGround(input.background);
    if (input.blockSpace !== undefined) spacing = setSpacingField(spacing, 'desktop', 'blockSpace', input.blockSpace);
    for (const [bp, gutter] of Object.entries(input.gutters ?? {}) as ['desktop' | 'tablet' | 'phone', string | null | undefined][]) {
      if (gutter !== undefined) layout = setPageGutter(layout, bp, gutter);
    }
    // Every key mentioned, so carryPageAttrs keeps these as they are.
    doc.attrs = { ...(doc.attrs ?? {}), spacing, layout, surface };
    return merges;
  });
}

/** Refused on a flow page; otherwise fitted to the page's column count without losing a cell's blocks. */
function fitSection(doc: JsonDoc, node: JsonNode): JsonNode {
  if (node.type !== 'pageSection') return node;
  const columns = pageColumnsOf(doc.attrs?.layout as PageLayout | undefined);
  if (!columns) throw new Error('this page has no column layout — choose one with set_page_layout (a layout from list_page_layout_presets, or custom) before adding sections');
  const count = node.attrs?.columns === 'single' ? 1 : sectionCellCount(columns);
  const attrs = { ...(node.attrs ?? {}) };
  if (!('width' in attrs)) {
    const width = sectionDefaultWidth(columns);
    if (width) attrs.width = width;
  }
  const first = !(doc.content ?? []).some((n) => n.type === 'pageSection');
  if (!('bleedToTop' in attrs) && first && sectionDefaultBleed(columns)) attrs.bleedToTop = true;
  return resizeSection({ ...node, attrs }, count, 'empty').section;
}

export async function listBlocks(id: string) {
  const page = await getPage(id);
  if (!page) throw new Error('page not found');
  return summarizeBlocks(page.doc);
}

// Links reference the id, so a rename leaves them intact. A slug taken in the
// namespace throws SLUG_TAKEN, a reserved one SLUG_RESERVED (assertSlugAvailable).
export async function renamePage(id: string, changes: { title?: string; slug?: string }) {
  const title = changes.title !== undefined ? changes.title.trim() : undefined;
  if (title !== undefined && title === '') throw new CodedError('title_required', 'Title cannot be empty');

  let slug: string | undefined;
  if (changes.slug !== undefined) {
    slug = cleanSlug(changes.slug);
    if (slug === '') throw new CodedError('slug_required', 'URL slug cannot be empty');
    const [node] = await db<{ namespace_id: string }[]>`select namespace_id from nodes where id = ${id}`;
    if (!node) throw new CodedError('not_found', 'Not found');
    await assertSlugAvailable(db, slug, id, node.namespace_id);
  }

  if (title === undefined && slug === undefined) return getPage(id);

  return db.begin(async (sql) => {
    if (title !== undefined) {
      // search_tsv is generated and can't read nodes, so search_title mirrors the title.
      await sql`update nodes set title = ${title} where id = ${id}`;
      await sql`update pages set search_title = ${title} where id = ${id}`;
    }
    if (slug !== undefined) {
      await sql`update nodes set slug = ${slug} where id = ${id}`;
    }
    await touchNode(sql, id);
    const [p] = await sql<PageRow[]>`select ${sql.unsafe(PAGE_SELECT)} where p.id = ${id}`;
    return p ?? null;
  });
}

// The node row takes the page, its versions and its links with it.
export async function deletePage(id: string): Promise<boolean> {
  return deleteNodeTx(db, id);
}

// For buildNode's quick link and link denormalization.
const blockRefs: BlockRefResolvers = {
  resolvePage: async (id) => {
    const p = await getPage(id);
    return p ? { id: p.id, slug: p.slug, title: p.title } : null;
  },
  resolveDocument: async (id) => {
    const d = await getDocument(id);
    return d ? { id: d.id, title: d.title } : null;
  },
};

/** What an embedding or plugin block may show, read as the writer; without them such a block is refused. */
export type WriterRefs = Pick<BlockRefResolvers, 'resolveEmbedTarget' | 'embedKindOf' | 'pluginHost'>;

export async function appendBlock(id: string, input: BlockInput, writer: WriterRefs = {}): Promise<string> {
  const node = await buildNode(input, { ...blockRefs, ...writer }); // before the lock
  return await withPageDoc(id, (doc) => {
    doc.content = doc.content ?? [];
    doc.content.push(fitSection(doc, node));
    return node.attrs?.blockId as string;
  });
}

export async function updateBlock(
  id: string,
  blockId: string,
  input: BlockInput,
  writer: WriterRefs = {},
  acknowledgeDropped: readonly string[] = []
): Promise<void> {
  const node = await buildNode(input, { ...blockRefs, ...writer });
  await withPageDoc(
    id,
    (doc, named) => {
      const idx = findBlockIndex(doc, blockId);
      if (idx === -1) throw new Error(`block ${blockId} not found`);
      named(doc.content![idx]);
      (node.attrs ??= {}).blockId = blockId;
      doc.content![idx] = fitSection(doc, node);
    },
    acknowledgeDropped
  );
}

export async function deleteBlock(id: string, blockId: string, acknowledgeDropped: readonly string[] = []): Promise<void> {
  await withPageDoc(
    id,
    (doc, named) => {
      const idx = findBlockIndex(doc, blockId);
      if (idx === -1) throw new Error(`block ${blockId} not found`);
      named(doc.content![idx]);
      doc.content!.splice(idx, 1);
    },
    acknowledgeDropped
  );
}

// A top-level grid or page section: a section's cells are a grid's.
function findLayout(doc: JsonDoc, gridBlockId: string): JsonNode {
  const idx = findBlockIndex(doc, gridBlockId);
  if (idx === -1) throw new Error(`grid ${gridBlockId} not found`);
  const node = doc.content![idx];
  if (node.type !== 'grid' && node.type !== 'pageSection') throw new Error(`block ${gridBlockId} is not a grid or a section`);
  return node;
}

export async function editCell(
  pageId: string,
  gridBlockId: string,
  cellIndex: number,
  opts: { blocks?: LeafBlockInput[]; mode?: 'replace' | 'append'; style?: CellStyleInput; acknowledgeDropped?: readonly string[] },
  writer: WriterRefs = {},
): Promise<void> {
  if (!opts.blocks && !opts.style) throw new Error('provide blocks and/or style to change');
  // Built before the lock: buildNode does its own reads.
  let built: JsonNode[] | null = null;
  if (opts.blocks) {
    built = [];
    for (const b of opts.blocks) built.push(await buildNode(b, { ...blockRefs, ...writer }));
  }
  await withPageDoc(pageId, (doc) => {
    const node = findLayout(doc, gridBlockId);
    const cells = node.content ?? [];
    if (cellIndex < 0 || cellIndex >= cells.length) {
      throw new Error(`cell index ${cellIndex} out of range (this grid has ${cells.length} cells: 0..${cells.length - 1})`);
    }
    const cell = cells[cellIndex];
    if (built) {
      const existing = cell.content ?? [];
      const onlyPlaceholder = existing.length === 1 && existing[0].type === 'paragraph' && !(existing[0].content?.length);
      cell.content = opts.mode === 'append' && !onlyPlaceholder ? [...existing, ...built] : built;
      if (!cell.content.length) cell.content = [emptyParagraph()];
    }
    if (opts.style) {
      cell.attrs = { ...(cell.attrs ?? {}), ...cellAttrsFromStyle(opts.style) };
    }
  }, opts.acknowledgeDropped);
}

// Visual attrs only: the column count stays (updateBlock restructures).
export async function styleGrid(
  pageId: string,
  gridBlockId: string,
  style: Partial<Pick<GridBlockInput, 'gap' | 'columnsByTier' | 'gapByTier' | 'spacing' | 'surface' | 'minHeight' | 'width'>>,
): Promise<void> {
  await withPageDoc(pageId, (doc) => {
    const node = findLayout(doc, gridBlockId);
    const attrs = containerAttrsFromStyle({ kind: 'grid', cells: [], ...style } as GridBlockInput);
    if (node.type === 'pageSection') {
      // A section's columns and gap are the page's column template, not its own.
      delete attrs.gap;
      delete attrs.columnsByTier;
      delete attrs.gapByTier;
      node.attrs = { ...(node.attrs ?? {}), ...attrs };
    } else {
      node.attrs = withGridTiers(node.attrs ?? {}, attrs);
    }
  });
}

// Refuses an MCP write whose background image the page doesn't own: an agent
// cannot upload, and a foreign id would render by another page's permissions.
export async function assertPageAssetRefs(pageId: string, input: unknown): Promise<void> {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    if (o.surface && typeof o.surface === 'object') {
      for (const tier of Object.values(o.surface as Record<string, unknown>)) {
        const image = (tier as { image?: unknown } | null)?.image;
        if (typeof image === 'string') ids.add(image);
      }
    }
    for (const child of Object.values(o)) walk(child);
  };
  walk(input);
  if (ids.size === 0) return;
  const owned = await pageOwnedAssetIds(pageId, [...ids]);
  const foreign = [...ids].filter((id) => !owned.has(id));
  if (foreign.length) throw new Error(`background image ${foreign.join(', ')} is not an image uploaded to this page`);
}

// toIndex is 0-based, clamped to the range after removal.
export async function moveBlock(id: string, blockId: string, toIndex: number): Promise<void> {
  await withPageDoc(id, (doc) => {
    const content = doc.content ?? [];
    const from = findBlockIndex(doc, blockId);
    if (from === -1) throw new Error(`block ${blockId} not found`);
    const [node] = content.splice(from, 1);
    const to = Math.max(0, Math.min(toIndex, content.length));
    content.splice(to, 0, node);
    doc.content = content;
  });
}
