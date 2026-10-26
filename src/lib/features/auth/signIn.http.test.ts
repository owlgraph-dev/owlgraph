// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, describe, expect, inject, it } from 'vitest';
import { createSession, createUser } from '$lib/features/auth/server';
import { call, createPage, formAction, startApp, type ServedApp } from '$tests/integration/http';
import { userOf } from '$tests/integration/users';

// Each test signs in from a client address of its own: the limits are keyed by it.

const app = await startApp();
const seed = inject('seed');
// The seeded accounts' password (tests/support/seed.ts).
const PASSWORD = 'e2e-seed-password';

const signIn = (served: ServedApp, from: string, email: string, password = PASSWORD, redirect?: string) =>
  call(served, redirect === undefined ? '/login' : `/login?redirect=${encodeURIComponent(redirect)}`, {
    from,
    body: new URLSearchParams({ email, password }),
  });

describe.skipIf(app.skipped)('signing in and out', () => {
  const served = app as ServedApp;
  afterAll(() => served.close());

  describe('the redirect', () => {
    it('a sign-in posted with a path on this site answers 303 to that path and sets a session cookie', async () => {
      const res = await signIn(served, '198.51.100.1', 'viewer@test', PASSWORD, '/settings/profile');
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe('/settings/profile');
      expect(res.headers.get('set-cookie')).toMatch(/^session=[0-9a-f]{64};/);
    });

    // The other off-site spellings are safeRedirect.test.ts's; a browser reads
    // this backslash as a slash.
    it('a sign-in posted with a backslash spelling of another host answers a redirect a browser resolves to this site', async () => {
      const res = await signIn(served, '198.51.100.2', 'editora@test', PASSWORD, '/\\example.org/phish');
      expect(res.status).toBe(303);
      expect(new URL(res.headers.get('location')!, served.origin).origin).toBe(served.origin);
    });
  });

  describe('the session cookie', () => {
    it('is HttpOnly, SameSite=Lax and Secure, for the whole site', async () => {
      const cookie = (await signIn(served, '198.51.100.3', 'viewer@test')).headers.get('set-cookie') ?? '';
      expect(cookie).toMatch(/^session=/);
      expect(cookie).toMatch(/; HttpOnly/i);
      expect(cookie).toMatch(/; SameSite=Lax/i);
      expect(cookie).toMatch(/; Secure/i);
      expect(cookie).toMatch(/; Path=\//i);
    });

    it('signing out ends the session on the server: the old cookie is anonymous afterwards', async () => {
      const cookie = `session=${(await createSession((await userOf('viewer')).id)).token}`;
      expect((await call(served, '/settings/profile', { cookie })).status).toBe(200);
      const out = await call(served, '/logout', { cookie, body: new URLSearchParams() });
      expect(out.status).toBe(303);
      expect(out.headers.get('location')).toBe('/login');
      const after = await call(served, '/settings/profile', { cookie });
      expect(after.status).toBe(303);
      expect(new URL(after.headers.get('location')!, served.origin).pathname).toBe('/login');
    });
  });

  describe('what a browser keeps', () => {
    it('a page sent to a signed-in viewer, and its data, is private, no-store; the same public page sent anonymously carries no policy', async () => {
      const { slug } = await createPage(served, 'admin', { visibility: 'public' });
      for (const path of [`/${slug}`, `/${slug}/__data.json`]) {
        const res = await call(served, path, { as: 'viewer' });
        expect(res.status, path).toBe(200);
        expect(res.headers.get('cache-control'), path).toBe('private, no-store');
      }
      const anonymous = await call(served, `/${slug}`);
      expect(anonymous.status).toBe(200);
      expect(anonymous.headers.get('cache-control')).toBeNull();
    });

    it('a response that chose its own policy keeps it: a public page’s image sent to a signed-in viewer stays cacheable', async () => {
      const res = await call(served, `/api/media/${seed.publicAssetId}`, { as: 'viewer' });
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toContain('public');
    });
  });

  describe('a refused sign-in', () => {
    it('answers an unknown address and a wrong password the same 400 and message', async () => {
      const unknown = await formAction(served, '/login', { email: 'nobody@test', password: PASSWORD }, { from: '198.51.100.4' });
      const wrong = await formAction(served, '/login', { email: 'viewer@test', password: 'not-the-password' }, { from: '198.51.100.5' });
      expect(unknown.status).toBe(400);
      expect(wrong.status).toBe(400);
      expect(unknown.data).toEqual({ email: 'nobody@test', error: { code: 'invalid_credentials', message: 'Invalid email or password.' } });
      expect(wrong.data).toEqual({ email: 'viewer@test', error: (unknown.data as { error: unknown }).error });
    });

    it('says so in the request’s language', async () => {
      const refused = await formAction(served, '/login', { email: 'viewer@test', password: 'not-the-password' }, { from: '198.51.100.8', headers: { 'accept-language': 'de' } });
      expect(refused.status).toBe(400);
      expect(refused.data).toEqual({ email: 'viewer@test', error: { code: 'invalid_credentials', message: 'E-Mail oder Passwort ist falsch.' } });
    });
  });

  describe('the limits', () => {
    it('after five sign-ins a minute for one address from one client, the sixth answers 429 with Retry-After — even with the right password', async () => {
      for (let i = 0; i < 5; i++) expect((await signIn(served, '198.51.100.6', 'viewer@test', 'not-the-password')).status).toBe(400);
      const limited = await signIn(served, '198.51.100.6', 'viewer@test');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(limited.headers.get('set-cookie')).toBeNull();
    });

    it('after twenty sign-ins a minute from one client, the twenty-first answers 429, whatever the address', async () => {
      for (let i = 0; i < 20; i++) expect((await signIn(served, '198.51.100.7', `nobody${i}@test`, 'not-the-password')).status).toBe(400);
      const limited = await signIn(served, '198.51.100.7', 'viewer@test');
      expect(limited.status).toBe(429);
      expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    });
  });

  describe('the interface language on the account', () => {
    it('a language chosen while signed in is stored on the account: a later request with only the session and an English Accept-Language renders in it', async () => {
      // An account of the test's own: the seeded ones keep speaking English.
      const user = await createUser({ email: 'language@test', name: 'Language', password: PASSWORD, role: 'editor' });
      const cookie = `session=${(await createSession(user.id)).token}`;
      expect((await call(served, '/api/locale', { cookie, json: { locale: 'de' } })).status).toBe(204);

      const res = await call(served, '/settings/profile', { cookie, headers: { 'accept-language': 'en-US,en;q=0.9' } });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toMatch(/<html[^>]* lang="de"/);
      expect(html).toContain('Profil');
    });
  });
});
