// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, it } from 'vitest';
import { db } from '$lib/platform/db.server';
import { createSession, createUser } from '$lib/features/auth/server';
import { userOf } from '$tests/integration/users';
import { beginFlow, sealCredential, sealFlow, storeConnection } from './connections.server';

// A made-up integration: what is stored is the core's, whatever plugin a connection is for.

const PLUGIN = 'some-service';
const ORIGIN = 'https://service.example';

describe('a person deleted', () => {
  // The app deactivates people and never deletes one; deleting the row is
  // what an operator does, and what goes with it is the schema's.
  it('takes their connections and their connects in progress with them — and nobody else’s', async () => {
    const leaving = await createUser({ email: 'leaving@integrations.int.test', name: 'Leaving', password: 'integration-seed-password', role: 'editor' });
    const staying = await userOf('editorB');
    for (const user of [leaving, staying]) {
      await createSession(user.id);
      const [session] = await db<{ id: string }[]>`select id from sessions where user_id = ${user.id} order by created_at desc limit 1`;
      const binding = { userId: user.id, plugin: PLUGIN, origin: ORIGIN };
      const sealed = sealCredential(binding, { kind: 'app_password', login: user.email, secret: `app-password-${user.id}` });
      await storeConnection(db, { ...binding, kind: 'app_password', sealed: sealed!, accountId: user.email, accountLabel: user.name });
      const flow = sealFlow({ ...binding, sessionId: session.id }, { handle: `handle-${user.id}`, approveUrl: `${ORIGIN}/approve/abc` });
      await beginFlow({ ...binding, sessionId: session.id, sealed: flow!, ttlSeconds: 600 });
    }
    const held = async (userId: string) => ({
      connections: (await db`select id from user_connections where user_id = ${userId}`).length,
      flows: (await db`select id from connection_flows where user_id = ${userId}`).length,
    });
    expect(await held(leaving.id)).toEqual({ connections: 1, flows: 1 });

    await db`delete from users where id = ${leaving.id}`;

    expect(await held(leaving.id)).toEqual({ connections: 0, flows: 0 });
    expect(await held(staying.id)).toEqual({ connections: 1, flows: 1 });
  });
});
