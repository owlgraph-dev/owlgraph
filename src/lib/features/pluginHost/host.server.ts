// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugin host (docs/architecture/plugins.md, "The host"). A server half reaches the
// core's data, the network and the response rules only through this object, so
// each rule is enforced here once: only the plugin's own nodes, each checked for
// the viewer; secrets and connections opened only for whom and where they were
// sealed; one client pinned to the plugin's origin; redirects only to this app.
import { db, type TxSql } from '$lib/platform/db.server';
import { logEvent, type Logger } from '$lib/platform/logger.server';
import { secretBox, SecretKeyMissing } from '$lib/platform/secretBox.server';
import { upstreamClient } from '$lib/platform/upstream.server';
import { servedFileHeaders } from '$lib/platform/servedFile';
import type { SessionUser } from '$lib/features/auth/server';
import { nodePath, type Visibility } from '$lib/features/nodes';
import { documentContentPath } from '$lib/features/documents';
import { getNodeType, resolveShareLink } from '$lib/features/nodes/server';
import { getPage, userCanWritePage } from '$lib/features/pages/server';
import {
  addMember,
  createCollection,
  findMemberDocument,
  getCollection,
  getCollectionSourceRef,
  listCollectionsForUser,
  lockCollection,
  memberDocumentsOf,
  setCollectionSourceRef,
  userCanReadCollection,
  userCanWriteCollection,
  type CollectionRow,
} from '$lib/features/collections/server';
import {
  createPluginDocument,
  findPluginDocument,
  getDocument,
  getDocumentSourceRef,
  listPluginDocumentsForUser,
  lockPluginDocument,
  setDocumentSourceRef,
  userCanReadDocument,
  userCanWriteDocument,
  type DocumentRow,
} from '$lib/features/documents/server';
import { pluginManifest } from '$lib/plugins';
import type { PluginFile, PluginHost, PluginNode, PluginNodes, PluginOpenConnection, PluginViewerConnection, PluginWriteResult } from '$lib/plugins/api';
import * as m from '$lib/paraglide/messages';
import { getPluginSettings, pluginOrigin } from './settings.server';
import { sealedSecretOf, storeSealedSecret } from './secrets.server';
import { bindSecret, openBoundSecret, type SecretBinding } from './boundSecret';
import { createGrants } from './grants.server';
import { indexSourceSearch } from './sourceSearch.server';
import { connectionOf, markRevoked, openCredential, touchConnection, type ConnectionRow } from './connections.server';
import { apiErrorBody, isApiErrorCode, pluginError, textError } from '$lib/platform/apiErrors';

