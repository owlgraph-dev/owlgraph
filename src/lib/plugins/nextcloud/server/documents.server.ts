// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Documents made from Nextcloud files, from a collection's share or from the
// editor's own files. Each step looks the file up first: a node is only made
// for, or bound to, a file that exists with the requested id. An own-files
// document stores only the file's facts: whether one viewer finds it among
// their files says nothing to anyone else.
import type { PluginFile, PluginHost, PluginNode, PluginRequest } from '$lib/plugins/api';
import { checkSharePath, parentOf } from '../sharePath';
import { propfind, shareAccess, turnedOff, type DavAccess, type DavProblem } from './client.server';
import { collectionRef, documentRef, hintFields, isFileId, type DocumentRef, type SourceStatus } from './refs';
import { secretOf } from './listing.server';
import { resolveNode, viewerAccess } from './resolve.server';
import type { DavEntry } from './propfind.server';
import { t } from '../messages';

type LookUpProblem = DavProblem | 'connect' | 'renew';

const STATUS_OF_PROBLEM: Record<LookUpProblem, number> = {
  disabled: 409,
  unconfigured: 409,
  unauthorized: 409,
  revoked: 409,
  notFound: 409,
  refused: 409,
  tooLarge: 409,
  connect: 409,
  renew: 409,
  unreachable: 502,
};

const fileOf = (entry: DavEntry): PluginFile => ({ filename: entry.name, mime: entry.mime, size: entry.size });

export interface DocumentView {
  id: string;
  title: string;
  href: string;
  content: { view: string; download: string } | null;
  file: PluginFile | null;
  /** Null for an own-files document. */
  path: string | null;
  fileid: string | null;
  /** Picked from someone's own files: each viewer reads it with their own connection, or not at all. */
  own: boolean;
  modified: string | null;
  status: SourceStatus;
  checkedAt: string | null;
  seenAt: string | null;
  collectionId: string | null;
  /** Only when the viewer may read the collection. */
  location: { collection: string; folder: string } | null;
  /** Why this viewer can't read an own-files document now; answered per viewer, never stored. */
  access?: 'connect' | 'renew' | 'unavailable';
  connectHref?: string;
}

/** While the plugin is off: the node alone, since nothing of its file could be served. */
function offView(node: PluginNode): DocumentView {
  return {
    id: node.id,
    title: node.title,
    href: node.href,
    content: null,
    file: null,
    path: null,
    fileid: null,
    own: false,
    modified: null,
    status: 'disabled',
    checkedAt: null,
    seenAt: null,
    collectionId: null,
    location: null,
  };
}

export async function documentView(host: PluginHost, node: PluginNode): Promise<DocumentView> {
  if (await turnedOff(host)) return offView(node);
  const ref = documentRef(node.ref);
  let location: DocumentView['location'] = null;
  if (ref?.collectionId && ref.path !== null) {
    const collection = await host.nodes.read(ref.collectionId);
    if (collection) location = { collection: collectionRef(collection.ref).name || collection.title, folder: parentOf(ref.path) ?? '' };
  }
  return {
    id: node.id,
    title: node.title,
    href: node.href,
    content: node.content,
    file: node.file,
    path: ref?.path ?? null,
    fileid: ref?.fileid ?? null,
    own: !!ref && ref.path === null,
    modified: ref?.modified ?? null,
    status: ref?.status ?? 'unconfigured',
    checkedAt: ref?.checkedAt ?? null,
    seenAt: ref?.seenAt ?? null,
    collectionId: ref?.collectionId ?? null,
    location,
  };
}

/** The entry at `path` under an access, if it is the file with `fileid`. */
async function fileAt(host: PluginHost, access: DavAccess, path: string, fileid: string, operation: string): Promise<{ ok: true; entry: DavEntry } | { ok: false; problem: DavProblem }> {
  const looked = await propfind(host, access, path, 0, operation);
  if (!looked.ok) return looked;
  const entry = looked.entries.find((e) => e.path === path);
  return entry && !entry.folder && entry.fileid === fileid ? { ok: true, entry } : { ok: false, problem: 'notFound' };
}

