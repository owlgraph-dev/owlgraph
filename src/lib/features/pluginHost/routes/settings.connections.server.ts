// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Route adapter for /settings/connections, re-exported by src/routes/settings/connections/+page.server.ts.
// The person's own connections (docs/architecture/settings.md, "The personal group"), scoped to locals.user.
import { error, type ServerLoadEvent } from '@sveltejs/kit';
import { safePath } from '$lib/features/auth';
import { clientNameFor, connectionStore, connectionsOf, pendingConnect, pluginOrigin } from '$lib/features/pluginHost/server';
import type { ConnectionView, ServiceConnectionView } from '$lib/features/pluginHost';
import { PLUGINS_WITH_CONNECTIONS } from '$lib/plugins';

export const load = async ({ locals, url }: ServerLoadEvent) => {
  const user = locals.user;
  if (!user) throw error(401, 'Sign in first');
  const mine = await connectionsOf(user.id);
  const services: ServiceConnectionView[] = await Promise.all(
    PLUGINS_WITH_CONNECTIONS.map(async (plugin) => {
      const origin = await pluginOrigin(plugin);
      const row = mine.find((c) => c.plugin === plugin.id);
      const connection: ConnectionView | null = row
        ? {
            accountLabel: row.account_label || row.account_id,
            // Made against another address than the one set up now: never sent there, so it has to be made anew.
            state: origin && row.origin !== origin ? 'moved' : row.status === 'active' ? 'active' : 'revoked',
            since: row.created_at.toISOString(),
            lastUsed: row.last_used_at?.toISOString() ?? null,
          }
        : null;
      const pending =
        origin && locals.sessionId ? await pendingConnect({ store: connectionStore, sessionId: locals.sessionId, userId: user.id, plugin: plugin.id }) : null;
      return {
        id: plugin.id,
        label: plugin.label(),
        intro: plugin.connections.intro(),
        available: origin !== null,
        connection,
        approveUrl: pending?.approveUrl ?? null,
      };
    })
  );
  return {
    services,
    // The credential's name at the service, for removing it there when the service could not be asked to.
    clientName: clientNameFor(url.host),
    // A way back only to a path on this app.
    returnTo: safePath(url.searchParams.get('return'), url.origin),
  };
};
