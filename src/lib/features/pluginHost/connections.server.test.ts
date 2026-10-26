// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { secretBox } from '$lib/platform/secretBox.server';
import { openCredential, openFlow, sealCredential, sealFlow } from './connections.server';

const USER = '11111111-1111-4111-8111-111111111111';
const CREDENTIAL = { kind: 'app_password' as const, login: 'alice@example.com', secret: 'app-pass-1' };
let before: string | undefined;

beforeAll(() => {
  before = process.env.APP_SECRET_KEY;
  process.env.APP_SECRET_KEY = randomBytes(32).toString('base64');
});
afterAll(() => {
  if (before === undefined) delete process.env.APP_SECRET_KEY;
  else process.env.APP_SECRET_KEY = before;
});

const row = (over: Partial<{ user_id: string; plugin: string; origin: string; credential_kind: 'app_password'; sealed_credential: string }> = {}) => ({
  user_id: USER,
  plugin: 'acme',
  origin: 'https://files.example.com',
  credential_kind: 'app_password' as const,
  sealed_credential: sealCredential({ userId: USER, plugin: 'acme', origin: 'https://files.example.com' }, CREDENTIAL)!,
  ...over,
});

describe("a person's sealed credential", () => {
  it('opens for its own row', () => {
    expect(openCredential(row())).toEqual(CREDENTIAL);
  });

  it("opens for no other row: another person's, another integration's, one made against another origin", () => {
    expect(openCredential(row({ user_id: '22222222-2222-4222-8222-222222222222' }))).toBeNull();
    expect(openCredential(row({ plugin: 'other' }))).toBeNull();
    expect(openCredential(row({ origin: 'https://evil.example.com' }))).toBeNull();
  });

  it('shows nothing of what it holds', () => {
    const sealed = row().sealed_credential;
    for (const part of ['alice', 'app-pass-1', 'files.example.com', USER]) expect(sealed).not.toContain(part);
  });

  it("opens as nothing — never an error quoting it — when it is not a credential, or another purpose's value", () => {
    expect(openCredential(row({ sealed_credential: secretBox().seal('user-credential', '{"u":"broken app-pass-1') }))).toBeNull();
    expect(openCredential(row({ sealed_credential: secretBox().seal('user-credential', '[]') }))).toBeNull();
    expect(openCredential(row({ sealed_credential: secretBox().seal('signed-url', JSON.stringify({ u: USER, p: 'acme', o: 'https://files.example.com', k: 'app_password', l: 'a', s: 'b' })) }))).toBeNull();
    expect(openCredential(row({ sealed_credential: 'v1.nonsense' }))).toBeNull();
  });
});

describe('a connect in progress', () => {
  const binding = { sessionId: 'session-hash-1', userId: USER, plugin: 'acme', origin: 'https://files.example.com' };
  const flow = (over: Partial<{ session_id: string; user_id: string; plugin: string; origin: string }> = {}) => ({
    session_id: 'session-hash-1',
    user_id: USER,
    plugin: 'acme',
    origin: 'https://files.example.com',
    sealed: sealFlow(binding, { handle: 'poll-token-1', approveUrl: 'https://files.example.com/login/v2/flow/x' })!,
    ...over,
  });

  it('opens only for the session, person, integration and origin that started it', () => {
    expect(openFlow(flow())).toEqual({ handle: 'poll-token-1', approveUrl: 'https://files.example.com/login/v2/flow/x' });
    expect(openFlow(flow({ session_id: 'session-hash-2' }))).toBeNull();
    expect(openFlow(flow({ user_id: '22222222-2222-4222-8222-222222222222' }))).toBeNull();
    expect(openFlow(flow({ plugin: 'other' }))).toBeNull();
    expect(openFlow(flow({ origin: 'https://evil.example.com' }))).toBeNull();
    expect(flow().sealed).not.toContain('poll-token-1');
  });
});

describe('without a key', () => {
  it('seals nothing', () => {
    const key = process.env.APP_SECRET_KEY;
    delete process.env.APP_SECRET_KEY;
    try {
      expect(sealCredential({ userId: USER, plugin: 'acme', origin: 'https://files.example.com' }, CREDENTIAL)).toBeNull();
    } finally {
      process.env.APP_SECRET_KEY = key;
    }
  });
});