async function lookUpShared(host: PluginHost, nodeId: string, path: string, fileid: string, operation: string): Promise<{ ok: true; entry: DavEntry } | { ok: false; problem: DavProblem }> {
  if (await turnedOff(host)) return { ok: false, problem: 'disabled' };
  const secret = await secretOf(host, nodeId);
  if (!secret) return { ok: false, problem: 'unconfigured' };
  return fileAt(host, shareAccess(secret), path, fileid, operation);
}

async function lookUpOwn(host: PluginHost, path: string, fileid: string, operation: string): Promise<{ ok: true; entry: DavEntry; uid: string } | { ok: false; problem: LookUpProblem }> {
  if (await turnedOff(host)) return { ok: false, problem: 'disabled' };
  const access = await viewerAccess(host);
  if (!access) return { ok: false, problem: (await host.connection.status()) === 'none' ? 'connect' : 'renew' };
  const found = await fileAt(host, access, path, fileid, operation);
  return found.ok ? { ...found, uid: access.root.uid } : found.problem === 'refused' ? { ok: false, problem: 'renew' } : found;
}

function refOf(path: string, entry: DavEntry, collectionId: string | null): DocumentRef {
  const now = new Date().toISOString();
  return { path, fileid: entry.fileid!, hint: null, etag: entry.etag, modified: entry.modified, status: 'ok', checkedAt: now, seenAt: now, collectionId };
}

function ownRefOf(path: string, entry: DavEntry, uid: string): Record<string, unknown> {
  const now = new Date().toISOString();
  return { fileid: entry.fileid!, ...hintFields({ path, uid }), etag: entry.etag, modified: entry.modified, status: 'ok', checkedAt: now, seenAt: now, collectionId: null };
}

/** A share's record has no hint. */
const stored = ({ hint: _hint, ...ref }: DocumentRef): Record<string, unknown> => ref;

function fileQuery(body: unknown): { path: string; fileid: string } | null {
  const { path, fileid } = (body ?? {}) as { path?: unknown; fileid?: unknown };
  const checked = checkSharePath(path);
  return 'path' in checked && checked.path !== '' && isFileId(fileid) ? { path: checked.path, fileid } : null;
}

// A refusal's code, and the sentence for it from the dictionary (the core's for a code of its own).
const REFUSAL_OF_PROBLEM: Record<LookUpProblem, { code: string; message?: () => string }> = {
  disabled: { code: 'plugin_disabled', message: () => t('connect_disabled') },
  unconfigured: { code: 'plugin_disabled', message: () => t('connect_disabled') },
  unauthorized: { code: 'refused', message: () => t('connect_unauthorized') },
  revoked: { code: 'revoked', message: () => t('connect_revoked') },
  notFound: { code: 'not_found' },
  refused: { code: 'connection_renew', message: () => t('own_renew') },
  tooLarge: { code: 'too_large', message: () => t('connect_too_large') },
  connect: { code: 'connect_required', message: () => t('own_connect') },
  renew: { code: 'connection_renew', message: () => t('own_renew') },
  unreachable: { code: 'upstream_unreachable', message: () => t('connect_unreachable') },
};

const refused = (host: PluginHost, problem: LookUpProblem) => {
  const refusal = REFUSAL_OF_PROBLEM[problem];
  return host.respond.error(STATUS_OF_PROBLEM[problem], refusal.code, refusal.message?.());
};

const createRefused = (host: PluginHost, reason: 'forbidden' | 'not-found' | 'no-secret-key') =>
  reason === 'forbidden' ? host.respond.error(403, 'forbidden') : reason === 'no-secret-key' ? host.respond.error(409, 'secret_key_missing', t('connect_no_key')) : host.respond.error(404, 'not_found');

