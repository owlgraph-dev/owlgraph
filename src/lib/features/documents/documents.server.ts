// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Documents are graph nodes, not assets: their own identity, metadata and
// visibility. The bytes stay behind this module so they can move to object
// storage. Access is enforced wherever a document is read or served.
import { createHash } from 'node:crypto';
import { db, type TxSql } from '$lib/platform/db.server';
import type { SessionUser } from '$lib/features/auth/server';
import { canWriteNode, type Visibility } from '$lib/features/nodes';
import {
  insertNode,
  readableNodes,
  touchNode,
  slugify,
  cleanSlug,
  assertSlugAvailable,
  namespaceJoin,
  namespaceSlugColumn,
  assertCanPlaceInNamespace,
  assertNotWiderThanNamespace,
  userCanReadNode,
} from '$lib/features/nodes/server';
import { getNamespace, getDefaultNamespace } from '$lib/features/namespaces/server';
import { getTypeClass } from '$lib/features/semantic/server';
import { extractText } from './extract.server';
import { detectLocale } from './detectLocale';
import { enabledLocales } from '$lib/platform/i18n/siteLocales';
import type { DocumentSource } from './externalUrl';
import { CodedError } from '$lib/platform/codedError';

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
// No HTML or SVG: they can carry script, and served content must stay inert.
export const ALLOWED_DOCUMENT_MIME = new Set(['application/pdf', 'text/plain', 'text/markdown']);

// The declared type is client-chosen: a PDF must carry %PDF- in its first 1024
// bytes (where readers look), and text has no NUL bytes. Upload routes refuse a mismatch.
export function matchesDocumentType(mime: string, bytes: Buffer): boolean {
  if (mime === 'application/pdf') return bytes.subarray(0, 1024).includes('%PDF-');
  return !bytes.includes(0);
}

export interface DocumentRow {
  id: string;
  title: string;
  slug: string;
  namespace_id: string;
  namespace_slug: string | null;
  // A link has no file: mime and size null, filename ''. A plugin's document
  // has no bytes here; filename/mime/size are what its integration last saw.
  source: DocumentSource;
  // The plugin id of a 'plugin' document (docs/architecture/plugins.md); null otherwise.
  plugin: string | null;
  external_url: string | null;
  filename: string;
  mime: string | null;
  size: number | null;
  visibility: string | null; // null = inherits namespace_access_level, live
  namespace_access_level: Visibility;
  created_by: string | null;
  created_at: string;
  class_id: string; // the 'document' type class or a subclass of it
  locale: string;
  // The language detected in an upload's text while it differs from `locale`
  // and the author has neither taken nor dismissed it; only ever a suggestion.
  detected_locale: string | null;
}

// Explicit columns, not `select *`: a missed nodes join fails loudly instead of
// leaving visibility undefined. Kept apart from the FROM clause so
// searchDocumentsFts can add its rank and snippet columns between them.
export const DOCUMENT_COLUMNS = `d.id, n.title, n.slug, n.namespace_id, ${namespaceSlugColumn()}, d.source, d.plugin, d.external_url, d.filename, d.mime, d.size,
    n.visibility, ns.access_level as namespace_access_level, n.created_by, n.created_at, n.class_id, n.locale, d.detected_locale`;
export const DOCUMENT_FROM = `from documents d join nodes n on n.id = d.id ${namespaceJoin('n')}`;

export async function getDocument(id: string): Promise<DocumentRow | null> {
  const [row] = await db<DocumentRow[]>`
    select ${db.unsafe(DOCUMENT_COLUMNS)} ${db.unsafe(DOCUMENT_FROM)} where d.id = ${id}`;
  return row ?? null;
}

/** The plugin of each given document an integration keeps; uploads and links are absent. */
export async function documentPlugins(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db<{ id: string; plugin: string }[]>`select id, plugin from documents where id = any(${[...ids]}::uuid[]) and plugin is not null`;
  return new Map(rows.map((r) => [r.id, r.plugin]));
}

export async function createDocument(opts: {
  bytes: Buffer;
  mime: string;
  filename: string;
  title?: string;
  createdBy: string | null;
  user: SessionUser | null;
  namespaceId?: string;
  locale?: string;
}): Promise<{ id: string; slug: string }> {
  const sha256 = createHash('sha256').update(opts.bytes).digest('hex');
  const title = opts.title?.trim() || opts.filename || 'Untitled';
  const slug = slugify(title);
  // A file whose text can't be extracted still uploads, indexed by its title only.
  let searchText = '';
  try {
    searchText = await extractText(opts.bytes, opts.mime);
  } catch {
    searchText = '';
  }
  return db.begin(async (sql) => {
    const { id, locale } = await insertDocumentNode(sql, { ...opts, title, slug });
    const detected = suggestedLocale(searchText, locale);
    await sql`
      insert into documents (id, source, filename, mime, size, bytes, sha256, search_text, search_title, search_locale, detected_locale)
      values (${id}, 'upload', ${opts.filename}, ${opts.mime}, ${opts.bytes.length}, ${opts.bytes}, ${sha256}, ${searchText}, ${title}, ${locale}, ${detected})`;
    return { id, slug };
  });
}

