// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Alexander Rensch
// This file is part of owlgraph. See LICENSE and PLUGIN-EXCEPTION.md.

// The bodies of the plugins' nodes' own pages, one line per plugin with any.
// Rendered on the server and hydrated like the rest of the page, so a body
// reaches neither the editor stack nor a server-only package
// (scripts/check-boundaries.mjs, rule 8).
import type { PluginNodeViews } from './api';
import { nextcloudNodeViews } from './nextcloud/nodeViews';

export const PLUGIN_NODE_VIEWS: readonly PluginNodeViews[] = [nextcloudNodeViews];

export function pluginNodeViews(id: string): PluginNodeViews | null {
  return PLUGIN_NODE_VIEWS.find((views) => views.id === id) ?? null;
}
