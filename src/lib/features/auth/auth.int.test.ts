// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { describe, expect, inject, it } from 'vitest';
import { graphql } from 'graphql';
import { db } from '$lib/platform/db.server';
import { schema } from '$lib/features/query/server';
import {
  createApiToken,
  createSession,
  createUser,
  getSessionUser,
  getUserByToken,
  hashToken,
  listApiTokens,
  revokeApiToken,
  setUserActive,
  setUserPassword,
  setUserRole,
} from './server';
import { userOf } from '$tests/integration/users';

// Accounts of each test's own, so no seeded session or token is spent.

const seed = inject('seed');
const PASSWORD = 'integration-password';

let n = 0;
const account = (role: 'editor' | 'viewer' = 'editor') => createUser({ email: `account${++n}@test`, name: `Account ${n}`, password: PASSWORD, role });
const sessionsOf = async (userId: string) => Number((await db<{ n: string }[]>`select count(*) as n from sessions where user_id = ${userId}`)[0].n);

describe('a session and an API token', () => {
  it('stop naming an account once it is deactivated: its sessions are deleted, its token resolves to no one', async () => {
    const user = await account();
    const session = await createSession(user.id);
    const { token } = await createApiToken(user.id, 'agent');
    expect(await getUserByToken(token)).toMatchObject({ id: user.id });

    await setUserActive(user.id, false);
    expect(await sessionsOf(user.id)).toBe(0);
    expect(await getSessionUser(session.token)).toBeNull();
    expect(await getUserByToken(token)).toBeNull();
  });

  it('an expired session, and an expired or revoked token, name no one', async () => {
    const user = await account();
    const session = await createSession(user.id);
    await db`update sessions set expires_at = now() - interval '1 minute' where id = ${hashToken(session.token)}`;
    expect(await getSessionUser(session.token)).toBeNull();

    const expired = await createApiToken(user.id, 'expired');
    await db`update api_tokens set expires_at = now() - interval '1 minute' where token_hash = ${hashToken(expired.token)}`;
    expect(await getUserByToken(expired.token)).toBeNull();

    const revoked = await createApiToken(user.id, 'revoked');
    const [row] = (await listApiTokens(user.id)).filter((t) => t.prefix === revoked.prefix);
    await revokeApiToken(row.id, user.id);
    expect(await getUserByToken(revoked.token)).toBeNull();
  });

  it('a token acts with its owner’s role as it is now', async () => {
    const user = await account('editor');
    const { token } = await createApiToken(user.id, 'agent');
    expect((await getUserByToken(token))?.role).toBe('editor');
    await setUserRole(user.id, 'viewer');
    expect((await getUserByToken(token))?.role).toBe('viewer');
  });

  it('a password change deletes every session of the account', async () => {
    const user = await account();
    const sessions = [await createSession(user.id), await createSession(user.id)];
    await setUserPassword(user.id, 'a-new-and-long-password');
    expect(await sessionsOf(user.id)).toBe(0);
    for (const s of sessions) expect(await getSessionUser(s.token)).toBeNull();
  });

  it('a token is revoked only by its owner: another user revoking its id leaves it working', async () => {
    const owner = await account();
    const other = await account();
    const { token, prefix } = await createApiToken(owner.id, 'agent');
    const [row] = (await listApiTokens(owner.id)).filter((t) => t.prefix === prefix);
    await revokeApiToken(row.id, other.id);
    expect(await getUserByToken(token)).toMatchObject({ id: owner.id });
  });
});

describe('the GraphQL search', () => {
  const titlesFor = async (role: 'editorB' | 'editorC') => {
    const res = await graphql({
      schema,
      source: 'query($t: String!) { search(text: $t) { title } }',
      variableValues: { t: 'Restricted' },
      contextValue: { user: await userOf(role) },
    });
    expect(res.errors).toBeUndefined();
    return (res.data as { search: { title: string }[] }).search.map((r) => r.title);
  };

  it('never lists the restricted page to an editor it is not shared with, and lists it to one it is', async () => {
    expect(await titlesFor('editorC')).not.toContain(seed.restrictedTitle);
    expect(await titlesFor('editorB')).toContain(seed.restrictedTitle);
  });
});
