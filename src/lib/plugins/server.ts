// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The plugins' server halves, one line per plugin with one. Read by the
// integrations feature alone and only on the server: a server half may reach
// htmlparser2 and node: builtins (scripts/check-boundaries.mjs, rule 8).
import type { PluginServer } from './api';
import { nextcloudServer } from './nextcloud/server';

export const PLUGIN_SERVERS: readonly PluginServer[] = [nextcloudServer];

export function pluginServer(id: string): PluginServer | null {
  return PLUGIN_SERVERS.find((server) => server.id === id) ?? null;
}
