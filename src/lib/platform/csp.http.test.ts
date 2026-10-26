// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createSession, getUserByToken } from '$lib/features/auth/server';
import { startApp } from '$tests/integration/http';
import { parseCsp } from './csp';

// The browser-side half is shell/e2e/csp-style-src.spec.ts.

const app = await startApp();
const seed = inject('seed');

const NONCE = /^'nonce-([A-Za-z0-9+/=]+)'$/;
const styleSrc = (res: Response) => parseCsp(res.headers.get('content-security-policy') ?? '').get('style-src') ?? [];
const nonceOf = (sources: string[]) => sources.map((s) => NONCE.exec(s)?.[1]).find(Boolean) ?? null;
const renderedNonces = (html: string) => Array.from(html.matchAll(/<style nonce="([^"]+)"/g), (m) => m[1]);

describe.skipIf(app.skipped)('the headers of a page response', () => {
  const server = app as Extract<typeof app, { skipped: false }>;
  let adminCookie = '';

  beforeAll(async () => {
    const admin = (await getUserByToken(seed.tokens.admin))!;
    adminCookie = `session=${(await createSession(admin.id)).token}`;
  });
  afterAll(() => server.close());

  it('a reader’s route allows only styles that carry its own nonce, a new one per response', async () => {
    const first = await fetch(`${server.url}/login`);
    expect(first.status).toBe(200);
    const sources = styleSrc(first);
    expect(sources).not.toContain("'unsafe-inline'");
    const nonce = nonceOf(sources);
    expect(nonce, 'style-src carries a nonce').toBeTruthy();
    const rendered = renderedNonces(await first.text());
    expect(rendered.length, 'the page renders inline style elements').toBeGreaterThan(0);
    expect(new Set(rendered), 'every one carries the response’s nonce').toEqual(new Set([nonce]));
    expect(first.headers.get('content-security-policy-report-only')).toBeNull();

    const second = await fetch(`${server.url}/login`);
    expect(nonceOf(styleSrc(second))).not.toBe(nonce);
  });

  it('a reader’s route forbids sniffing, framing and full referrers', async () => {
    const res = await fetch(`${server.url}/login`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });

  it('the settings allow inline styles, without a nonce', async () => {
    const res = await fetch(`${server.url}/settings/profile`, { headers: { cookie: adminCookie }, redirect: 'manual' });
    expect(res.status).toBe(200);
    const sources = styleSrc(res);
    expect(sources).toContain("'unsafe-inline'");
    expect(nonceOf(sources)).toBeNull();
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });
});
