// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// A host for the plugin's unit tests: the real pinned client, the given
// settings, and the log lines kept. Every other part refuses, so a module
// under test that reaches for one fails loudly.
import { upstreamClient } from '$lib/platform/upstream.server';
import type { PluginHost } from '$lib/plugins/api';

export interface FakeHostOptions {
  origin: string | null;
  enabled?: boolean;
  /** Anonymous unless a test names one. */
  viewerId?: string | null;
  cacheSeconds?: number;
  /** The parts a test answers itself; the rest refuse. */
  nodes?: Partial<PluginHost['nodes']>;
  secrets?: Partial<PluginHost['secrets']>;
  connection?: Partial<PluginHost['connection']>;
  respond?: Partial<PluginHost['respond']>;
}

/** Plain responses: the core's own add only their headers. */
export const jsonResponses: Pick<PluginHost['respond'], 'json' | 'error' | 'notFound'> = {
  json: (data, status = 200) => Response.json(data, { status }),
  error: (status, code, message) => Response.json({ error: { code, message: message ?? code } }, { status }),
  notFound: () => new Response(null, { status: 404 }),
};

export type FakeHost = PluginHost & { logs: { upstreamFailed: Record<string, unknown>[]; sourceState: Record<string, unknown>[] } };

const refuse = (part: string) =>
  new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return (target as Record<string | symbol, unknown>)[key];
        return () => {
          throw new Error(`fake host: ${part}.${String(key)} is not part of this test`);
        };
      },
    }
  );

export function fakeHost(opts: FakeHostOptions): FakeHost {
  const logs = { upstreamFailed: [] as Record<string, unknown>[], sourceState: [] as Record<string, unknown>[] };
  const enabled = opts.enabled ?? true;
  return {
    pluginId: 'nextcloud',
    viewerId: opts.viewerId ?? null,
    locale: 'en',
    settings: async () => ({ enabled, values: { origin: opts.origin, cacheSeconds: opts.cacheSeconds ?? 60 } }),
    upstream: async () => (enabled && opts.origin ? upstreamClient(opts.origin) : null),
    nodes: Object.assign(refuse('nodes'), opts.nodes) as PluginHost['nodes'],
    secrets: Object.assign(refuse('secrets'), opts.secrets) as PluginHost['secrets'],
    connection: Object.assign(refuse('connection'), opts.connection) as PluginHost['connection'],
    grants: refuse('grants') as PluginHost['grants'],
    respond: Object.assign(refuse('respond'), opts.respond) as PluginHost['respond'],
    log: {
      upstreamFailed: (fields) => logs.upstreamFailed.push(fields),
      sourceState: (fields) => logs.sourceState.push(fields),
    },
    logs,
  };
}
