// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { db } from '$lib/platform/db.server';
import { createSecretBox, secretBox } from '$lib/platform/secretBox.server';
import { createCollection } from '$lib/features/collections/server';
import { connectionOf, openCredential, sealCredential, sealedSecretOf, storeConnection, storeSealedSecret } from '$lib/features/pluginHost/server';
import { runScript } from '$tests/integration/scripts';
import { userOf, type Role } from '$tests/integration/users';

// The script runs as an operator runs it; what it stored is opened as the
// deployment would, under the new key alone. The integration is made up: the
// sealing and storing are the core's.

const PLUGIN = 'some-service';
const ORIGIN = 'https://service.example';
const OLD = randomBytes(32).toString('base64');
const NEW = randomBytes(32).toString('base64');
/** A key this deployment never had. */
const LOST = randomBytes(32).toString('base64');

const rotation = { DATABASE_URL: process.env.DATABASE_URL, APP_SECRET_KEY: NEW, APP_SECRET_KEY_PREVIOUS: OLD };
const rotate = () => runScript('rotate-secrets.ts', [], rotation);

// The deployment's box reads its key from the environment.
const runKey = process.env.APP_SECRET_KEY;
function restoreRunKey() {
  if (runKey === undefined) delete process.env.APP_SECRET_KEY;
  else process.env.APP_SECRET_KEY = runKey;
}
function withKey<T>(key: string, fn: () => T): T {
  process.env.APP_SECRET_KEY = key;
  try {
    return fn();
  } finally {
    restoreRunKey();
  }
}
beforeAll(() => {
  delete process.env.APP_SECRET_KEY_PREVIOUS;
});
afterAll(restoreRunKey);

let n = 0;

/** A mirrored collection whose source credential `value` is sealed under `key`. */
async function nodeSecret(key: string, value = `share-token-${++n}`) {
  const admin = await userOf('admin');
  const { id } = await createCollection({ title: `Rotated source ${++n}`, createdBy: admin.id, user: admin, plugin: PLUGIN, sourceRef: { path: `/share-${n}` } });
  const sealed = withKey(key, () => secretBox().seal('node-source-secret', value));
  await storeSealedSecret(db, id, PLUGIN, sealed);
  return { id, value };
}

/** `role`'s connection to the service, its credential sealed under `key`. */
async function connection(role: Role, key: string, secret = `app-password-${++n}`) {
  const user = await userOf(role);
  const binding = { userId: user.id, plugin: PLUGIN, origin: ORIGIN };
  const credential = { kind: 'app_password' as const, login: user.email, secret };
  const sealed = withKey(key, () => sealCredential(binding, credential));
  const { id } = await storeConnection(db, { ...binding, kind: 'app_password', sealed: sealed!, accountId: user.email, accountLabel: user.name });
  return { id, userId: user.id, credential };
}

/** A node's stored credential opened with `key` alone, or null. */
async function openNodeSecret(nodeId: string, key: string) {
  const sealed = await sealedSecretOf(nodeId, PLUGIN);
  return sealed ? withKey(key, () => secretBox().open('node-source-secret', sealed)) : null;
}

/** A person's connection credential opened with `key` alone, or null. */
async function openConnection(userId: string, key: string) {
  const row = await connectionOf(userId, PLUGIN);
  return row ? withKey(key, () => openCredential(row)) : null;
}

/** Every stored sealed value, by row id. */
async function stored() {
  const secrets = await db<{ id: string; sealed: string }[]>`select node_id as id, sealed from node_source_secrets order by node_id`;
  const credentials = await db<{ id: string; sealed: string }[]>`select id, sealed_credential as sealed from user_connections order by id`;
  return new Map([...secrets, ...credentials].map((row) => [row.id, row.sealed]));
}

describe('npm run secrets:rotate', () => {
  it('re-seals every node source secret and connection credential under the current key, so each opens under it without the previous one', async () => {
    const oldSecret = await nodeSecret(OLD);
    const currentSecret = await nodeSecret(NEW);
    const oldConnection = await connection('editorA', OLD);
    const currentConnection = await connection('editorB', NEW);
    const before = await stored();
    expect(await openNodeSecret(oldSecret.id, NEW)).toBeNull();
    expect(await openConnection(oldConnection.userId, NEW)).toBeNull();

    const run = await rotate();
    expect(run.code, run.stdout + run.stderr).toBe(0);
    expect(run.stdout).toContain('Re-sealed 2; already under the current key 2.');

    expect(await openNodeSecret(oldSecret.id, NEW)).toBe(oldSecret.value);
    expect(await openNodeSecret(currentSecret.id, NEW)).toBe(currentSecret.value);
    expect(await openConnection(oldConnection.userId, NEW)).toEqual(oldConnection.credential);
    expect(await openConnection(currentConnection.userId, NEW)).toEqual(currentConnection.credential);
    // Sealed anew, not merely readable.
    expect(await openNodeSecret(oldSecret.id, OLD)).toBeNull();
    expect(await openConnection(oldConnection.userId, OLD)).toBeNull();
    const after = await stored();
    const box = createSecretBox(NEW);
    for (const sealed of after.values()) expect(box.isStale(sealed)).toBe(false);
    expect(after.get(currentSecret.id)).toBe(before.get(currentSecret.id));
    expect(after.get(currentConnection.id)).toBe(before.get(currentConnection.id));
    expect(after.get(oldSecret.id)).not.toBe(before.get(oldSecret.id));
    expect(after.get(oldConnection.id)).not.toBe(before.get(oldConnection.id));
  });

  it('re-seals nothing on a second run', async () => {
    const secret = await nodeSecret(OLD);
    const first = await rotate();
    expect(first.code, first.stdout + first.stderr).toBe(0);
    const total = (await stored()).size;
    expect(first.stdout).toContain(`Re-sealed 1; already under the current key ${total - 1}.`);
    const before = await stored();

    const second = await rotate();
    expect(second.code, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).toContain(`Re-sealed 0; already under the current key ${total}.`);
    expect(await stored()).toEqual(before);
    expect(await openNodeSecret(secret.id, NEW)).toBe(secret.value);
  });

  it('lists a value no key opens by its node or connection id, never a character of it, leaves it stored and exits 1 — re-sealing the rest', async () => {
    const lostSecret = await nodeSecret(LOST, 'lost-share-token-7f3c9e');
    const lostConnection = await connection('editorC', LOST, 'lost-app-password-7f3c9e');
    const stale = await nodeSecret(OLD);
    const before = await stored();

    const run = await rotate();
    expect(run.code, run.stdout + run.stderr).toBe(1);
    expect(run.stdout).toContain('Re-sealed 1;');
    expect(run.stdout).toContain(`2 under no key this deployment has (connect their sources again): ${lostSecret.id}, connection ${lostConnection.id}`);
    const printed = run.stdout + run.stderr;
    for (const value of [lostSecret.value, lostConnection.credential.secret, before.get(lostSecret.id)!, before.get(lostConnection.id)!]) expect(printed).not.toContain(value);

    const after = await stored();
    expect(after.get(lostSecret.id)).toBe(before.get(lostSecret.id));
    expect(after.get(lostConnection.id)).toBe(before.get(lostConnection.id));
    expect(await openNodeSecret(stale.id, NEW)).toBe(stale.value);
    expect(await openNodeSecret(lostSecret.id, NEW)).toBeNull();
  });
});
