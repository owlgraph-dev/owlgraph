// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A node's files, passed on to readers (docs/architecture/plugins.md, "Grants"). A page's
// stable link redirects to a grant minted for this viewer and the way they read
// the node; redeeming it reads the same way, matches the file id (a renamed or
// replaced file is not the one granted) and streams under the core's served-file rules.
import type { PluginHost, PluginNode, PluginOpenConnection, PluginRequest } from '$lib/plugins/api';
import { checkSharePath, joinPath } from '../sharePath';
import { propfind, shareAccess, streamFile, userAccess, type DavAccess } from './client.server';
import { documentRef, isFileId } from './refs';
import { cacheSeconds, secretOf } from './listing.server';
import { noteShareAnswer, shareRefused } from './cache.server';
import { locate } from './locate.server';
import { resolveNode, rootOfNode } from './resolve.server';
import type { DavEntry } from './propfind.server';

const grantPath = (host: PluginHost, token: string) => `/api/plugins/${host.pluginId}/file/${token}`;

/** GET open?c=<collection>&p=<path>&f=<fileid>[&download=1] — a listing row's file. */
export async function openRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const collection = await host.nodes.read(request.query.get('c') ?? '');
  const checked = checkSharePath(request.query.get('p') ?? '');
  const fileid = request.query.get('f');
  if (!collection || collection.type !== 'collection' || 'problem' in checked || checked.path === '' || !isFileId(fileid)) {
    return host.respond.notFound();
  }
  const resolution = await resolveNode(host, collection, { operation: 'open' });
  if (resolution.via === null) return resolution.reason === 'renew' ? host.respond.forbidden() : host.respond.notFound();
  const detail = { p: checked.path, f: fileid, ...(request.query.get('download') === '1' ? { d: 1 } : {}) };
  const token = await host.grants.issue(collection.id, detail, { via: resolution.via });
  return token ? host.respond.redirect(grantPath(host, token)) : host.respond.notFound();
}

/** For the core's content routes: a redirect to a grant for the document's own file. */
export async function serveDocument(doc: PluginNode, opts: { download: boolean }, host: PluginHost): Promise<Response | null> {
  const ref = documentRef(doc.ref);
  if (!ref) return null;
  const resolution = await resolveNode(host, doc, { operation: 'content' });
  if (resolution.via === null) return resolution.reason === 'renew' ? host.respond.forbidden() : null;
  // Read through the share, the file is at its path there; through the viewer's own files, wherever its id is.
  const detail: Record<string, string | number> = resolution.via === 'node' ? { p: resolution.base, f: ref.fileid } : { f: ref.fileid };
  if (opts.download) detail.d = 1;
  const token = await host.grants.issue(doc.id, detail, { via: resolution.via });
  return token ? host.respond.redirect(grantPath(host, token)) : null;
}

/** GET file/<grant> */
export async function fileRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const grant = await host.grants.redeem(request.params.token ?? '');
  if (grant === 'expired') return host.respond.gone();
  if (grant === 'renew') return host.respond.forbidden();
  if (!grant) return host.respond.notFound();
  const { p, f, d } = grant.detail;
  if (!isFileId(f)) return host.respond.notFound();
  const node = await host.nodes.read(grant.nodeId);
  if (!node) return host.respond.notFound();
  return grant.via === 'user' ? serveOwn(host, node, grant.connection, p, f, d === 1) : serveShared(host, node, p, f, d === 1);
}

function respondFile(host: PluginHost, entry: DavEntry, file: { body: ReadableStream<Uint8Array>; size: number | null }, download: boolean): Response {
  return host.respond.file({ body: file.body, mime: entry.mime ?? 'application/octet-stream', filename: entry.name, size: file.size, download });
}

async function fileAt(host: PluginHost, access: DavAccess, path: string, fileid: string, operation: string): Promise<{ entry: DavEntry | null; problem: string | null }> {
  const looked = await propfind(host, access, path, 0, operation);
  const entry = looked.ok ? (looked.entries.find((e) => e.path === path) ?? null) : null;
  return entry && !entry.folder && entry.fileid === fileid ? { entry, problem: null } : { entry: null, problem: looked.ok ? 'notFound' : looked.problem };
}

async function serveShared(host: PluginHost, node: PluginNode, p: unknown, f: string, download: boolean): Promise<Response> {
  const checked = checkSharePath(p);
  if (typeof p !== 'string' || 'problem' in checked) return host.respond.notFound();
  if (node.type === 'document') {
    // A document grants its own file and nothing else; a collection any file below its root.
    const ref = documentRef(node.ref);
    if (!ref || ref.path !== checked.path || ref.fileid !== f) return host.respond.notFound();
  }
  const secret = await secretOf(host, node.id);
  const upstream = await host.upstream();
  if (!secret || !upstream) return host.respond.notFound();
  if (shareRefused(upstream.origin, secret, (await cacheSeconds(host)) * 1000)) return host.respond.notFound();
  const access = shareAccess(secret);
  const found = await fileAt(host, access, checked.path, f, 'file:lookup');
  if (found.problem === 'revoked' || found.problem === 'unauthorized') noteShareAnswer(upstream.origin, secret, found.problem);
  if (!found.entry) {
    if (node.type === 'document' && found.problem) await recordDocument(host, node, found.problem);
    return host.respond.notFound();
  }
  const file = await streamFile(host, access, checked.path, 'file:get');
  return file.ok ? respondFile(host, found.entry, file, download) : host.respond.notFound();
}

/** Only through the connection the grant was made for, never the share: what their own files don't hold isn't theirs to read this way. */
async function serveOwn(host: PluginHost, node: PluginNode, connection: PluginOpenConnection, p: unknown, f: string, download: boolean): Promise<Response> {
  const access = userAccess(connection);
  const root = rootOfNode(node);
  if (!access || !root.fileid) return host.respond.notFound();
  let below = '';
  if (node.type === 'document') {
    // A document's own file is its root.
    if (f !== root.fileid) return host.respond.notFound();
  } else {
    const checked = checkSharePath(p);
    if (typeof p !== 'string' || 'problem' in checked || checked.path === '') return host.respond.notFound();
    below = checked.path;
  }
  for (const fresh of [false, true]) {
    const located = await locate(host, access, root.fileid, { hint: root.hint, operation: 'file', fresh });
    if (!located.ok) return host.respond.notFound();
    const path = joinPath(located.path, below);
    const found = await fileAt(host, access, path, f, 'file:lookup:own');
    if (found.entry) {
      const file = await streamFile(host, access, path, 'file:get:own');
      return file.ok ? respondFile(host, found.entry, file, download) : host.respond.notFound();
    }
    // Only a miss is retried: the root may have moved since it was found.
    if (found.problem !== 'notFound') return host.respond.notFound();
  }
  return host.respond.notFound();
}

/** Stores a status change a reader's request through the share found. */
async function recordDocument(host: PluginHost, doc: PluginNode, problem: string): Promise<void> {
  const ref = documentRef(doc.ref);
  // A server that failed once says nothing of the file.
  if (!ref || !(problem === 'notFound' || problem === 'revoked' || problem === 'unauthorized') || ref.status === problem) return;
  if (await host.nodes.observe(doc.id, { ...doc.ref, status: problem, checkedAt: new Date().toISOString() })) {
    host.log.sourceState({ nodeId: doc.id, from: ref.status, to: problem, reason: problem });
  }
}
