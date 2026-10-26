// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Sealed values (docs/architecture/authorization.md, "Secrets"): AES-256-GCM under an HKDF
// subkey of APP_SECRET_KEY per purpose, so a value never opens as another
// purpose; one that doesn't open is null. A sealed value names its key, so
// APP_SECRET_KEY_PREVIOUS opens it until `npm run secrets:rotate` re-seals it.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';
import { weakSecretReason } from './secrets';

/** Each purpose seals under a key of its own. */
export type SealPurpose = 'node-source-secret' | 'signed-url' | 'user-credential' | 'connection-flow';

/** Sealing was asked of a deployment without a usable APP_SECRET_KEY. */
export class SecretKeyMissing extends Error {
  constructor(readonly problem: string) {
    super(`APP_SECRET_KEY ${problem}`);
    this.name = 'SecretKeyMissing';
  }
}

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
// 32 bytes in standard base64: 43 characters and one `=` of padding.
const KEY_FORMAT = /^[A-Za-z0-9+/]{43}=$/;

/** Why a key value is unfit, or null for a usable one. */
export function secretKeyProblem(value: string | undefined | null): string | null {
  const weak = weakSecretReason(value);
  if (weak) return weak;
  if (!KEY_FORMAT.test(value!)) return 'is not 32 random bytes in base64 (docs/guides/deployment.md shows how to make one)';
  // Random bytes repeat rarely; a key of a few distinct bytes was typed, not drawn.
  if (new Set(Buffer.from(value!, 'base64')).size < 16) return 'is not random';
  return null;
}

export interface SecretBox {
  /** The id of the key new values are sealed under. */
  readonly keyId: string;
  seal(purpose: SealPurpose, plaintext: string): string;
  /** The plaintext, or null for a value that does not open (altered, another purpose, an unknown key). */
  open(purpose: SealPurpose, sealed: string): string | null;
  /** Whether a value was sealed under an older key, so a rotation re-seals it. */
  isStale(sealed: string): boolean;
}

interface Key {
  id: string;
  bytes: Buffer;
}

function keyOf(value: string): Key {
  const bytes = Buffer.from(value, 'base64');
  return { id: createHash('sha256').update(bytes).digest('base64url').slice(0, 8), bytes };
}

/** A box over the current key and any previous ones (which only open). Throws SecretKeyMissing for an unfit current key. */
export function createSecretBox(current: string | undefined, previous: readonly string[] = []): SecretBox {
  const problem = secretKeyProblem(current);
  if (problem) throw new SecretKeyMissing(problem);
  const active = keyOf(current!);
  const ring = new Map<string, Key>([[active.id, active]]);
  for (const value of previous) {
    if (secretKeyProblem(value)) continue;
    const key = keyOf(value);
    if (!ring.has(key.id)) ring.set(key.id, key);
  }

  const subkeys = new Map<string, Buffer>();
  const subkey = (key: Key, purpose: SealPurpose): Buffer => {
    const cacheKey = `${key.id}:${purpose}`;
    let derived = subkeys.get(cacheKey);
    if (!derived) {
      derived = Buffer.from(hkdfSync('sha256', key.bytes, Buffer.alloc(0), `owlgraph ${purpose}`, 32));
      subkeys.set(cacheKey, derived);
    }
    return derived;
  };
  const aad = (keyId: string, purpose: SealPurpose) => Buffer.from(`${VERSION}.${keyId}.${purpose}`);

  return {
    keyId: active.id,
    seal(purpose, plaintext) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', subkey(active, purpose), iv);
      cipher.setAAD(aad(active.id, purpose));
      const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
      return `${VERSION}.${active.id}.${iv.toString('base64url')}.${body.toString('base64url')}`;
    },
    open(purpose, sealed) {
      const parts = sealed.split('.');
      if (parts.length !== 4 || parts[0] !== VERSION) return null;
      const key = ring.get(parts[1]);
      if (!key) return null;
      const iv = Buffer.from(parts[2], 'base64url');
      const body = Buffer.from(parts[3], 'base64url');
      if (iv.length !== IV_BYTES || body.length < TAG_BYTES) return null;
      try {
        const decipher = createDecipheriv('aes-256-gcm', subkey(key, purpose), iv);
        decipher.setAAD(aad(key.id, purpose));
        decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
        return Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
    isStale(sealed) {
      return sealed.split('.')[1] !== active.id;
    },
  };
}

/** Whether this deployment can seal, and why not. */
export function secretKeyStatus(): { configured: boolean; problem: string | null } {
  const problem = secretKeyProblem(process.env.APP_SECRET_KEY);
  return { configured: !problem, problem };
}

/** For the startup summary: whether the key is there and fit, never a character of it. */
export function secretKeySummary(): '(set)' | '(unset)' | '(unfit)' {
  if (!process.env.APP_SECRET_KEY) return '(unset)';
  return secretKeyStatus().configured ? '(set)' : '(unfit)';
}

let cached: { env: string; box: SecretBox } | null = null;

/** The deployment's box, from APP_SECRET_KEY and APP_SECRET_KEY_PREVIOUS (comma-separated). Throws SecretKeyMissing without a usable key. */
export function secretBox(): SecretBox {
  const current = process.env.APP_SECRET_KEY;
  const previous = process.env.APP_SECRET_KEY_PREVIOUS ?? '';
  const env = `${current ?? ''}|${previous}`;
  if (cached?.env !== env) {
    const box = createSecretBox(current, previous.split(',').map((v) => v.trim()).filter(Boolean));
    cached = { env, box };
  }
  return cached.box;
}
