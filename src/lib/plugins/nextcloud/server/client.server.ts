// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Requests to the configured Nextcloud, all through the host's pinned client
// (docs/architecture/plugins.md). An upstream address carries a share's token or a person's
// id, so a failure is logged by operation, kind and status, never by address.
import type { PluginHost, PluginOpenConnection, PluginUpstream, UpstreamResult } from '$lib/plugins/api';
import { isShareToken } from '../sharePath';
import { davPath, isUid, SEARCH_PATH } from './davRoot';
import { parseMultistatus, PROPFIND_BODY, searchBody, type DavEntry } from './propfind.server';

/** A share's credential, sealed with each node of the share. */
export interface ShareSecret {
  token: string;
  password: string | null;
}

/** A share as its visitor, or a person's own files as them. */
export type DavAccess = ShareAccess | UserAccess;
export interface ShareAccess {
  kind: 'share';
  root: { kind: 'share'; token: string };
  secret: ShareSecret;
}
export interface UserAccess {
  kind: 'user';
  root: { kind: 'user'; uid: string };
  connection: PluginOpenConnection;
}

export function shareAccess(secret: ShareSecret): ShareAccess {
  return { kind: 'share', root: { kind: 'share', token: secret.token }, secret };
}

/** Null for an account whose id cannot name a WebDAV root. */
export function userAccess(connection: PluginOpenConnection): UserAccess | null {
  return isUid(connection.accountId) ? { kind: 'user', root: { kind: 'user', uid: connection.accountId }, connection } : null;
}

/** `unauthorized`: the share wants another password; `revoked`: the share is gone; `refused`: the person's connection was refused. */
export type DavProblem = 'disabled' | 'unconfigured' | 'unauthorized' | 'revoked' | 'notFound' | 'refused' | 'unreachable' | 'tooLarge';

const XML_LIMIT = 2 * 1024 * 1024;
const FILE_LIMIT = 512 * 1024 * 1024;

export function encodeSecret(secret: ShareSecret): string {
  return JSON.stringify({ token: secret.token, password: secret.password });
}

/** Null when the plaintext isn't a share credential. */
export function decodeSecret(text: string | null): ShareSecret | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as { token?: unknown; password?: unknown };
    if (!isShareToken(value.token)) return null;
    return { token: value.token, password: typeof value.password === 'string' ? value.password : null };
  } catch {
    return null;
  }
}

const basic = (login: string, password: string) => `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`;

// A share is read as its anonymous visitor (its password as Basic auth for
// `anonymous`), with the XHR header Nextcloud requires of a public non-GET.
function headersFor(access: DavAccess, extra: Record<string, string> = {}): Record<string, string> {
  if (access.kind === 'user') return { authorization: basic(access.connection.credential.login, access.connection.credential.secret), ...extra };
  const headers: Record<string, string> = { 'x-requested-with': 'XMLHttpRequest', ...extra };
  if (access.secret.password !== null) headers.authorization = basic('anonymous', access.secret.password);
  return headers;
}

/** While off nothing is asked of Nextcloud, and routes say the plugin is off, not that a connection is missing. */
export async function turnedOff(host: PluginHost): Promise<boolean> {
  return !(await host.settings()).enabled;
}

async function upstreamOf(host: PluginHost): Promise<{ upstream: PluginUpstream } | { problem: 'disabled' | 'unconfigured' }> {
  const upstream = await host.upstream();
  if (upstream) return { upstream };
  return { problem: (await host.settings()).enabled ? 'unconfigured' : 'disabled' };
}

function problemOfStatus(access: DavAccess, status: number, atRoot: boolean): DavProblem {
  if (access.kind === 'user') {
    if (status === 401) return 'refused';
    // What a person may not see is, to Nextcloud, not there.
    if (status === 403 || status === 404) return 'notFound';
    return 'unreachable';
  }
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return atRoot ? 'revoked' : 'notFound';
  return 'unreachable';
}

/**
 * A 401 on a person's connection is reported to the host once (it turns
 * revoked) and never retried: Nextcloud's brute-force protection counts every
 * one against this server's address.
 */
async function refusedBy(host: PluginHost, access: DavAccess, problem: DavProblem): Promise<void> {
  if (problem === 'refused' && access.kind === 'user') await host.connection.refused(access.connection.id);
}

