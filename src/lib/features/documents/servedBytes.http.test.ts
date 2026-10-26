// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { parseCsp } from '$lib/platform/csp';
import { call, formAction, startApp, type ServedApp } from '$tests/integration/http';

// Only the sandbox and the empty default-src are pinned: the app's own style
// policy may add a style-src beside a response's.

const app = await startApp();
const seed = inject('seed');
const policy = (res: Response) => parseCsp(res.headers.get('content-security-policy') ?? '');

describe.skipIf(app.skipped)('served bytes', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  it('a text document is served sandboxed, with its declared type, inline', async () => {
    const res = await call(served, `/api/documents/${seed.mdDocId}/content`, { as: 'editorA' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(policy(res).get('default-src')).toEqual(["'none'"]);
    expect(policy(res).has('sandbox')).toBe(true);
    expect(res.headers.get('content-disposition')).toMatch(/^inline;/);
  });

  it('a PDF keeps its declared type and nosniff, without the sandbox its viewer cannot run under', async () => {
    const res = await call(served, `/api/documents/${seed.docId}/content`, { as: 'editorA' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBeNull();
  });

  it('a download hands any document over as an attachment, a byte stream under the sandbox', async () => {
    const res = await call(served, `/api/documents/${seed.mdDocId}/content?download`, { as: 'editorA' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(policy(res).has('sandbox')).toBe(true);
  });

  it('a filename beyond ASCII is served in both its plain and its encoded form', async () => {
    const form = new FormData();
    form.append('title', 'Bericht – Q3');
    form.append('file', new File(['Quartalsbericht'], 'Bericht – Q3.txt', { type: 'text/plain' }));
    const { id } = (await (await call(served, '/api/documents', { as: 'editorA', body: form })).json()) as { id: string };

    const res = await call(served, `/api/documents/${id}/content`, { as: 'editorA' });
    expect(res.status).toBe(200);
    // The exact header is contentDisposition.test.ts's; here, that both forms arrive.
    const disposition = res.headers.get('content-disposition') ?? '';
    expect(disposition).toMatch(/^inline; filename="[^"]*Q3\.txt"/);
    expect(disposition).toContain(`filename*=UTF-8''Bericht%20%E2%80%93%20Q3.txt`);
  });

  it('an SVG logo uploaded through the branding form is served sandboxed, its own inline styles still applying', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const uploaded = await formAction(served, '/settings/branding?/upload', {}, { as: 'admin', files: { file: new File([svg], 'logo.svg', { type: 'image/svg+xml' }) } });
    expect(uploaded.type).toBe('success');
    const [setting] = await db<{ value: string }[]>`select value from site_settings where key = 'logo_asset_id'`;
    expect(setting?.value).toBeTruthy();

    const res = await call(served, `/api/media/branding/logo/${setting.value}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/svg+xml');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(policy(res).get('default-src')).toEqual(["'none'"]);
    expect(policy(res).has('sandbox')).toBe(true);
    expect(policy(res).get('style-src')).toEqual(["'unsafe-inline'"]);
  });
});