// The URL must already be validated (parseExternalUrl) and is never fetched
// (docs/architecture/documents.md), so only the title is indexed.
export async function createLinkDocument(opts: {
  url: string;
  title: string;
  createdBy: string | null;
  user: SessionUser | null;
  namespaceId?: string;
  locale?: string;
}): Promise<{ id: string; slug: string }> {
  const title = opts.title.trim();
  if (title === '') throw new CodedError('title_required', 'Title cannot be empty');
  const slug = slugify(title);
  return db.begin(async (sql) => {
    const { id, locale } = await insertDocumentNode(sql, { ...opts, title, slug });
    await sql`
      insert into documents (id, source, external_url, search_text, search_title, search_locale)
      values (${id}, 'link', ${opts.url}, '', ${title}, ${locale})`;
    return { id, slug };
  });
}

// A document an integration serves (docs/architecture/plugins.md). `ref` is its record of
// the file and never holds a credential. Runs in the caller's transaction, where
// the integration also seals the node's credential and adds it to its collection.
export async function createPluginDocument(
  opts: {
    plugin: string;
    ref: Record<string, unknown>;
    title: string;
    file: { filename: string; mime: string | null; size: number | null };
    createdBy: string | null;
    user: SessionUser | null;
    namespaceId?: string;
    locale?: string;
    /** Narrower than the namespace — the page or collection it is made from — or null to inherit it. */
    visibility?: Visibility | null;
  },
  sql: TxSql
): Promise<{ id: string; slug: string }> {
  const title = opts.title.trim() || opts.file.filename || 'Untitled';
  const slug = slugify(title);
  const { id, locale } = await insertDocumentNode(sql, { ...opts, title, slug });
  await sql`
    insert into documents (id, source, plugin, source_ref, filename, mime, size, search_text, search_title, search_locale)
    values (${id}, 'plugin', ${opts.plugin}, ${sql.json(opts.ref as never)}, ${opts.file.filename}, ${opts.file.mime},
      ${opts.file.size}, '', ${title}, ${locale})`;
  return { id, slug };
}

/**
 * The integration's document in a namespace whose source record holds every key
 * of `match`. Take lockPluginDocument for the same key first in the same
 * transaction, so two requests for one file make one node.
 */
export async function findPluginDocument(
  sql: TxSql,
  opts: { namespaceId: string; plugin: string; match: Readonly<Record<string, string | number>> }
): Promise<string | null> {
  const [row] = await sql<{ id: string }[]>`
    select d.id from documents d join nodes n on n.id = d.id
    where n.namespace_id = ${opts.namespaceId} and d.source = 'plugin' and d.plugin = ${opts.plugin}
      and d.source_ref @> ${sql.json(opts.match as never)}
    order by n.created_at limit 1`;
  return row?.id ?? null;
}

/** Holds, until the transaction ends, the one lock a namespace, an integration and a file's `match` share. */
export async function lockPluginDocument(
  sql: TxSql,
  opts: { namespaceId: string; plugin: string; match: Readonly<Record<string, string | number>> }
): Promise<void> {
  const key = JSON.stringify([opts.namespaceId, opts.plugin, Object.entries(opts.match).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))]);
  await sql`select pg_advisory_xact_lock(hashtext('plugin-document'), hashtext(${key}))`;
}

/** A plugin document's source_ref, kept out of DocumentRow: it is its integration's business. */
export async function getDocumentSourceRef(id: string, sql: TxSql = db): Promise<Record<string, unknown> | null> {
  const [row] = await sql<{ source_ref: Record<string, unknown> | null }[]>`
    select source_ref from documents where id = ${id} and source = 'plugin'`;
  return row?.source_ref ?? null;
}

/** Replaces a plugin document's record of its source and, when given, its file as last seen. False for any other document. */
export async function setDocumentSourceRef(
  id: string,
  ref: Record<string, unknown>,
  file?: { filename: string; mime: string | null; size: number | null },
  sql: TxSql = db
): Promise<boolean> {
  const rows = file
    ? await sql`
        update documents set source_ref = ${sql.json(ref as never)}, filename = ${file.filename}, mime = ${file.mime}, size = ${file.size}
        where id = ${id} and source = 'plugin' returning id`
    : await sql`update documents set source_ref = ${sql.json(ref as never)} where id = ${id} and source = 'plugin' returning id`;
  return rows.length > 0;
}

