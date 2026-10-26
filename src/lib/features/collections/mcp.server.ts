// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// Read-only for agents: members join through an integration or an editor's
// hand, never through an agent.
import { z } from 'zod';
import type { ToolRegistry } from '../../../mcp/registry';
import { text, errText } from '../../../mcp/registry';
import { getCollection, membersOf, userCanReadCollection } from '$lib/features/collections/server';
import { pluginLabel } from '$lib/plugins';

export function registerCollectionTools({ user, tool }: ToolRegistry): void {
  tool(
    'get_collection',
    {
      title: 'Get collection',
      description:
        "Get a collection — an ordered set of nodes — with its members in their order: id, title, locale, visibility, plugin (the integration a mirrored collection's source belongs to, null for a curated one) and members ({id, type, title, url, position, label, plugin}), only the members you can access, numbered from 1 among them. A member's label is what the collection calls it, in your language (null for none); its plugin is the integration its own source belongs to (null for one of the core's own). A mirrored collection's live contents (the folder it mirrors) are not listed: only the nodes made from it are members.",
      inputSchema: { collectionId: z.string() },
    },
    'page:read',
    async ({ collectionId }) => {
      const collection = await getCollection(collectionId);
      // Not found and not readable answer alike, as everywhere.
      if (!collection || !(await userCanReadCollection(user, collection))) return errText('Collection not found');
      const members = (await membersOf(collection.id, user)).map(({ id, type, title, url, position, label, plugin }) => ({ id, type, title, url, position, label, plugin }));
      return text(
        JSON.stringify(
          {
            id: collection.id,
            title: collection.title,
            locale: collection.locale,
            visibility: collection.visibility ?? collection.namespace_access_level,
            plugin: collection.plugin,
            pluginLabel: collection.plugin ? pluginLabel(collection.plugin) : null,
            members,
          },
          null,
          2
        )
      );
    }
  );
}
