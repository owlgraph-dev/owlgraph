// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The find_pages_by_* lookups aren't viewer-scoped: these tools filter their
// rows to the readable pages.
import { z } from 'zod';
import type { ToolRegistry } from '../../../mcp/registry';
import { text } from '../../../mcp/registry';
import { readablePageIds } from '$lib/features/pages/server';
import {
  getNodeTags,
  setNodeTags,
  findPagesByTag,
  listTags,
  getNodeProperties,
  findPagesByProperty,
  listPropertyNames,
  listPropertyDefinitions,
} from '$lib/features/semantic/server';
import { localize } from '$lib/platform/i18n/localizedText';

export function registerSemanticTools({ user, tool, pageTool }: ToolRegistry): void {
  pageTool(
    'get_node_properties',
    { title: 'Get node properties', description: 'List the semantic properties (name/value pairs from inline {{{name:value}}} annotations) declared on a single page.', inputSchema: { pageId: z.string() } },
    'read',
    async (page) => text(JSON.stringify(await getNodeProperties(page.id), null, 2))
  );

  tool(
    'find_pages_by_property',
    {
      title: 'Find pages by property',
      description: "Cross-page query over semantic properties. Given a property name (e.g. 'status' or 'deadline') and an optional value, return the pages that declare it, with the matching value(s). Omit value to get every page that has the property at all. Use list_property_names first to discover which properties exist. Only pages you can read are returned.",
      inputSchema: { name: z.string(), value: z.string().optional() },
    },
    'page:read',
    async ({ name, value }) => {
      const readable = await readablePageIds(user);
      const rows = (await findPagesByProperty(name, value)).filter((r) => readable.has(r.id));
      return text(JSON.stringify(rows, null, 2));
    }
  );

  tool(
    'list_property_names',
    { title: 'List property names', description: 'List every distinct semantic-property name used on the nodes you may read, with how many times each occurs on them. Useful for discovering the de-facto set of properties before querying.', inputSchema: {} },
    'page:read',
    async () => text(JSON.stringify(await listPropertyNames(user), null, 2))
  );

  pageTool(
    'get_node_tags',
    { title: 'Get node tags', description: 'List the page-level tags (categories) on a page.', inputSchema: { pageId: z.string() } },
    'read',
    async (page) => text(JSON.stringify(await getNodeTags(page.id), null, 2))
  );

  pageTool(
    'set_node_tags',
    { title: 'Set node tags', description: 'Replace a page\'s tags (categories) with the given list. Tags are page-level metadata used to categorize pages (like MediaWiki categories or Obsidian tags), distinct from inline semantic properties. Pass the full desired set — this overwrites existing tags.', inputSchema: { pageId: z.string(), tags: z.array(z.string()) } },
    'write',
    async (page, { tags }) => text(JSON.stringify(await setNodeTags(page.id, tags), null, 2))
  );

  tool(
    'find_pages_by_tag',
    { title: 'Find pages by tag', description: 'Return the pages you can read that carry a given tag.', inputSchema: { tag: z.string() } },
    'page:read',
    async ({ tag }) => {
      const readable = await readablePageIds(user);
      const rows = (await findPagesByTag(tag)).filter((r) => readable.has(r.id));
      return text(JSON.stringify(rows, null, 2));
    }
  );

  tool(
    'list_tags',
    { title: 'List tags', description: 'List every distinct tag on the nodes you may read, with how many of them carry each.', inputSchema: {} },
    'page:read',
    async () => text(JSON.stringify(await listTags(user), null, 2))
  );

  tool(
    'list_property_definitions',
    {
      title: 'List property definitions',
      description:
        "List the centrally-defined semantic properties (name, human label, datatype, description). Consult this to use consistent property names and the expected datatype when annotating pages. `label`/`description` are resolved for your request's interface language (your language preference, else Accept-Language among the enabled languages, else the site default language); `labels`/`descriptions` hold every translation. Annotate with the name, never a label.",
      inputSchema: {},
    },
    'property:read',
    async () =>
      text(
        JSON.stringify(
          (await listPropertyDefinitions()).map((d) => ({
            name: d.name,
            group_slug: d.group_slug,
            label: localize(d.label, d.name),
            labels: d.label,
            datatype: d.datatype,
            description: localize(d.description, ''),
            descriptions: d.description,
          })),
          null,
          2
        )
      )
  );
}
