// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { call, startApp, type ServedApp } from '$tests/integration/http';

// The route reads ENABLE_DESIGN_PLAYGROUND per request, so each test stubs it
// in this process, where the handler runs.

const app = await startApp();

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.skipIf(app.skipped)('design-system playground', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  /** The admin's playground at `path`, its status checked. */
  async function playground(path: string) {
    const res = await call(served, path, { as: 'admin' });
    expect(res.status, path).toBe(200);
    return new JSDOM(await res.text()).window.document;
  }
  const sectionIds = (document: Document) => [...document.querySelectorAll('[data-playground]')].map((el) => el.getAttribute('data-playground') ?? '');

  it('renders every registered section once', async () => {
    vi.stubEnv('ENABLE_DESIGN_PLAYGROUND', 'true');
    const document = await playground('/dev/design-system');
    expect([...document.querySelectorAll('h1')].map((h) => h.textContent?.trim())).toContain('Design system');
    const ids = sectionIds(document);
    expect(ids.length).toBeGreaterThan(20);
    expect(new Set(ids).size).toBe(ids.length);
    expect(document.querySelectorAll('[data-overlay]').length, 'the playground should declare its overlay specimens').toBeGreaterThan(5);
    expect(sectionIds(await playground(`/dev/design-system?section=${ids[1]}`))).toEqual([ids[1]]);
  });

  describe('its gate', () => {
    it.each([['unset', undefined], ['false', 'false'], ['1', '1'], ['TRUE', 'TRUE']])('answers an admin 404 with ENABLE_DESIGN_PLAYGROUND %s', async (_, value) => {
      vi.stubEnv('ENABLE_DESIGN_PLAYGROUND', value);
      expect((await call(served, '/dev/design-system', { as: 'admin' })).status).toBe(404);
    });

    it('serves an admin the playground with ENABLE_DESIGN_PLAYGROUND=true', async () => {
      vi.stubEnv('ENABLE_DESIGN_PLAYGROUND', 'true');
      expect((await call(served, '/dev/design-system', { as: 'admin' })).status).toBe(200);
    });

    it.each([['on', 'true'], ['off', undefined]])('sends an anonymous visitor to sign in, the playground %s', async (_, value) => {
      vi.stubEnv('ENABLE_DESIGN_PLAYGROUND', value);
      const res = await call(served, '/dev/design-system?section=button');
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/login?redirect=${encodeURIComponent('/dev/design-system?section=button')}`);
    });
  });
});