/** One integration's documents a viewer may read whose title holds `q`, newest first. */
export async function listPluginDocumentsForUser(
  user: SessionUser | null,
  opts: { plugin: string; q?: string; limit?: number }
): Promise<(DocumentRow & { source_ref: Record<string, unknown> })[]> {
  const term = opts.q?.trim() ? db`n.title ilike ${`%${opts.q.trim()}%`}` : db`true`;
  return db<(DocumentRow & { source_ref: Record<string, unknown> })[]>`
    select ${db.unsafe(DOCUMENT_COLUMNS)}, d.source_ref ${db.unsafe(DOCUMENT_FROM)}
    where d.plugin = ${opts.plugin} and ${term} and ${readableNodes(user, 'n')}
    order by n.created_at desc limit ${Math.min(Math.max(opts.limit ?? 20, 1), 100)}`;
}

// Returns the content language the node got (the given one, else the site
// default) for the documents row's search mirror.
async function insertDocumentNode(
  sql: TxSql,
  opts: { title: string; slug: string; createdBy: string | null; user: SessionUser | null; namespaceId?: string; locale?: string; visibility?: Visibility | null }
): Promise<{ id: string; locale: string }> {
  const namespace = opts.namespaceId ? await getNamespace(sql, opts.namespaceId) : await getDefaultNamespace(sql);
  if (!namespace) throw new CodedError('unknown_namespace', 'Unknown namespace');
  await assertCanPlaceInNamespace(sql, opts.user, namespace.id, namespace.access_level);
  if (opts.visibility) assertNotWiderThanNamespace(opts.visibility, namespace.access_level);
  // The 'document' type class carries the document metadata group, so its
  // fields render; editors may pick a subclass afterward.
  const documentClass = await getTypeClass(sql, 'document');
  const node = await insertNode(sql, {
    classId: documentClass.id,
    slug: opts.slug,
    namespaceId: namespace.id,
    createdBy: opts.createdBy,
    visibility: opts.visibility ?? null, // null inherits the namespace's access level, live
    title: opts.title,
    locale: opts.locale,
  });
  return { id: node.id, locale: node.locale };
}

// The caller validates the upload (ALLOWED_DOCUMENT_MIME, MAX_DOCUMENT_BYTES,
// matchesDocumentType). On a link this is the switch to 'upload', the URL
// dropped in the same update. Returns the source before, for the audit event.
export async function replaceDocumentBytes(
  id: string,
  opts: { bytes: Buffer; mime: string; filename: string }
): Promise<DocumentSource | null> {
  const sha256 = createHash('sha256').update(opts.bytes).digest('hex');
  let searchText = '';
  try {
    searchText = await extractText(opts.bytes, opts.mime);
  } catch {
    searchText = '';
  }
  return db.begin(async (sql) => {
    const [before] = await sql<{ source: DocumentSource; locale: string }[]>`
      select d.source, n.locale from documents d join nodes n on n.id = d.id where d.id = ${id} for update of d`;
    if (!before) return null;
    if (before.source === 'plugin') throw sourceFixed();
    await sql`
      update documents set source = 'upload', external_url = null,
        filename = ${opts.filename}, mime = ${opts.mime}, size = ${opts.bytes.length},
        bytes = ${opts.bytes}, sha256 = ${sha256}, search_text = ${searchText},
        detected_locale = ${suggestedLocale(searchText, before.locale)}
      where id = ${id}`;
    await touchNode(sql, id);
    return before.source;
  });
}

// The caller validates the URL (parseExternalUrl). On an upload this is the
// switch to 'link': the stored file and its extracted text are deleted in the
// same update, so none outlives it. Returns the source before, for the audit event.
export async function setDocumentLink(id: string, url: string): Promise<DocumentSource | null> {
  return db.begin(async (sql) => {
    const [before] = await sql<{ source: DocumentSource }[]>`select source from documents where id = ${id} for update`;
    if (!before) return null;
    if (before.source === 'plugin') throw sourceFixed();
    await sql`
      update documents set source = 'link', external_url = ${url},
        filename = '', mime = null, size = null, bytes = null, sha256 = null, search_text = '',
        detected_locale = null
      where id = ${id}`;
    await touchNode(sql, id);
    return before.source;
  });
}

// A document from an integration keeps its source: its file lives with the
// other service, and the integration alone re-binds it (docs/architecture/plugins.md).
function sourceFixed(): Error {
  return new CodedError('source_fixed', "A document from an integration keeps its source");
}

