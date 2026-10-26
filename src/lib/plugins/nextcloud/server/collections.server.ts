// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Collections made beside a page, from a share's link or the editor's own folder.
// A share's token is checked against the server at once and kept only sealed,
// never in the record or an answer. An own-files folder has no credential of
// its own: each viewer reads it with their own connection, or not at all.
import type { PluginConnectResult, PluginHost, PluginNode, PluginRequest, PluginSourceSummary } from '$lib/plugins/api';
import { t } from '../messages';
import { checkSharePath } from '../sharePath';
import { parseShareUrl } from './shareUrl';
import { encodeSecret, propfind, shareAccess, turnedOff, type DavProblem, type ShareSecret } from './client.server';
import { noteShareAnswer } from './cache.server';
import { collectionRef, hintFields, isFileId, type SourceStatus } from './refs';
import { viewerAccess } from './resolve.server';
import type { DavEntry } from './propfind.server';

type Checked = { ok: true; secret: ShareSecret; root: DavEntry } | { ok: false; status: 400 | 403 | 404 | 409 | 502; code: string; message: string };
type Refusal = Extract<Checked, { ok: false }>;

const MAX_PASSWORD = 512;

function refused(problem: DavProblem): Refusal {
  switch (problem) {
    case 'unauthorized':
      return { ok: false, status: 400, code: 'refused', message: t('connect_unauthorized') };
    case 'revoked':
    case 'notFound':
      return { ok: false, status: 404, code: 'revoked', message: t('connect_revoked') };
    case 'disabled':
    case 'unconfigured':
      return { ok: false, status: 409, code: 'plugin_disabled', message: t('connect_disabled') };
    case 'tooLarge':
      return { ok: false, status: 400, code: 'too_large', message: t('connect_too_large') };
    default:
      return { ok: false, status: 502, code: 'upstream_unreachable', message: t('connect_unreachable') };
  }
}

async function checkShare(host: PluginHost, shareUrl: unknown, password: unknown): Promise<Checked> {
  const upstream = await host.upstream();
  if (!upstream) return refused('disabled');
  if (typeof shareUrl !== 'string' || (password !== undefined && password !== null && typeof password !== 'string')) {
    return { ok: false, status: 400, code: 'invalid_share', message: t('connect_invalid') };
  }
  if (typeof password === 'string' && password.length > MAX_PASSWORD) return { ok: false, status: 400, code: 'invalid_share', message: t('connect_invalid') };
  const parsed = parseShareUrl(shareUrl, upstream.origin);
  if ('problem' in parsed) {
    if (parsed.problem === 'other-origin') return { ok: false, status: 400, code: 'other_origin', message: t('connect_other_origin', { origin: upstream.origin }) };
    return { ok: false, status: 400, code: parsed.problem === 'invalid' ? 'invalid_share' : 'not_a_share', message: t(parsed.problem === 'invalid' ? 'connect_invalid' : 'connect_not_a_share') };
  }
  const secret: ShareSecret = { token: parsed.token, password: typeof password === 'string' && password !== '' ? password : null };
  const looked = await propfind(host, shareAccess(secret), '', 0, 'collections:connect');
  // Counts like a reader's answer: a refusal starts the wait, a read ends it.
  noteShareAnswer(upstream.origin, secret, looked.ok ? null : looked.problem);
  if (!looked.ok) return refused(looked.problem);
  const root = looked.entries.find((e) => e.path === '');
  if (!root) return refused('unreachable');
  if (!root.folder) return { ok: false, status: 400, code: 'not_a_folder', message: t('connect_not_a_folder') };
  return { ok: true, secret, root };
}

const now = () => new Date().toISOString();

/** For the block that shows it; `own` for a folder of someone's own files. */
function collectionSummary(node: PluginNode) {
  const ref = collectionRef(node.ref);
  return { id: node.id, title: node.title, href: node.href, name: ref.name, status: ref.status, own: ref.hint !== null };
}

/** A folder of the editor's own files at `path`, if it is there with `fileid`, and their Nextcloud uid. */
async function checkOwnFolder(host: PluginHost, own: unknown): Promise<{ ok: true; root: DavEntry; path: string; uid: string } | Refusal> {
  if (await turnedOff(host)) return refused('disabled');
  const { path, fileid } = (own ?? {}) as { path?: unknown; fileid?: unknown };
  const checked = checkSharePath(path);
  if ('problem' in checked || !isFileId(fileid)) return { ok: false, status: 400, code: 'invalid_share', message: t('connect_invalid') };
  const access = await viewerAccess(host);
  if (!access) {
    const status = await host.connection.status();
    return { ok: false, status: 409, code: status === 'none' ? 'connect_required' : 'connection_renew', message: t(status === 'none' ? 'own_connect' : 'own_renew') };
  }
  const missing: Refusal = { ok: false, status: 404, code: 'not_found', message: t('own_not_found') };
  const looked = await propfind(host, access, checked.path, 0, 'collections:own');
  if (!looked.ok) {
    if (looked.problem === 'refused') return { ok: false, status: 409, code: 'connection_renew', message: t('own_renew') };
    return looked.problem === 'notFound' ? missing : refused(looked.problem);
  }
  const root = looked.entries.find((e) => e.path === checked.path);
  if (!root || root.fileid !== fileid) return missing;
  if (!root.folder) return { ok: false, status: 400, code: 'not_a_folder', message: t('own_not_a_folder') };
  return { ok: true, root, path: checked.path, uid: access.root.uid };
}