/**
 * POST documents { collectionId, path, fileid } — the collection's document for one of its share's files;
 * POST documents { besidePageId, own: { path, fileid } } — a document of a file of the editor's own Nextcloud, beside the page.
 */
export async function createDocumentRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const body = (request.body ?? {}) as { collectionId?: unknown; besidePageId?: unknown; own?: unknown };
  if (body.own !== undefined) {
    const own = fileQuery(body.own);
    if (typeof body.besidePageId !== 'string' || !own) return host.respond.error(400, 'invalid_request');
    const looked = await lookUpOwn(host, own.path, own.fileid, 'documents:create:own');
    if (!looked.ok) return refused(host, looked.problem);
    const result = await host.nodes.createDocument({
      besidePageId: body.besidePageId,
      title: looked.entry.name,
      file: fileOf(looked.entry),
      ref: ownRefOf(own.path, looked.entry, looked.uid),
      match: { fileid: own.fileid },
    });
    if (!result.ok) return createRefused(host, result.reason);
    return host.respond.json({ document: await documentView(host, result.node), created: result.created }, result.created ? 201 : 200);
  }
  const file = fileQuery(request.body);
  if (typeof body.collectionId !== 'string' || !file) return host.respond.error(400, 'invalid_request');
  const collection = await host.nodes.read(body.collectionId);
  if (!collection || collection.type !== 'collection') return host.respond.error(404, 'not_found');
  if (!(await host.nodes.canWrite(collection.id))) return host.respond.error(403, 'forbidden');
  const looked = await lookUpShared(host, collection.id, file.path, file.fileid, 'documents:create');
  if (!looked.ok) return refused(host, looked.problem);
  const result = await host.nodes.createDocument({
    collectionId: collection.id,
    title: looked.entry.name,
    file: fileOf(looked.entry),
    ref: stored(refOf(file.path, looked.entry, collection.id)),
    match: { fileid: file.fileid },
  });
  if (!result.ok) return createRefused(host, result.reason);
  return host.respond.json({ document: await documentView(host, result.node), created: result.created }, result.created ? 201 : 200);
}

/** GET documents?q= — the documents the viewer may read, for the file block's picker. */
export async function searchDocumentsRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const found = await host.nodes.search('document', (request.query.get('q') ?? '').slice(0, 200), { limit: 20 });
  const documents = await Promise.all(found.map((node) => documentView(host, node)));
  return host.respond.json((await turnedOff(host)) ? { documents, reason: 'disabled' } : { documents });
}

/** GET documents/:id */
export async function getDocumentRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const doc = await host.nodes.read(request.params.id ?? '');
  if (!doc || doc.type !== 'document') return host.respond.error(404, 'not_found');
  return host.respond.json({ document: await documentView(host, doc) });
}

/**
 * PATCH documents/:id { path, fileid } — a share's document bound to another file of its share;
 * PATCH documents/:id { own: { path, fileid } } — a document of someone's own files bound to another of the editor's.
 * Its node and edges are kept either way.
 */
export async function rebindDocumentRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const doc = await host.nodes.read(request.params.id ?? '');
  if (!doc || doc.type !== 'document') return host.respond.error(404, 'not_found');
  if (!(await host.nodes.canWrite(doc.id))) return host.respond.error(403, 'forbidden');
  const before = documentRef(doc.ref);
  const own = (request.body as { own?: unknown } | undefined)?.own;
  if (own !== undefined) {
    // A share's document stays with its share; an own-files document with own files.
    const file = fileQuery(own);
    if (!file || (before && before.path !== null)) return host.respond.error(400, 'invalid_request');
    const looked = await lookUpOwn(host, file.path, file.fileid, 'documents:rebind:own');
    if (!looked.ok) return refused(host, looked.problem);
    await host.nodes.rebind(doc.id, { ref: ownRefOf(file.path, looked.entry, looked.uid), file: fileOf(looked.entry) });
  } else {
    const file = fileQuery(request.body);
    if (!file || (before && before.path === null)) return host.respond.error(400, 'invalid_request');
    const looked = await lookUpShared(host, doc.id, file.path, file.fileid, 'documents:rebind');
    if (!looked.ok) return refused(host, looked.problem);
    await host.nodes.rebind(doc.id, { ref: stored(refOf(file.path, looked.entry, before?.collectionId ?? null)), file: fileOf(looked.entry) });
    if (before && before.status !== 'ok') host.log.sourceState({ nodeId: doc.id, from: before.status, to: 'ok' });
  }
  const after = await host.nodes.read(doc.id);
  return host.respond.json({ document: after ? await documentView(host, after) : null });
}