// Only ever offered to the author, never applied (docs/architecture/languages.md).
function suggestedLocale(text: string, current: string): string | null {
  const detected = detectLocale(text, enabledLocales());
  return detected && detected !== current ? detected : null;
}

export async function clearDocumentLocaleSuggestion(id: string): Promise<void> {
  await db`update documents set detected_locale = null where id = ${id}`;
}

// The metadata half of documents.search_tsv; call it after every write to a
// property, a tag or source_search. scripts/backfill-search.ts runs the same expression.
export async function refreshDocumentSearchMeta(id: string, sql: TxSql = db): Promise<void> {
  await sql`
    update documents d set search_meta = trim(concat_ws(' ',
      (select string_agg(p.value, ' ' order by p.name, p.value) from node_properties p where p.node_id = d.id),
      (select string_agg(t.tag, ' ' order by t.tag) from node_tags t where t.node_id = d.id),
      d.source_search
    ))
    where d.id = ${id}`;
}

/** Every plugin's document id, for maintenance across integrations. */
export async function pluginDocumentIds(): Promise<string[]> {
  const rows = await db<{ id: string }[]>`select id from documents where source = 'plugin' order by id`;
  return rows.map((r) => r.id);
}

/** Sets the names a plugin's source reports, which search matches beside the title, and refreshes search_meta. */
export async function setDocumentSourceSearch(id: string, text: string, sql: TxSql = db): Promise<void> {
  const rows = await sql`update documents set source_search = ${text || null} where id = ${id} and source = 'plugin' returning id`;
  if (rows.length > 0) await refreshDocumentSearchMeta(id, sql);
}

// A slug is unique within its namespace across every node kind, since it lives
// on `nodes` (assertSlugAvailable).
export async function renameDocument(id: string, changes: { title?: string; slug?: string }): Promise<DocumentRow | null> {
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

  if (title === undefined && slug === undefined) return getDocument(id);

  return db.begin(async (sql) => {
    if (title !== undefined) {
      // search_title mirrors nodes.title: the generated search_tsv can't read another table.
      await sql`update nodes set title = ${title} where id = ${id}`;
      await sql`update documents set search_title = ${title} where id = ${id}`;
    }
    if (slug !== undefined) {
      await sql`update nodes set slug = ${slug} where id = ${id}`;
    }
    await touchNode(sql, id);
    const [row] = await sql<DocumentRow[]>`select ${sql.unsafe(DOCUMENT_COLUMNS)} ${sql.unsafe(DOCUMENT_FROM)} where d.id = ${id}`;
    return row ?? null;
  });
}

// Null for a document without a stored file, as for a missing one, so every
// serving path 404s rather than failing.
export async function getDocumentBytes(
  id: string
): Promise<{ mime: string; size: number; filename: string; bytes: Buffer } | null> {
  const [row] = await db<{ mime: string; size: number; filename: string; bytes: Buffer }[]>`
    select mime, size, filename, bytes from documents where id = ${id} and source = 'upload'`;
  if (!row) return null;
  return { mime: row.mime, size: row.size, filename: row.filename, bytes: Buffer.from(row.bytes) };
}

// Not access-checked: the caller checks. Null for a document without a stored file.
export async function getDocumentText(id: string): Promise<{ mime: string; text: string } | null> {
  const data = await getDocumentBytes(id);
  if (!data) return null;
  return { mime: data.mime, text: await extractText(data.bytes, data.mime) };
}

export async function getDocumentShares(id: string): Promise<string[]> {
  const rows = await db<{ user_id: string }[]>`select user_id from document_shares where document_id = ${id}`;
  return rows.map((r) => r.user_id);
}

export async function setDocumentShares(id: string, userIds: unknown): Promise<string[]> {
  const ids = Array.isArray(userIds) ? [...new Set(userIds.map((u) => String(u)))] : [];
  await db.begin(async (sql) => {
    await sql`delete from document_shares where document_id = ${id}`;
    for (const uid of ids) {
      await sql`insert into document_shares (document_id, user_id) values (${id}, ${uid}) on conflict do nothing`;
    }
  });
  return ids;
}

// Document writes are owner or admin only, so they need no lookup and stay synchronous.
export function userCanWriteDocument(user: SessionUser | null, doc: DocumentRow): boolean {
  return canWriteNode(user, doc, 'document');
}

export async function userCanReadDocument(user: SessionUser | null, doc: DocumentRow): Promise<boolean> {
  return userCanReadNode(user, doc, 'document');
}

export async function listDocumentsForUser(user: SessionUser | null): Promise<DocumentRow[]> {
  return db<DocumentRow[]>`
    select ${db.unsafe(DOCUMENT_COLUMNS)} ${db.unsafe(DOCUMENT_FROM)}
    where ${readableNodes(user, 'n')} order by n.created_at desc`;
}
