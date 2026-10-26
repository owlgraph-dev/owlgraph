// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

import { inject, type ProvidedContext } from 'vitest';
import { getUserByToken } from '$lib/features/auth/server';

export type Role = keyof ProvidedContext['seed']['tokens'];

/** The user a seeded role's API token resolves to. */
export async function userOf(role: Role) {
  const user = await getUserByToken(inject('seed').tokens[role]);
  if (!user) throw new Error(`the ${role} token resolves to no user`);
  return user;
}