type Read = { ok: true; entries: DavEntry[] } | { ok: false; problem: DavProblem };

async function readAnswer(host: PluginHost, access: DavAccess, result: UpstreamResult, operation: string, durationMs: number, atRoot: boolean): Promise<Read> {
  if (result.kind === 'failure') {
    host.log.upstreamFailed({ operation, failure: result.failure, status: result.status, durationMs });
    return { ok: false, problem: result.failure === 'too_large' ? 'tooLarge' : 'unreachable' };
  }
  if (result.status !== 207) {
    host.log.upstreamFailed({ operation, failure: 'status', status: result.status, durationMs });
    const problem = problemOfStatus(access, result.status, atRoot);
    await refusedBy(host, access, problem);
    return { ok: false, problem };
  }
  const parsed = parseMultistatus(result.body.toString('utf8'), access.root);
  if (!parsed) {
    host.log.upstreamFailed({ operation, failure: 'malformed', status: result.status, durationMs });
    return { ok: false, problem: 'unreachable' };
  }
  if (parsed.tooMany) return { ok: false, problem: 'tooLarge' };
  return { ok: true, entries: parsed.entries };
}

/** Under a share, a 404 below the root asks the root once more, so a share that is gone reads as revoked, not a missing path. */
export async function propfind(host: PluginHost, access: DavAccess, path: string, depth: 0 | 1, operation: string): Promise<Read> {
  const client = await upstreamOf(host);
  if ('problem' in client) return { ok: false, problem: client.problem };
  const started = Date.now();
  const result = await client.upstream.fetch({
    method: 'PROPFIND',
    path: davPath(access.root, path),
    headers: headersFor(access, { depth: String(depth), 'content-type': 'application/xml; charset=utf-8' }),
    body: PROPFIND_BODY,
    maxBytes: XML_LIMIT,
  });
  const read = await readAnswer(host, access, result, operation, Date.now() - started, path === '');
  if (!read.ok && read.problem === 'notFound' && access.kind === 'share') {
    const root = await propfind(host, access, '', 0, `${operation}:root`);
    if (!root.ok && root.problem === 'revoked') return root;
  }
  return read;
}

/** Where a file or folder lies in a person's own files, by its id; no entries when it isn't among them. */
export async function searchById(host: PluginHost, access: UserAccess, fileid: string, operation: string): Promise<Read> {
  const client = await upstreamOf(host);
  if ('problem' in client) return { ok: false, problem: client.problem };
  const started = Date.now();
  const result = await client.upstream.fetch({
    method: 'SEARCH',
    path: SEARCH_PATH,
    headers: headersFor(access, { 'content-type': 'text/xml; charset=utf-8' }),
    body: searchBody(access.root.uid, fileid),
    maxBytes: XML_LIMIT,
  });
  return readAnswer(host, access, result, operation, Date.now() - started, false);
}

/** A file's bytes for a reader; only after its entry was looked up and matched. */
export async function streamFile(
  host: PluginHost,
  access: DavAccess,
  path: string,
  operation: string
): Promise<{ ok: true; body: ReadableStream<Uint8Array>; size: number | null } | { ok: false; problem: DavProblem }> {
  const client = await upstreamOf(host);
  if ('problem' in client) return { ok: false, problem: client.problem };
  const started = Date.now();
  const result = await client.upstream.stream({ method: 'GET', path: davPath(access.root, path), headers: headersFor(access), maxBytes: FILE_LIMIT });
  const durationMs = Date.now() - started;
  if (result.kind === 'failure') {
    host.log.upstreamFailed({ operation, failure: result.failure, status: result.status, durationMs });
    return { ok: false, problem: result.failure === 'too_large' ? 'tooLarge' : 'unreachable' };
  }
  if (result.status !== 200) {
    await result.body.cancel().catch(() => {});
    host.log.upstreamFailed({ operation, failure: 'status', status: result.status, durationMs });
    const problem = problemOfStatus(access, result.status, false);
    await refusedBy(host, access, problem);
    return { ok: false, problem };
  }
  const declared = Number(result.headers['content-length']);
  return { ok: true, body: result.body, size: Number.isSafeInteger(declared) && declared >= 0 ? declared : null };
}