/**
 * POST collections { pageId, shareUrl, password? } — a collection of a share, beside the page being edited;
 * POST collections { pageId, own: { path, fileid } } — a collection of a folder of the editor's own Nextcloud.
 */
export async function createCollectionRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const body = (request.body ?? {}) as { pageId?: unknown; shareUrl?: unknown; password?: unknown; own?: unknown };
  if (typeof body.pageId !== 'string') return host.respond.error(400, 'invalid_request');
  // Checked before anything goes to Nextcloud on the caller's behalf.
  const may = await host.nodes.mayCreateBeside(body.pageId);
  if (may === 'forbidden') return host.respond.error(403, 'forbidden', t('connect_forbidden'));
  if (may === 'not-found') return host.respond.error(404, 'not_found');
  let input: { title: string; ref: Record<string, unknown>; secret?: string };
  if (body.own !== undefined) {
    const checked = await checkOwnFolder(host, body.own);
    if (!checked.ok) return host.respond.error(checked.status, checked.code, checked.message);
    const name = checked.root.name || (checked.path === '' ? '' : checked.path.slice(checked.path.lastIndexOf('/') + 1));
    input = {
      title: name || t('own_title_fallback'),
      ref: { path: '', name, fileid: checked.root.fileid, ...hintFields({ path: checked.path, uid: checked.uid }), status: 'ok', checkedAt: now(), count: null },
    };
  } else {
    const checked = await checkShare(host, body.shareUrl, body.password);
    if (!checked.ok) return host.respond.error(checked.status, checked.code, checked.message);
    input = {
      title: checked.root.name || t('share_title_fallback'),
      ref: { path: '', name: checked.root.name, ...(checked.root.fileid ? { fileid: checked.root.fileid } : {}), status: 'ok', checkedAt: now(), count: null },
      secret: encodeSecret(checked.secret),
    };
  }
  const result = await host.nodes.createCollection({ ...input, besidePageId: body.pageId });
  if (!result.ok) {
    if (result.reason === 'no-secret-key') return host.respond.error(409, 'secret_key_missing', t('connect_no_key'));
    if (result.reason === 'forbidden') return host.respond.error(403, 'forbidden', t('connect_forbidden'));
    return host.respond.error(404, 'not_found');
  }
  return host.respond.json({ collection: collectionSummary(result.node) }, 201);
}

/** While the plugin is off: the node alone, nothing of its share or folder. */
function offSummary(node: PluginNode): ReturnType<typeof collectionSummary> {
  return { id: node.id, title: node.title, href: node.href, name: '', status: 'disabled', own: false };
}

/** GET collections?q= — the collections the viewer may read, for a block's picker. */
export async function searchCollectionsRoute(request: PluginRequest, host: PluginHost): Promise<Response> {
  const found = await host.nodes.search('collection', (request.query.get('q') ?? '').slice(0, 200), { limit: 20 });
  if (await turnedOff(host)) return host.respond.json({ collections: found.map(offSummary), reason: 'disabled' });
  return host.respond.json({ collections: found.map(collectionSummary) });
}

/**
 * PUT /api/collections/<id>/source (the core checks the writer): the share's
 * credential is sealed for the collection and each of its documents, which
 * hold the same share.
 */
export async function connectCollection(collection: PluginNode, values: Readonly<Record<string, string>>, host: PluginHost): Promise<PluginConnectResult> {
  const checked = await checkShare(host, values.shareUrl, values.password);
  if (!checked.ok) return { ok: false, status: checked.status === 404 ? 400 : checked.status, code: checked.code, message: checked.message };
  const secret = encodeSecret(checked.secret);
  if (!(await host.secrets.set(collection.id, secret))) return { ok: false, status: 409, code: 'secret_key_missing', message: t('connect_no_key') };
  for (const member of await host.nodes.members(collection.id)) await host.secrets.set(member.id, secret);
  const before = collectionRef(collection.ref);
  // Connected to a share, it is that share's folder — whatever it was picked from before.
  const { pathHint: _pathHint, hintUid: _hintUid, fileid: _fileid, ...kept } = collection.ref;
  await host.nodes.rebind(collection.id, {
    ref: { ...kept, path: '', name: checked.root.name, ...(checked.root.fileid ? { fileid: checked.root.fileid } : {}), status: 'ok', checkedAt: now() },
  });
  if (before.status !== 'ok') host.log.sourceState({ nodeId: collection.id, from: before.status, to: 'ok' });
  return { ok: true };
}

const STATUS_TEXT: Record<Exclude<SourceStatus, 'ok'>, () => string> = {
  unauthorized: () => t('status_unauthorized'),
  revoked: () => t('status_revoked'),
  notFound: () => t('status_not_found'),
  unreachable: () => t('status_unreachable'),
  disabled: () => t('status_disabled'),
  unconfigured: () => t('status_unconfigured'),
  tooLarge: () => t('status_too_large'),
};

/** What a collection's source panel says of its share. */
export function describeCollection(node: PluginNode): PluginSourceSummary {
  const ref = collectionRef(node.ref);
  return {
    name: ref.name || node.title,
    detail: ref.count === null ? null : t('describe_count', { count: ref.count }),
    checkedAt: ref.checkedAt,
    problem: ref.status === 'ok' ? null : STATUS_TEXT[ref.status](),
  };
}
