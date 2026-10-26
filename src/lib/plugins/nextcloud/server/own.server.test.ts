// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { fakeHost, jsonResponses } from '../e2e/fakeHost';
import { ownListingRoute } from './own.server';

// The host's connection refuses, so a route that reached for it would fail the test.

describe('the own listing while the plugin is turned off', () => {
  it('lists nothing and says the plugin is off, not that a connection is missing', async () => {
    const host = fakeHost({ origin: null, enabled: false, viewerId: 'u0000000-0000-4000-8000-000000000001', respond: jsonResponses });
    const res = await ownListingRoute({ params: {}, query: new URLSearchParams({ p: 'Projekte', r: '/page/edit' }), body: undefined }, host);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: 'unavailable', reason: 'disabled', path: 'Projekte', folder: null, entries: [], total: 0, offset: 0 });
  });
});
