// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createSecretBox, secretBox, secretKeyProblem, secretKeyStatus, SecretKeyMissing } from './secretBox.server';

const newKey = () => randomBytes(32).toString('base64');

describe('secretKeyProblem', () => {
  it('accepts 32 random bytes in base64', () => {
    expect(secretKeyProblem(newKey())).toBeNull();
  });

  it('names what is wrong with an unfit key', () => {
    expect(secretKeyProblem(undefined)).toBe('is not set');
    expect(secretKeyProblem('change-me')).toBe('is still a placeholder value');
    expect(secretKeyProblem(randomBytes(16).toString('base64'))).toMatch(/^is not 32 random bytes in base64/);
    expect(secretKeyProblem(randomBytes(32).toString('hex'))).toMatch(/^is not 32 random bytes in base64/);
    expect(secretKeyProblem(Buffer.alloc(32).toString('base64'))).toBe('is not random');
  });
});

describe('a secret box', () => {
  it('opens what it sealed, and a sealed value tells nothing of its plaintext', () => {
    const box = createSecretBox(newKey());
    const sealed = box.seal('node-source-secret', 'share-token-and-password');
    expect(sealed).not.toContain('share-token');
    expect(sealed.split('.')).toHaveLength(4);
    expect(box.open('node-source-secret', sealed)).toBe('share-token-and-password');
  });

  it('seals the same plaintext differently each time', () => {
    const box = createSecretBox(newKey());
    expect(box.seal('signed-url', 'x')).not.toBe(box.seal('signed-url', 'x'));
  });

  it('opens nothing that was altered', () => {
    const box = createSecretBox(newKey());
    const sealed = box.seal('signed-url', '{"n":"node"}');
    const [version, keyId, iv, body] = sealed.split('.');
    const flipped = body.slice(0, -2) + (body.at(-2) === 'A' ? 'B' : 'A') + body.at(-1);
    expect(box.open('signed-url', [version, keyId, iv, flipped].join('.'))).toBeNull();
    expect(box.open('signed-url', [version, keyId, iv.slice(1), body].join('.'))).toBeNull();
    expect(box.open('signed-url', 'not a sealed value')).toBeNull();
    expect(box.open('signed-url', '')).toBeNull();
  });

  it('keeps purposes apart', () => {
    const box = createSecretBox(newKey());
    const sealed = box.seal('node-source-secret', 'secret');
    expect(box.open('signed-url', sealed)).toBeNull();
  });

  it('opens nothing sealed under another key', () => {
    const sealed = createSecretBox(newKey()).seal('signed-url', 'x');
    expect(createSecretBox(newKey()).open('signed-url', sealed)).toBeNull();
  });

  it('opens what a previous key sealed, and marks it for re-sealing', () => {
    const oldKey = newKey();
    const old = createSecretBox(oldKey).seal('node-source-secret', 'secret');
    const rotated = createSecretBox(newKey(), [oldKey]);
    expect(rotated.open('node-source-secret', old)).toBe('secret');
    expect(rotated.isStale(old)).toBe(true);
    const resealed = rotated.seal('node-source-secret', 'secret');
    expect(rotated.isStale(resealed)).toBe(false);
    expect(createSecretBox(oldKey).open('node-source-secret', resealed)).toBeNull();
  });

  it('refuses to exist without a usable key', () => {
    expect(() => createSecretBox(undefined)).toThrow(SecretKeyMissing);
    expect(() => createSecretBox('password')).toThrow(SecretKeyMissing);
  });
});

describe("the deployment's box", () => {
  afterEach(() => vi.unstubAllEnvs());

  it('comes from APP_SECRET_KEY, with APP_SECRET_KEY_PREVIOUS opening older values', () => {
    const oldKey = newKey();
    vi.stubEnv('APP_SECRET_KEY', oldKey);
    const old = secretBox().seal('node-source-secret', 'secret');
    vi.stubEnv('APP_SECRET_KEY', newKey());
    vi.stubEnv('APP_SECRET_KEY_PREVIOUS', `${newKey()}, ${oldKey}`);
    expect(secretBox().open('node-source-secret', old)).toBe('secret');
    expect(secretKeyStatus()).toEqual({ configured: true, problem: null });
  });

  it('is missing, and says why, without a key', () => {
    vi.stubEnv('APP_SECRET_KEY', '');
    expect(() => secretBox()).toThrow(SecretKeyMissing);
    expect(secretKeyStatus()).toEqual({ configured: false, problem: 'is not set' });
  });
});