/**
 * POST documents/:id/check — the file looked up again as the editor reads it.
 * Through the share its state is stored; through the editor's own files only
 * the file is, and a miss is answered to the editor, never stored.
 */
export async function checkDocumentRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const doc = await host.nodes.read(request.params.id ?? '');
  if (!doc || doc.type !== 'document') return host.respond.error(404, 'not_found');
  if (!(await host.nodes.canWrite(doc.id))) return host.respond.error(403, 'forbidden');
  if (await turnedOff(host)) return host.respond.json({ document: await documentView(host, doc), problem: 'disabled' });
  const ref = documentRef(doc.ref);
  if (!ref) return host.respond.error(409, 'plugin_disabled', t('connect_disabled'));
  const resolution = await resolveNode(host, doc, { operation: 'documents:check', fresh: true });
  let problem: string | null = null;
  if (resolution.via === 'user') {
    const found = await fileAt(host, resolution.access, resolution.base, ref.fileid, 'documents:check:own');
    if (found.ok) {
      const now = new Date().toISOString();
      await host.nodes.rebind(doc.id, { ref: { ...doc.ref, etag: found.entry.etag, modified: found.entry.modified, seenAt: now }, file: fileOf(found.entry) });
    } else problem = found.problem;
  } else if (resolution.via === 'node') {
    const looked = await lookUpShared(host, doc.id, resolution.base, ref.fileid, 'documents:check');
    const status: SourceStatus = looked.ok ? 'ok' : looked.problem === 'refused' ? 'unauthorized' : looked.problem;
    await host.nodes.rebind(doc.id, {
      ref: looked.ok ? stored(refOf(resolution.base, looked.entry, ref.collectionId)) : { ...doc.ref, status, checkedAt: new Date().toISOString() },
      ...(looked.ok ? { file: fileOf(looked.entry) } : {}),
    });
    if (status !== ref.status) host.log.sourceState({ nodeId: doc.id, from: ref.status, to: status, ...(looked.ok ? {} : { reason: status }) });
  } else {
    problem = resolution.reason === 'unavailable' ? (resolution.problem ?? 'notFound') : resolution.reason;
  }
  const after = await host.nodes.read(doc.id);
  const view = after ? await documentView(host, after) : null;
  if (view && problem && ref.path === null) {
    view.access = problem === 'connect' || problem === 'renew' ? problem : 'unavailable';
    if (problem === 'connect' || problem === 'renew') view.connectHref = host.connection.href(request.query.get('r') ?? undefined);
  }
  return host.respond.json({ document: view, ...(problem ? { problem } : {}) });
}

/** Why this viewer can't read an own-files document, from the database alone; null when they can or it is a share's. */
export async function ownAccess(host: PluginHost, view: DocumentView): Promise<Pick<DocumentView, 'access' | 'connectHref'> | null> {
  if (!view.own) return null;
  if (host.viewerId === null) return { access: 'unavailable' };
  const status = await host.connection.status();
  if (status === 'active') return null;
  return { access: status === 'none' ? 'connect' : 'renew', connectHref: host.connection.href() };
}
