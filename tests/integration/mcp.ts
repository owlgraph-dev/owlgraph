// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The real buildServer(user) for a seeded user, over the SDK's in-memory
// transport: every tool and gate as an agent meets them, without HTTP.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Logger } from '$lib/platform/logger.server';
import { buildServer } from '../../src/mcp/server';
import { userOf, type Role } from './users';

export { userOf, type Role };
type ToolResult = Awaited<ReturnType<Client['callTool']>>;

/** A client connected to the agents' server as the seeded role's user. */
export async function connectAs(role: Role, log?: Logger): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'integration', version: '0.0.0' });
  await buildServer(await userOf(role), log).connect(serverSide);
  await client.connect(clientSide);
  return client;
}

/** A tool result's text, its parts joined. */
export const textOf = (res: ToolResult): string => ((res.content ?? []) as { text?: string }[]).map((c) => c.text ?? '').join('\n');

/** A tool result's text, read as JSON. */
export const jsonOf = <T = unknown>(res: ToolResult): T => JSON.parse(textOf(res)) as T;
