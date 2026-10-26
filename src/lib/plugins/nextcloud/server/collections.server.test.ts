// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import type { PluginNode, PluginRequest } from '$lib/plugins/api';
import { fakeHost, jsonResponses } from '../e2e/fakeHost';
import { t } from '../messages';
import { createCollectionRoute, searchCollectionsRoute } from './collections.server';

// The host's secrets, connection and writes refuse, so a route that reached
// for one while the plugin is off would fail the test.

const SHARE = '6f1c1a52-0c5a-4b8e-9d0f-6b1f0e2a9c11';
const OWN = '7a2d2b63-1d6b-4c9f-8e10-7c2a1f3b0d22';
const PAGE = 'a0000000-0000-4000-8000-0000000000a1';

const share: PluginNode = {
  id: SHARE,
  type: 'collection',
  title: 'Unterlagen',
  href: '/unterlagen',
  ref: { path: '', name: 'Projektunterlagen', fileid: '530', status: 'revoked', count: 3, checkedAt: '2026-10-09T10:00:00.000Z' },
  file: null,
  content: null,
};
const own: PluginNode = {
  id: OWN,
  type: 'collection',
  title: 'Team',
  href: '/team',
  ref: { path: '', name: 'Team', fileid: '531', pathHint: 'Projekte/Team', hintUid: 'alice', status: 'ok', count: 2, checkedAt: '2026-10-09T10:00:00.000Z' },
  file: null,
  content: null,
};

const offHost = () =>
  fakeHost({
    origin: null,
    enabled: false,
    viewerId: 'u0000000-0000-4000-8000-000000000001',
    nodes: { search: async () => [share, own], mayCreateBeside: async () => 'ok' },
    respond: jsonResponses,
  });

const request = (body?: unknown, query = ''): PluginRequest => ({ params: {}, query: new URLSearchParams(query), body });

describe('the collection routes while the plugin is turned off', () => {
  it("offer the picker's collections each as its node alone, and say the plugin is off", async () => {
    const res = await searchCollectionsRoute(request(undefined, 'q='), offHost());
    expect(res.status).toBe(200);
    expect(await res.clone().json()).toEqual({
      collections: [
        { id: SHARE, title: 'Unterlagen', href: '/unterlagen', name: '', status: 'disabled', own: false },
        { id: OWN, title: 'Team', href: '/team', name: '', status: 'disabled', own: false },
      ],
      reason: 'disabled',
    });
    const text = await res.text();
    for (const fact of ['Projektunterlagen', 'Projekte/Team', 'revoked', '530']) expect(text).not.toContain(fact);
  });

  it("refuse to make a collection — of a share, or of a folder of the editor's own files — as the plugin being off", async () => {
    const host = offHost();
    const answers = [
      await createCollectionRoute(request({ pageId: PAGE, shareUrl: 'https://cloud.example.org/s/AbCdEfGhIjKlMnO' }), host),
      await createCollectionRoute(request({ pageId: PAGE, own: { path: 'Projekte/Team', fileid: '531' } }), host),
    ];
    for (const res of answers) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: { code: 'plugin_disabled', message: t('connect_disabled') } });
    }
    expect(host.logs).toEqual({ upstreamFailed: [], sourceState: [] });
  });
});