export interface HostContext {
  user: SessionUser | null;
  /** The interface language. */
  locale: string;
  log: Logger;
  /** The share link the request came through: its node is readable, and its grants re-check it. */
  shareLink?: { token: string; nodeId: string } | null;
  /** The page being rendered, where a viewer who connects their account returns to. */
  returnTo?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// A redirect stays on this app: an absolute path, not protocol-relative, with no
// backslash or whitespace a browser could read as a way off it.
const APP_PATH = /^\/(?![/\\])[^\s\\]*$/;

type Loaded = { type: 'collection'; row: CollectionRow } | { type: 'document'; row: DocumentRow };

const fileOf = (row: { filename: string; mime: string | null; size: number | null }): PluginFile => ({
  filename: row.filename,
  mime: row.mime,
  size: row.size,
});

// The core's content route, which asks the plugin (serveDocument) once it has checked the reader.
const contentOf = (id: string) => ({ view: documentContentPath(id), download: documentContentPath(id, { download: true }) });

/** Seals a node's credential for that node at its service's address. Throws SecretKeyMissing without a usable key. */
function sealSecret(secret: string, binding: SecretBinding): string {
  return secretBox().seal('node-source-secret', bindSecret(secret, binding));
}

/** Null unless the credential opens as that node's, at that address. */
function openSecret(sealed: string, binding: SecretBinding): string | null {
  let plaintext: string | null;
  try {
    plaintext = secretBox().open('node-source-secret', sealed);
  } catch {
    return null;
  }
  return plaintext === null ? null : openBoundSecret(plaintext, binding);
}

export function createPluginHost(pluginId: string, ctx: HostContext): PluginHost {
  const manifest = pluginManifest(pluginId);
  if (!manifest) throw new Error(`No plugin '${pluginId}' is registered`);
  const user = ctx.user;
  // Nodes this request may read whatever the viewer's own access says: the
  // share link's node and those of the grants it redeemed.
  const granted = new Set<string>(ctx.shareLink ? [ctx.shareLink.nodeId] : []);

  async function load(id: string): Promise<Loaded | null> {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const type = await getNodeType(id);
    if (type === 'collection') {
      const row = await getCollection(id);
      return row && row.plugin === pluginId ? { type, row } : null;
    }
    if (type === 'document') {
      const row = await getDocument(id);
      return row && row.source === 'plugin' && row.plugin === pluginId ? { type, row } : null;
    }
    return null;
  }

  async function readable(node: Loaded): Promise<boolean> {
    if (granted.has(node.row.id)) return true;
    return node.type === 'collection' ? userCanReadCollection(user, node.row) : userCanReadDocument(user, node.row);
  }

  async function writable(node: Loaded): Promise<boolean> {
    if (!user) return false;
    return node.type === 'collection' ? userCanWriteCollection(user, node.row) : userCanWriteDocument(user, node.row);
  }

  /** `knownRef` when the caller's query already read the record. */
  async function view(node: Loaded, knownRef?: Record<string, unknown> | null): Promise<PluginNode> {
    const ref =
      knownRef !== undefined
        ? knownRef
        : node.type === 'collection'
          ? await getCollectionSourceRef(node.row.id)
          : await getDocumentSourceRef(node.row.id);
    return {
      id: node.row.id,
      type: node.type,
      title: node.row.title,
      href: nodePath(node.row.namespace_slug, node.row.slug),
      ref: ref ?? {},
      file: node.type === 'document' ? fileOf(node.row) : null,
      content: node.type === 'document' ? contentOf(node.row.id) : null,
    };
  }

  /** The origin as configured now: what the client is pinned to and a connection must have been made against. */
  const pinnedOrigin = () => pluginOrigin(manifest);

  /** Gives a document made from a collection the collection's credential, sealed anew for it; none when that does not open. */
  async function copySecret(sql: TxSql, fromId: string, toId: string): Promise<void> {
    const origin = await pinnedOrigin();
    const sealed = origin ? await sealedSecretOf(fromId, pluginId, sql) : null;
    const value = sealed && origin ? openSecret(sealed, { node: fromId, origin }) : null;
    if (value !== null && origin) await storeSealedSecret(sql, toId, pluginId, sealSecret(value, { node: toId, origin }));
  }

  async function besidePage(pageId: unknown): Promise<{ page: NonNullable<Awaited<ReturnType<typeof getPage>>> } | { refused: 'forbidden' | 'not-found' }> {
    if (!user) return { refused: 'forbidden' };
    if (typeof pageId !== 'string' || !UUID.test(pageId)) return { refused: 'not-found' };
    const page = await getPage(pageId);
    if (!page) return { refused: 'not-found' };
    return (await userCanWritePage(user, page)) ? { page } : { refused: 'forbidden' };
  }

  async function readNode(id: string): Promise<PluginNode | null> {
    const node = await load(id);
    return node && (await readable(node)) ? view(node) : null;
  }

  const nodes: PluginNodes = {
    read: readNode,

    async canWrite(id) {
      const node = await load(id);
      return !!node && (await writable(node));
    },

    async members(collectionId) {
      const node = await load(collectionId);
      if (!node || node.type !== 'collection' || !(await readable(node))) return [];
      const rows = await memberDocumentsOf(collectionId, pluginId, user);
      return rows.map((r) => ({
        id: r.id,
        type: 'document' as const,
        title: r.title,
        href: nodePath(r.namespace_slug, r.slug),
        ref: r.source_ref,
        file: fileOf(r),
        content: contentOf(r.id),
      }));
    },

    async search(type, q, opts = {}) {
      const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
      const found: { node: Loaded; ref?: Record<string, unknown> }[] =
        type === 'collection'
          ? (await listCollectionsForUser(user, { plugin: pluginId, q, limit })).map((row) => ({ node: { type: 'collection' as const, row } }))
          : (await listPluginDocumentsForUser(user, { plugin: pluginId, q, limit })).map((row) => ({
              node: { type: 'document' as const, row },
              ref: row.source_ref,
            }));
      const out: PluginNode[] = [];
      for (const { node, ref } of found) if (!opts.writable || (await writable(node))) out.push(await view(node, ref));
      return out;
    },

    async mayCreateBeside(pageId) {
      const beside = await besidePage(pageId);
      return 'page' in beside ? 'ok' : beside.refused;
    },

    async createCollection(input): Promise<PluginWriteResult> {
      const beside = await besidePage(input.besidePageId);
      if (!('page' in beside) || !user) return { ok: false, reason: 'page' in beside ? 'forbidden' : beside.refused };
      const { page } = beside;
      // A secret is sealed for the collection at the address it was checked
      // against, so none can be stored while the integration is off.
      const origin = input.secret === undefined ? null : await pinnedOrigin();
      if (input.secret !== undefined && !origin) return { ok: false, reason: 'not-found' };
      let id: string;
      try {
        ({ id } = await db.begin(async (sql) => {
          const created = await createCollection(
            {
              title: input.title,
              createdBy: user.id,
              user,
              namespaceId: page.namespace_id,
              locale: page.locale,
              // No wider than the page it is made beside.
              visibility: page.visibility as Visibility | null,
              plugin: pluginId,
              sourceRef: input.ref,
            },
            sql
          );
          if (input.secret !== undefined && origin) await storeSealedSecret(sql, created.id, pluginId, sealSecret(input.secret, { node: created.id, origin }));
          return created;
        }));
      } catch (e) {
        // Without a key nothing is made: the collection would hold no credential.
        if (e instanceof SecretKeyMissing) return { ok: false, reason: 'no-secret-key' };
        if ((e as { code?: string }).code === 'namespace_membership_required') return { ok: false, reason: 'forbidden' };
        throw e;
      }
      logEvent(ctx.log, 'node.created', { nodeId: id, nodeType: 'collection', namespaceId: page.namespace_id, actorId: user.id });
      await indexSourceSearch('collection', id, ctx.log);
      const node = await load(id);
      return node ? { ok: true, node: await view(node), created: true } : { ok: false, reason: 'not-found' };
    },

    async createDocument(input): Promise<PluginWriteResult> {
      // Never empty: an empty match would take any member for the file.
      const matchKeys = Object.keys(input.match);
      if (matchKeys.length === 0) throw new Error('createDocument: match names what identifies the file');
      for (const key of matchKeys) {
        if (input.ref[key] !== input.match[key]) throw new Error(`createDocument: match.${key} is not the record's`);
      }
      if (!user) return { ok: false, reason: 'forbidden' };
      // In the namespace of what it is made from, and no wider than it.
      const newDocument = (sql: Parameters<typeof createPluginDocument>[1], place: { namespace_id: string; locale: string; visibility: string | null }) =>
        createPluginDocument(
          {
            plugin: pluginId,
            ref: input.ref,
            title: input.title,
            file: input.file,
            createdBy: user.id,
            user,
            namespaceId: place.namespace_id,
            locale: place.locale,
            visibility: place.visibility as Visibility | null,
          },
          sql
        );
      let made: { id: string; created: boolean } | null;
      let namespaceId: string;
      try {
        if (input.collectionId !== undefined) {
          // A member, holding the collection's credential sealed anew for it.
          const collection = await load(input.collectionId);
          if (!collection || collection.type !== 'collection' || !(await readable(collection))) return { ok: false, reason: 'not-found' };
          if (!(await writable(collection))) return { ok: false, reason: 'forbidden' };
          namespaceId = collection.row.namespace_id;
          made = await db.begin(async (sql) => {
            if (!(await lockCollection(sql, collection.row.id))) return null;
            const existing = await findMemberDocument(sql, collection.row.id, pluginId, input.match);
            if (existing) return { id: existing, created: false };
            const doc = await newDocument(sql, collection.row);
            await copySecret(sql, collection.row.id, doc.id);
            await addMember(sql, collection.row.id, doc.id);
            return { id: doc.id, created: true };
          });
        } else {
          // One per file in the page's namespace, with no credential.
          if (typeof input.besidePageId !== 'string' || !UUID.test(input.besidePageId)) return { ok: false, reason: 'not-found' };
          const page = await getPage(input.besidePageId);
          if (!page) return { ok: false, reason: 'not-found' };
          if (!(await userCanWritePage(user, page))) return { ok: false, reason: 'forbidden' };
          namespaceId = page.namespace_id;
          const where = { namespaceId: page.namespace_id, plugin: pluginId, match: input.match };
          made = await db.begin(async (sql) => {
            await lockPluginDocument(sql, where);
            const existing = await findPluginDocument(sql, where);
            if (existing) return { id: existing, created: false };
            return { id: (await newDocument(sql, page)).id, created: true };
          });
        }
      } catch (e) {
        if ((e as { code?: string }).code === 'namespace_membership_required') return { ok: false, reason: 'forbidden' };
        throw e;
      }
      if (!made) return { ok: false, reason: 'not-found' };
      if (made.created) {
        logEvent(ctx.log, 'node.created', {
          nodeId: made.id,
          nodeType: 'document',
          namespaceId,
          actorId: user.id,
          source: 'plugin',
        });
        await indexSourceSearch('document', made.id, ctx.log);
      }
      // One made earlier by someone else may be theirs alone to read.
      const node = await load(made.id);
      if (!node || !(await readable(node))) return { ok: false, reason: 'forbidden' };
      return { ok: true, node: await view(node), created: made.created };
    },

    async rebind(id, input) {
      const node = await load(id);
      if (!node || !(await writable(node))) return false;
      const written = node.type === 'collection' ? await setCollectionSourceRef(id, input.ref) : await setDocumentSourceRef(id, input.ref, input.file);
      if (written) await indexSourceSearch(node.type, id, ctx.log);
      return written;
    },

    async observe(id, ref) {
      const node = await load(id);
      if (!node || !(await readable(node))) return false;
      const written = node.type === 'collection' ? await setCollectionSourceRef(id, ref) : await setDocumentSourceRef(id, ref);
      if (written) await indexSourceSearch(node.type, id, ctx.log);
      return written;
    },
  };

  // Looked up once a request. A share link's viewer has none: they see what
  // anyone may.
  let viewerRow: Promise<ConnectionRow | null> | null = null;
  const rowOfViewer = () => (viewerRow ??= user && !ctx.shareLink && manifest.connections ? connectionOf(user.id, pluginId) : Promise.resolve(null));
  let opened: Promise<PluginOpenConnection | null> | null = null;

  const connection: PluginViewerConnection = {
    async status() {
      const row = await rowOfViewer();
      if (!row) return 'none';
      return row.status === 'active' && row.origin === (await pinnedOrigin()) ? 'active' : 'renew';
    },

    open() {
      return (opened ??= (async () => {
        const row = await rowOfViewer();
        if (!row || row.status !== 'active') return null;
        const origin = await pinnedOrigin();
        // Made against another address: never sent to this one.
        if (!origin || row.origin !== origin) return null;
        const credential = openCredential(row);
        if (!credential) return null;
        void touchConnection(row.id).catch(() => {});
        return { id: row.id, accountId: row.account_id, accountLabel: row.account_label || row.account_id, credential };
      })());
    },

    async refused(connectionId) {
      const row = await rowOfViewer();
      // Only the viewer's own connection, and only the one this request read with.
      if (!user || !row || row.id !== connectionId) return;
      const changed = await markRevoked(connectionId);
      viewerRow = Promise.resolve({ ...row, status: 'revoked' });
      opened = Promise.resolve(null);
      if (changed) logEvent(ctx.log, 'integration.connection_state', { plugin: pluginId, connectionId, subjectId: user.id, from: 'active', to: 'revoked' });
    },

    href(returnTo = ctx.returnTo ?? undefined) {
      const back = typeof returnTo === 'string' && APP_PATH.test(returnTo) ? returnTo : null;
      return back ? `/settings/connections?return=${encodeURIComponent(back)}` : '/settings/connections';
    },
  };

  const grants = createGrants({
    pluginId,
    viewerId: user?.id ?? null,
    shareLink: ctx.shareLink?.token ?? null,
    seal: (plaintext) => secretBox().seal('signed-url', plaintext),
    open: (sealed) => {
      try {
        return secretBox().open('signed-url', sealed);
      } catch {
        return null;
      }
    },
    now: Date.now,
    canRead: async (nodeId) => {
      const node = await load(nodeId);
      return !!node && (await readable(node));
    },
    shareLinkGrants: async (token, nodeId) => (await resolveShareLink(token, ctx.log))?.nodeId === nodeId,
    granted: (nodeId) => granted.add(nodeId),
    openConnection: () => connection.open(),
  });

  const noStore = { 'cache-control': 'private, no-store' };

  return {
    pluginId,
    viewerId: user?.id ?? null,
    locale: ctx.locale,

    settings: () => getPluginSettings(manifest),

    async upstream() {
      const origin = await pinnedOrigin();
      return origin ? upstreamClient(origin) : null;
    },

    nodes,

    connection,

    secrets: {
      // Opens only as the node it was sealed for, at the address it was made for
      // (boundSecret.ts): copied to another node, or after the address changed, it opens as nothing.
      async get(nodeId) {
        const node = await load(nodeId);
        if (!node || !(await readable(node))) return null;
        const origin = await pinnedOrigin();
        const sealed = origin ? await sealedSecretOf(nodeId, pluginId) : null;
        return sealed && origin ? openSecret(sealed, { node: nodeId, origin }) : null;
      },
      async set(nodeId, secret) {
        const node = await load(nodeId);
        if (!node || !(await writable(node))) return false;
        const origin = await pinnedOrigin();
        if (!origin) return false;
        try {
          await storeSealedSecret(db, nodeId, pluginId, sealSecret(secret, { node: nodeId, origin }));
        } catch (e) {
          if (e instanceof SecretKeyMissing) return false;
          throw e;
        }
        return true;
      },
    },

    grants,

    respond: {
      json: (data, status = 200) =>
        new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...noStore } }),
      redirect(path) {
        if (!APP_PATH.test(path)) throw new Error('A plugin redirects to a path on this app only');
        return new Response(null, { status: 302, headers: { location: path, ...noStore, 'referrer-policy': 'no-referrer' } });
      },
      file: (input) =>
        new Response(input.body, {
          headers: servedFileHeaders({
            mime: input.mime,
            filename: input.filename,
            download: input.download,
            cacheControl: 'private, no-store',
            length: input.size,
          }),
        }),
      error: (status, code, message) =>
        pluginError(status, code, message ?? (isApiErrorCode(code) ? apiErrorBody(code).body.error.message : m.error_generic()), { headers: noStore }),
      notFound: () => textError('not_found', {}, { headers: noStore }),
      gone: () => textError('grant_expired', {}, { headers: noStore }),
      forbidden: (text) =>
        text === undefined ? textError('connection_renew', {}, { headers: noStore }) : new Response(text, { status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore } }),
    },

    log: {
      upstreamFailed: (fields) => logEvent(ctx.log, 'integration.upstream_failed', { plugin: pluginId, ...fields }),
      sourceState: (fields) => logEvent(ctx.log, 'integration.source_state', { plugin: pluginId, ...fields }),
    },
  };
}
