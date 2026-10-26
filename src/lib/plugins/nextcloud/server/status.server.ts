// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// "Check connection" on the settings page. Shares are read through the WebDAV
// endpoint Nextcloud 29 introduced, so an older server is refused here rather
// than failing every listing later.
import type { PluginUpstream } from '$lib/plugins/api';
import { t } from '../messages';

const MIN_MAJOR_VERSION = 29;

export async function checkServer(upstream: PluginUpstream): Promise<{ ok: boolean; message: string }> {
  const result = await upstream.fetch({ method: 'GET', path: '/status.php', headers: { accept: 'application/json' }, maxBytes: 64 * 1024 });
  if (result.kind === 'failure') {
    if (result.failure === 'redirect') return { ok: false, message: t('check_redirect') };
    if (result.failure === 'timeout') return { ok: false, message: t('check_timeout') };
    return { ok: false, message: t('check_unreachable') };
  }
  let status: { productname?: unknown; version?: unknown; versionstring?: unknown; installed?: unknown } | null = null;
  try {
    status = result.status === 200 ? JSON.parse(result.body.toString('utf8')) : null;
  } catch {
    status = null;
  }
  const version = typeof status?.version === 'string' ? status.version : null;
  if (!status || status.installed !== true || !version || !/^\d+\./.test(version)) return { ok: false, message: t('check_not_nextcloud') };
  const shown = typeof status.versionstring === 'string' && /^[\w.-]{1,32}$/.test(status.versionstring) ? status.versionstring : version.split('.').slice(0, 3).join('.');
  if (Number(version.split('.')[0]) < MIN_MAJOR_VERSION) return { ok: false, message: t('check_too_old', { version: shown }) };
  return { ok: true, message: t('check_ok', { version: shown }) };
}
