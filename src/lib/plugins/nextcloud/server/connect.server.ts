// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Login Flow v2 (Nextcloud 29+), which the core runs around these steps
// (docs/architecture/nextcloud.md). Each step talks only to the
// configured server: poll never fetches the `poll.endpoint` the answer names.
// A 401 is never retried: Nextcloud's brute-force protection counts them per
// address, and owlgraph is one address.
import type { PluginConnectionFlow, PluginCredential } from '$lib/plugins/api';

const LIMIT = 64 * 1024;
/** A poll token as Nextcloud makes them: 128 letters and digits. */
const POLL_TOKEN = /^[A-Za-z0-9]{32,256}$/;
/** How long Nextcloud keeps a flow. */
const FLOW_SECONDS = 20 * 60;

/** A JSON object or null; never a parser's message, which would quote the body. */
function json(body: Buffer): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(body.toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const basic = (credential: PluginCredential) => `Basic ${Buffer.from(`${credential.login}:${credential.secret}`).toString('base64')}`;

const begin: PluginConnectionFlow['begin'] = async (client, opts) => {
  const res = await client.fetch({ method: 'POST', path: '/index.php/login/v2', headers: { 'user-agent': opts.clientName, accept: 'application/json' }, maxBytes: LIMIT });
  if (res.kind !== 'response' || res.status >= 500) return { ok: false, reason: 'unreachable' };
  if (res.status !== 200) return { ok: false, reason: 'refused' };
  const body = json(res.body);
  const poll = body?.poll && typeof body.poll === 'object' ? (body.poll as Record<string, unknown>) : null;
  if (typeof body?.login !== 'string' || typeof poll?.token !== 'string' || !POLL_TOKEN.test(poll.token)) return { ok: false, reason: 'refused' };
  return { ok: true, approveUrl: body.login, handle: poll.token, ttlSeconds: FLOW_SECONDS };
};

const poll: PluginConnectionFlow['poll'] = async (client, handle) => {
  const res = await client.fetch({
    method: 'POST',
    path: '/index.php/login/v2/poll',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: `token=${encodeURIComponent(handle)}`,
    maxBytes: LIMIT,
  });
  if (res.kind !== 'response') return { state: 'failed' };
  // Not approved yet, or never: an unknown token answers the same, and the
  // core's own lifetime ends a flow that waits too long.
  if (res.status === 404) return { state: 'pending' };
  if (res.status !== 200) return { state: 'failed' };
  const body = json(res.body);
  const { server, loginName, appPassword } = body ?? {};
  if (typeof server !== 'string' || typeof loginName !== 'string' || typeof appPassword !== 'string' || !loginName || !appPassword) return { state: 'failed' };
  return { state: 'approved', server, credential: { kind: 'app_password', login: loginName, secret: appPassword } };
};

// The account id, not the login name, is what its WebDAV paths name.
const verify: PluginConnectionFlow['verify'] = async (client, credential) => {
  const res = await client.fetch({
    method: 'GET',
    path: '/ocs/v1.php/cloud/user?format=json',
    headers: { authorization: basic(credential), 'ocs-apirequest': 'true', accept: 'application/json' },
    maxBytes: LIMIT,
  });
  if (res.kind !== 'response') return { ok: false, reason: 'unreachable' };
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'unauthorized' };
  if (res.status !== 200) return { ok: false, reason: 'unreachable' };
  const ocs = json(res.body)?.ocs;
  const data = ocs && typeof ocs === 'object' ? (ocs as { data?: unknown }).data : null;
  const fields = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  if (typeof fields.id !== 'string' || fields.id === '') return { ok: false, reason: 'unreachable' };
  const name = [fields['display-name'], fields.displayname].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  return { ok: true, accountId: fields.id, accountLabel: (name ?? fields.id).slice(0, 200) };
};

const revoke: PluginConnectionFlow['revoke'] = async (client, credential) => {
  const res = await client.fetch({
    method: 'DELETE',
    path: '/ocs/v2.php/core/apppassword?format=json',
    headers: { authorization: basic(credential), 'ocs-apirequest': 'true', accept: 'application/json' },
    maxBytes: LIMIT,
  });
  return res.kind === 'response' && res.status === 200;
};

export const connectFlow: PluginConnectionFlow = { begin, poll, verify, revoke };
