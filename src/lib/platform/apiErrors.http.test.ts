// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, it } from 'vitest';
import { call, createPage, startApp, type ServedApp } from '$tests/integration/http';

// The API's one error body (docs/architecture/routing.md, "Errors"), per family, on the
// built handler: what an adapter refuses, what the hook refuses before one
// runs, and what SvelteKit answers itself.
const app = await startApp();

afterAll(async () => {
  if (!app.skipped) await app.close();
});

const shape = (code: string, extra: Record<string, unknown> = {}) => ({ error: { code, message: expect.stringMatching(/\S/), ...extra } });

describe.skipIf(app.skipped)('an error the HTTP API answers', () => {
  const served = app as ServedApp;

  it('is the hook’s refusal of a request without a session, in the language it asks for', async () => {
    const en = await call(served, '/api/pages', { method: 'POST', headers: { 'accept-language': 'en' } });
    expect([en.status, await en.json()]).toEqual([401, { error: { code: 'unauthorized', message: 'Sign in to do this.' } }]);
    const de = await call(served, '/api/pages', { method: 'POST', headers: { 'accept-language': 'de' } });
    expect([de.status, await de.json()]).toEqual([401, { error: { code: 'unauthorized', message: 'Melde dich an, um das zu tun.' } }]);
  });

  it("is an adapter's refusal: forbidden, not found, and a missing field named", async () => {
    const viewer = await call(served, '/api/pages', { as: 'viewer', method: 'POST' });
    expect([viewer.status, await viewer.json()]).toEqual([403, shape('forbidden')]);
    const { id } = await createPage(served, 'editorA', { visibility: 'public' });
    const missing = await call(served, `/api/pages/${id}/versions`, { as: 'editorA', method: 'POST', json: {} });
    expect([missing.status, await missing.json()]).toEqual([400, shape('invalid_request', { field: 'doc' })]);
    const gone = await call(served, '/api/pages/00000000-0000-4000-8000-000000000000/lock', { as: 'editorA', method: 'POST', json: {} });
    expect([gone.status, await gone.json()]).toEqual([404, { error: { code: 'not_found', message: "This page doesn't exist, or you can't open it." } }]);
  });

  it('is what SvelteKit answers itself, reshaped: an unknown address and a method without a handler', async () => {
    const unknown = await call(served, '/api/no-such-address', { as: 'editorA' });
    expect([unknown.status, await unknown.json()]).toEqual([404, shape('not_found')]);
    const method = await call(served, '/api/media', { as: 'editorA' });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toContain('POST');
    expect(await method.json()).toEqual(shape('method_not_allowed'));
  });

  it("is a byte route's sentence as text, not the JSON body", async () => {
    const res = await call(served, '/api/media/00000000-0000-4000-8000-000000000000', { as: 'editorA', headers: { 'accept-language': 'de' } });
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe('Das gibt es nicht, oder du kannst es nicht öffnen.');
  });
});
